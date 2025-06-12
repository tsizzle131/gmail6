import config from '../../config';
import { z } from 'zod';

// Define the schema for the parameters expected by the research function
export const PerplexityResearchParamsSchema = z.object({
  companyName: z.string().describe("The name of the company to research."),
  websiteUrl: z.string().url().optional().describe("The optional website URL of the company for more targeted research.")
});

export type PerplexityResearchParams = z.infer<typeof PerplexityResearchParamsSchema>;

/**
 * Performs research on a company using the Perplexity API.
 *
 * @param params - The company name and optional website URL.
 * @returns A promise that resolves to a string containing the research findings.
 * @throws An error if the Perplexity API is not configured or if the API call fails.
 */
export async function researchCompanyWithPerplexity(params: PerplexityResearchParams): Promise<string> {
  const { companyName, websiteUrl } = params;

  if (!config.perplexityApiUrl || !config.perplexityApiKey) {
    console.warn('Perplexity API URL or Key is not configured. Skipping research.');
    return "Perplexity API not configured. Research skipped.";
  }

  const researchQuery = `Provide a concise company overview and key insights for ${companyName}${websiteUrl ? ` (website: ${websiteUrl})` : ''}. Focus on their main business, industry, and any notable technologies or recent activities.`;

  try {
    console.log(`[perplexityResearchWrapper] Querying Perplexity for: ${companyName}`);
    const response = await fetch(config.perplexityApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.perplexityApiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          { role: 'system', content: 'You are an AI research assistant. Provide concise and factual information.' },
          { role: 'user', content: researchQuery },
        ],
        max_tokens: 500, // Keep the response concise
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Perplexity API request failed with status ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      console.warn('[perplexityResearchWrapper] Received no content from Perplexity API for:', companyName);
      return `No research findings available for ${companyName}.`;
    }

    console.log(`[perplexityResearchWrapper] Received research for ${companyName}`);
    return content;
  } catch (error) {
    console.error(`[perplexityResearchWrapper] Error researching ${companyName} with Perplexity:`, error);
    throw new Error(`Failed to research company ${companyName} using Perplexity: ${(error as Error).message}`);
  }
}
 