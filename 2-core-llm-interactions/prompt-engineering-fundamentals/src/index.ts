import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY not found in environment variables");
  process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey });

async function testPromptTechniques() {
  const userQuestion = "How do I handle errors in TypeScript?";

  // Basic prompt
  const basicPrompt = userQuestion;

  // Enhanced prompt with role and structure
  const enhancedPrompt = `You are a TypeScript expert teaching a developer.
  
  Question: ${userQuestion}
  
  Please structure your response as:
  1. Brief explanation
  2. Simple code example
  3. Best practice tip`;

  console.log("Basic prompt:", basicPrompt);
  console.log("Enhanced prompt:", enhancedPrompt);

  console.log("AI is thinking...");
  // Test both prompts
  const basicResponse = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    contents: basicPrompt,
  });

  const enhancedResponse = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    contents: enhancedPrompt,
  });

  console.log("Basic response:", basicResponse.text);
  console.log("Enhanced response:", enhancedResponse.text);
}

testPromptTechniques();
