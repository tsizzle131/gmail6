import { tool } from '@langchain/core/tools';
import { analyzeWebsiteContent, generateTalkingPoints, ContentAnalysisParamsSchema } from './contentAnalysisTool';

/**
 * LangChain tool wrapper for AI-powered website content analysis
 */
export const contentAnalysisTool = tool(
  async (params) => {
    try {
      console.log(`[contentAnalysisToolWrapper] Analyzing content for ${params.companyName}`);
      
      const analysis = await analyzeWebsiteContent(params);
      const talkingPoints = generateTalkingPoints(analysis);
      
      return JSON.stringify({
        success: true,
        analysis: analysis,
        talkingPoints: talkingPoints,
        companyName: params.companyName,
        insightCount: {
          painPoints: analysis.painPoints.length,
          valuePropositions: analysis.valuePropositions.length,
          keyServices: analysis.keyServices.length,
          totalInsights: analysis.painPoints.length + analysis.valuePropositions.length + 
                         analysis.keyServices.length + analysis.competitiveAdvantages.length
        }
      });
    } catch (error) {
      console.error(`[contentAnalysisToolWrapper] Error in content analysis:`, error);
      return JSON.stringify({
        success: false,
        error: `Failed to analyze website content: ${(error as Error).message}`,
        companyName: params.companyName
      });
    }
  },
  {
    name: 'website_content_analyzer',
    description: 'Analyzes website content using AI to extract business insights including pain points, value propositions, services, and opportunities. Essential for email personalization.',
    schema: ContentAnalysisParamsSchema,
  }
);