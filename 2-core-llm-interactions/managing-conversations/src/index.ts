import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY not found in environment variables");
  process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey });

// A simple message structure
interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

const messages: Message[] = [];

function addMessage(role: "system" | "user" | "assistant", content: string) {
  messages.push({ role, content });
}

// Add a system message to guide the AI's behavior
addMessage(
  "system",
  "You are a helpful programming tutor. Keep your answers short and practical."
);

function formatMessages(): string {
  return messages.map((msg) => `${msg.role}: ${msg.content}`).join("\n");
}

async function chat(userMessage: string): Promise<string> {
  // Add the user's message to history
  addMessage("user", userMessage);

  // Create the full conversation prompt
  const conversationPrompt = formatMessages();

  // Send to AI using the same method as tutorial 2.1
  const response = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    contents: conversationPrompt,
  });

  const aiResponse = response.text;

  // Add AI's response to history
  addMessage("assistant", aiResponse || "");

  return aiResponse || "";
}

async function testConversation() {
  // Set up the AI's behavior first
  addMessage(
    "system",
    "You are a helpful programming tutor. Keep your answers short and practical."
  );

  console.log("Starting conversation...\n");

  // First message
  const response1 = await chat("What is TypeScript?");
  console.log("You: What is TypeScript?");
  console.log("AI:", response1, "\n");

  // Second message - AI remembers the context
  const response2 = await chat("Show me a simple example");
  console.log("You: Show me a simple example");
  console.log("AI:", response2, "\n");

  // Third message - still remembers
  const response3 = await chat("What are its main benefits?");
  console.log("You: What are its main benefits?");
  console.log("AI:", response3);
}

testConversation();
