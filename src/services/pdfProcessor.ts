import pdf from 'pdf-parse';
import config from '../config';

/**
 * PDF processing and text extraction service
 */

export interface PDFProcessingResult {
  text: string;
  chunks: TextChunk[];
  metadata: PDFMetadata;
}

export interface TextChunk {
  id: string;
  text: string;
  embedding?: number[];
  chunkIndex: number;
  wordCount: number;
}

export interface PDFMetadata {
  title?: string;
  author?: string;
  pages: number;
  wordCount: number;
  extractedAt: Date;
}

/**
 * Extract text from PDF buffer
 */
export async function extractTextFromPDF(pdfBuffer: Buffer, filename: string): Promise<PDFProcessingResult> {
  console.log(`[pdfProcessor] Processing PDF: ${filename}`);
  
  try {
    // Extract text using pdf-parse
    const pdfData = await pdf(pdfBuffer);
    
    if (!pdfData.text || pdfData.text.trim().length === 0) {
      throw new Error('No text content found in PDF');
    }
    
    // Clean and normalize text
    const cleanedText = cleanPDFText(pdfData.text);
    
    // Create chunks for better RAG performance
    const chunks = createTextChunks(cleanedText);
    
    // Extract metadata
    const metadata: PDFMetadata = {
      title: pdfData.info?.Title || filename.replace('.pdf', ''),
      author: pdfData.info?.Author,
      pages: pdfData.numpages,
      wordCount: cleanedText.split(/\s+/).length,
      extractedAt: new Date()
    };
    
    console.log(`[pdfProcessor] Successfully processed PDF: ${chunks.length} chunks, ${metadata.wordCount} words`);
    
    return {
      text: cleanedText,
      chunks,
      metadata
    };
    
  } catch (error) {
    console.error(`[pdfProcessor] Error processing PDF ${filename}:`, error);
    throw new Error(`Failed to process PDF: ${(error as Error).message}`);
  }
}

/**
 * Clean and normalize extracted PDF text
 */
function cleanPDFText(text: string): string {
  return text
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Remove page headers/footers (common patterns)
    .replace(/^Page \d+.*$/gm, '')
    .replace(/^\d+\s*$/gm, '')
    // Remove hyphenation at line breaks
    .replace(/-\s*\n\s*/g, '')
    // Normalize line breaks
    .replace(/\n\s*\n/g, '\n\n')
    // Trim and clean
    .trim();
}

/**
 * Create text chunks optimized for RAG retrieval
 * Using sliding window approach with overlap for better context
 */
function createTextChunks(text: string, chunkSize: number = 1000, overlap: number = 200): TextChunk[] {
  const words = text.split(/\s+/);
  const chunks: TextChunk[] = [];
  
  let startIndex = 0;
  let chunkIndex = 0;
  
  while (startIndex < words.length) {
    const endIndex = Math.min(startIndex + chunkSize, words.length);
    const chunkWords = words.slice(startIndex, endIndex);
    const chunkText = chunkWords.join(' ');
    
    // Skip very short chunks
    if (chunkText.trim().length < 50) {
      break;
    }
    
    chunks.push({
      id: `chunk_${chunkIndex}`,
      text: chunkText,
      chunkIndex,
      wordCount: chunkWords.length
    });
    
    // Move start position with overlap
    startIndex = endIndex - overlap;
    chunkIndex++;
  }
  
  console.log(`[pdfProcessor] Created ${chunks.length} text chunks`);
  return chunks;
}

/**
 * Generate embeddings for text chunks using OpenAI
 */
export async function generateEmbeddings(chunks: TextChunk[]): Promise<TextChunk[]> {
  console.log(`[pdfProcessor] Generating embeddings for ${chunks.length} chunks`);
  
  try {
    const embeddings = await Promise.all(
      chunks.map(async (chunk) => {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.openaiApiKey}`,
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small', // More cost-effective than ada-002
            input: chunk.text,
            encoding_format: 'float'
          })
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`OpenAI embeddings API failed: ${response.status} ${errorBody}`);
        }

        const data = await response.json();
        const embedding = data.data[0]?.embedding;
        
        if (!embedding) {
          throw new Error('No embedding returned from OpenAI API');
        }

        return {
          ...chunk,
          embedding
        };
      })
    );

    console.log(`[pdfProcessor] Successfully generated ${embeddings.length} embeddings`);
    return embeddings;
    
  } catch (error) {
    console.error(`[pdfProcessor] Error generating embeddings:`, error);
    throw new Error(`Failed to generate embeddings: ${(error as Error).message}`);
  }
}

/**
 * Categorize content based on text analysis
 */
export function categorizeContent(text: string, filename: string): {
  contentType: string;
  topics: string[];
  targetAudience: string[];
  industryRelevance: string[];
} {
  const lowerText = text.toLowerCase();
  const lowerFilename = filename.toLowerCase();
  
  // Determine content type
  let contentType = 'document';
  if (lowerFilename.includes('whitepaper') || lowerText.includes('whitepaper')) {
    contentType = 'whitepaper';
  } else if (lowerFilename.includes('case') && lowerFilename.includes('study')) {
    contentType = 'case_study';
  } else if (lowerFilename.includes('proposal')) {
    contentType = 'proposal';
  } else if (lowerFilename.includes('presentation') || lowerFilename.includes('deck')) {
    contentType = 'presentation';
  } else if (lowerText.includes('blog') || lowerText.includes('article')) {
    contentType = 'blog_post';
  }
  
  // Extract topics
  const topics: string[] = [];
  const topicKeywords = {
    'artificial intelligence': ['ai', 'artificial intelligence', 'machine learning', 'deep learning'],
    'data analytics': ['analytics', 'data analysis', 'business intelligence', 'reporting'],
    'cloud computing': ['cloud', 'aws', 'azure', 'gcp', 'saas'],
    'cybersecurity': ['security', 'cybersecurity', 'privacy', 'compliance'],
    'digital transformation': ['digital transformation', 'modernization', 'automation'],
    'software development': ['development', 'programming', 'software', 'coding']
  };
  
  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      topics.push(topic);
    }
  }
  
  // Determine target audience
  const targetAudience: string[] = [];
  const audienceKeywords = {
    'executives': ['ceo', 'cto', 'cfo', 'executive', 'leadership'],
    'technical teams': ['developer', 'engineer', 'technical', 'architect'],
    'decision makers': ['manager', 'director', 'decision', 'stakeholder'],
    'it professionals': ['it', 'system admin', 'infrastructure', 'operations']
  };
  
  for (const [audience, keywords] of Object.entries(audienceKeywords)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      targetAudience.push(audience);
    }
  }
  
  // Determine industry relevance
  const industryRelevance: string[] = [];
  const industryKeywords = {
    'healthcare': ['healthcare', 'medical', 'hospital', 'patient'],
    'finance': ['finance', 'banking', 'fintech', 'financial'],
    'retail': ['retail', 'ecommerce', 'customer', 'sales'],
    'manufacturing': ['manufacturing', 'production', 'supply chain'],
    'technology': ['technology', 'software', 'tech', 'innovation']
  };
  
  for (const [industry, keywords] of Object.entries(industryKeywords)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      industryRelevance.push(industry);
    }
  }
  
  return {
    contentType,
    topics,
    targetAudience,
    industryRelevance
  };
}