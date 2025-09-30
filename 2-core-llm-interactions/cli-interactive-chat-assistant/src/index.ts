import { GoogleGenAI } from "@google/genai";
import * as readline from "readline";
import * as dotenv from "dotenv";

dotenv.config();

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("❌ GEMINI_API_KEY not found in environment variables");
  process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey });
const messages: Message[] = [];
let totalTokensUsed = 0;

function addMessage(role: "system" | "user" | "assistant", content: string) {
  messages.push({ role, content });
}

function formatMessagesForAPI(): string {
  return messages.map((msg) => `${msg.role}: ${msg.content}`).join("\n");
}

function initializeAssistant() {
  addMessage(
    "system",
    "You are a helpful programming tutor. Keep your answers practical and concise. When users ask follow-up questions, reference previous parts of our conversation to maintain context."
  );

  console.log("🤖 AI Programming Tutor Ready!");
  console.log(
    "💡 I'm here to help you learn programming. Type 'help' for commands.\n"
  );
}

async function streamingChat(userMessage: string): Promise<string> {
  try {
    // Add user message to conversation history
    addMessage("user", userMessage);

    console.log("🤔 AI: ");

    // Send entire conversation history to AI for streaming
    const conversationPrompt = formatMessagesForAPI();

    const result = await genAI.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: conversationPrompt,
      config: {
        temperature: 0.7,
        maxOutputTokens: 500,
      },
    });

    let fullResponse = "";
    let chunkUsage = null;

    // Process streaming chunks
    for await (const chunk of result) {
      const chunkText = chunk.text || "";
      fullResponse += chunkText;

      // Display each chunk immediately for real-time effect
      process.stdout.write(chunkText);

      // Capture usage metadata from chunks
      if (chunk.usageMetadata) {
        chunkUsage = chunk.usageMetadata;
      }
    }

    console.log("\n"); // Add newline when streaming is complete

    // Add complete AI response to conversation history
    addMessage("assistant", fullResponse);

    // Track token usage from the final chunk
    if (chunkUsage) {
      const sessionTokens =
        (chunkUsage.promptTokenCount || 0) +
        (chunkUsage.candidatesTokenCount || 0);
      totalTokensUsed += sessionTokens;
    }

    return fullResponse;
  } catch (error) {
    console.error("\n❌ Error in conversation:", error);
    return "Sorry, I encountered an error. Please try again.";
  }
}

function showConversationHistory() {
  console.log("📜 Conversation History:");
  console.log("=".repeat(50));

  messages.forEach((msg, index) => {
    if (msg.role === "system") return; // Skip system message in display

    const speaker = msg.role === "user" ? "You" : "AI";
    const content =
      msg.content.length > 100
        ? msg.content.substring(0, 100) + "..."
        : msg.content;

    console.log(`${index}. ${speaker}: ${content}`);
  });

  console.log("=".repeat(50) + "\n");
}

function clearConversation() {
  // Keep only the system message
  const systemMessage = messages.find((msg) => msg.role === "system");
  messages.length = 0;

  if (systemMessage) {
    messages.push(systemMessage);
  }

  console.log("🧹 Conversation cleared! Starting fresh.\n");
}

function showStats() {
  const userMessages = messages.filter((msg) => msg.role === "user").length;
  const aiMessages = messages.filter((msg) => msg.role === "assistant").length;

  console.log("📊 Session Statistics:");
  console.log(`  Total messages: ${messages.length - 1}`); // Exclude system message
  console.log(`  Your messages: ${userMessages}`);
  console.log(`  AI responses: ${aiMessages}`);
  console.log(`  Total tokens used: ${totalTokensUsed}\n`);
}

function handleSpecialCommands(input: string): boolean {
  const command = input.toLowerCase().trim();

  switch (command) {
    case "help":
      console.log("📋 Available commands:");
      console.log("  help     - Show this help message");
      console.log("  history  - Show conversation history");
      console.log("  clear    - Clear conversation (keeps system message)");
      console.log("  stats    - Show session statistics");
      console.log("  exit     - End the conversation\n");
      return true;

    case "history":
      showConversationHistory();
      return true;

    case "clear":
      clearConversation();
      return true;

    case "stats":
      showStats();
      return true;

    default:
      return false;
  }
}

function startConversation(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (): void => {
    rl.question("You: ", async (input) => {
      const userInput = input.trim();

      if (userInput.toLowerCase() === "exit") {
        console.log("\n👋 Thanks for chatting! Here's your session summary:");
        showStats();
        rl.close();
        return;
      }

      if (userInput === "") {
        console.log("Please enter a message or command.\n");
        askQuestion();
        return;
      }

      // Check for special commands
      if (handleSpecialCommands(userInput)) {
        askQuestion();
        return;
      }

      // Regular streaming conversation
      await streamingChat(userInput);

      // Show quick stats after each response
      const messageCount = messages.length - 1; // Exclude system message
      console.log(
        `📊 Messages: ${messageCount} | Session tokens: ${totalTokensUsed}\n`
      );

      askQuestion();
    });
  };

  askQuestion();
}

// Graceful shutdown handling
process.on("SIGINT", () => {
  console.log("\n\n👋 Conversation ended!");
  showStats();
  process.exit(0);
});

// Start the assistant
initializeAssistant();
startConversation();
