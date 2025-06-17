import { supabase } from '../db/supabaseClient';
import { sendEmail, EmailData } from './emailSender';
import logger from '../logger';

/**
 * Conversation Management Service
 * Handles conversation context, response scheduling, and handoff management
 */

export interface ConversationSummary {
  id: string;
  campaignId: string;
  contactId: string;
  status: string;
  stage: string;
  totalResponses: number;
  lastResponseAt?: string;
  requiresHandoff: boolean;
  sequencePaused: boolean;
}

export interface ResponseSchedulingOptions {
  delay: 'immediate' | '15min' | '1hour' | '4hours' | '24hours';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  responseType: 'answer' | 'clarification' | 'objection_handling' | 'scheduling' | 'closing';
}

/**
 * Get conversation summary for a campaign contact
 */
export async function getConversationSummary(campaignId: string, contactId: string): Promise<ConversationSummary | null> {
  try {
    const { data: conversation, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('contact_id', contactId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get conversation: ${error.message}`);
    }

    if (!conversation) {
      return null;
    }

    return {
      id: conversation.id,
      campaignId: conversation.campaign_id,
      contactId: conversation.contact_id,
      status: conversation.conversation_status,
      stage: conversation.conversation_stage,
      totalResponses: conversation.total_responses,
      lastResponseAt: conversation.last_response_at,
      requiresHandoff: conversation.requires_handoff,
      sequencePaused: conversation.sequence_paused
    };

  } catch (error) {
    logger.error('[conversationManager] Error getting conversation summary:', error);
    return null;
  }
}

/**
 * Update conversation status and stage
 */
export async function updateConversationStatus(
  conversationId: string,
  status: string,
  stage?: string,
  additionalData?: any
) {
  try {
    const updateData: any = {
      conversation_status: status,
      updated_at: new Date().toISOString(),
      ...additionalData
    };

    if (stage) {
      updateData.conversation_stage = stage;
    }

    const { error } = await supabase
      .from('conversations')
      .update(updateData)
      .eq('id', conversationId);

    if (error) {
      throw new Error(`Failed to update conversation: ${error.message}`);
    }

    logger.info(`[conversationManager] Updated conversation ${conversationId} to status: ${status}`);

  } catch (error) {
    logger.error('[conversationManager] Error updating conversation status:', error);
    throw error;
  }
}

/**
 * Schedule an automated response
 */
export async function scheduleAutomatedResponse(
  conversationId: string,
  emailResponseId: string,
  responseContent: {
    subject: string;
    content: string;
    tone: string;
    responseType: string;
    personalizationScore: number;
  },
  schedulingOptions: ResponseSchedulingOptions
) {
  try {
    logger.info(`[conversationManager] Scheduling automated response for conversation ${conversationId}`);

    // Calculate send time based on delay
    const sendTime = calculateResponseSendTime(schedulingOptions.delay);

    // Create automated response record
    const { data: automatedResponse, error: responseError } = await supabase
      .from('automated_responses')
      .insert({
        conversation_id: conversationId,
        email_response_id: emailResponseId,
        response_type: schedulingOptions.responseType,
        response_subject: responseContent.subject,
        response_content: responseContent.content,
        response_tone: responseContent.tone,
        personalization_score: responseContent.personalizationScore,
        send_status: sendTime.getTime() <= Date.now() ? 'draft' : 'scheduled',
        scheduled_send_time: sendTime.toISOString()
      })
      .select()
      .single();

    if (responseError) {
      throw new Error(`Failed to create automated response: ${responseError.message}`);
    }

    // If immediate, send right away
    if (schedulingOptions.delay === 'immediate') {
      await sendAutomatedResponse(automatedResponse.id);
    }

    return {
      success: true,
      automatedResponseId: automatedResponse.id,
      scheduledSendTime: sendTime,
      message: `Response scheduled for ${sendTime.toISOString()}`
    };

  } catch (error) {
    logger.error('[conversationManager] Error scheduling automated response:', error);
    throw error;
  }
}

/**
 * Send an automated response immediately
 */
export async function sendAutomatedResponse(automatedResponseId: string) {
  try {
    logger.info(`[conversationManager] Sending automated response ${automatedResponseId}`);

    // Get the automated response with related data
    const { data: response, error: responseError } = await supabase
      .from('automated_responses')
      .select(`
        *,
        conversations(
          campaign_id,
          contact_id,
          campaigns(name, product_name),
          contacts(email, company_name)
        )
      `)
      .eq('id', automatedResponseId)
      .single();

    if (responseError || !response) {
      throw new Error(`Failed to get automated response: ${responseError?.message}`);
    }

    if (response.send_status === 'sent') {
      logger.warn(`[conversationManager] Response ${automatedResponseId} already sent`);
      return { success: true, message: 'Already sent' };
    }

    const conversation = response.conversations;
    const contact = conversation.contacts;
    const campaign = conversation.campaigns;

    // Prepare email data
    const emailData: EmailData = {
      to: contact.email,
      from: `tristan@reignovertech.com`, // Use configured sender
      subject: response.response_subject,
      html: formatEmailContent(response.response_content, contact.company_name),
      text: response.response_content,
      campaignId: conversation.campaign_id,
      contactId: conversation.contact_id,
      emailType: 'outbound_response'
    };

    // Send the email
    const sendResult = await sendEmail(emailData);

    if (!sendResult.success) {
      throw new Error(`Failed to send email: ${sendResult.error}`);
    }

    // Update automated response status
    const { error: updateError } = await supabase
      .from('automated_responses')
      .update({
        send_status: 'sent',
        actual_send_time: new Date().toISOString(),
        mailgun_message_id: sendResult.messageId,
        send_attempt_count: (response.send_attempt_count || 0) + 1
      })
      .eq('id', automatedResponseId);

    if (updateError) {
      logger.warn(`[conversationManager] Failed to update response status: ${updateError.message}`);
    }

    logger.info(`[conversationManager] Automated response sent successfully: ${sendResult.messageId}`);

    return {
      success: true,
      messageId: sendResult.messageId,
      message: 'Automated response sent successfully'
    };

  } catch (error) {
    logger.error('[conversationManager] Error sending automated response:', error);

    // Update response with error
    await supabase
      .from('automated_responses')
      .update({
        send_status: 'failed',
        last_error_message: (error as Error).message,
        send_attempt_count: 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', automatedResponseId);

    throw error;
  }
}

/**
 * Trigger handoff for sales/consultation
 */
export async function triggerHandoff(
  conversationId: string,
  handoffType: 'sales' | 'support' | 'technical' | 'management',
  reason: string,
  urgency: 'low' | 'medium' | 'high' | 'urgent' = 'medium'
) {
  try {
    logger.info(`[conversationManager] Triggering ${handoffType} handoff for conversation ${conversationId}`);

    // Update conversation with handoff information
    await updateConversationStatus(conversationId, 'responded', 'qualified', {
      requires_handoff: true,
      handoff_reason: reason,
      handoff_triggered_at: new Date().toISOString(),
      next_action: 'handoff'
    });

    // Create handoff notification (could be email, Slack, etc.)
    await createHandoffNotification(conversationId, handoffType, reason, urgency);

    // Pause the campaign sequence for this contact
    const { data: conversation } = await supabase
      .from('conversations')
      .select('campaign_id, contact_id')
      .eq('id', conversationId)
      .single();

    if (conversation) {
      await pauseCampaignSequence(
        conversation.campaign_id,
        conversation.contact_id,
        `Handoff triggered: ${reason}`
      );
    }

    return {
      success: true,
      handoffType,
      reason,
      urgency,
      message: `${handoffType} handoff triggered successfully`
    };

  } catch (error) {
    logger.error('[conversationManager] Error triggering handoff:', error);
    throw error;
  }
}

/**
 * Process scheduled responses (to be called by cron job)
 */
export async function processScheduledResponses() {
  try {
    logger.info('[conversationManager] Processing scheduled responses');

    // Get responses scheduled for now or earlier
    const { data: scheduledResponses, error } = await supabase
      .from('automated_responses')
      .select('id')
      .eq('send_status', 'scheduled')
      .lte('scheduled_send_time', new Date().toISOString())
      .order('scheduled_send_time', { ascending: true })
      .limit(50); // Process in batches

    if (error) {
      throw new Error(`Failed to get scheduled responses: ${error.message}`);
    }

    if (!scheduledResponses || scheduledResponses.length === 0) {
      logger.info('[conversationManager] No scheduled responses to process');
      return { processed: 0, errors: [] };
    }

    const results = {
      processed: 0,
      errors: [] as string[]
    };

    // Process each response
    for (const response of scheduledResponses) {
      try {
        await sendAutomatedResponse(response.id);
        results.processed++;
      } catch (error) {
        const errorMessage = `Failed to send response ${response.id}: ${(error as Error).message}`;
        logger.error('[conversationManager]', errorMessage);
        results.errors.push(errorMessage);
      }
    }

    logger.info(`[conversationManager] Processed ${results.processed} scheduled responses, ${results.errors.length} errors`);

    return results;

  } catch (error) {
    logger.error('[conversationManager] Error processing scheduled responses:', error);
    throw error;
  }
}

/**
 * Get conversation analytics for a campaign
 */
export async function getConversationAnalytics(campaignId: string, days: number = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: analytics, error } = await supabase
      .from('conversation_analytics')
      .select('*')
      .eq('campaign_id', campaignId)
      .gte('analytics_date', startDate.toISOString().split('T')[0])
      .order('analytics_date', { ascending: true });

    if (error) {
      throw new Error(`Failed to get conversation analytics: ${error.message}`);
    }

    // Calculate totals
    const totals = analytics?.reduce((acc: any, day: any) => {
      acc.totalResponses += day.total_responses_received || 0;
      acc.positiveResponses += day.positive_responses || 0;
      acc.negativeResponses += day.negative_responses || 0;
      acc.questionsReceived += day.questions_received || 0;
      acc.automatedResponsesSent += day.automated_responses_sent || 0;
      acc.handoffsTriggered += day.handoffs_triggered || 0;
      acc.meetingsScheduled += day.meetings_scheduled || 0;
      return acc;
    }, {
      totalResponses: 0,
      positiveResponses: 0,
      negativeResponses: 0,
      questionsReceived: 0,
      automatedResponsesSent: 0,
      handoffsTriggered: 0,
      meetingsScheduled: 0
    }) || {};

    // Calculate rates
    const responseRate = totals.totalResponses > 0 ? 
      (totals.positiveResponses / totals.totalResponses * 100) : 0;
    const handoffRate = totals.totalResponses > 0 ? 
      (totals.handoffsTriggered / totals.totalResponses * 100) : 0;

    return {
      success: true,
      period: { days, startDate: startDate.toISOString().split('T')[0] },
      totals,
      rates: { responseRate, handoffRate },
      dailyData: analytics || []
    };

  } catch (error) {
    logger.error('[conversationManager] Error getting conversation analytics:', error);
    throw error;
  }
}

// Helper functions

function calculateResponseSendTime(delay: string): Date {
  const now = new Date();
  
  switch (delay) {
    case 'immediate':
      return now;
    case '15min':
      return new Date(now.getTime() + 15 * 60 * 1000);
    case '1hour':
      return new Date(now.getTime() + 60 * 60 * 1000);
    case '4hours':
      return new Date(now.getTime() + 4 * 60 * 60 * 1000);
    case '24hours':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    default:
      return now;
  }
}

function formatEmailContent(content: string, companyName: string): string {
  // Add basic HTML formatting and personalization
  const formattedContent = content
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');

  return `
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <p>${formattedContent}</p>
        
        <br>
        
        <p>Best regards,<br>
        Tristan Waite<br>
        ReignOverTech<br>
        <a href="mailto:tristan@reignovertech.com">tristan@reignovertech.com</a></p>
        
        <hr style="margin-top: 30px; border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #666;">
          If you no longer wish to receive these emails, 
          <a href="mailto:tristan@reignovertech.com?subject=Unsubscribe">click here to unsubscribe</a>.
        </p>
      </body>
    </html>
  `;
}

async function createHandoffNotification(
  conversationId: string,
  handoffType: string,
  reason: string,
  urgency: string
) {
  try {
    // In a real implementation, this would send notifications via:
    // - Email to sales team
    // - Slack message
    // - CRM integration
    // - Internal dashboard alert

    logger.info(`[conversationManager] Handoff notification created`, {
      conversationId,
      handoffType,
      reason,
      urgency
    });

    // For now, just log the handoff
    // TODO: Implement actual notification system

  } catch (error) {
    logger.error('[conversationManager] Error creating handoff notification:', error);
  }
}

async function pauseCampaignSequence(campaignId: string, contactId: string, reason: string) {
  try {
    const { error } = await supabase
      .from('campaign_contacts')
      .update({
        contact_status: 'paused',
        is_manually_paused: true,
        pause_reason: reason,
        updated_at: new Date().toISOString()
      })
      .eq('campaign_id', campaignId)
      .eq('contact_id', contactId);

    if (error) {
      throw new Error(`Failed to pause sequence: ${error.message}`);
    }

    // Cancel scheduled emails
    await supabase
      .from('scheduled_emails')
      .update({
        status: 'cancelled',
        last_error_message: reason,
        updated_at: new Date().toISOString()
      })
      .eq('campaign_id', campaignId)
      .eq('contact_id', contactId)
      .eq('status', 'scheduled');

    logger.info(`[conversationManager] Paused sequence for contact ${contactId}: ${reason}`);

  } catch (error) {
    logger.error('[conversationManager] Error pausing sequence:', error);
    throw error;
  }
}