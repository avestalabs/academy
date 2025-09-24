import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY not found");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function trackTokenUsage(prompt: string) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent(prompt);
    const response = await result.response;

    console.log("📝 Prompt:", prompt);
    console.log("🤖 Response:", response.text());
    console.log("\n📊 Token Usage:");
    console.log(
      "  Input tokens:",
      result.response.usageMetadata?.promptTokenCount
    );
    console.log(
      "  Output tokens:",
      result.response.usageMetadata?.candidatesTokenCount
    );
    console.log(
      "  Total tokens:",
      result.response.usageMetadata?.totalTokenCount
    );
  } catch (error) {
    console.error("Error:", error);
  }
}

// Test with a simple prompt
trackTokenUsage("What is TypeScript in one sentence?");
