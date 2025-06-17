import { z } from 'zod';
import config from '../../config';

// Define the schema for content analysis parameters
export const ContentAnalysisParamsSchema = z.object({
  websiteContent: z.string().describe("The scraped website content to analyze"),
  companyName: z.string().describe("The company name for context"),
  industry: z.string().describe("The company's industry for targeted analysis"),
  businessDescription: z.string().optional().describe("Additional business description if available")
});

export type ContentAnalysisParams = z.infer<typeof ContentAnalysisParamsSchema>;

/**
 * Content analysis results structure
 */
export interface ContentAnalysisResult {
  painPoints: string[];
  valuePropositions: string[];
  keyServices: string[];
  targetMarkets: string[];
  competitiveAdvantages: string[];
  businessChallenges: string[];
  growthOpportunities: string[];
  technologyStack: string[];
  companyValues: string[];
  recentNews: string[];
}

/**
 * AI-powered content analysis to extract business insights from website content
 */
export async function analyzeWebsiteContent(params: ContentAnalysisParams): Promise<ContentAnalysisResult> {
  const { websiteContent, companyName, industry, businessDescription } = params;
  
  console.log(`[contentAnalysisTool] Analyzing website content for ${companyName} in ${industry} industry`);

  if (!websiteContent || websiteContent.trim().length < 50) {
    console.warn(`[contentAnalysisTool] Insufficient website content for ${companyName}, returning minimal analysis`);
    return getMinimalAnalysis(companyName, industry, businessDescription);
  }

  const analysisPrompt = `
You are an expert business analyst. Analyze the following website content to extract key business insights that would be valuable for B2B outreach personalization.

COMPANY: ${companyName}
INDUSTRY: ${industry}
${businessDescription ? `BUSINESS DESCRIPTION: ${businessDescription}` : ''}

WEBSITE CONTENT TO ANALYZE:
${websiteContent.substring(0, 2000)}${websiteContent.length > 2000 ? '...' : ''}

ANALYSIS INSTRUCTIONS:
Extract and categorize the following business insights:

1. PAIN POINTS: What challenges, problems, or difficulties does this company likely face based on their business model, industry, and content?

2. VALUE PROPOSITIONS: What unique value does this company offer to their customers? What are their key selling points?

3. KEY SERVICES: What are the main services or products this company offers?

4. TARGET MARKETS: Who are their primary customers or market segments?

5. COMPETITIVE ADVANTAGES: What sets them apart from competitors? What are their strengths?

6. BUSINESS CHALLENGES: What operational, technical, or market challenges might they be facing?

7. GROWTH OPPORTUNITIES: What areas for growth or expansion can be identified?

8. TECHNOLOGY STACK: What technologies, tools, or platforms do they use or mention?

9. COMPANY VALUES: What values, mission, or culture aspects are emphasized?

10. RECENT NEWS: Any recent developments, achievements, or announcements mentioned?

OUTPUT FORMAT:
Provide your analysis as a JSON object with arrays for each category. Be specific and actionable. Focus on insights that would help craft personalized outreach emails.

{
  "painPoints": ["specific pain point 1", "specific pain point 2"],
  "valuePropositions": ["value prop 1", "value prop 2"],
  "keyServices": ["service 1", "service 2"],
  "targetMarkets": ["market 1", "market 2"],
  "competitiveAdvantages": ["advantage 1", "advantage 2"],
  "businessChallenges": ["challenge 1", "challenge 2"],
  "growthOpportunities": ["opportunity 1", "opportunity 2"],
  "technologyStack": ["tech 1", "tech 2"],
  "companyValues": ["value 1", "value 2"],
  "recentNews": ["news 1", "news 2"]
}
  `.trim();

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert business analyst specializing in B2B market research and competitive analysis. Always respond with valid JSON.' 
          },
          { role: 'user', content: analysisPrompt }
        ],
        max_tokens: 800,
        temperature: 0.3, // Lower temperature for more analytical, consistent results
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API request failed with status ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.trim();
    
    if (!result) {
      throw new Error('No analysis result from OpenAI response');
    }

    const analysis: ContentAnalysisResult = JSON.parse(result);
    
    // Validate and sanitize the results
    const sanitizedAnalysis = sanitizeAnalysisResult(analysis);
    
    console.log(`[contentAnalysisTool] Successfully analyzed content for ${companyName}:`);
    console.log(`  - Pain Points: ${sanitizedAnalysis.painPoints.length}`);
    console.log(`  - Value Props: ${sanitizedAnalysis.valuePropositions.length}`);
    console.log(`  - Key Services: ${sanitizedAnalysis.keyServices.length}`);
    
    return sanitizedAnalysis;

  } catch (error) {
    console.error(`[contentAnalysisTool] Error analyzing website content:`, error);
    
    // Fallback to minimal analysis
    return getMinimalAnalysis(companyName, industry, businessDescription);
  }
}

