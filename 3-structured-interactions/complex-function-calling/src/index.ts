import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import * as readline from "readline";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

// Tool 1: Enhanced Calculator
const calculatorFunction: FunctionDeclaration = {
  name: "calculate",
  description: "Perform math calculations including percentages",
  parameters: {
    type: Type.OBJECT,
    properties: {
      operation: {
        type: Type.STRING,
        enum: ["add", "subtract", "multiply", "divide", "percentage"],
        description: "Math operation to perform",
      },
      a: { type: Type.NUMBER, description: "First number" },
      b: { type: Type.NUMBER, description: "Second number" },
    },
    required: ["operation", "a", "b"],
  },
};

// Tool 2: Mock Weather Service
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

// Tool 3: File Operations
const fileFunction: FunctionDeclaration = {
  name: "saveNote",
  description: "Save a note or information to a file",
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: { type: Type.STRING, description: "Name of the file" },
      content: { type: Type.STRING, description: "Content to save" },
    },
    required: ["filename", "content"],
  },
};

// Calculator implementation
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

// Mock weather database (no API needed!)
const weatherData: Record<string, any> = {
  tokyo: { temp: 22, condition: "sunny", humidity: 65 },
  london: { temp: 15, condition: "rainy", humidity: 80 },
  "new-york": { temp: 18, condition: "cloudy", humidity: 70 },
  paris: { temp: 20, condition: "partly cloudy", humidity: 55 },
};

function getWeather(city: string) {
  const cityKey = city.toLowerCase().replace(/\s+/g, "-");
  const weather = weatherData[cityKey];

  if (!weather) {
    throw new Error(`Weather data not available for ${city}`);
  }

  return weather;
}

// File operations
function saveNote(filename: string, content: string): string {
  try {
    fs.writeFileSync(`${filename}.txt`, content);
    return `Successfully saved to ${filename}.txt`;
  } catch (error) {
    throw new Error(`Failed to save file: ${error}`);
  }
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Error: GEMINI_API_KEY not found");
  process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey });

// All available tools
const allTools = [calculatorFunction, weatherFunction, fileFunction];

async function askAI(userMessage: string): Promise<void> {
  try {
    // Send message with all available tools
    const response = await genAI.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ text: userMessage }],
      config: {
        tools: [{ functionDeclarations: allTools }],
        temperature: 0.1,
      },
    });

    let functionCalls: any[] = [];

    // Stream initial response
    process.stdout.write("AI: ");
    for await (const chunk of response) {
      const chunkText = chunk.text || "";
      process.stdout.write(chunkText);

      if (chunk.functionCalls) {
        functionCalls.push(...chunk.functionCalls);
      }
    }
    console.log();

    // Execute any function calls
    if (functionCalls.length > 0) {
      const functionResults = [];

      for (const functionCall of functionCalls) {
        console.log(`\nCalling: ${functionCall.name}`);
        console.log(`Arguments: ${JSON.stringify(functionCall.args)}`);

        try {
          let result;

          // Execute the appropriate function
          switch (functionCall.name) {
            case "calculate":
              const { operation, a, b } = functionCall.args;
              result = calculate(operation, a, b);
              break;

            case "getWeather":
              const { city } = functionCall.args;
              result = getWeather(city);
              break;

            case "saveNote":
              const { filename, content } = functionCall.args;
              result = saveNote(filename, content);
              break;

            default:
              throw new Error(`Unknown function: ${functionCall.name}`);
          }

          console.log(`Result: ${JSON.stringify(result)}`);

          functionResults.push({
            call: functionCall,
            result: { result: result },
          });
        } catch (error) {
          console.log(`Error: ${error}`);
          functionResults.push({
            call: functionCall,
            result: {
              error: error instanceof Error ? error.message : "Unknown error",
            },
          });
        }
      }
      // Build conversation context with all function results
      const conversationParts = [
        { role: "user", parts: [{ text: userMessage }] },
      ];

      // Add each function call and result
      for (const { call, result } of functionResults) {
        conversationParts.push({
          role: "model",
          parts: [{ functionCall: call } as any],
        });
        conversationParts.push({
          role: "function",
          parts: [
            {
              functionResponse: {
                name: call.name,
                response: result,
              },
            } as any,
          ],
        });
      }

      // Get final response with all context
      const finalResponse = await genAI.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: conversationParts,
      });

      console.log();
      process.stdout.write("AI: ");
      for await (const chunk of finalResponse) {
        const chunkText = chunk.text || "";
        process.stdout.write(chunkText);
      }
      console.log();
    }
  } catch (error) {
    console.log(
      "\nError:",
      error instanceof Error ? error.message : "Something went wrong"
    );
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function startChat(): void {
  console.log("Multi-Tool AI Assistant");
  console.log("I can calculate, check weather, and save notes!");
  console.log("Try: 'What's 15% of 200 and what's the weather in Tokyo?'\n");

  const chat = (): void => {
    rl.question("You: ", async (input) => {
      if (input.toLowerCase() === "exit") {
        console.log("Goodbye!");
        rl.close();
        return;
      }

      if (input.trim()) {
        await askAI(input);
      }

      console.log();
      chat();
    });
  };

  chat();
}

startChat();
