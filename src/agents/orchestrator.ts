import { StateGraph, MessagesAnnotation } from '@langchain/langgraph';
import { googleMapsTool } from './tools/googleMapsTool';
import { googleMapsQueryTool } from './tools/googleMapsQueryTool';
import { websiteScraperTool } from './tools/websiteScraperTool';
import { emailExtractionTool } from './tools/emailExtractionTool';
import { leadEnrichmentTool } from './tools/leadEnrichmentTool';
import { perplexityResearchTool } from './tools/perplexityResearchTool';
import { databaseWriterTool, EnrichedLeadData, SaveLeadsParams } from './tools/databaseWriterTool';
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { openai } from '../ai/client';

// Define a type for the state that the agent will manage internally
// This helps in structuring the data accumulation process, though the LLM manages this via prompting.
interface LeadProcessingState {
  originalQuery: Record<string, any>;
  googleMapsResults?: any[]; // Raw results from google_maps_search
  processedLeads: EnrichedLeadData[];
  currentCampaignId?: string;
}

export async function callModel(state: typeof MessagesAnnotation.State) {
  const systemPromptText = `You are a sophisticated lead generation and processing orchestrator.
Your goal is to efficiently process multiple leads based on a user's request. You MUST maintain a comprehensive list of all prospects identified in Stage 1 and ensure that EACH prospect is processed through ALL subsequent data collection and enrichment stages (Stages 2-5) before compiling the final list for database saving (Stages 6-7). Do not stop processing after a single lead.

Workflow Stages:

1.  **Initial Query & Search:**
    a.  Understand the user's request for leads (e.g., industry, location, keywords).
    b.  Use 'google_maps_query' to formulate an optimal search query.
    c.  Execute 'google_maps_search' with the formulated query to get an initial list of company prospects. Keep all data from this search for each prospect (name, address, phone, website). This will be part of 'source_google_maps_data' for each. **Compile a list of ALL prospects found here and ensure every single one goes through the subsequent stages.**

2.  **Batch Data Collection - Stage 1 (Website Scraping):**
    a.  From your complete list of prospects from Stage 1, identify all prospects that have a website URL.
    b.  For ALL these prospects, if they have a website, invoke the 'website_scraper' tool. You can request multiple 'website_scraper' calls in a single turn if appropriate.
    c.  The 'website_scraper' tool will attempt to find and prioritize content from common contact pages (e.g., '/contact-us', '/support') in addition to the main page content. Collect all scraped text. This will be 'scraped_website_text' for each relevant lead. If scraping fails or no website, this will be empty/null for that lead.

3.  **Batch Data Collection - Stage 2 (Company Research):**
    a.  For ALL prospects from your complete list (from Stage 1), use the 'company_researcher' tool. Use their name and website URL (if available).
    b.  Collect all research results. This will be 'source_perplexity_research' for each lead.

4.  **Batch Data Collection - Stage 3 (Email Extraction):**
    a.  For ALL prospects from your complete list where 'scraped_website_text' was successfully obtained in Stage 2, use the 'email_extraction' tool with the 'scraped_website_text' as input. If 'scraped_website_text' is empty or unavailable for a lead, this step should result in an empty email list for that lead.
    b.  The 'email_extraction' tool returns a JSON string representing an array of emails (e.g., "[\"test@example.com\"]") or an empty array string (e.g., "[]"). You MUST parse this JSON string into an actual array of strings.
    c.  This parsed array of emails will be 'emails_found'. If no emails are found, parsing fails, or if 'scraped_website_text' was not available, 'emails_found' MUST be an empty JavaScript array, like [].

5.  **Batch Data Collection - Stage 4 (Lead Enrichment):**
    a.  For ALL prospects from your complete list, use the 'lead_enrichment' tool. Provide the company name, website (if available), and the 'source_perplexity_research' text obtained in Stage 3.
    b.  This tool will return structured lead details (industry, description, headcount, roles, score).

6.  **Final Compilation:**
    a.  For EACH prospect from your complete list, compile all information gathered through all stages into a single 'EnrichedLeadData' object:
        {
          name: string,
          website?: string,
          industry?: string,
          description?: string,
          headcount?: string,
          roles?: string[],
          score?: number,
          address?: string, // from google_maps_search
          phone?: string, // from google_maps_search
          source_google_maps_data?: any, // from google_maps_search
          source_perplexity_research?: string, // from company_researcher
          emails_found: string[], // CRITICAL: This MUST be an array of strings, e.g., ["email1@example.com"], or an empty JavaScript array [] if no emails were found or extraction was not possible.
          scraped_website_text?: string // from website_scraper
        }
    b.  Create a final array containing all these compiled 'EnrichedLeadData' objects.

7.  **Database Save:**
    a.  Determine the 'campaignId': If the initial user request specified a campaign ID (which must be a valid UUID), use that. If no valid campaign ID is provided by the user or if the provided ID is not a valid UUID, the 'campaignId' key MUST NOT be included in the arguments to 'save_leads_to_database'. Do NOT pass an empty string or null for campaignId; OMIT the key entirely.
    b.  Call the 'save_leads_to_database' tool ONCE with an object: { leads: [array_of_EnrichedLeadData_objects] }. If a valid 'campaignId' (UUID) was determined and is to be included, the call will look like: { leads: [...], campaignId: "valid-uuid-here" }.

8.  **Final Response:**
    a.  The final response to the user should be the outcome message from 'save_leads_to_database'.

**Important Instructions:**
*   You MUST manage this workflow stage by stage. Aim to batch tool calls for multiple leads within a stage when possible (e.g., request scraping for 5 websites in one turn).
*   Keep track of all data gathered for each prospect throughout the stages.
*   Only after all leads from your initial compiled list have been processed through all data collection stages (Stages 2-5) should you call 'save_leads_to_database'.
*   **Data Segregation:** For each lead, you must keep track of multiple distinct pieces of information gathered from different tools. For example, 'scraped_website_text' comes *only* from the 'website_scraper' tool. 'source_perplexity_research' comes *only* from the 'company_researcher' tool. Ensure these (and other data points) are stored separately and accurately for each lead and are not accidentally overwritten by outputs from other tools or stages. When compiling the final 'EnrichedLeadData' object, ensure each field is populated from the correct source.
*   When you decide to use tools, include a 'tool_calls' field in your AIMessage.
*   If a tool fails for a specific lead within a batch, note the failure and continue processing other leads from your compiled list. The compiled data for the failing lead should reflect the missing information.`;

  const systemPrompt = new SystemMessage(systemPromptText);
  let messages = [systemPrompt, ...state.messages];

  const modelWithTools = openai.bindTools([
    googleMapsQueryTool,
    googleMapsTool,
    websiteScraperTool,
    perplexityResearchTool,
    emailExtractionTool,
    leadEnrichmentTool,
    databaseWriterTool,
  ]);

  let response = await modelWithTools.invoke(messages as any[]);

  while (response.tool_calls && response.tool_calls.length > 0) {
    const toolMessages: ToolMessage[] = [];
    const currentAiMessage = response;

    for (const call of response.tool_calls) {
      const toolMap: Record<string, any> = {
        google_maps_query: googleMapsQueryTool,
        google_maps_search: googleMapsTool,
        website_scraper: websiteScraperTool,
        company_researcher: perplexityResearchTool,
        email_extraction: emailExtractionTool,
        lead_enrichment: leadEnrichmentTool,
        save_leads_to_database: databaseWriterTool,
      };
      const tool = toolMap[call.name];
      
      if (!tool) {
        console.warn(`Tool not found for call: ${call.name}. Skipping this call.`);
        toolMessages.push(new ToolMessage({
          tool_call_id: call.id!,
          name: call.name,
          content: `Error: Tool ${call.name} not found.`
        }));
        continue;
      }

      const args = call.args as Record<string, any>;
      let result: any;
      try {
        const rawResult: unknown = tool.call ? await tool.call(args) : await tool(args);
        result = rawResult === undefined ? null : rawResult;
      } catch (e) {
        console.error(`Error executing tool ${call.name} with args ${JSON.stringify(args)}:`, e);
        result = `Error executing tool ${call.name}: ${(e as Error).message}`;
      }
      
      const toolCallId = call.id;
      if (typeof toolCallId !== 'string') {
        console.error("Critical: Tool call ID is missing or not a string!", call);
        toolMessages.push(new ToolMessage({
          tool_call_id: call.id || `missing_id_${Date.now()}`,
          name: call.name,
          content: "Error: Tool call ID was missing for this call."
        }));
        continue; 
      }

      // Revised logic for preparing toolContent
      let toolContent: string;
      if (result === null) { // Handles both null and undefined (due to earlier assignment)
          toolContent = "null";
      } else if (typeof result === 'string') {
          // If the result is already a string (e.g., plain text from scraper/research, or JSON string from email_extraction), use it directly.
          toolContent = result;
      } else {
          // For objects or arrays, stringify them.
          toolContent = JSON.stringify(result);
      }

      toolMessages.push(new ToolMessage({
        tool_call_id: toolCallId,
        name: call.name,
        content: toolContent,
      }));
    }

    messages = [...messages, currentAiMessage, ...toolMessages];
    response = await modelWithTools.invoke(messages as any[]);
  }

  return { messages: [response] };
}

export const orchestrator = new StateGraph(MessagesAnnotation)
  .addNode('agent', callModel)
  .addEdge('__start__', 'agent')
  .compile();