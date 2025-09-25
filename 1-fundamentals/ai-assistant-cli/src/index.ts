import { GoogleGenAI } from "@google/genai";
import * as readline from "readline";
import * as dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("❌ GEMINI_API_KEY not found in environment variables");
  console.log("Please add your API key to the .env file");
  process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let totalTokensUsed = 0;
let conversationCount = 0;

async function askAI(question: string): Promise<void> {
  try {
    console.log("\n🤔 Thinking...\n");

    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: question,
      config: {
        temperature: 0.7,
      },
    });

    console.log(`AI: ${response.text}\n`);

    // Display token usage
    const usage = response.usageMetadata;
    if (usage) {
      const inputTokens = usage.promptTokenCount || 0;
      const outputTokens = usage.candidatesTokenCount || 0;
      const sessionTotal = inputTokens + outputTokens;

      totalTokensUsed += sessionTotal;
      conversationCount++;

      console.log(
        `📊 Token Usage: ${inputTokens} input, ${outputTokens} output (Total: ${sessionTotal})\n`
      );
    }
  } catch (error) {
    console.error("❌ Error calling AI:", error);
    console.log("Please try again.\n");
  }
}

function startAssistant(): void {
  console.log("🤖 AI Assistant Ready! Type 'exit' to quit.\n");

  const askQuestion = (): void => {
    rl.question("You: ", async (input) => {
      const userInput = input.trim();

      if (userInput.toLowerCase() === "exit") {
        console.log(`\n👋 Goodbye! Total session tokens: ${totalTokensUsed}`);
        console.log(`Conversations: ${conversationCount}`);
        rl.close();
        return;
      }

      if (userInput === "") {
        console.log("Please enter a question.\n");
        askQuestion();
        return;
      }

      await askAI(userInput);
      askQuestion(); // Continue the conversation
    });
  };

  askQuestion();
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log(`\n\n👋 Goodbye! Total session tokens: ${totalTokensUsed}`);
  console.log(`Conversations: ${conversationCount}`);
  process.exit(0);
});

// Start the assistant
startAssistant();
