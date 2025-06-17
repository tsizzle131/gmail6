import { StateGraph, MessagesAnnotation } from '@langchain/langgraph';
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { openai } from '../ai/client';

// Import our email crafting tools
import { emailTemplateTool, emailTemplateVariationsTool } from './tools/emailTemplateToolWrapper';
import { emailPersonalizationTool, emailVariationsPersonalizationTool } from './tools/emailPersonalizationToolWrapper';
import { contentAnalysisTool } from './tools/contentAnalysisToolWrapper';
import { companyKnowledgeRetrievalTool } from './tools/companyKnowledgeRetrievalWrapper';
import { knowledgeVectorSearchTool } from './tools/knowledgeVectorSearchWrapper';

/**
 * Email crafting workflow state
 */
interface EmailCraftingState {
  leadData: any;
  contentAnalysis?: any;
  templates?: string[];
  personalizedEmails?: any[];
  selectedEmail?: any;
  approach: string;
  tone: string;
}

/**
 * Main Email Crafting Agent - orchestrates AI-powered email generation workflow
 */
export async function callEmailCraftingModel(state: typeof MessagesAnnotation.State) {
  const systemPromptText = `You are an expert Email Crafting Agent specializing in AI-powered B2B outreach personalization.

Your goal is to create highly personalized, engaging emails for cold outreach using advanced AI analysis and personalization techniques.

WORKFLOW STAGES:

1. **Company Knowledge Retrieval Stage:**
   - Use 'company_knowledge_retrieval' to gather comprehensive sender company information
   - Retrieve relevant services, case studies, team credentials, and competitive advantages
   - Identify industry expertise and similar client successes
   - Generate personalization insights and suggested approach

2. **RAG Knowledge Search Stage:**
   - Use 'knowledge_vector_search' to find relevant PDFs, whitepapers, and case studies
   - Search based on prospect industry, context, and business needs
   - Extract specific document references and citations
   - Generate talking points from knowledge assets

3. **Content Analysis Stage:**
   - Use 'website_content_analyzer' to extract business insights from the lead's website content
   - Identify pain points, value propositions, services, and opportunities
   - Generate talking points for personalization

4. **Template Generation Stage:**
   - Use 'email_template_generator' to create AI-powered email templates
   - Choose approach based on knowledge assets (case_study if relevant documents exist, value_proposition otherwise)
   - Select appropriate tone: professional, casual, direct, consultative, or friendly
   - Consider generating multiple template variations for A/B testing

5. **Enhanced Personalization Stage:**
   - Use 'email_personalizer' to create highly personalized emails using:
     * Lead-specific data and content analysis
     * Company knowledge (services, case studies, competitive advantages)
     * RAG knowledge assets (whitepapers, case studies, specific document references)
     * Relevant team credentials and expertise
     * Industry-specific experience and success stories
   - Include specific document citations and references when relevant
   - Ensure personalization feels genuine and credible
   - Generate personalization score and key elements

6. **Final Selection:**
   - Review generated email variations
   - Select the highest-scoring personalized email with knowledge-backed credibility
   - Provide recommendations for optimization and document usage

IMPORTANT INSTRUCTIONS:
- ALWAYS start by retrieving company knowledge to establish credibility and expertise
- Search knowledge base for relevant documents based on prospect industry and context
- Analyze prospect website content to identify personalization opportunities
- Use company knowledge to select relevant services, case studies, and competitive advantages
- Include specific document references when relevant (e.g., "as outlined in our Healthcare AI whitepaper")
- Match company expertise and knowledge assets to prospect needs for authentic positioning
- Aim for personalization scores of 9+ out of 10 with knowledge-backed credibility
- Keep emails concise but highly relevant (under 200 words)
- Focus on starting conversations with demonstrated expertise and thought leadership
- Provide clear reasoning for approach, tone selection, and document usage
- Leverage case studies, whitepapers, and success stories when relevant to prospect industry/size

AVAILABLE LEAD DATA:
The user will provide lead information including:
- Company name and industry
- Website content (scraped and summarized)
- Business description and enrichment data
- Contact information if available

Your response should guide the email creation process step by step, using the available tools to create the most effective personalized outreach email.`;

  const systemPrompt = new SystemMessage(systemPromptText);
  let messages = [systemPrompt, ...state.messages];

  const modelWithTools = openai.bindTools([
    companyKnowledgeRetrievalTool,
    knowledgeVectorSearchTool,
    contentAnalysisTool,
    emailTemplateTool,
    emailTemplateVariationsTool,
    emailPersonalizationTool,
    emailVariationsPersonalizationTool,
  ]);

  let response = await modelWithTools.invoke(messages as any[]);

  // Handle tool calls in the same pattern as the lead generation agent
  while (response.tool_calls && response.tool_calls.length > 0) {
    const toolMessages: ToolMessage[] = [];
    const currentAiMessage = response;

    for (const call of response.tool_calls) {
      const toolMap: Record<string, any> = {
        company_knowledge_retrieval: companyKnowledgeRetrievalTool,
        knowledge_vector_search: knowledgeVectorSearchTool,
        website_content_analyzer: contentAnalysisTool,
        email_template_generator: emailTemplateTool,
        email_template_variations: emailTemplateVariationsTool,
        email_personalizer: emailPersonalizationTool,
        email_variations_personalizer: emailVariationsPersonalizationTool,
      };
      
      const tool = toolMap[call.name];
      
      if (!tool) {
        console.warn(`[emailCraftingAgent] Tool not found for call: ${call.name}. Skipping this call.`);
        toolMessages.push(new ToolMessage({
          tool_call_id: call.id!,
          name: call.name,
          content: `Error: Tool ${call.name} not found.`
        }));
        continue;
      }

      const args = call.args as Record<string, any>;
      console.log(`[emailCraftingAgent] Executing tool: ${call.name} with args:`, JSON.stringify(args, null, 2));
      
      let result: any;
      try {
        const rawResult: unknown = tool.call ? await tool.call(args) : await tool(args);
        result = rawResult === undefined ? null : rawResult;
        console.log(`[emailCraftingAgent] Tool ${call.name} completed successfully`);
      } catch (e) {
        console.error(`[emailCraftingAgent] Error executing tool ${call.name} with args ${JSON.stringify(args)}:`, e);
        result = `Error executing tool ${call.name}: ${(e as Error).message}`;
      }
      
      const toolCallId = call.id;
      if (typeof toolCallId !== 'string') {
        console.error("[emailCraftingAgent] Critical: Tool call ID is missing or not a string!", call);
        toolMessages.push(new ToolMessage({
          tool_call_id: call.id || `missing_id_${Date.now()}`,
          name: call.name,
          content: typeof result === 'string' ? result : JSON.stringify(result)
        }));
      } else {
        toolMessages.push(new ToolMessage({
          tool_call_id: toolCallId,
          name: call.name,
          content: typeof result === 'string' ? result : JSON.stringify(result)
        }));
      }
    }

    // Add the AI message with tool calls and the tool responses
    messages = [...messages, currentAiMessage, ...toolMessages];
    
    // Continue the conversation
    response = await modelWithTools.invoke(messages as any[]);
  }

  // Return the updated state with the final response
  return {
    messages: [...state.messages, response]
  };
}

