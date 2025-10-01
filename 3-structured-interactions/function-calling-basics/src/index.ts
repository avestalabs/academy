import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import * as readline from "readline";
import * as dotenv from "dotenv";

dotenv.config();

// 1. Define what the AI can call
const calculatorFunction: FunctionDeclaration = {
  name: "calculate",
  description: "Perform basic math calculations",
  parameters: {
    type: Type.OBJECT,
    properties: {
      operation: {
        type: Type.STRING,
        enum: ["add", "subtract", "multiply", "divide"],
        description: "The math operation to perform",
      },
      a: { type: Type.NUMBER, description: "First number" },
      b: { type: Type.NUMBER, description: "Second number" },
    },
    required: ["operation", "a", "b"],
  },
};

// 2. Create the actual function
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
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

// 3. Setup AI
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Error: GEMINI_API_KEY not found");
  process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey });

// 4. Simple function calling with streaming
async function askAI(userMessage: string): Promise<void> {
  try {
    const response = await genAI.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ text: userMessage }],
      config: {
        tools: [{ functionDeclarations: [calculatorFunction] }],
        temperature: 0.1,
      },
    });

    let functionCalls = [];

    // Stream the initial response
    process.stdout.write("AI: ");
    for await (const chunk of response) {
      const chunkText = chunk.text || "";
      process.stdout.write(chunkText);

      // Collect any function calls
      if (chunk.functionCalls) {
        functionCalls.push(...chunk.functionCalls);
      }
    }
    console.log(); // new line after streaming

    // If AI wants to call a function
    if (functionCalls.length > 0) {
      const functionCall = functionCalls[0]; // Get first function call

      console.log(`\nCalling function: ${functionCall.name}`);
      console.log(`Arguments: ${JSON.stringify(functionCall.args)}`);

      // Execute the function
      if (functionCall.name === "calculate" && functionCall.args) {
        const args = functionCall.args;
        const result = calculate(
          args.operation as string,
          args.a as number,
          args.b as number
        );

        console.log(`Result: ${result}\n`);

        // Get AI's final response with streaming
        const finalResponse = await genAI.models.generateContentStream({
          model: "gemini-2.5-flash",
          contents: [
            { role: "user", parts: [{ text: userMessage }] },
            { role: "model", parts: [{ functionCall }] },
            {
              role: "function",
              parts: [
                {
                  functionResponse: {
                    name: "calculate",
                    response: { result },
                  },
                },
              ],
            },
          ],
        });

        // Stream the final answer
        process.stdout.write("AI: ");
        for await (const chunk of finalResponse) {
          const chunkText = chunk.text || "";
          process.stdout.write(chunkText);
        }
        console.log(); // new line after streaming
      }
    }
  } catch (error) {
    console.log(
      "\nError:",
      error instanceof Error ? error.message : "Something went wrong"
    );
  }
}

// 5. Terminal chat interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function startChat(): void {
  console.log("Function Calling AI Assistant");
  console.log("Ask me to calculate something! (type 'exit' to quit)\n");

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

      console.log(); // blank line for readability
      chat();
    });
  };

  chat();
}

// Start the chat
startChat();
