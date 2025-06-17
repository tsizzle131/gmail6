import { z } from 'zod';
import config from '../../config';

// Define the schema for email template generation parameters
export const EmailTemplateParamsSchema = z.object({
  industry: z.string().describe("The target company's industry (e.g., 'AI consulting', 'healthcare', 'fintech')"),
  approach: z.enum(['value_proposition', 'pain_point', 'case_study', 'industry_trend', 'consultative']).describe("The email approach strategy"),
  tone: z.enum(['professional', 'casual', 'direct', 'consultative', 'friendly']).describe("The desired tone of the email"),
  serviceOffering: z.string().describe("The service or solution being offered"),
  companyName: z.string().optional().describe("The sender's company name")
});

export type EmailTemplateParams = z.infer<typeof EmailTemplateParamsSchema>;

/**
 * AI-powered email template generator that creates personalized prompt templates
 * for different industries, approaches, and tones.
 */
export async function generateEmailTemplate(params: EmailTemplateParams): Promise<string> {
  const { industry, approach, tone, serviceOffering, companyName } = params;
  
  console.log(`[emailTemplatesTool] Generating ${approach} template for ${industry} industry with ${tone} tone`);

  const templatePrompts = {
    value_proposition: `Create a value proposition email template for the ${industry} industry with a ${tone} tone. The email should:
- Lead with a compelling value statement about ${serviceOffering}
- Highlight 2-3 key benefits specific to ${industry} companies
- Include a soft call-to-action for a brief conversation
- Be concise (under 150 words)
- Use placeholders like {company_name}, {contact_name}, {specific_benefit} for personalization`,

    pain_point: `Create a pain point focused email template for the ${industry} industry with a ${tone} tone. The email should:
- Open by acknowledging a common challenge in the ${industry} sector
- Briefly explain how ${serviceOffering} addresses this specific pain point
- Include a relevant statistic or insight about the industry
- End with a question to engage the prospect
- Use placeholders like {company_name}, {pain_point}, {industry_insight} for personalization`,

    case_study: `Create a case study email template for the ${industry} industry with a ${tone} tone. The email should:
- Reference a similar company in the ${industry} space (use placeholder {similar_company})
- Briefly describe the challenge and solution provided
- Include specific results or improvements achieved
- Connect the case study to ${serviceOffering}
- Use placeholders like {similar_company}, {challenge}, {result} for personalization`,

    industry_trend: `Create an industry trend email template for the ${industry} industry with a ${tone} tone. The email should:
- Open with a relevant trend or development in the ${industry} sector
- Connect the trend to potential opportunities or challenges
- Position ${serviceOffering} as a solution to capitalize on or address the trend
- Include a thought-provoking question about the trend's impact
- Use placeholders like {trend}, {impact}, {opportunity} for personalization`,

    consultative: `Create a consultative email template for the ${industry} industry with a ${tone} tone. The email should:
- Position the sender as an industry expert or advisor
- Ask insightful questions about the company's current challenges or goals
- Subtly reference expertise in ${serviceOffering} without being salesy
- Offer value through insights or resources
- Use placeholders like {expertise_area}, {strategic_question}, {insight} for personalization`
  };

  const systemPrompt = `You are an expert email copywriter specializing in B2B outreach. Create email templates that are:
- Highly personalized and relevant to the specific industry
- Professional yet engaging with the specified tone
- Focused on value rather than features
- Designed to start conversations, not close sales
- Include clear placeholders for dynamic personalization

Company Context: ${companyName ? `Writing for ${companyName}, which provides ${serviceOffering}.` : `Writing for a company that provides ${serviceOffering}.`}`;

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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: templatePrompts[approach] }
        ],
        max_tokens: 400,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API request failed with status ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    const template = data.choices?.[0]?.message?.content?.trim();
    
    if (!template) {
      throw new Error('No template generated from OpenAI response');
    }

    console.log(`[emailTemplatesTool] Successfully generated ${approach} template for ${industry}`);
    return template;

  } catch (error) {
    console.error(`[emailTemplatesTool] Error generating email template:`, error);
    throw new Error(`Failed to generate email template: ${(error as Error).message}`);
  }
}

/**
 * Get multiple template variations for A/B testing
 */
export async function generateTemplateVariations(params: EmailTemplateParams, count: number = 3): Promise<string[]> {
  console.log(`[emailTemplatesTool] Generating ${count} template variations for ${params.approach} approach`);
  
  const variations: string[] = [];
  
  // Generate multiple variations with slightly different parameters
  for (let i = 0; i < count; i++) {
    try {
      const template = await generateEmailTemplate({
        ...params,
        // Vary temperature slightly for each variation
      });
      variations.push(template);
    } catch (error) {
      console.warn(`[emailTemplatesTool] Failed to generate variation ${i + 1}:`, error);
    }
  }
  
  if (variations.length === 0) {
    throw new Error('Failed to generate any template variations');
  }
  
  console.log(`[emailTemplatesTool] Generated ${variations.length} template variations`);
  return variations;
}

/**
 * Get industry-specific insights for email personalization
 */
export function getIndustryInsights(industry: string): Record<string, string[]> {
  const industryData: Record<string, Record<string, string[]>> = {
    'ai consulting': {
      pain_points: ['AI implementation complexity', 'Data quality and integration', 'ROI measurement challenges', 'Talent shortage', 'Ethical AI considerations'],
      trends: ['Generative AI adoption', 'AI governance frameworks', 'Edge AI deployment', 'AI-powered automation', 'Responsible AI practices'],
      value_props: ['Accelerated AI adoption', 'Risk mitigation', 'Competitive advantage', 'Operational efficiency', 'Data-driven insights']
    },
    'healthcare': {
      pain_points: ['Patient data security', 'Regulatory compliance', 'Operational inefficiencies', 'Staff burnout', 'Technology integration'],
      trends: ['Digital health transformation', 'Telemedicine expansion', 'AI in diagnostics', 'Value-based care', 'Patient experience focus'],
      value_props: ['Improved patient outcomes', 'Cost reduction', 'Compliance assurance', 'Workflow optimization', 'Enhanced care delivery']
    },
    'fintech': {
      pain_points: ['Regulatory compliance', 'Cybersecurity threats', 'Customer acquisition costs', 'Legacy system integration', 'Market competition'],
      trends: ['Open banking', 'Embedded finance', 'Cryptocurrency adoption', 'Regulatory changes', 'AI-powered risk assessment'],
      value_props: ['Enhanced security', 'Regulatory compliance', 'Customer experience improvement', 'Operational efficiency', 'Market differentiation']
    },
    'ecommerce': {
      pain_points: ['Customer acquisition', 'Inventory management', 'Cart abandonment', 'Customer retention', 'Supply chain disruptions'],
      trends: ['Omnichannel experiences', 'Social commerce', 'Sustainability focus', 'Personalization at scale', 'Voice commerce'],
      value_props: ['Increased conversions', 'Customer lifetime value', 'Operational efficiency', 'Market expansion', 'Brand loyalty']
    }
  };
  
  const normalizedIndustry = industry.toLowerCase();
  return industryData[normalizedIndustry] || {
    pain_points: ['Operational inefficiencies', 'Technology challenges', 'Market competition', 'Regulatory compliance', 'Cost management'],
    trends: ['Digital transformation', 'Automation adoption', 'Data-driven decisions', 'Customer experience focus', 'Sustainability initiatives'],
    value_props: ['Improved efficiency', 'Cost reduction', 'Competitive advantage', 'Better customer experience', 'Risk mitigation']
  };
}