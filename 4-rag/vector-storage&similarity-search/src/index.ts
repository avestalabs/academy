import { GoogleGenerativeAI } from '@google/generative-ai';
import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

interface VectorDocument {
  id: number;
  content: string;
  embedding: number[];
  metadata?: Record<string, any>;
  created_at: Date;
}

class PostgreSQLVectorStore {
  private client: Client;
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    this.client = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'vector_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
    });

    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    this.model = this.genAI.getGenerativeModel({ model: "text-embedding-004" });
  }

  async connect() {
    await this.client.connect();
    console.log('Connected to PostgreSQL database');
  }

  async disconnect() {
    await this.client.end();
    console.log('Disconnected from PostgreSQL database');
  }

  async addDocument(content: string, metadata?: Record<string, any>): Promise<number> {
    try {
      const result = await this.model.embedContent(content);
      const embedding = result.embedding.values;

      const query = `
        INSERT INTO documents (content, embedding, metadata)
        VALUES ($1, $2, $3)
        RETURNING id
      `;
      
      const values = [
        content,
        `[${embedding.join(',')}]`,
        metadata ? JSON.stringify(metadata) : null
      ];

      const res = await this.client.query(query, values);
      const documentId = res.rows[0].id;
      
      console.log(`Added document with ID: ${documentId}`);
      return documentId;
    } catch (error) {
      console.error('Error adding document:', error);
      throw error;
    }
  }

  async search(query: string, topK: number = 5): Promise<Array<VectorDocument & { similarity: number }>> {
    try {
      const result = await this.model.embedContent(query);
      const queryEmbedding = result.embedding.values;

      const searchQuery = `
        SELECT 
          id,
          content,
          metadata,
          created_at,
          1 - (embedding <=> $1) AS similarity
        FROM documents
        ORDER BY embedding <=> $1
        LIMIT $2
      `;

      const queryVector = `[${queryEmbedding.join(',')}]`;
      const res = await this.client.query(searchQuery, [queryVector, topK]);

      return res.rows.map(row => ({
        id: row.id,
        content: row.content,
        embedding: [],
        metadata: row.metadata,
        created_at: row.created_at,
        similarity: parseFloat(row.similarity)
      }));
    } catch (error) {
      console.error('Error searching documents:', error);
      throw error;
    }
  }

  async searchWithFilter(
    query: string, 
    topK: number = 5, 
    metadataFilter?: Record<string, any>
  ): Promise<Array<VectorDocument & { similarity: number }>> {
    try {
      const result = await this.model.embedContent(query);
      const queryEmbedding = result.embedding.values;

      let searchQuery = `
        SELECT 
          id,
          content,
          metadata,
          created_at,
          1 - (embedding <=> $1) AS similarity
        FROM documents
      `;

      const queryParams: any[] = [`[${queryEmbedding.join(',')}]`];

      if (metadataFilter) {
        const filterConditions = Object.entries(metadataFilter).map((_, index) => {
          return `metadata->>'${Object.keys(metadataFilter)[index]}' = $${index + 2}`;
        });
        
        searchQuery += ` WHERE ${filterConditions.join(' AND ')}`;
        queryParams.push(...Object.values(metadataFilter));
      }

      searchQuery += ` ORDER BY embedding <=> $1 LIMIT $${queryParams.length + 1}`;
      queryParams.push(topK);

      const res = await this.client.query(searchQuery, queryParams);

      return res.rows.map(row => ({
        id: row.id,
        content: row.content,
        embedding: [],
        metadata: row.metadata,
        created_at: row.created_at,
        similarity: parseFloat(row.similarity)
      }));
    } catch (error) {
      console.error('Error searching with filter:', error);
      throw error;
    }
  }
}

async function testPostgreSQLVectorStore() {
  const vectorStore = new PostgreSQLVectorStore();
  
  try {
    await vectorStore.connect();

    await vectorStore.addDocument(
      "TypeScript is a strongly typed programming language that builds on JavaScript",
      { category: "programming", language: "typescript" }
    );
    
    await vectorStore.addDocument(
      "JavaScript is a versatile programming language for web development",
      { category: "programming", language: "javascript" }
    );
    
    await vectorStore.addDocument(
      "The weather forecast shows sunny skies for the weekend",
      { category: "weather", location: "general" }
    );
    
    await vectorStore.addDocument(
      "React is a popular JavaScript library for building user interfaces",
      { category: "programming", language: "javascript", framework: "react" }
    );

    console.log('\n=== Basic Search Results ===');
    const results = await vectorStore.search("programming languages", 3);
    
    results.forEach((result, index) => {
      console.log(`${index + 1}. ${result.content}`);
      console.log(`   Similarity: ${result.similarity.toFixed(3)}`);
      console.log(`   Category: ${result.metadata?.category}`);
      console.log('---');
    });

    console.log('\n=== Filtered Search Results (Programming only) ===');
    const filteredResults = await vectorStore.searchWithFilter(
      "web development", 
      2, 
      { category: "programming" }
    );
    
    filteredResults.forEach((result, index) => {
      console.log(`${index + 1}. ${result.content}`);
      console.log(`   Similarity: ${result.similarity.toFixed(3)}`);
      console.log(`   Language: ${result.metadata?.language}`);
      console.log('---');
    });

  } finally {
    await vectorStore.disconnect();
  }
}

async function main() {
  console.log('=== PostgreSQL Vector Store Demo ===\n');
  await testPostgreSQLVectorStore();
}

main().catch(console.error);
