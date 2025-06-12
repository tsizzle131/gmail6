import { tool } from '@langchain/core/tools';
// import { z } from 'zod'; // z is imported via PerplexityResearchParamsSchema from the wrapper
import { researchCompanyWithPerplexity, PerplexityResearchParamsSchema, PerplexityResearchParams } from './perplexityResearchWrapper';

/**
 * LangChain Tool that wraps the Perplexity company research function.
 */
export const perplexityResearchTool = tool(
  async (params: PerplexityResearchParams) => { // Explicitly type params
    try {
      const researchResult = await researchCompanyWithPerplexity(params);
      return researchResult;
    } catch (error) {
      console.error('[perplexityResearchTool] Error during research:', error);
      // Return a structured error message or re-throw, depending on desired agent behavior
      return `Error researching company: ${(error as Error).message}`;
    }
  },
  {
    name: 'company_researcher',
    description: 'Researches a company using Perplexity API to get an overview, industry insights, and notable activities. Use this to understand more about a lead after finding their website.',
    schema: PerplexityResearchParamsSchema, // Use the schema from the wrapper
  }
); 