/**
 * Sanitize and validate analysis results
 */
function sanitizeAnalysisResult(analysis: any): ContentAnalysisResult {
  const defaultArray: string[] = [];
  
  return {
    painPoints: Array.isArray(analysis.painPoints) ? analysis.painPoints.filter(Boolean) : defaultArray,
    valuePropositions: Array.isArray(analysis.valuePropositions) ? analysis.valuePropositions.filter(Boolean) : defaultArray,
    keyServices: Array.isArray(analysis.keyServices) ? analysis.keyServices.filter(Boolean) : defaultArray,
    targetMarkets: Array.isArray(analysis.targetMarkets) ? analysis.targetMarkets.filter(Boolean) : defaultArray,
    competitiveAdvantages: Array.isArray(analysis.competitiveAdvantages) ? analysis.competitiveAdvantages.filter(Boolean) : defaultArray,
    businessChallenges: Array.isArray(analysis.businessChallenges) ? analysis.businessChallenges.filter(Boolean) : defaultArray,
    growthOpportunities: Array.isArray(analysis.growthOpportunities) ? analysis.growthOpportunities.filter(Boolean) : defaultArray,
    technologyStack: Array.isArray(analysis.technologyStack) ? analysis.technologyStack.filter(Boolean) : defaultArray,
    companyValues: Array.isArray(analysis.companyValues) ? analysis.companyValues.filter(Boolean) : defaultArray,
    recentNews: Array.isArray(analysis.recentNews) ? analysis.recentNews.filter(Boolean) : defaultArray
  };
}

/**
 * Generate minimal analysis when content is insufficient or AI fails
 */
function getMinimalAnalysis(companyName: string, industry: string, businessDescription?: string): ContentAnalysisResult {
  console.log(`[contentAnalysisTool] Generating minimal analysis for ${companyName} based on industry: ${industry}`);
  
  // Industry-specific fallback insights
  const industryInsights: Record<string, Partial<ContentAnalysisResult>> = {
    'ai consulting': {
      painPoints: ['AI implementation complexity', 'Data quality challenges', 'ROI measurement difficulties'],
      valuePropositions: ['AI expertise', 'Implementation support', 'Strategic guidance'],
      businessChallenges: ['Keeping up with AI advances', 'Client education', 'Talent acquisition']
    },
    'healthcare': {
      painPoints: ['Regulatory compliance', 'Patient data security', 'Operational efficiency'],
      valuePropositions: ['Patient care improvement', 'Compliance assurance', 'Cost reduction'],
      businessChallenges: ['Regulatory changes', 'Technology integration', 'Staff training']
    },
    'fintech': {
      painPoints: ['Regulatory compliance', 'Security threats', 'Customer trust'],
      valuePropositions: ['Financial innovation', 'Security', 'User experience'],
      businessChallenges: ['Regulatory changes', 'Competition', 'Technology evolution']
    }
  };
  
  const industryData = industryInsights[industry.toLowerCase()] || {
    painPoints: ['Operational efficiency', 'Technology integration', 'Market competition'],
    valuePropositions: ['Quality service', 'Expertise', 'Customer satisfaction'],
    businessChallenges: ['Market competition', 'Technology adoption', 'Growth scaling']
  };
  
  return {
    painPoints: industryData.painPoints || [],
    valuePropositions: industryData.valuePropositions || [],
    keyServices: businessDescription ? [businessDescription] : [],
    targetMarkets: [industry],
    competitiveAdvantages: [],
    businessChallenges: industryData.businessChallenges || [],
    growthOpportunities: [],
    technologyStack: [],
    companyValues: [],
    recentNews: []
  };
}

/**
 * Generate personalization talking points from analysis results
 */
export function generateTalkingPoints(analysis: ContentAnalysisResult): string[] {
  const talkingPoints: string[] = [];
  
  // Add pain point talking points
  analysis.painPoints.slice(0, 2).forEach(painPoint => {
    talkingPoints.push(`Address ${painPoint} challenge`);
  });
  
  // Add value proposition talking points
  analysis.valuePropositions.slice(0, 2).forEach(valueProp => {
    talkingPoints.push(`Leverage ${valueProp} strength`);
  });
  
  // Add growth opportunity talking points
  analysis.growthOpportunities.slice(0, 1).forEach(opportunity => {
    talkingPoints.push(`Explore ${opportunity} potential`);
  });
  
  return talkingPoints;
}