import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { connectDB, getDB } from "./database.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 7000;
const SECRET = process.env.JWT_SECRET || "change_me";
const EXPIRES = process.env.JWT_EXPIRES_IN || "7d";

const send = (res, status, data) => res.status(status).json(data);
const tokenFor = (id) => jwt.sign({ sub: id }, SECRET, { expiresIn: EXPIRES });

const auth = (req, res, next) => {
  const t = (req.headers.authorization || "").replace("Bearer ", "");
  if (!t) return send(res, 401, { message: "Unauthorized" });
  try {
    req.user = jwt.verify(t, SECRET);
    next();
  } catch {
    return send(res, 401, { message: "Unauthorized" });
  }
};

app.get("/", (req, res) => send(res, 200, { ok: true, name: "GolfBuddy API" }));

// courses --> get from mongoDB
app.get(["/golfcourses", "/courses"], async (req, res) => {
  const courses = await getDB().collection("courses").find().toArray();
  send(res, 200, courses);
});

app.get(["/golfcourses/:id", "/courses/:id"], async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return send(res, 400, { message: "Invalid id" });

  const course = await getDB().collection("courses").findOne({ _id: new ObjectId(id) });
  if (!course) return send(res, 404, { message: "Course not found" });

  send(res, 200, course);
});

app.post("/golfcourses", auth, async (req, res) => {
  const { name, location, priceRange = "€€", difficultyLevel = "Intermediate", rating = 0 } = req.body;
  if (!name || !location) return send(res, 400, { message: "Missing name or location" });

  const isLegend = /augusta/i.test(name); // easter egg in validation
  const doc = {
    name: String(name).trim(),
    location: String(location).trim(),
    priceRange: String(priceRange).trim(),
    difficultyLevel: String(difficultyLevel).trim(),
    rating: isLegend ? Math.max(Number(rating) || 0, 4.9) : Number(rating) || 0
  };

  const r = await getDB().collection("courses").insertOne(doc);
  send(res, 201, { _id: r.insertedId, ...doc, ...(isLegend ? { easterEgg: "🏌️ Legend detected" } : {}) });
});

app.delete("/golfcourses/:id", auth, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return send(res, 400, { message: "Invalid id" });

  const r = await getDB().collection("courses").deleteOne({ _id: new ObjectId(id) });
  if (!r.deletedCount) return send(res, 404, { message: "Course not found" });

  send(res, 200, { message: "Deleted" });
});

//start server --> call function from database.js
await connectDB();
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));