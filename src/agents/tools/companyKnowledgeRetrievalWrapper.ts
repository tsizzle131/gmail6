import { tool } from '@langchain/core/tools';
import { retrieveCompanyKnowledge, scoreKnowledgeRelevance, CompanyKnowledgeParamsSchema } from './companyKnowledgeRetrieval';

/**
 * LangChain tool wrapper for company knowledge retrieval
 */
export const companyKnowledgeRetrievalTool = tool(
  async (params) => {
    try {
      console.log(`[companyKnowledgeRetrievalWrapper] Retrieving knowledge for ${params.companyName}`);
      
      const knowledge = await retrieveCompanyKnowledge(params);
      const relevanceScore = scoreKnowledgeRelevance(knowledge, params.prospectIndustry, params.prospectSize);
      
      return JSON.stringify({
        success: true,
        knowledge: knowledge,
        relevanceScore: relevanceScore,
        companyName: params.companyName,
        prospectContext: {
          industry: params.prospectIndustry,
          size: params.prospectSize
        },
        summary: {
          hasIndustryExperience: knowledge.personalizationInsights.industryExperience.length > 0,
          relevantCaseStudies: knowledge.relevantCaseStudies.length,
          primaryServices: knowledge.relevantServices.length,
          suggestedApproach: knowledge.personalizationInsights.suggestedApproach
        }
      });
    } catch (error) {
      console.error(`[companyKnowledgeRetrievalWrapper] Error retrieving company knowledge:`, error);
      return JSON.stringify({
        success: false,
        error: `Failed to retrieve company knowledge: ${(error as Error).message}`,
        companyName: params.companyName
      });
    }
  },
  {
    name: 'company_knowledge_retrieval',
    description: 'Retrieves comprehensive company knowledge including services, case studies, and credentials to personalize outreach emails. Essential for authentic and credible email crafting.',
    schema: CompanyKnowledgeParamsSchema,
  }
);