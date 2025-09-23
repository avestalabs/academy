import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY not found in environment variables");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function testConnection() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-flash" });
    console.log("✅ Gemini setup successful!");
    console.log("Model loaded:", model);
  } catch (error) {
    console.error("❌ Setup failed:", error);
  }
}

testConnection();
