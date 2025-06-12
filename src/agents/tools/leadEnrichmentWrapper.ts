import config from '../../config';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { openai } from '../../ai/client';
import { z } from 'zod'; // For potential future use with schema validation if needed

// Helper function to extract JSON from a string, potentially wrapped in markdown/text
function extractJsonFromString(str: string): any | null {
  if (typeof str !== 'string') return null;
  // Attempt to find JSON within triple backticks
  const match = str.match(/```json\\n([\\s\\S]*?)\\n```/);
  if (match && match[1]) {
    try {
      return JSON.parse(match[1]);
    } catch (e) {
      // Fall through if parsing the extracted block fails
      console.warn('[extractJsonFromString] Failed to parse JSON from markdown block:', e);
    }
  }
  // If no markdown block or parsing failed, try parsing the whole string directly
  try {
    return JSON.parse(str);
  } catch (e) {
    console.warn('[extractJsonFromString] Failed to parse string as JSON directly:', e);
    return null;
  }
}

// Declare fetch for making HTTP requests (Node 18+ global fetch)
// @ts-ignore
declare const fetch: (input: string, init?: any) => Promise<any>;

/**
 * Parameters for lead enrichment
 */
export interface EnrichmentParams {
  name: string;
  website?: string;
}

/**
 * Structured lead enrichment result
 */
export interface LeadEnrichment {
  industry: string;
  description: string;
  headcount: string;
  roles: string[];
  score: number;
}

/**
 * Enriches a lead using Perplexity for context and OpenAI for structured output
 */
export async function enrichLead(
  params: EnrichmentParams
): Promise<LeadEnrichment> {
  let contextData = '';

  // Use Perplexity API if configured
  if (config.perplexityApiUrl && config.perplexityApiKey) {
    console.log('Using Perplexity API at', config.perplexityApiUrl);
    try {
      const resp = await fetch(config.perplexityApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.perplexityApiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-sonar-small-128k-online', // Updated to new model family
          messages: [
            { role: 'system', content: 'You are an AI research assistant. Provide concise and factual information based on the company name and website if available.' },
            { role: 'user', content: `Research company: ${params.name}${params.website ? ` (${params.website})` : ''}. Provide a summary of their business, industry, and any notable recent activities or technologies used.` }
          ],
          max_tokens: 700, // Increased slightly for better context
        }),
      });
      if (!resp.ok) {
        const errorBody = await resp.text();
        throw new Error(`Perplexity API request failed with status ${resp.status}: ${errorBody}`);
      }
      const body = await resp.json();
      const choice = body.choices?.[0]?.message;
      contextData = choice?.content || '';
      console.log('[enrichLead] Perplexity returned contextData snippet:', contextData.substring(0, 200));
    } catch (e) {
      console.error('[enrichLead] Error fetching from Perplexity:', e);
      contextData = `Error fetching context from Perplexity: ${(e as Error).message}`;
    }
  }

  // Build prompt for OpenAI
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', 'You are a helpful assistant. Your task is to extract structured information about a company based on the provided context and output it STRICTLY as a valid JSON object. Do not include any explanatory text before or after the JSON object.'],
    ['user', 'Based on the company name, website, and additional context below, provide a JSON object with the following keys: "industry" (string), "description" (string, 2-3 sentences), "headcount" (string, e.g., "10-50" or "500+"), "roles" (array of strings, e.g., ["software engineer", "sales"]), and "score" (integer, 0-100, representing lead quality). Name: {name}\nWebsite: {website}\nAdditional Context:\n{context}'],
  ]);

  // Use a model that supports JSON mode, and enable it.
  const modelWithJsonMode = openai.withStructuredOutput(LeadEnrichmentSchema, { name: 'LeadEnrichment' });
  const chain = prompt.pipe(modelWithJsonMode);

  try {
    const response = await chain.invoke({
      name: params.name,
      website: params.website || '',
      context: contextData,
    });
    // response should already be a parsed object when using withStructuredOutput
    return response as LeadEnrichment;
  } catch (error) {
    console.error('[enrichLead] Error invoking OpenAI or parsing JSON:', error);
    // Fallback or re-throw as appropriate
    throw new Error(`Failed to enrich lead ${params.name}: ${(error as Error).message}`);
  }
}

// Define Zod schema for structured output validation (matches LeadEnrichment interface)
export const LeadEnrichmentSchema = z.object({
  industry: z.string(),
  description: z.string(),
  headcount: z.string(),
  roles: z.array(z.string()),
  score: z.number().min(0).max(100),
});