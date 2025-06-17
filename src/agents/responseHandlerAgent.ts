import { StateGraph, MessagesAnnotation } from '@langchain/langgraph';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { openai } from '../ai/client';
import { supabase } from '../db/supabaseClient';
import logger from '../logger';

// Import response handling tools
import { responseClassificationTool } from './tools/responseClassificationTool';
import { conversationContextTool } from './tools/conversationContextTool';
import { responseGenerationTool } from './tools/responseGenerationTool';
import { actionDeterminationTool } from './tools/actionDeterminationTool';

/**
 * Response handling workflow state
 */
interface ResponseHandlingState {
  emailResponseId: string;
  responseContent: string;
  responseFromEmail: string;
  campaignId: string;
  contactId: string;
  classification?: any;
  conversationContext?: any;
  generatedResponse?: any;
  recommendedActions?: any;
  processingComplete?: boolean;
}

/**
 * Main Response Handler Agent - orchestrates AI-powered email response processing
 */
export async function callResponseHandlerModel(state: typeof MessagesAnnotation.State) {
  const systemPromptText = `You are an expert Response Handler Agent specializing in AI-powered email conversation management.

Your goal is to intelligently process incoming email replies, classify their intent, and generate appropriate responses for B2B cold outreach campaigns.

WORKFLOW STAGES:

1. **Response Classification Stage:**
   - Use 'response_classification' to analyze the incoming email reply
   - Classify intent: interested/not_interested/question/objection/unsubscribe/auto_reply
   - Determine sentiment score and confidence level
   - Extract key points and intent summary

2. **Conversation Context Stage:**
   - Use 'conversation_context' to retrieve relevant email history
   - Get campaign context, previous emails, and contact information
   - Analyze conversation progression and current stage
   - Build comprehensive context for response generation

3. **Response Generation Stage:**
   - Use 'response_generation' to create intelligent, contextual replies
   - Generate personalized responses based on classification and context
   - Ensure appropriate tone and messaging for the conversation stage
   - Include relevant company information and next steps

4. **Action Determination Stage:**
   - Use 'action_determination' to decide on follow-up actions
   - Determine if campaign sequence should be paused
   - Identify handoff triggers for sales/consultation scheduling
   - Set next action timing and priority

RESPONSE GUIDELINES:
- Always maintain professionalism and brand consistency
- Respond appropriately to the specific intent and sentiment
- Include relevant value propositions when appropriate
- Suggest clear next steps (meeting, call, demo, etc.)
- Handle objections with empathy and additional value
- Respect unsubscribe requests immediately

AVAILABLE TOOLS:
- response_classification: Classify email intent and sentiment
- conversation_context: Retrieve conversation history and context
- response_generation: Generate intelligent email responses
- action_determination: Determine next actions and campaign decisions

Always use tools in the proper sequence and provide detailed, actionable outputs for each stage.`;

  const systemMessage = new SystemMessage(systemPromptText);
  const messages = [systemMessage, ...state.messages];

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: messages.map(msg => ({
          role: msg._getType() === 'human' ? 'user' : 
                msg._getType() === 'ai' ? 'assistant' : 'system',
          content: msg.content.toString()
        })),
        tools: [
          responseClassificationTool,
          conversationContextTool,
          responseGenerationTool,
          actionDeterminationTool
        ],
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    const responseData = await response.json();
    const aiMessage = responseData.choices[0].message;
    const responseMessage = new AIMessage(aiMessage.content || '');

    // Handle tool calls if present
    if (aiMessage.tool_calls) {
      const toolMessages = [];
      
      for (const toolCall of aiMessage.tool_calls) {
        try {
          let toolResult;
          const toolArgs = JSON.parse(toolCall.function.arguments);

          switch (toolCall.function.name) {
            case 'response_classification':
              toolResult = await handleResponseClassification(toolArgs);
              break;
            case 'conversation_context':
              toolResult = await handleConversationContext(toolArgs);
              break;
            case 'response_generation':
              toolResult = await handleResponseGeneration(toolArgs);
              break;
            case 'action_determination':
              toolResult = await handleActionDetermination(toolArgs);
              break;
            default:
              toolResult = `Unknown tool: ${toolCall.function.name}`;
          }

          toolMessages.push({
            role: 'tool' as const,
            content: JSON.stringify(toolResult),
            tool_call_id: toolCall.id
          });

        } catch (error) {
          logger.error(`[responseHandler] Tool execution error for ${toolCall.function.name}:`, error);
          toolMessages.push({
            role: 'tool' as const,
            content: JSON.stringify({ error: `Tool execution failed: ${(error as Error).message}` }),
            tool_call_id: toolCall.id
          });
        }
      }

      // Add tool messages to the conversation
      return {
        messages: [...state.messages, responseMessage, ...toolMessages.map(tm => 
          new AIMessage(tm.content)
        )]
      };
    }

    return {
      messages: [...state.messages, responseMessage]
    };

  } catch (error) {
    logger.error('[responseHandler] Error in response handler model:', error);
    const errorMessage = new AIMessage(`Error processing response: ${(error as Error).message}`);
    return {
      messages: [...state.messages, errorMessage]
    };
  }
}

