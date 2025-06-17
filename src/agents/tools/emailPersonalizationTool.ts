import { z } from 'zod';
import config from '../../config';

// Define the schema for email personalization parameters
export const EmailPersonalizationParamsSchema = z.object({
  template: z.string().describe("The email template with placeholders to personalize"),
  companyName: z.string().describe("The target company name"),
  contactName: z.string().optional().describe("The contact person's name if available"),
  industry: z.string().describe("The company's industry"),
  websiteContent: z.string().optional().describe("Summarized website content from the company"),
  businessDescription: z.string().optional().describe("Company business description from lead enrichment"),
  companySize: z.string().optional().describe("Company size/headcount range"),
  painPoints: z.array(z.string()).optional().describe("Identified pain points from content analysis"),
  valueProps: z.array(z.string()).optional().describe("Relevant value propositions"),
  senderName: z.string().describe("The sender's name"),
  senderCompany: z.string().describe("The sender's company name"),
  serviceOffering: z.string().describe("The service or solution being offered")
});

export type EmailPersonalizationParams = z.infer<typeof EmailPersonalizationParamsSchema>;

/**
 * Personalized email data structure
 */
export interface PersonalizedEmail {
  subject: string;
  body: string;
  personalizationScore: number; // 1-10 scale
  keyPersonalizationElements: string[];
  approach: string;
}

/**
 * AI-powered email personalization using lead-specific data
 */
export async function personalizeEmail(params: EmailPersonalizationParams): Promise<PersonalizedEmail> {
  const { 
    template, 
    companyName, 
    contactName, 
    industry, 
    websiteContent, 
    businessDescription,
    companySize,
    painPoints,
    valueProps,
    senderName,
    senderCompany,
    serviceOffering 
  } = params;
  
  console.log(`[emailPersonalizationTool] Personalizing email for ${companyName} in ${industry} industry`);

  // Build context for AI personalization
  const personalizationContext = `
COMPANY INFORMATION:
- Company: ${companyName}
- Industry: ${industry}
- Business: ${businessDescription || 'Not specified'}
- Size: ${companySize || 'Not specified'}
${contactName ? `- Contact: ${contactName}` : ''}

INSIGHTS FROM RESEARCH:
${websiteContent ? `Website Content: ${websiteContent.substring(0, 500)}...` : 'No website content available'}
${painPoints?.length ? `Pain Points: ${painPoints.join(', ')}` : ''}
${valueProps?.length ? `Value Propositions: ${valueProps.join(', ')}` : ''}

SENDER INFORMATION:
- Sender: ${senderName}
- Company: ${senderCompany}
- Service: ${serviceOffering}
  `.trim();

  const personalizationPrompt = `
You are an expert email copywriter. Your task is to personalize the following email template using the provided company and contact information.

EMAIL TEMPLATE TO PERSONALIZE:
${template}

PERSONALIZATION CONTEXT:
${personalizationContext}

INSTRUCTIONS:
1. Replace all placeholders in the template with specific, relevant information
2. Add genuine personalization based on the company's business, industry, and identified insights
3. Ensure the tone remains professional and consultative
4. Keep the email concise (under 200 words) but highly relevant
5. Create a compelling subject line that's personalized to the company
6. Make sure every personalization element feels natural and researched, not templated

OUTPUT FORMAT:
Provide your response as a JSON object with these fields:
{
  "subject": "Personalized subject line",
  "body": "Complete personalized email body",
  "personalizationScore": number between 1-10 (10 being highly personalized),
  "keyPersonalizationElements": ["element1", "element2", "element3"],
  "approach": "description of the personalization approach used"
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
            content: 'You are an expert B2B email copywriter specializing in highly personalized outreach. Always respond with valid JSON.' 
          },
          { role: 'user', content: personalizationPrompt }
        ],
        max_tokens: 600,
        temperature: 0.7,
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
      throw new Error('No personalization result from OpenAI response');
    }

    const personalizedEmail: PersonalizedEmail = JSON.parse(result);
    
    // Validate required fields
    if (!personalizedEmail.subject || !personalizedEmail.body) {
      throw new Error('Invalid personalization result - missing subject or body');
    }

    console.log(`[emailPersonalizationTool] Successfully personalized email for ${companyName} with score ${personalizedEmail.personalizationScore}/10`);
    return personalizedEmail;

  } catch (error) {
    console.error(`[emailPersonalizationTool] Error personalizing email:`, error);
    
    // Fallback to basic personalization if AI fails
    const fallbackEmail: PersonalizedEmail = {
      subject: `${serviceOffering} for ${companyName}`,
      body: template
        .replace(/{company_name}/g, companyName)
        .replace(/{contact_name}/g, contactName || 'there')
        .replace(/{sender_name}/g, senderName)
        .replace(/{sender_company}/g, senderCompany)
        .replace(/{service_offering}/g, serviceOffering)
        .replace(/{industry}/g, industry),
      personalizationScore: 3,
      keyPersonalizationElements: ['Company name', 'Industry'],
      approach: 'Basic template personalization (AI failed)'
    };
    
    return fallbackEmail;
  }
}

/**
 * Generate multiple personalized emails with different approaches
 */
export async function generatePersonalizedEmailVariations(
  params: EmailPersonalizationParams, 
  templates: string[]
): Promise<PersonalizedEmail[]> {
  console.log(`[emailPersonalizationTool] Generating ${templates.length} personalized email variations for ${params.companyName}`);
  
  const variations: PersonalizedEmail[] = [];
  
  for (let i = 0; i < templates.length; i++) {
    try {
      const personalizedEmail = await personalizeEmail({
        ...params,
        template: templates[i]
      });
      variations.push(personalizedEmail);
    } catch (error) {
      console.warn(`[emailPersonalizationTool] Failed to personalize template ${i + 1}:`, error);
    }
  }
  
  if (variations.length === 0) {
    throw new Error('Failed to generate any personalized email variations');
  }
  
  // Sort by personalization score (highest first)
  variations.sort((a, b) => b.personalizationScore - a.personalizationScore);
  
  console.log(`[emailPersonalizationTool] Generated ${variations.length} personalized variations, best score: ${variations[0]?.personalizationScore}/10`);
  return variations;
}

/**
 * Extract dynamic personalization data from lead information
 */
export function extractPersonalizationData(leadData: any): Partial<EmailPersonalizationParams> {
  return {
    companyName: leadData.name || leadData.company_name,
    industry: leadData.industry || leadData.enriched_data?.industry,
    websiteContent: leadData.scraped_website_text,
    businessDescription: leadData.enriched_data?.description,
    companySize: leadData.enriched_data?.headcount,
    // Extract additional personalization data as needed
  };
}