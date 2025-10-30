import { GoogleGenerativeAI } from '@google/generative-ai';
import { Client } from 'pg';
import * as path from 'path';
import { ProcessedFile } from './file-processor';

interface DocumentChunk {
  id: number;
  chunk_id: string;
  content: string;
  embedding: number[];
  metadata: {
    source: string;
    chunkIndex: number;
    fileType: string;
    lastModified: Date;
  };
}

interface SearchResult {
  chunk: DocumentChunk;
  similarity: number;
}

export class PostgreSQLDocumentManager {
  private client: Client;
  private genAI: GoogleGenerativeAI;
  private embeddingModel: any;
  private generativeModel: any;

  constructor() {
    this.client = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'cli_document_qa_db',
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

  async connect(): Promise<void> {
    await this.client.connect();
    console.log('📊 Connected to PostgreSQL database');
  }

  async disconnect(): Promise<void> {
    await this.client.end();
    console.log('📊 Disconnected from PostgreSQL database');
  }

    async getStats() {
    try {
        const query = `
        SELECT 
            COUNT(*) as total_chunks,
            COUNT(DISTINCT metadata->>'source') as total_documents,
            array_agg(DISTINCT metadata->>'fileType') as file_types,
            MAX(created_at) as last_updated
        FROM document_chunks
        `;
        
        const result = await this.client.query(query);
        const row = result.rows[0];
        
        return {
        totalChunks: parseInt(row.total_chunks),
        totalDocuments: parseInt(row.total_documents),
        fileTypes: row.file_types ? row.file_types.filter(Boolean) : [],
        lastUpdated: row.last_updated ? new Date(row.last_updated) : null
        };
    } catch (error) {
        console.error('Error getting stats:', error);
        return {
        totalChunks: 0,
        totalDocuments: 0,
        fileTypes: [],
        lastUpdated: null
        };
    }
    }

    async clearDatabase(): Promise<void> {
    try {
        await this.client.query('DELETE FROM document_chunks');
        console.log('🗑️ Database cleared');
    } catch (error) {
        console.error('Error clearing database:', error);
        throw error;
    }
    }

    async checkDocumentExists(filePath: string): Promise<boolean> {
    try {
        const query = `
        SELECT EXISTS(
            SELECT 1 FROM document_chunks 
            WHERE metadata->>'source' = $1
        )
        `;
        const result = await this.client.query(query, [filePath]);
        return result.rows[0].exists;
    } catch (error) {
        console.error('Error checking document existence:', error);
        return false;
    }
    }

    private splitIntoChunks(text: string, chunkSize: number = 600, overlap: number = 100): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
        let end = start + chunkSize;

        if (end < text.length) {
        // Find better breakpoints
        const breakChars = ['\n\n', '\n', '. ', '!', '?', ';'];
        let bestBreak = -1;

        for (const breakChar of breakChars) {
            const breakIndex = text.lastIndexOf(breakChar, end);
            if (breakIndex > start + chunkSize * 0.5) {
            bestBreak = breakIndex + breakChar.length;
            break;
            }
        }

        if (bestBreak > -1) {
            end = bestBreak;
        }
        }

        chunks.push(text.slice(start, end).trim());
        start = end - overlap;
    }

    return chunks.filter(chunk => chunk.length > 20);
    }

    async ingestFile(file: ProcessedFile): Promise<void> {
    console.log(`📄 Processing: ${path.basename(file.path)} (${file.size} bytes)`);

    try {
        // Check if file already exists and remove old chunks
        const existsQuery = `DELETE FROM document_chunks WHERE metadata->>'source' = $1`;
        await this.client.query(existsQuery, [file.path]);

        const textChunks = this.splitIntoChunks(file.content);
        console.log(`  └─ Created ${textChunks.length} chunks`);

        for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];

        // Create embedding for the chunk
        const result = await this.embeddingModel.embedContent(chunk);
        const embedding = result.embedding.values;

        // Prepare chunk data
        const chunkId = `${file.path}_chunk_${i}`;
        const metadata = {
            source: file.path,
            chunkIndex: i,
            fileType: file.type,
            lastModified: file.lastModified.toISOString()
        };

        // Insert into PostgreSQL
        const insertQuery = `
            INSERT INTO document_chunks (chunk_id, content, embedding, metadata)
            VALUES ($1, $2, $3, $4)
        `;

        const values = [
            chunkId,
            chunk,
            `[${embedding.join(',')}]`, // Convert array to PostgreSQL vector format
            JSON.stringify(metadata)
        ];

        await this.client.query(insertQuery, values);
        }

        console.log(`✅ Successfully processed ${file.path}`);
    } catch (error) {
        console.error(`❌ Error ingesting file ${file.path}:`, error);
        throw error;
    }
    }


    async searchSimilarChunks(query: string, topK: number = 4): Promise<SearchResult[]> {
    try {
        // Create embedding for the query
        const result = await this.embeddingModel.embedContent(query);
        const queryEmbedding = result.embedding.values;

        // Execute similarity search using PostgreSQL with pgvector
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
            embedding: [], // We don't need to return the full embedding
            metadata: {
            source: row.metadata.source,
            chunkIndex: row.metadata.chunkIndex,
            fileType: row.metadata.fileType,
            lastModified: new Date(row.metadata.lastModified)
            }
        },
        similarity: parseFloat(row.similarity)
        }));
    } catch (error) {
        console.error('Error searching similar chunks:', error);
        throw error;
    }
    }

    async askQuestion(question: string, maxResults: number = 4): Promise<string> {
    // Check if database has any documents
    const stats = await this.getStats();
    if (stats.totalChunks === 0) {
        return "❌ No documents have been ingested yet. Please ingest some documents first using --ingest.";
    }

    try {
        // Search for relevant chunks using PostgreSQL
        const searchResults = await this.searchSimilarChunks(question, maxResults);

        if (searchResults.length === 0 || searchResults[0].similarity < 0.3) {
        return "🤔 I couldn't find relevant information in the ingested documents to answer your question.";
        }

        // Prepare context from retrieved chunks
        const context = searchResults.map((result, index) => {
        const source = path.basename(result.chunk.metadata.source);
        return `[Source: ${source}]\n${result.chunk.content}`;
        }).join('\n\n---\n\n');

        // Generate answer using the LLM
        const prompt = `You are a helpful assistant answering questions based on provided documentation.

    Context from documents:
    ${context}

    Question: ${question}

    Instructions:
    - Answer based only on the provided context
    - If the context doesn't contain enough information, say so clearly
    - Be specific and reference the sources when possible
    - Keep the answer concise but complete
    - Format your response in a friendly, conversational tone

    Answer:`;

        const response = await this.generativeModel.generateContent(prompt);
        const answer = response.response.text();

        // Add source information
        const sources = Array.from(new Set(searchResults.map(r => path.basename(r.chunk.metadata.source))));
        const sourceInfo = `\n\n📚 Sources: ${sources.join(', ')}`;

        return answer + sourceInfo;

    } catch (error) {
        console.error('❌ Error processing question:', error);
        return "❌ An error occurred while processing your question. Please try again.";
    }
    }

}

