import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY not found in environment variables");
  process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey });

async function makeFirstCall() {
  try {
    const prompt = "What is TypeScript in one sentence?";

    console.log("🤖 Sending prompt:", prompt);

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    console.log("✅ AI Response:", response.text);
  } catch (error) {
    console.error("❌ Error making LLM call:", error);
  }
}

makeFirstCall();