/**
 * Create the Email Crafting Agent workflow graph
 */
export function createEmailCraftingAgent() {
  const workflow = new StateGraph(MessagesAnnotation)
    .addNode('email_crafter', callEmailCraftingModel)
    .addEdge('__start__', 'email_crafter')
    .addEdge('email_crafter', '__end__');

  return workflow.compile();
}

/**
 * Simplified interface for email crafting
 */
export async function craftPersonalizedEmail(leadData: {
  companyName: string;
  industry: string;
  websiteContent?: string;
  businessDescription?: string;
  companySize?: string;
  contactName?: string;
  senderName: string;
  senderCompany: string;
  serviceOffering: string;
  approach?: string;
  tone?: string;
}) {
  console.log(`[emailCraftingAgent] Starting email crafting workflow for ${leadData.companyName}`);
  
  const agent = createEmailCraftingAgent();
  
  // Create the initial message with lead data
  const initialMessage = new HumanMessage({
    content: `Please create a personalized outreach email for the following lead:

LEAD INFORMATION:
- Company: ${leadData.companyName}
- Industry: ${leadData.industry}
- Business Description: ${leadData.businessDescription || 'Not provided'}
- Company Size: ${leadData.companySize || 'Not specified'}
- Contact Name: ${leadData.contactName || 'Not specified'}
- Website Content: ${leadData.websiteContent ? 'Available for analysis' : 'Not available'}

SENDER INFORMATION:
- Sender: ${leadData.senderName}
- Company: ${leadData.senderCompany}
- Service Offering: ${leadData.serviceOffering}

PREFERENCES:
- Approach: ${leadData.approach || 'Choose best approach based on analysis'}
- Tone: ${leadData.tone || 'professional'}

Please analyze the content, generate appropriate templates, personalize the email, and provide the final result with personalization insights.`
  });

  try {
    const result = await agent.invoke({
      messages: [initialMessage]
    });

    console.log(`[emailCraftingAgent] Email crafting workflow completed for ${leadData.companyName}`);
    return result;
  } catch (error) {
    console.error(`[emailCraftingAgent] Error in email crafting workflow:`, error);
    throw error;
  }
}