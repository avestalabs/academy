import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY not found in environment variables");
  process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey });

async function demonstrateTemperature() {
  const prompt = "what is javascript in one sentence?";

  // Low temperature - consistent, focused
  const response = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      temperature: 0.1,
    },
  });

  console.log("Conservative (temp 0.1):", response.text);
}
async function demonstrateCreativeTemperature() {
  const prompt =
    "Write a creative opening line for a story about a robot chef.";

  // High temperature - creative, varied

  const response = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { temperature: 0.9 },
  });
  console.log("Creative (temp 0.9):", response.text);
}

async function demonstrateTokenLimits() {
  const prompt = "Explain how photosynthesis works in plants in 2 lines.";

  // Short response
  const response = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { maxOutputTokens: 700, temperature: 0.3 },
  });
  console.log("Short (30 tokens):", response.text);
}

async function demonstrateStopSequences() {
  const prompt = "List four benefits of exercise:\n1.";

  const response = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { temperature: 0.3, stopSequences: ["\n4.", "4."] },
  });
  console.log("Stopped at item 4:", response.text);
}

async function demonstrateTopP() {
  const prompt = "Generate two business ideas for a food truck.";

  const response = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      topP: 0.8,
    },
  });

  console.log("Using topP (0.8):", response.text);
}

// Run all demonstrations
async function runAllExamples() {
  await demonstrateTemperature();
  await demonstrateCreativeTemperature();
  await demonstrateTokenLimits();
  await demonstrateStopSequences();
  await demonstrateTopP();
}

runAllExamples().catch(console.error);
