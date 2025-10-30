import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
console.log("API Key: ",process.env.GOOGLE_API_KEY);

const model = genAI.getGenerativeModel({ 
  model: "text-embedding-004" 
});

async function createEmbedding(text: string) {
    try {
      const result = await model.embedContent(text);
      return result.embedding.values;
    } catch (error) {
      console.error('Error creating embedding:', error);
      throw error;
    }
  }
  
  async function testEmbeddings() {
    const texts = [
      "I love programming in TypeScript",
      "TypeScript development is enjoyable",
      "The weather is sunny today"
    ];
  
    for (const text of texts) {
      const embedding = await createEmbedding(text);
      console.log(`Text: "${text}"`);
      console.log(`Embedding dimensions: ${embedding.length}`);
      console.log(`First 5 values: [${embedding.slice(0, 5).join(', ')}]`);
      console.log('---');
    }
  }
  
  function cosineSimilarity(vecA: number[], vecB: number[]): number {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }
  
  async function compareSimilarity() {
    const text1 = "I enjoy coding in TypeScript";
    const text2 = "TypeScript programming is fun";
    const text3 = "The cat is sleeping";
  
    const emb1 = await createEmbedding(text1);
    const emb2 = await createEmbedding(text2);
    const emb3 = await createEmbedding(text3);
  
    console.log('Similarity between programming texts:', 
      cosineSimilarity(emb1, emb2).toFixed(3));
    console.log('Similarity between programming and cat text:', 
      cosineSimilarity(emb1, emb3).toFixed(3));
  }
  
  async function main() {
    console.log('=== Creating Text Embeddings ===\n');
    await testEmbeddings();
    
    console.log('\n=== Comparing Similarities ===\n');
    await compareSimilarity();
  }
  
  main().catch(console.error);
  