import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY not found");
  process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey });

async function trackTokenUsage(prompt: string) {
  try {
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    console.log("📝 Prompt:", prompt);
    console.log("🤖 Response:", response.text);
    console.log("\n📊 Token Usage:");
    console.log("  Input tokens:", response.usageMetadata?.promptTokenCount);
    console.log(
      "  Thoughts tokens:",
      response.usageMetadata?.thoughtsTokenCount
    );
    console.log(
      "  Output tokens:",
      response.usageMetadata?.candidatesTokenCount
    );
    console.log("  Total tokens:", response.usageMetadata?.totalTokenCount);
  } catch (error) {
    console.error("Error:", error);
  }
}

// Test with a simple prompt
trackTokenUsage("What is TypeScript in one sentence?");
