import { tool } from '@langchain/core/tools';
import { searchKnowledgeBase, extractTalkingPoints, KnowledgeVectorSearchParamsSchema } from './knowledgeVectorSearch';

/**
 * LangChain tool wrapper for knowledge vector search
 */
export const knowledgeVectorSearchTool = tool(
  async (params) => {
    try {
      console.log(`[knowledgeVectorSearchWrapper] Searching knowledge for: "${params.query}"`);
      
      const searchResults = await searchKnowledgeBase(params);
      const talkingPoints = extractTalkingPoints(searchResults);
      
      return JSON.stringify({
        success: true,
        knowledgeResults: searchResults,
        talkingPoints: talkingPoints,
        searchQuery: params.query,
        summary: {
          totalResults: searchResults.totalResults,
          industryMatches: searchResults.searchInsights.industryMatches,
          topContentTypes: Object.keys(searchResults.searchInsights.contentTypeDistribution),
          hasRelevantKnowledge: searchResults.relevantKnowledge.length > 0,
          suggestedUsage: searchResults.searchInsights.suggestedUsage
        }
      });
    } catch (error) {
      console.error(`[knowledgeVectorSearchWrapper] Error in knowledge search:`, error);
      return JSON.stringify({
        success: false,
        error: `Failed to search knowledge base: ${(error as Error).message}`,
        query: params.query
      });
    }
  },
  {
    name: 'knowledge_vector_search',
    description: 'Searches the company knowledge base (PDFs, whitepapers, case studies) to find relevant content for email personalization. Essential for adding credibility and specific references to outreach emails.',
    schema: KnowledgeVectorSearchParamsSchema,
  }
);