import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

const messages: Message[] = [];

function addMessage(role: "system" | "user" | "assistant", content: string) {
  messages.push({ role, content });
}

function formatMessagesForStreaming(): string {
  return messages.map((msg) => `${msg.role}: ${msg.content}`).join("\n");
}

function displayStreamingResponse(text: string) {
  // Write text without a newline (so it continues on same line)
  process.stdout.write(text || "");
}

async function streamingChatWithDisplay(userMessage: string): Promise<string> {
  addMessage("user", userMessage);
  const conversationPrompt = formatMessagesForStreaming();

  console.log(`\nYou: ${userMessage}`);
  console.log("AI: ");

  const result = await genAI.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: conversationPrompt,
  });
  let fullResponse = "";

  for await (const chunk of result) {
    const chunkText = chunk.text || "";
    fullResponse += chunkText;

    // Display each chunk immediately
    displayStreamingResponse(chunkText || "");
  }

  console.log("\n"); // Add newline when complete
  addMessage("assistant", fullResponse);

  return fullResponse;
}

async function testStreamingConversation() {
  // Set up AI behavior
  addMessage(
    "system",
    "You are a helpful programming tutor. Keep answers practical and include examples."
  );

  console.log("Starting streaming conversation...\n");

  // First streaming message
  await streamingChatWithDisplay("What is TypeScript and why should I use it?");

  // Second streaming message - AI remembers context
  await streamingChatWithDisplay("Show me a simple example with types");

  // Third streaming message
  await streamingChatWithDisplay(
    "What are the main benefits over regular JavaScript?"
  );
}

testStreamingConversation();
