import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import * as readline from "readline";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface SessionStats {
  messagesCount: number;
  toolsUsed: number;
  tokensUsed: number;
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("❌ GEMINI_API_KEY not found");
  process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey });
const messages: Message[] = [];
const stats: SessionStats = {
  messagesCount: 0,
  toolsUsed: 0,
  tokensUsed: 0,
};

function addMessage(role: "system" | "user" | "assistant", content: string) {
  messages.push({ role, content });

  if (role !== "system") {
    stats.messagesCount++;
  }
}

function formatMessagesForAPI() {
  return messages.map((msg) => {
    if (msg.role === "system") return { text: msg.content };
    return { text: `${msg.role}: ${msg.content}` };
  });
}

function initializeAssistant() {
  addMessage(
    "system",
    "You are a helpful AI assistant. You can perform calculations, save files, and check weather. Keep responses practical and reference previous conversation context when relevant. When using tools, briefly explain what you're doing."
  );

  console.log("🚀 AI Assistant Ready! Type 'exit' to quit.\n");
}

// Calculator for mathematical operations
const calculatorFunction: FunctionDeclaration = {
  name: "calculate",
  description: "Perform mathematical calculations",
  parameters: {
    type: Type.OBJECT,
    properties: {
      operation: {
        type: Type.STRING,
        enum: ["add", "subtract", "multiply", "divide", "percentage"],
        description: "Mathematical operation to perform",
      },
      a: { type: Type.NUMBER, description: "First number" },
      b: { type: Type.NUMBER, description: "Second number" },
    },
    required: ["operation", "a", "b"],
  },
};

// File saver for important information
const fileFunction: FunctionDeclaration = {
  name: "saveNote",
  description: "Save information or notes to a text file",
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: {
        type: Type.STRING,
        description: "Name of the file (without extension)",
      },
      content: {
        type: Type.STRING,
        description: "Content to save to the file",
      },
    },
    required: ["filename", "content"],
  },
};

// Weather checker for quick reference
const weatherFunction: FunctionDeclaration = {
  name: "getWeather",
  description: "Get current weather information for a city",
  parameters: {
    type: Type.OBJECT,
    properties: {
      city: {
        type: Type.STRING,
        description: "City name (e.g., tokyo, london, new-york)",
      },
    },
    required: ["city"],
  },
};

const allTools = [calculatorFunction, fileFunction, weatherFunction];

