import { MongoClient } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

const uri = process.env.MONGO_URI;

if (!uri) {
  console.error("Error: MONGO_URI is not defined in .env file.");
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 5000,
});

let dbInstance = null;

export default async function connectDb() {
  if (dbInstance) {
    return dbInstance;
  }
  try {
    await client.connect();
    dbInstance = client.db("oneWay");
    console.log("Database connection established.");
    return dbInstance;
  } catch (error) {
    console.error("Could not connect to the database.", error);
    throw error;
  }
}