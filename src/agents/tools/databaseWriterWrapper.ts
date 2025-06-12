import { supabase } from '../../db/supabaseClient';
import { z } from 'zod';

// Define the structure of an enriched lead based on current agent output
export const EnrichedLeadDataSchema = z.object({
  name: z.string().describe("Company Name"),
  website: z.string().url().optional().describe("Company Website URL"),
  industry: z.string().optional().describe("Industry"),
  description: z.string().optional().describe("Company Description"),
  headcount: z.string().optional().describe("Company Headcount"), // Consider a more structured type if possible
  roles: z.array(z.string()).optional().describe("Relevant Roles"),
  score: z.number().optional().describe("Lead Score (0-100)"),
  // Fields from Google Maps or other sources, if available directly in the final lead object
  address: z.string().optional().describe("Company Address"),
  phone: z.string().optional().describe("Company Phone"),
  // Raw data for context/history
  source_google_maps_data: z.any().optional().describe("Raw Google Maps search result for this company"),
  source_perplexity_research: z.string().optional().describe("Raw research text from Perplexity tool"),
  // Emails if extracted before this stage and part of the lead object
  emails_found: z.array(z.string().email()).optional().describe("Emails found for this company, ensure these are valid email formats."),
  scraped_website_text: z.string().optional().describe("Full text content scraped from the company website")
  // The 'enriched_data' field is removed from here as it's not part of the input AI prepares,
  // but rather the wrapper stores the whole lead object into the DB 'enriched_data' column.
});

export type EnrichedLeadData = z.infer<typeof EnrichedLeadDataSchema>;

export const SaveLeadsParamsSchema = z.object({
  leads: z.array(EnrichedLeadDataSchema).describe("An array of enriched lead data objects to save."),
  campaignId: z.string().uuid().optional().describe("Optional campaign ID to associate these leads with.")
});

export type SaveLeadsParams = z.infer<typeof SaveLeadsParamsSchema>;

/**
 * Saves an array of enriched leads to the Supabase database.
 * It attempts to create/update a company in the 'companies' table
 * and then creates a contact in the 'contacts' table.
 *
 * @param params - Object containing leads array and optional campaignId.
 * @returns A summary of the save operation.
 */
