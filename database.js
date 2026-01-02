import 'dotenv/config';
import { MongoClient } from 'mongodb';

const mongoUri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME || 'golfdb';

if (!mongoUri) {
  throw new Error('Missing MONGO_URI environment variable');
}

let client;
let db;
let connectionPromise;

export async function connectDB() {
  if (db) return db;

  if (!connectionPromise) {
    client = new MongoClient(mongoUri);
    connectionPromise = client.connect();
  }

  await connectionPromise;
  db = client.db(dbName);

  console.log('Connected to :', db.databaseName);
  return db;
}

export function getDB() {
  if (!db) {
    throw new Error('Database not connected yet. Call connectDB() first.');
  }
  return db;
}