/**
 * Handle response classification tool execution
 */
async function handleResponseClassification(args: any) {
  try {
    const { emailResponseId, responseContent, responseFromEmail } = args;

    logger.info(`[responseHandler] Classifying response from ${responseFromEmail}`);

    // Use OpenAI to classify the response
    const classificationResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{
          role: 'system',
          content: `You are an expert email response classifier. Analyze the following email reply and provide classification.

CLASSIFICATION CATEGORIES:
- interested: Shows genuine interest in the product/service
- not_interested: Politely or directly declines
- question: Has questions about the product/service/company
- objection: Raises concerns or objections
- unsubscribe: Requests to be removed from communications
- auto_reply: Automated out-of-office or auto-response
- other: Doesn't fit other categories

Respond with JSON in this format:
{
  "classification": "category",
  "sentiment_score": -1.0 to 1.0,
  "confidence_score": 0.0 to 1.0,
  "intent_summary": "brief summary of what they want",
  "key_points": ["point1", "point2"],
  "urgency_level": "low/medium/high/urgent",
  "requires_response": true/false
}`
        }, {
          role: 'user',
          content: `Email content to classify:\n\n${responseContent}`
        }],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    const classificationData = await classificationResponse.json();
    const classificationText = classificationData.choices[0].message.content;
    const classification = JSON.parse(classificationText || '{}');

    // Update the email_responses table with classification
    const { error: updateError } = await supabase
      .from('email_responses')
      .update({
        classification: classification.classification,
        sentiment_score: classification.sentiment_score,
        confidence_score: classification.confidence_score,
        intent_summary: classification.intent_summary,
        urgency_level: classification.urgency_level,
        requires_response: classification.requires_response,
        processed_at: new Date().toISOString(),
        processing_status: 'processed'
      })
      .eq('id', emailResponseId);

    if (updateError) {
      throw new Error(`Failed to update classification: ${updateError.message}`);
    }

    logger.info(`[responseHandler] Response classified as: ${classification.classification}`);

    return {
      success: true,
      classification,
      message: `Response classified as ${classification.classification} with ${classification.confidence_score} confidence`
    };

  } catch (error) {
    logger.error('[responseHandler] Classification error:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Handle conversation context retrieval
 */
async function handleConversationContext(args: any) {
  try {
    const { campaignId, contactId, emailResponseId } = args;

    logger.info(`[responseHandler] Retrieving conversation context for campaign ${campaignId}, contact ${contactId}`);

    // Get conversation record
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('contact_id', contactId)
      .single();

    if (conversationError && conversationError.code !== 'PGRST116') {
      throw new Error(`Failed to get conversation: ${conversationError.message}`);
    }

    // Get email history
    const { data: emailHistory, error: historyError } = await supabase
      .from('email_responses')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true });

    if (historyError) {
      throw new Error(`Failed to get email history: ${historyError.message}`);
    }

    // Get campaign and contact details
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*, companies(*)')
      .eq('id', campaignId)
      .single();

    if (campaignError) {
      throw new Error(`Failed to get campaign: ${campaignError.message}`);
    }

    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();

    if (contactError) {
      throw new Error(`Failed to get contact: ${contactError.message}`);
    }

    const context = {
      conversation: conversation || null,
      emailHistory: emailHistory || [],
      campaign,
      contact,
      totalResponses: emailHistory?.length || 0,
      lastResponseAt: emailHistory?.[emailHistory.length - 1]?.created_at || null
    };

    return {
      success: true,
      context,
      message: `Retrieved context for ${context.totalResponses} previous responses`
    };

  } catch (error) {
    logger.error('[responseHandler] Context retrieval error:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Handle response generation
 */
async function handleResponseGeneration(args: any) {
  try {
    const { classification, context, responseContent, companyInfo } = args;

    logger.info(`[responseHandler] Generating response for ${classification.classification} intent`);

    // Generate appropriate response based on classification
    const responsePrompt = buildResponsePrompt(classification, context, responseContent, companyInfo);

    const responseGeneration = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [{
          role: 'system',
          content: responsePrompt
        }],
        temperature: 0.7,
        max_tokens: 800
      })
    });

    const generationData = await responseGeneration.json();
    const generatedContent = generationData.choices[0].message.content;

    // Parse response if it's JSON format
    let responseData;
    try {
      responseData = JSON.parse(generatedContent || '{}');
    } catch {
      responseData = {
        subject: `Re: ${context.campaign.name}`,
        content: generatedContent,
        tone: 'professional',
        personalizationScore: 7
      };
    }

    return {
      success: true,
      response: responseData,
      message: 'Response generated successfully'
    };

  } catch (error) {
    logger.error('[responseHandler] Response generation error:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Handle action determination
 */
async function handleActionDetermination(args: any) {
  try {
    const { classification, context, conversationId } = args;

    logger.info(`[responseHandler] Determining actions for ${classification.classification} response`);

    const actions = {
      pauseSequence: false,
      requiresHandoff: false,
      nextAction: 'respond',
      responseDelay: 'immediate', // immediate/1hour/4hours/24hours
      handoffReason: null as string | null,
      sequencePauseReason: null as string | null
    };

    // Determine actions based on classification
    switch (classification.classification) {
      case 'interested':
        actions.pauseSequence = true;
        actions.requiresHandoff = true;
        actions.handoffReason = 'qualified';
        actions.sequencePauseReason = 'positive_response';
        actions.responseDelay = 'immediate';
        break;

      case 'question':
        actions.pauseSequence = true;
        actions.sequencePauseReason = 'requires_clarification';
        actions.responseDelay = 'immediate';
        break;

      case 'objection':
        actions.pauseSequence = true;
        actions.sequencePauseReason = 'objection_handling';
        actions.responseDelay = '1hour'; // Give time for thoughtful response
        break;

      case 'not_interested':
        actions.pauseSequence = true;
        actions.nextAction = 'close';
        actions.sequencePauseReason = 'not_interested';
        actions.responseDelay = '4hours'; // Polite delay
        break;

      case 'unsubscribe':
        actions.pauseSequence = true;
        actions.nextAction = 'unsubscribe';
        actions.sequencePauseReason = 'unsubscribe_request';
        actions.responseDelay = 'immediate';
        break;

      case 'auto_reply':
        actions.pauseSequence = false; // Continue sequence
        actions.nextAction = 'ignore';
        actions.responseDelay = 'none';
        break;
    }

    // Update conversation record
    if (conversationId) {
      const { error: updateError } = await supabase
        .from('conversations')
        .update({
          sequence_paused: actions.pauseSequence,
          sequence_paused_at: actions.pauseSequence ? new Date().toISOString() : null,
          sequence_pause_reason: actions.sequencePauseReason,
          requires_handoff: actions.requiresHandoff,
          handoff_reason: actions.handoffReason,
          handoff_triggered_at: actions.requiresHandoff ? new Date().toISOString() : null,
          next_action: actions.nextAction,
          last_response_at: new Date().toISOString(),
          total_responses: context.totalResponses + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      if (updateError) {
        logger.warn(`[responseHandler] Failed to update conversation: ${updateError.message}`);
      }
    }

    // Pause campaign sequence if needed
    if (actions.pauseSequence && context.campaign && actions.sequencePauseReason) {
      await pauseCampaignSequence(context.campaign.id, context.contact.id, actions.sequencePauseReason);
    }

    return {
      success: true,
      actions,
      message: `Actions determined: pause=${actions.pauseSequence}, handoff=${actions.requiresHandoff}`
    };

  } catch (error) {
    logger.error('[responseHandler] Action determination error:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Build response generation prompt based on classification and context
 */
function buildResponsePrompt(classification: any, context: any, responseContent: string, companyInfo: any) {
  const basePrompt = `You are generating a professional email response for ReignOverTech, an AI automation and software development company.

INCOMING EMAIL CLASSIFICATION: ${classification.classification}
SENTIMENT: ${classification.sentiment_score}
INTENT: ${classification.intent_summary}

CONVERSATION CONTEXT:
- Campaign: ${context.campaign.name}
- Contact: ${context.contact.company_name} (${context.contact.email})
- Previous responses: ${context.totalResponses}
- Industry: ${context.contact.industry}

COMPANY INFORMATION:
${JSON.stringify(companyInfo, null, 2)}

INCOMING EMAIL CONTENT:
"${responseContent}"

RESPONSE GUIDELINES:`;

  switch (classification.classification) {
    case 'interested':
      return basePrompt + `
Generate an enthusiastic but professional response that:
- Thanks them for their interest
- Suggests a specific next step (demo, call, meeting)
- Includes 1-2 relevant value propositions
- Provides clear contact information and scheduling options

Format as JSON: {"subject": "...", "content": "...", "tone": "enthusiastic", "personalizationScore": 1-10}`;

    case 'question':
      return basePrompt + `
Generate a helpful response that:
- Directly answers their specific questions
- Provides additional relevant information
- Offers to schedule a call for more detailed discussion
- Maintains a consultative tone

Format as JSON: {"subject": "...", "content": "...", "tone": "consultative", "personalizationScore": 1-10}`;

    case 'objection':
      return basePrompt + `
Generate an empathetic response that:
- Acknowledges their concerns respectfully
- Provides evidence or case studies that address the objection
- Offers alternative approaches or solutions
- Suggests a brief call to discuss their specific situation

Format as JSON: {"subject": "...", "content": "...", "tone": "understanding", "personalizationScore": 1-10}`;

    case 'not_interested':
      return basePrompt + `
Generate a respectful response that:
- Thanks them for their honesty
- Offers to keep them updated on relevant developments
- Leaves the door open for future conversation
- Provides unsubscribe option

Format as JSON: {"subject": "...", "content": "...", "tone": "respectful", "personalizationScore": 1-10}`;

    default:
      return basePrompt + `
Generate an appropriate professional response.
Format as JSON: {"subject": "...", "content": "...", "tone": "professional", "personalizationScore": 1-10}`;
  }
}

/**
 * Pause campaign sequence for a specific contact
 */
async function pauseCampaignSequence(campaignId: string, contactId: string, reason: string) {
  try {
    // Update campaign_contacts to pause sequence
    const { error: pauseError } = await supabase
      .from('campaign_contacts')
      .update({
        contact_status: 'paused',
        is_manually_paused: true,
        pause_reason: reason,
        updated_at: new Date().toISOString()
      })
      .eq('campaign_id', campaignId)
      .eq('contact_id', contactId);

    if (pauseError) {
      throw new Error(`Failed to pause sequence: ${pauseError.message}`);
    }

    // Cancel any scheduled emails for this contact
    const { error: cancelError } = await supabase
      .from('scheduled_emails')
      .update({
        status: 'cancelled',
        last_error_message: `Sequence paused: ${reason}`,
        updated_at: new Date().toISOString()
      })
      .eq('campaign_id', campaignId)
      .eq('contact_id', contactId)
      .eq('status', 'scheduled');

    if (cancelError) {
      logger.warn(`[responseHandler] Failed to cancel scheduled emails: ${cancelError.message}`);
    }

    logger.info(`[responseHandler] Paused sequence for contact ${contactId}: ${reason}`);

  } catch (error) {
    logger.error('[responseHandler] Error pausing sequence:', error);
    throw error;
  }
}

/**
 * Main entry point for processing email responses
 */
export async function processEmailResponse(emailResponseId: string) {
  try {
    logger.info(`[responseHandler] Processing email response ${emailResponseId}`);

    // Get the email response record
    const { data: emailResponse, error: responseError } = await supabase
      .from('email_responses')
      .select('*')
      .eq('id', emailResponseId)
      .single();

    if (responseError || !emailResponse) {
      throw new Error(`Failed to get email response: ${responseError?.message}`);
    }

    // Create initial state for the workflow
    const initialMessages = [
      new HumanMessage(`Process email response: ${emailResponse.response_content}`)
    ];

    // Run the LangGraph workflow
    const workflow = new StateGraph(MessagesAnnotation)
      .addNode('responseHandler', callResponseHandlerModel)
      .addEdge('__start__', 'responseHandler')
      .addEdge('responseHandler', '__end__')
      .compile();

    const result = await workflow.invoke({
      messages: initialMessages
    });

    logger.info(`[responseHandler] Completed processing response ${emailResponseId}`);

    return {
      success: true,
      result,
      emailResponseId
    };

  } catch (error) {
    logger.error('[responseHandler] Error processing email response:', error);
    
    // Update processing status to failed
    await supabase
      .from('email_responses')
      .update({
        processing_status: 'failed',
        processing_error: (error as Error).message,
        updated_at: new Date().toISOString()
      })
      .eq('id', emailResponseId);

    throw error;
  }
}