export async function saveLeadsToDatabase(params: SaveLeadsParams): Promise<{ successCount: number; errorCount: number; errors: string[] }> {
  const { leads, campaignId } = params;
  let successCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  console.log(`[saveLeads] Received ${leads.length} leads to process. Campaign ID: ${campaignId}`);

  for (const lead of leads) {
    console.log(`[saveLeads] Full incoming lead object for ${lead.name}:`, JSON.stringify(lead, null, 2));
    try {
      // 1. Upsert Company
      //    Attempt to find company by domain or name. Create if not exists.
      let companyId: string | undefined;
      const domain = lead.website ? new URL(lead.website).hostname.replace(/^www\./, '') : undefined;

      if (domain) {
        const { data: existingCompany, error: companyFetchError } = await supabase
          .from('companies')
          .select('id')
          .eq('domain', domain)
          .single();

        if (companyFetchError && companyFetchError.code !== 'PGRST116') { // PGRST116: 0 rows
          console.error(`[saveLeads] Error fetching company by domain ${domain}:`, companyFetchError);
          // Decide if this is a fatal error for this lead or if we can proceed without companyId
        }
        if (existingCompany) {
          companyId = existingCompany.id;
          // Optionally, update company details if new info is available
          const { error: companyUpdateError } = await supabase
            .from('companies')
            .update({
              name: lead.name,
              industry: lead.industry,
              updated_at: new Date().toISOString(),
            })
            .eq('id', companyId);
          if (companyUpdateError) console.warn(`[saveLeads] Error updating company ${companyId}: `, companyUpdateError);
        } else {
          const { data: newCompany, error: companyInsertError } = await supabase
            .from('companies')
            .insert({
              name: lead.name,
              domain: domain,
              industry: lead.industry,
            })
            .select('id')
            .single();
          if (companyInsertError) throw new Error(`Inserting company ${lead.name}: ${companyInsertError.message}`);
          if (newCompany) companyId = newCompany.id;
        }
      } else {
         // If no domain, try to find/create by name (less reliable) or proceed without company link
        const { data: existingCompanyByName, error: companyFetchByNameError } = await supabase
            .from('companies')
            .select('id')
            .eq('name', lead.name)
            .maybeSingle(); // Use maybeSingle if name is not unique

        if (existingCompanyByName) {
            companyId = existingCompanyByName.id;
        } else if (!companyFetchByNameError || companyFetchByNameError.code === 'PGRST116') {
            const { data: newCompanyByName, error: companyInsertByNameError } = await supabase
                .from('companies')
                .insert({ name: lead.name, industry: lead.industry })
                .select('id')
                .single();
            if (companyInsertByNameError) console.warn(`[saveLeads] Error inserting company by name ${lead.name}: `, companyInsertByNameError.message);
            if (newCompanyByName) companyId = newCompanyByName.id;
        }
      }


      // 2. Insert Contact, linking to the company if companyId was found
      //    This assumes we're adding new contacts. For updates, logic would be more complex (e.g., find by email & campaignId).
      
      let primaryEmail: string | null = null;
      let additionalEmails: string[] | null = null;

      if (lead.emails_found && lead.emails_found.length > 0) {
        primaryEmail = lead.emails_found[0];
        if (lead.emails_found.length > 1) {
          additionalEmails = lead.emails_found.slice(1);
        }
      }
      
      const contactToInsert: Record<string, any> = {
        campaign_id: campaignId || null, // Handle if campaignId is truly optional or set a default
        company_id: companyId || null, // Link to company if available
        company_name: lead.name,
        domain: domain,
        industry: lead.industry,
        email: primaryEmail, 
        additional_emails: additionalEmails,
        // Map other EnrichedLeadData fields to contacts table columns
        description: lead.description,
        headcount: lead.headcount,
        roles: lead.roles,
        lead_score: lead.score,
        source_google_maps_data: lead.source_google_maps_data,
        source_perplexity_research: lead.source_perplexity_research,
        phone_number: lead.phone,
        address: lead.address,
        website_content: lead.scraped_website_text,
        last_enriched_at: new Date().toISOString(),
      };
      
      // Remove null/undefined fields before insert to use DB defaults if any
      Object.keys(contactToInsert).forEach(key => {
        if (contactToInsert[key] === undefined) { // Keep nulls, remove undefined
            delete contactToInsert[key];
        }
      });
      
      // Temporarily comment out this block to allow saving leads even without emails for debugging
      /*
      if (!contactToInsert.email) {
          const message = `Skipping contact for ${lead.name} as no email was found/provided.`;
          console.warn(`[saveLeads] ${message}`);
          errors.push(message); 
          errorCount++; 
          continue; 
      }
      */

      const { error: contactInsertError } = await supabase
        .from('contacts')
        .insert(contactToInsert);

      if (contactInsertError) {
        throw new Error(`Inserting contact for ${lead.name}: ${contactInsertError.message}`);
      }

      successCount++;
    } catch (err: any) { // Changed e to err and typed it
      console.error(`[saveLeads] Failed to save lead ${lead.name}:`, err); // Log the full error object
      errors.push(`Failed ${lead.name}: ${err.message}`); // Keep err.message for the summary
      errorCount++;
    }
  }

  console.log(`[saveLeads] Database save complete. Success: ${successCount}, Failed: ${errorCount}`);
  if (errorCount > 0) {
    console.error('[saveLeads] Errors encountered:', errors.join('\n'));
  }
  return { successCount, errorCount, errors };
}

// Example of how the agent might prepare the data:
// const finalLeadsForDb: EnrichedLeadData[] = agentOutput.map(lead => ({
//   name: lead.name,
//   website: lead.website,
//   industry: lead.industry,
//   description: lead.description,
//   headcount: lead.headcount,
//   roles: lead.roles,
//   score: lead.score,
//   address: lead.googleMapsData?.address, // Assuming googleMapsData is nested
//   phone: lead.googleMapsData?.phone,
//   source_google_maps_data: lead.googleMapsData,
//   source_perplexity_research: lead.perplexityResearchText,
//   emails_found: lead.extractedEmails || [],
//   scraped_website_text: lead.scrapedWebsiteText
// }));
//
// const campaignIdToUse = "some-uuid-string"; // Determined by agent or config
//
// const result = await saveLeadsToDatabase({ leads: finalLeadsForDb, campaignId: campaignIdToUse }); 