import { tool } from '@langchain/core/tools';
import { enrichLead, EnrichmentParams, LeadEnrichment } from './leadEnrichmentWrapper';
import { z } from 'zod';

export const leadEnrichmentTool = tool(
  enrichLead as (args: EnrichmentParams) => Promise<LeadEnrichment>,
  {
    name: 'lead_enrichment',
    description: 'Enriches a lead with industry, company description, headcount range, roles, and a score',
    schema: z.object({
      name: z.string().describe('Name of the company or lead'),
      website: z.string().optional().describe('Website URL of the company'),
    }),
  }
);