function calculate(operation: string, a: number, b: number): number {
  switch (operation) {
    case "add":
      return a + b;
    case "subtract":
      return a - b;
    case "multiply":
      return a * b;
    case "divide":
      if (b === 0) throw new Error("Cannot divide by zero");
      return a / b;
    case "percentage":
      return (a * b) / 100;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

function saveNote(filename: string, content: string): string {
  try {
    const timestamp = new Date().toISOString().split("T")[0];
    const fullContent = `[${timestamp}] ${content}`;
    fs.writeFileSync(`${filename}.txt`, fullContent);
    return `Successfully saved to ${filename}.txt`;
  } catch (error) {
    throw new Error(`Failed to save file: ${error}`);
  }
}

// Simple weather data for demonstration
const weatherData: Record<string, any> = {
  tokyo: { temp: 22, condition: "sunny", humidity: 65 },
  london: { temp: 15, condition: "rainy", humidity: 80 },
  "new-york": { temp: 18, condition: "cloudy", humidity: 70 },
  "san-francisco": { temp: 20, condition: "foggy", humidity: 75 },
};

function getWeather(city: string) {
  const cityKey = city.toLowerCase().replace(/\s+/g, "-");
  const weather = weatherData[cityKey];

  if (!weather) {
    throw new Error(
      `Weather data not available for ${city}. Available: tokyo, london, new-york, san-francisco`
    );
  }

  return weather;
}

// Helper: run a single tool call
function runTool(functionCall: any): any {
  switch (functionCall.name) {
    case "calculate": {
      const { operation, a, b } = functionCall.args;
      return calculate(operation, a, b);
    }
    case "saveNote": {
      const { filename, content } = functionCall.args;
      return saveNote(filename, content);
    }
    case "getWeather": {
      const { city } = functionCall.args;
      return getWeather(city);
    }
    default:
      throw new Error(`Unknown function: ${functionCall.name}`);
  }
}

async function streamingChatWithTools(userMessage: string): Promise<void> {
  try {
    addMessage("user", userMessage);

    // Phase 1: initial streamed response to surface tool calls
    const initialStream = await genAI.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: formatMessagesForAPI(),
      config: { tools: [{ functionDeclarations: allTools }], temperature: 0.7 },
    });

    let firstCalls: any[] = [];
    let initialText = "";
    let chunkUsage: any = null;

    process.stdout.write("🤔 AI: ");
    for await (const chunk of initialStream) {
      const t = chunk.text || "";
      process.stdout.write(t);
      initialText += t;
      if (chunk.functionCalls && chunk.functionCalls.length > 0) {
        firstCalls.push(...chunk.functionCalls);
      }
      if (chunk.usageMetadata) chunkUsage = chunk.usageMetadata;
    }
    console.log();

    // If no tool calls, we're done
    if (firstCalls.length === 0) {
      addMessage("assistant", initialText);
      if (chunkUsage) {
        stats.tokensUsed +=
          (chunkUsage.promptTokenCount || 0) +
          (chunkUsage.candidatesTokenCount || 0);
      }
      return;
    }

    console.log(`\n🔧 Found ${firstCalls.length} function call(s) to execute:`);

    // Build transcript with the user's prompt
    const transcript: any[] = [
      { role: "user", parts: [{ text: userMessage }] },
    ];

    // Execute first round of calls
    const firstResults: any[] = [];
    for (const call of firstCalls) {
      console.log(`\nCalling: ${call.name}`);
      console.log(`Arguments: ${JSON.stringify(call.args)}`);
      stats.toolsUsed++;
      try {
        const result = runTool(call);
        console.log(`Result: ${JSON.stringify(result)}`);
        firstResults.push({ call, result: { result } });
      } catch (error) {
        console.log(`Error: ${error}`);
        firstResults.push({
          call,
          result: {
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    }

    // Seed transcript with tool calls + results
    for (const { call, result } of firstResults) {
      transcript.push({
        role: "model",
        parts: [{ functionCall: call } as any],
      });
      transcript.push({
        role: "function",
        parts: [
          { functionResponse: { name: call.name, response: result } } as any,
        ],
      });
    }

    // Resolve follow-up calls until none remain
    while (true) {
      let moreCalls: any[] = [];
      let textOut = "";

      const follow = await genAI.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: transcript,
        config: {
          tools: [{ functionDeclarations: allTools }],
          temperature: 0.7,
        },
      });
      for await (const c of follow) {
        const ct = c.text || "";
        process.stdout.write(ct);
        textOut += ct;
        if (c.functionCalls && c.functionCalls.length > 0) {
          moreCalls.push(...c.functionCalls);
        }
      }

      if (moreCalls.length === 0) {
        console.log();
        addMessage("assistant", textOut);
        break;
      }

      console.log(
        `\n\n🔧 Found ${moreCalls.length} additional function call(s):`
      );
      const roundResults: any[] = [];
      for (const call of moreCalls) {
        console.log(`\nCalling: ${call.name}`);
        console.log(`Arguments: ${JSON.stringify(call.args)}`);
        stats.toolsUsed++;
        try {
          const result = runTool(call);
          console.log(`Result: ${JSON.stringify(result)}`);
          roundResults.push({ call, result: { result } });
        } catch (error) {
          console.log(`Error: ${error}`);
          roundResults.push({
            call,
            result: {
              error: error instanceof Error ? error.message : "Unknown error",
            },
          });
        }
      }

      for (const { call, result } of roundResults) {
        transcript.push({
          role: "model",
          parts: [{ functionCall: call } as any],
        });
        transcript.push({
          role: "function",
          parts: [
            { functionResponse: { name: call.name, response: result } } as any,
          ],
        });
      }
      process.stdout.write("\nAI: ");
    }

    if (chunkUsage) {
      stats.tokensUsed +=
        (chunkUsage.promptTokenCount || 0) +
        (chunkUsage.candidatesTokenCount || 0);
    }
  } catch (error) {
    console.error("\n❌ Error:", error);
    addMessage("assistant", "Sorry, I encountered an error. Please try again.");
  }
}

function startAssistant(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (): void => {
    rl.question("You: ", async (input) => {
      const userInput = input.trim();

      if (userInput.toLowerCase() === "exit") {
        console.log("\n👋 Thanks for using the AI Assistant!");
        console.log(
          `📊 Final Stats - Messages: ${stats.messagesCount} | Tools used: ${stats.toolsUsed} | Tokens: ${stats.tokensUsed}`
        );
        rl.close();
        return;
      }

      if (userInput === "") {
        console.log("Please enter a message.\n");
        askQuestion();
        return;
      }

      await streamingChatWithTools(userInput);

      // Show simple stats after each interaction
      console.log(
        `📊 Messages: ${stats.messagesCount} | Tools used: ${stats.toolsUsed} | Tokens: ${stats.tokensUsed}\n`
      );

      askQuestion();
    });
  };

  askQuestion();
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\n👋 Session ended!");
  console.log(
    `📊 Final Stats - Messages: ${stats.messagesCount} | Tools used: ${stats.toolsUsed} | Tokens: ${stats.tokensUsed}`
  );
  process.exit(0);
});

// Start the assistant
initializeAssistant();
startAssistant();
