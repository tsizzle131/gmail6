import { tool } from '@langchain/core/tools';
import { generateEmailTemplate, generateTemplateVariations, EmailTemplateParamsSchema } from './emailTemplatesTool';

/**
 * LangChain tool wrapper for AI-powered email template generation
 */
export const emailTemplateTool = tool(
  async (params) => {
    try {
      console.log(`[emailTemplateToolWrapper] Generating email template with params:`, params);
      
      const result = await generateEmailTemplate(params);
      
      return JSON.stringify({
        success: true,
        template: result,
        approach: params.approach,
        industry: params.industry,
        tone: params.tone
      });
    } catch (error) {
      console.error(`[emailTemplateToolWrapper] Error in email template generation:`, error);
      return JSON.stringify({
        success: false,
        error: `Failed to generate email template: ${(error as Error).message}`
      });
    }
  },
  {
    name: 'email_template_generator',
    description: 'Generates AI-powered email templates for different industries, approaches, and tones. Creates personalized prompt templates that can be used for outreach campaigns.',
    schema: EmailTemplateParamsSchema,
  }
);

/**
 * LangChain tool wrapper for generating multiple template variations for A/B testing
 */
export const emailTemplateVariationsTool = tool(
  async (params) => {
    try {
      console.log(`[emailTemplateToolWrapper] Generating template variations with params:`, params);
      
      const variations = await generateTemplateVariations(params, 3);
      
      return JSON.stringify({
        success: true,
        variations: variations,
        count: variations.length,
        approach: params.approach,
        industry: params.industry
      });
    } catch (error) {
      console.error(`[emailTemplateToolWrapper] Error generating template variations:`, error);
      return JSON.stringify({
        success: false,
        error: `Failed to generate template variations: ${(error as Error).message}`
      });
    }
  },
  {
    name: 'email_template_variations',
    description: 'Generates multiple variations of email templates for A/B testing. Creates 3 different versions of the same approach for testing effectiveness.',
    schema: EmailTemplateParamsSchema,
  }
);