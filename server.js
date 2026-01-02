import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
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
  send(res, 201, { _id: r.insertedId, ...doc, ...(isLegend ? {  easterEgg: "🏌️ Legend detected" } : {}) });//easteregg hihi
});

app.delete("/golfcourses/:id", auth, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return send(res, 400, { message: "Invalid id" });

  const r = await getDB().collection("courses").deleteOne({ _id: new ObjectId(id) });
  if (!r.deletedCount) return send(res, 404, { message: "Course not found" });

  send(res, 200, { message: "Deleted" });
});
//competitions 

//Get
app.get("/competitions", async (req, res) => {
  const { level, sort = "date", order = "asc" } = req.query;
  const filter = level ? { level } : {};

  const sortField = sort === "price" ? "entryFee" : "date";
  const dir = order === "desc" ? -1 : 1;

  const comps = await getDB().collection("competitions").find(filter).sort({ [sortField]: dir }).toArray();
  send(res, 200, comps);
});
//get
app.get("/competitions/:id", async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return send(res, 400, { message: "Invalid id" });

  const comp = await getDB().collection("competitions").findOne({ _id: new ObjectId(id) });
  if (!comp) return send(res, 404, { message: "Competition not found" });

  send(res, 200, comp);
});
//post
app.post("/competitions", auth, async (req, res) => {
  const { title, date, level, entryFee, courseId } = req.body;
  if (!title || !date || !level || typeof entryFee !== "number" || !courseId) return send(res, 400, { message: "Missing or invalid data" });
  if (!ObjectId.isValid(courseId)) return send(res, 400, { message: "Invalid courseId" });

  const doc = { title: String(title).trim(), date: new Date(date), level: String(level).trim(), entryFee, courseId: new ObjectId(courseId) };
  const r = await getDB().collection("competitions").insertOne(doc);

  send(res, 201, { _id: r.insertedId, ...doc });
});
//delete
app.delete("/competitions/:id", auth, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return send(res, 400, { message: "Invalid id" });

  const r = await getDB().collection("competitions").deleteOne({ _id: new ObjectId(id) });
  if (!r.deletedCount) return send(res, 404, { message: "Competition not found" });

  send(res, 200, { message: "Deleted" });
});

//weather (extra)

//profile + favorites
app.get("/users/:id", auth, async (req, res) => {
  const { id } = req.params;
   // alleen je profiel bekijken
  if (req.user.sub !== id) return send(res, 401, { message: "Unauthorized" });
  if (!ObjectId.isValid(id)) return send(res, 400, { message: "Invalid id" });
 // data ophalen uit mongo
  const user = await getDB().collection("users").findOne({ _id: new ObjectId(id) });
  if (!user) return send(res, 404, { message: "User not found" });
//favoriete courses ophalen
  const favIds = (user.favorites || []).map((x) => new ObjectId(x));
  const favorites = favIds.length ? await getDB().collection("courses").find({ _id: { $in: favIds } }).toArray() : [];

  send(res, 200, { id: user._id, username: user.username, email: user.email, handicapLevel: user.handicapLevel, favorites });
});


app.put("/users/:id/favorites", auth, async (req, res) => {
  const { id } = req.params;
  const { courseId, action } = req.body;

  // eigen profiel aanpassen
  if (req.user.sub !== id) return send(res, 401, { message: "Unauthorized" });

  //  ids geldig zijn?
  if (!ObjectId.isValid(id) || !ObjectId.isValid(courseId)) 
    return send(res, 400, { message: "Invalid id" });

  const users = getDB().collection("users");
  const uId = new ObjectId(id);
  const cId = new ObjectId(courseId);

  // haal de user op
  const user = await users.findOne({ _id: uId });
  if (!user) return send(res, 404, { message: "User not found" });

  // check of course al favoriet is
  const has = (user.favorites || []).some((f) => f.toString() === cId.toString());

  // voeg toe of verwijder favorite
  if (action === "add" && !has) await users.updateOne({ _id: uId }, { $push: { favorites: cId } });
  if (action === "remove" && has) await users.updateOne({ _id: uId }, { $pull: { favorites: cId } });

  // Feedback geven
  send(res, 200, { message: "Updated" });
});

//auth 
app.post("/auth/register", async (req, res) => {
  const { username, email, password, handicapLevel = "Beginner" } = req.body;
  if (!username || !email || !password) return send(res, 400, { message: "Missing fields" });

  const users = getDB().collection("users");
  const exists = await users.findOne({ email: String(email).toLowerCase().trim() });
  if (exists) return send(res, 409, { message: "Email already registered" });

  const userDoc = {
    username: String(username).trim(),
    email: String(email).toLowerCase().trim(),
    passwordHash: await bcrypt.hash(password, 10),
    handicapLevel: String(handicapLevel).trim(),
    favorites: [],
    createdAt: new Date()
  };

  const r = await users.insertOne(userDoc);
  send(res, 201, { token: tokenFor(r.insertedId.toString()), user: { id: r.insertedId, username: userDoc.username, handicapLevel: userDoc.handicapLevel } });
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return send(res, 400, { message: "Missing fields" });

  const user = await getDB().collection("users").findOne({ email: String(email).toLowerCase().trim() });
  if (!user) return send(res, 401, { message: "Invalid login" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return send(res, 401, { message: "Invalid login" });

  send(res, 200, { token: tokenFor(user._id.toString()), user: { id: user._id, username: user.username, handicapLevel: user.handicapLevel } });
});

//start server --> call function from database.js
await connectDB();
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));