import { tool } from '@langchain/core/tools';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { openai } from '../../ai/client';
import { z } from 'zod';

/**
 * Generates a Google Maps search query string from parameters.
 */
export async function generateGoogleMapsQuery(
  params: { industry: string; location: string; filters?: string }
): Promise<string> {
  console.log("[googleMapsQueryTool] Entering with params:", JSON.stringify(params, null, 2));
  const { industry, location, filters } = params;
  // Define prompt template
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', 'You are a helpful assistant that generates concise Google Maps search queries. Your output should be ONLY the search query itself, without any surrounding quotes or explanations.'],
    ['user', 'Generate a Google Maps search string given the following parameters:'],
    ['assistant', `Industry: {industry}\nLocation: {location}\nFilters: {filters}`],
  ]);

  // Build and invoke chain
  const chain = prompt.pipe(openai);
  const response = await chain.invoke({ industry, location, filters: filters || '' });
  let result = response.content as string;
  // Manually remove leading/trailing quotes, if present
  if (result.startsWith('"') && result.endsWith('"')) {
    result = result.substring(1, result.length - 1);
  }
  console.log("[googleMapsQueryTool] Exiting with (cleaned) result:", JSON.stringify(result, null, 2));
  return result;
}

// LangChain Tool for Google Maps query generation
export const googleMapsQueryTool = tool(
  generateGoogleMapsQuery,
  {
    name: 'google_maps_query',
    description: 'Generates a Google Maps search string based on industry, location, and optional filters',
    schema: z.object({
      industry: z.string().describe('The industry to search for (e.g., coffee shops)'),
      location: z.string().describe('The location to search in (e.g., San Francisco, CA)'),
      filters: z.string().optional().describe('Optional additional filters (e.g., open now)')
    })
  }
);
