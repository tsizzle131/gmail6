import { tool } from '@langchain/core/tools';
import {
  saveLeadsToDatabase,
  SaveLeadsParamsSchema,
  SaveLeadsParams,
  EnrichedLeadData // Exporting for potential use in orchestrator type definitions
} from './databaseWriterWrapper';

/**
 * LangChain Tool that wraps the saveLeadsToDatabase function.
 */
export const databaseWriterTool = tool(
  async (params: SaveLeadsParams) => {
    try {
      const result = await saveLeadsToDatabase(params);
      if (result.errorCount > 0) {
        return `Leads processed. Saved: ${result.successCount}, Failed: ${result.errorCount}. Errors: ${result.errors.join('; ')}`;
      }
      return `Successfully saved ${result.successCount} leads to the database.`;
    } catch (error: any) {
      console.error('[databaseWriterTool] Error saving leads:', error);
      return `Error saving leads to database: ${error.message}`;
    }
  },
  {
    name: 'save_leads_to_database',
    description: 'Saves a list of enriched lead data objects to the database. Use this as the final step after all lead generation and enrichment is complete. The input must be an object containing an array of leads under the \'leads\' key, and an optional \'campaignId\'.',
    schema: SaveLeadsParamsSchema,
  }
);

// Re-export types for easier import in other parts of the application if needed
export type { EnrichedLeadData, SaveLeadsParams }; 