import { GoogleGenAI, Type } from "@google/genai";
import * as readline from "readline";
import * as dotenv from "dotenv";

dotenv.config();

// Schema for extracting person information
const personSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Full name of the person" },
    age: { type: Type.INTEGER, description: "Age in years" },
    email: { type: Type.STRING, description: "Email address" },
    phone: { type: Type.STRING, description: "Phone number (optional)" },
    occupation: {
      type: Type.STRING,
      description: "Job or profession (optional)",
    },
  },
  required: ["name", "age", "email"],
};

// Schema for analyzing product reviews
const reviewAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    sentiment: {
      type: Type.STRING,
      enum: ["positive", "negative", "neutral"],
      description: "Overall sentiment of the review",
    },
    rating: {
      type: Type.INTEGER,
      description: "Estimated rating from 1-5 based on review content",
    },
    keyPoints: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Main points mentioned in the review",
    },
    categories: {
      type: Type.ARRAY,
      items: {
        type: Type.STRING,
        enum: ["quality", "price", "service", "delivery", "features"],
      },
      description: "Categories the review mentions",
    },
  },
  required: ["sentiment", "rating", "keyPoints"],
};

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Error: GEMINI_API_KEY not found");
  process.exit(1);
}

const genAI = new GoogleGenAI({ apiKey });

// Simple JSON mode - AI tries to return JSON
async function extractWithJSONMode(text: string): Promise<void> {
  try {
    console.log("🔄 Using JSON Mode...");

    const prompt = `Extract person information from this text and return ONLY valid JSON: "${text}"
    
    Return format: {"name": "...", "age": ..., "email": "...", "phone": "...", "occupation": "..."}`;

    const response = await genAI.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ text: prompt }],
      config: {
        temperature: 0.1,
        responseMimeType: "application/json", // This enables JSON mode
      },
    });

    let fullResponse = "";
    process.stdout.write("AI Response: ");

    for await (const chunk of response) {
      const chunkText = chunk.text || "";
      process.stdout.write(chunkText);
      fullResponse += chunkText;
    }

    console.log("\n");

    // Try to parse the JSON
    try {
      const parsed = JSON.parse(fullResponse);
      console.log("✅ Successfully parsed JSON:", parsed);
    } catch (parseError) {
      console.log("❌ Failed to parse JSON:", parseError);
    }
  } catch (error) {
    console.log(
      "Error:",
      error instanceof Error ? error.message : "Something went wrong"
    );
  }
}

// Structured output with schema - guaranteed format
async function extractWithSchema(text: string): Promise<void> {
  try {
    console.log("🔄 Using Structured Output Schema...");

    const response = await genAI.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [
        {
          text: `Extract person information from this text: "${text}"`,
        },
      ],
      config: {
        temperature: 0.1,
        responseSchema: personSchema, // This enforces the exact schema
        responseMimeType: "application/json",
      },
    });

    let fullResponse = "";
    process.stdout.write("AI Response: ");

    for await (const chunk of response) {
      const chunkText = chunk.text || "";
      process.stdout.write(chunkText);
      fullResponse += chunkText;
    }

    console.log("\n");

    // Parse the guaranteed-valid JSON
    const parsed = JSON.parse(fullResponse);
    console.log("✅ Structured data extracted:", parsed);

    // Validate required fields are present
    if (parsed.name && parsed.age && parsed.email) {
      console.log("✅ All required fields present");
    } else {
      console.log("❌ Missing required fields");
    }
  } catch (error) {
    console.log(
      "Error:",
      error instanceof Error ? error.message : "Something went wrong"
    );
  }
}

// Complex structured output for review analysis
async function analyzeReview(reviewText: string): Promise<void> {
  try {
    console.log("🔄 Analyzing review with structured output...");

    const response = await genAI.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [
        {
          text: `Analyze this product review and extract structured information: "${reviewText}"`,
        },
      ],
      config: {
        temperature: 0.1,
        responseSchema: reviewAnalysisSchema,
        responseMimeType: "application/json",
      },
    });

    let fullResponse = "";
    process.stdout.write("Analysis: ");

    for await (const chunk of response) {
      const chunkText = chunk.text || "";
      process.stdout.write(chunkText);
      fullResponse += chunkText;
    }

    console.log("\n");

    const analysis = JSON.parse(fullResponse);

    // Display formatted results
    console.log("📊 Review Analysis Results:");
    console.log(`   Sentiment: ${analysis.sentiment}`);
    console.log(`   Rating: ${analysis.rating}/5`);
    console.log(`   Key Points: ${analysis.keyPoints.join(", ")}`);
    if (analysis.categories) {
      console.log(`   Categories: ${analysis.categories.join(", ")}`);
    }
  } catch (error) {
    console.log(
      "Error:",
      error instanceof Error ? error.message : "Something went wrong"
    );
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function startDemo(): void {
  console.log("🎯 JSON Mode & Structured Outputs Demo");
  console.log("Choose an option:");
  console.log("1. Extract person info (JSON Mode)");
  console.log("2. Extract person info (Structured Output)");
  console.log("3. Analyze product review");
  console.log("4. Exit\n");

  const handleChoice = (): void => {
    rl.question("Enter choice (1-4): ", async (choice) => {
      switch (choice) {
        case "1":
          rl.question("Enter text with person info: ", async (text) => {
            await extractWithJSONMode(text);
            console.log("\n" + "=".repeat(50) + "\n");
            handleChoice();
          });
          break;

        case "2":
          rl.question("Enter text with person info: ", async (text) => {
            await extractWithSchema(text);
            console.log("\n" + "=".repeat(50) + "\n");
            handleChoice();
          });
          break;

        case "3":
          rl.question("Enter product review: ", async (review) => {
            await analyzeReview(review);
            console.log("\n" + "=".repeat(50) + "\n");
            handleChoice();
          });
          break;

        case "4":
          console.log("Goodbye!");
          rl.close();
          return;

        default:
          console.log("Invalid choice. Please enter 1-4.");
          handleChoice();
      }
    });
  };

  handleChoice();
}

startDemo();
