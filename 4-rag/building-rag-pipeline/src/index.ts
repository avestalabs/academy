import { GoogleGenerativeAI } from '@google/generative-ai';
import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

interface DocumentChunk {
  id: number;
  chunk_id: string;
  content: string;
  embedding: number[];
  metadata: {
    source: string;
    chunkIndex: number;
    timestamp: Date;
  };
}

interface SearchResult {
  chunk: DocumentChunk;
  similarity: number;
}

class PostgreSQLRAGPipeline {
  private client: Client;
  private genAI: GoogleGenerativeAI;
  private embeddingModel: any;
  private generativeModel: any;

  constructor() {
    this.client = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'rag_pipeline_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
    });

    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    this.embeddingModel = this.genAI.getGenerativeModel({
      model: "text-embedding-004"
    });
    this.generativeModel = this.genAI.getGenerativeModel({
      model: "gemini-2.5-flash"
    });
  }

  async connect() {
    await this.client.connect();
    console.log('Connected to PostgreSQL database');
  }

  async disconnect() {
    await this.client.end();
    console.log('Disconnected from PostgreSQL database');
  }

  // Split text into overlapping chunks for embedding
  private splitIntoChunks(text: string, chunkSize: number = 500, overlap: number = 50): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + chunkSize;

      // Try to break at natural boundaries
      if (end < text.length) {
        const lastPeriod = text.lastIndexOf('. ', end);
        const lastNewline = text.lastIndexOf('\n', end);
        const breakPoint = Math.max(lastPeriod, lastNewline);

        if (breakPoint > start + chunkSize * 0.5) {
          end = breakPoint + 1;
        }
      }

      chunks.push(text.slice(start, end).trim());
      start = end - overlap; // overlap for context continuity
    }

    return chunks.filter(chunk => chunk.length > 0);
  }

  // Ingest document into PostgreSQL with embeddings
  async ingestDocument(content: string, source: string): Promise<void> {
    console.log(`Ingesting document: ${source}`);

    try {
      // Step 1: Split document into chunks
      const textChunks = this.splitIntoChunks(content);
      console.log(`Created ${textChunks.length} chunks`);

      // Step 2: Create embeddings and store in PostgreSQL
      for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];

        // Create embedding for the chunk
        const result = await this.embeddingModel.embedContent(chunk);
        const embedding = result.embedding.values;

        // Prepare chunk data
        const chunkId = `${source}_chunk_${i}`;
        const metadata = {
          source: source,
          chunkIndex: i,
          timestamp: new Date()
        };

        // Insert into PostgreSQL
        const query = `
          INSERT INTO document_chunks (chunk_id, content, embedding, metadata)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (chunk_id) DO UPDATE SET
            content = EXCLUDED.content,
            embedding = EXCLUDED.embedding,
            metadata = EXCLUDED.metadata
        `;

        const values = [
          chunkId,
          chunk,
          `[${embedding.join(',')}]`, // Convert array to PostgreSQL vector format
          JSON.stringify(metadata)
        ];

        await this.client.query(query, values);
        console.log(`Processed chunk ${i + 1}/${textChunks.length}`);
      }

      console.log(`Successfully ingested ${source}`);
    } catch (error) {
      console.error(`Error ingesting document ${source}:`, error);
      throw error;
    }
  }

  // Search PostgreSQL for similar chunks using vector similarity
  async searchSimilarChunks(query: string, topK: number = 3): Promise<SearchResult[]> {
    try {
      // Create embedding for the query
      const result = await this.embeddingModel.embedContent(query);
      const queryEmbedding = result.embedding.values;

      // Execute similarity search
      const searchQuery = `
        SELECT
          id,
          chunk_id,
          content,
          metadata,
          created_at,
          1 - (embedding <=> $1) AS similarity
        FROM document_chunks
        ORDER BY embedding <=> $1
        LIMIT $2
      `;

      const queryVector = `[${queryEmbedding.join(',')}]`;
      const res = await this.client.query(searchQuery, [queryVector, topK]);

      return res.rows.map(row => ({
        chunk: {
          id: row.id,
          chunk_id: row.chunk_id,
          content: row.content,
          embedding: [],
          metadata: row.metadata
        },
        similarity: parseFloat(row.similarity)
      }));
    } catch (error) {
      console.error('Error searching similar chunks:', error);
      throw error;
    }
  }

  // Generate answer using LLM based on retrieved context
  async generateAnswer(query: string, maxContext: number = 3): Promise<string> {
    console.log(`Processing query: "${query}"`);

    try {
      // Step 1: Search for relevant chunks
      const searchResults = await this.searchSimilarChunks(query, maxContext);

      if (searchResults.length === 0) {
        return "I don't have enough information to answer that question.";
      }

      // Step 2: Prepare context
      const context = searchResults
        .map((result, index) =>
          `Context ${index + 1} (similarity: ${result.similarity.toFixed(3)}):\n${result.chunk.content}`
        )
        .join('\n\n---\n\n');

      // Step 3: Create LLM prompt
      const prompt = `You are a helpful assistant. Answer the user's question based on the provided context.

Context:
${context}

Question: ${query}

Instructions:
- Use only the information provided in the context
- If the context doesn't contain enough information, say so
- Be specific and cite relevant parts of the context
- Keep your answer concise but complete

Answer:`;

      // Step 4: Generate answer using the LLM
      const result = await this.generativeModel.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error('Error generating answer:', error);
      return "I encountered an error while generating the answer.";
    }
  }
}

// Demo function to ingest and query documents
async function demonstrateRAGPipeline() {
  const rag = new PostgreSQLRAGPipeline();

  try {
    await rag.connect();

    // Sample documents to ingest
    const documents = [
      {
        source: "typescript_basics.md",
        content: `TypeScript is a programming language developed by Microsoft. It adds static type definitions to JavaScript. TypeScript code is compiled to JavaScript, which means it can run anywhere JavaScript runs. The main benefits include better IDE support, early error detection, and improved code maintainability. To get started with TypeScript, you need to install it using npm install -g typescript.`
      },
      {
        source: "async_await.md",
        content: `Async/await in TypeScript provides a clean way to handle asynchronous operations. Use async before function declarations and await before asynchronous calls. Error handling with async/await is done using try-catch blocks. For example: async function fetchData() { try { const result = await fetch('/api/data'); return await result.json(); } catch (error) { console.error('Error:', error); } }`
      },
      {
        source: "debugging_tips.md",
        content: `Debugging TypeScript applications involves several techniques. Use the debugger statement for breakpoints. Console.log is helpful for quick debugging. TypeScript compiler provides excellent error messages. Use source maps for debugging compiled code. VS Code has excellent TypeScript debugging support with built-in debugging tools.`
      }
    ];

    // Ingest all documents
    console.log('=== Starting Document Ingestion ===\n');
    for (const doc of documents) {
      await rag.ingestDocument(doc.content, doc.source);
      console.log('---');
    }

    // Test queries
    const queries = [
      "How do I handle errors in async/await?",
      "What is TypeScript?",
      "How can I debug TypeScript code?",
      "What are the benefits of using TypeScript?"
    ];

    console.log('\n=== Testing RAG Pipeline ===\n');
    for (const query of queries) {
      console.log(`🤔 Question: ${query}`);
      const answer = await rag.generateAnswer(query);
      console.log(`🤖 Answer: ${answer}\n`);
      console.log('---\n');
    }
  } finally {
    await rag.disconnect();
  }
}

// Entry point
async function main() {
  try {
    await demonstrateRAGPipeline();
  } catch (error) {
    console.error('Pipeline error:', error);
  }
}

main().catch(console.error);
