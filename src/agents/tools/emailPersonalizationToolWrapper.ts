import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { personalizeEmail, generatePersonalizedEmailVariations, EmailPersonalizationParamsSchema } from './emailPersonalizationTool';

/**
 * LangChain tool wrapper for AI-powered email personalization
 */
export const emailPersonalizationTool = tool(
  async (params) => {
    try {
      console.log(`[emailPersonalizationToolWrapper] Personalizing email for ${params.companyName}`);
      
      const result = await personalizeEmail(params);
      
      return JSON.stringify({
        success: true,
        personalizedEmail: result,
        companyName: params.companyName,
        personalizationScore: result.personalizationScore
      });
    } catch (error) {
      console.error(`[emailPersonalizationToolWrapper] Error in email personalization:`, error);
      return JSON.stringify({
        success: false,
        error: `Failed to personalize email: ${(error as Error).message}`,
        companyName: params.companyName
      });
    }
  },
  {
    name: 'email_personalizer',
    description: 'Personalizes email templates using AI and lead-specific data. Takes a template with placeholders and company information to create highly personalized outreach emails.',
    schema: EmailPersonalizationParamsSchema,
  }
);

/**
 * Extended schema for multiple template personalization
 */
const MultipleTemplatePersonalizationSchema = EmailPersonalizationParamsSchema.extend({
  templates: z.array(z.string()).describe("Array of email templates to personalize")
}).omit({ template: true });

/**
 * LangChain tool wrapper for generating multiple personalized email variations
 */
export const emailVariationsPersonalizationTool = tool(
  async (params) => {
    try {
      console.log(`[emailPersonalizationToolWrapper] Generating personalized variations for ${params.companyName}`);
      
      const { templates, ...personalizationParams } = params;
      
      // Generate variations for each template
      const variations = await generatePersonalizedEmailVariations(
        { ...personalizationParams, template: templates[0] }, // Use first template as base
        templates
      );
      
      return JSON.stringify({
        success: true,
        variations: variations,
        count: variations.length,
        companyName: params.companyName,
        averageScore: variations.reduce((sum, v) => sum + v.personalizationScore, 0) / variations.length
      });
    } catch (error) {
      console.error(`[emailPersonalizationToolWrapper] Error generating personalized variations:`, error);
      return JSON.stringify({
        success: false,
        error: `Failed to generate personalized variations: ${(error as Error).message}`,
        companyName: params.companyName
      });
    }
  },
  {
    name: 'email_variations_personalizer',
    description: 'Generates multiple personalized email variations from different templates for A/B testing. Creates highly personalized versions for comparison.',
    schema: MultipleTemplatePersonalizationSchema,
  }
);