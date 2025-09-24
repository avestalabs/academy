import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY not found in environment variables");
  process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey });

async function testConnection() {
  try {
    const model = await genAI.models.get({
      model: "gemini-2.5-flash",
    });
    console.log("✅ Gemini setup successful!");
    console.log("Model loaded:", model);
  } catch (error) {
    console.error("❌ Setup failed:", error);
  }
}

testConnection();
