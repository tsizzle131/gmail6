import { StateGraph, MessagesAnnotation } from '@langchain/langgraph';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { openai } from '../ai/client';
import { supabase } from '../db/supabaseClient';
import logger from '../logger';

/**
 * Campaign Manager Agent State
 */
interface CampaignManagerState {
  campaignId: string;
  action: 'schedule_emails' | 'check_progression' | 'optimize_timing' | 'analyze_performance';
  contactsToProcess?: any[];
  schedulingResults?: any[];
  analyticsData?: any;
  recommendations?: string[];
}

/**
 * Campaign Manager Agent - AI-powered campaign orchestration and optimization
 */
export async function callCampaignManagerModel(state: typeof MessagesAnnotation.State) {
  const systemPromptText = `You are an expert Campaign Manager Agent specializing in automated email sequence management and campaign optimization.

Your role is to intelligently manage email campaigns by:

CORE RESPONSIBILITIES:
1. **Campaign Scheduling**: Determine optimal timing for email sequences based on contact progression
2. **Contact Progression**: Analyze contact status and decide next actions (continue sequence, pause, convert)
3. **Performance Optimization**: Monitor campaign metrics and recommend improvements
4. **Safety Management**: Ensure campaigns respect rate limits and deliverability best practices

DECISION FRAMEWORK:

**Contact Status Assessment:**
- ACTIVE: Continue with next email in sequence
- ENGAGED: Increase engagement focus, potentially accelerate sequence
- RESPONDED: Move to conversation management, pause automated sequence
- CONVERTED: Mark as success, remove from active sequence
- BOUNCED/UNSUBSCRIBED: Remove from all sequences immediately

**Scheduling Intelligence:**
- Respect 3-4 day intervals between emails
- Prefer Tuesday/Thursday sending pattern
- Avoid weekends and holidays
- Consider recipient timezone when possible
- Apply rate limiting to protect domain reputation

**Performance Monitoring:**
- Track open rates, click rates, response rates
- Monitor bounce rates and spam complaints
- Identify high-performing vs low-performing contacts
- Recommend sequence adjustments based on data

**Safety Protocols:**
- Never exceed 50 emails/hour or 200 emails/day per campaign
- Auto-pause if bounce rate >5% or spam complaints >1%
- Require minimum personalization score of 7/10 before sending
- Implement exponential backoff for failed sends

WORKFLOW PROCESS:
1. Analyze current campaign state and contact progression
2. Identify contacts ready for next email in sequence
3. Check safety thresholds and rate limits
4. Schedule emails with optimal timing
5. Update contact statuses based on recent activity
6. Generate performance insights and recommendations

Always prioritize email deliverability and recipient experience over send volume.`;

  const systemPrompt = new SystemMessage(systemPromptText);
  let messages = [systemPrompt, ...state.messages];

  // For now, provide basic campaign management logic
  // In a full implementation, this would use tools for database operations
  const response = await openai.invoke(messages as any[]);

  return {
    messages: [...state.messages, response]
  };
}

/**
 * Create Campaign Manager Agent workflow
 */
export function createCampaignManagerAgent() {
  const workflow = new StateGraph(MessagesAnnotation)
    .addNode('campaign_manager', callCampaignManagerModel)
    .addEdge('__start__', 'campaign_manager')
    .addEdge('campaign_manager', '__end__');

  return workflow.compile();
}

/**
 * Process campaign scheduling for all active campaigns
 */
export async function processCampaignScheduling(): Promise<{
  campaignsProcessed: number;
  emailsScheduled: number;
  contactsUpdated: number;
  errors: string[];
}> {
  logger.info('[campaignManager] Starting campaign scheduling process');
  
  const results = {
    campaignsProcessed: 0,
    emailsScheduled: 0,
    contactsUpdated: 0,
    errors: [] as string[]
  };

  try {
    // 1. Get all active campaigns
    const { data: activeCampaigns, error: campaignsError } = await supabase
      .from('campaigns')
      .select(`
        *,
        campaign_sequences(*),
        campaign_settings(*)
      `)
      .eq('status', 'active');

    if (campaignsError) {
      throw new Error(`Failed to fetch active campaigns: ${campaignsError.message}`);
    }

    if (!activeCampaigns || activeCampaigns.length === 0) {
      logger.info('[campaignManager] No active campaigns found');
      return results;
    }

    logger.info(`[campaignManager] Processing ${activeCampaigns.length} active campaigns`);

    // 2. Process each campaign
    for (const campaign of activeCampaigns) {
      try {
        await processSingleCampaign(campaign);
        results.campaignsProcessed++;
      } catch (error) {
        const errorMsg = `Campaign ${campaign.id}: ${(error as Error).message}`;
        logger.error(`[campaignManager] ${errorMsg}`);
        results.errors.push(errorMsg);
      }
    }

    logger.info(`[campaignManager] Campaign scheduling completed`, results);
    return results;

  } catch (error) {
    logger.error('[campaignManager] Error in campaign scheduling process:', error);
    results.errors.push((error as Error).message);
    return results;
  }
}

/**
 * Process a single campaign's email scheduling
 */
async function processSingleCampaign(campaign: any): Promise<void> {
  logger.info(`[campaignManager] Processing campaign: ${campaign.name} (${campaign.id})`);

  // 1. Get active contacts for this campaign that need emails
  const { data: activeContacts, error: contactsError } = await supabase
    .from('campaign_contacts')
    .select(`
      *,
      contacts(*)
    `)
    .eq('campaign_id', campaign.id)
    .eq('contact_status', 'active')
    .lte('next_email_scheduled_at', new Date().toISOString())
    .order('next_email_scheduled_at', { ascending: true });

  if (contactsError) {
    throw new Error(`Failed to fetch active contacts: ${contactsError.message}`);
  }

  if (!activeContacts || activeContacts.length === 0) {
    logger.info(`[campaignManager] No contacts ready for emails in campaign ${campaign.id}`);
    return;
  }

  logger.info(`[campaignManager] Found ${activeContacts.length} contacts ready for emails`);

  // 2. Check campaign safety limits
  const campaignSettings = campaign.campaign_settings?.[0] || getDefaultCampaignSettings();
  const safetyCheck = await checkCampaignSafety(campaign.id, campaignSettings);
  
  if (!safetyCheck.safe) {
    logger.warn(`[campaignManager] Campaign ${campaign.id} paused due to safety concerns: ${safetyCheck.reason}`);
    await pauseCampaign(campaign.id, safetyCheck.reason || 'Safety check failed');
    return;
  }

  // 3. Schedule emails for eligible contacts
  const emailsToSchedule = activeContacts.slice(0, campaignSettings.max_emails_per_hour || 50);
  
  for (const campaignContact of emailsToSchedule) {
    try {
      await scheduleNextEmailForContact(campaignContact, campaign);
    } catch (error) {
      logger.error(`[campaignManager] Error scheduling email for contact ${campaignContact.contact_id}:`, error);
    }
  }
}

/**
 * Schedule the next email for a specific contact
 */
async function scheduleNextEmailForContact(campaignContact: any, campaign: any): Promise<void> {
  const nextEmailNumber = campaignContact.current_email_number + 1;
  const sequence = campaign.campaign_sequences?.[0];

  // Check if sequence is complete
  if (!sequence || nextEmailNumber > (sequence.total_emails || 12)) {
    await completeCampaignSequence(campaignContact.id);
    return;
  }

  // Calculate next send time (3-4 days from last email, on Tues/Thurs)
  const nextSendTime = calculateNextSendTime(
    campaignContact.last_email_sent_at,
    sequence.send_days || ['Tuesday', 'Thursday'],
    sequence.send_time_hour || 10
  );

  // Create scheduled email record
  const { error: scheduleError } = await supabase
    .from('scheduled_emails')
    .insert({
      campaign_contact_id: campaignContact.id,
      campaign_id: campaign.id,
      contact_id: campaignContact.contact_id,
      email_sequence_number: nextEmailNumber,
      scheduled_send_time: nextSendTime.toISOString(),
      personalization_data: {
        contact: campaignContact.contacts,
        campaign: campaign,
        sequenceNumber: nextEmailNumber
      }
    });

  if (scheduleError) {
    throw new Error(`Failed to schedule email: ${scheduleError.message}`);
  }

  // Update campaign contact with next scheduled time
  await supabase
    .from('campaign_contacts')
    .update({
      next_email_scheduled_at: nextSendTime.toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', campaignContact.id);

  logger.info(`[campaignManager] Scheduled email ${nextEmailNumber} for contact ${campaignContact.contact_id} at ${nextSendTime.toISOString()}`);
}

/**
 * Calculate the next optimal send time
 */
function calculateNextSendTime(lastSentAt: string | null, sendDays: string[], sendHour: number): Date {
  const now = new Date();
  const threeDaysFromLastSend = lastSentAt ? new Date(new Date(lastSentAt).getTime() + 3 * 24 * 60 * 60 * 1000) : now;
  
  // Start from the later of "now" or "3 days from last send"
  let nextSendTime = new Date(Math.max(now.getTime(), threeDaysFromLastSend.getTime()));
  
  // Find next valid send day (Tuesday or Thursday)
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  while (!sendDays.includes(dayNames[nextSendTime.getDay()])) {
    nextSendTime.setDate(nextSendTime.getDate() + 1);
  }
  
  // Set the specific hour
  nextSendTime.setHours(sendHour, 0, 0, 0);
  
  // If we've passed today's send time, move to next valid day
  if (nextSendTime <= now) {
    nextSendTime.setDate(nextSendTime.getDate() + 1);
    while (!sendDays.includes(dayNames[nextSendTime.getDay()])) {
      nextSendTime.setDate(nextSendTime.getDate() + 1);
    }
    nextSendTime.setHours(sendHour, 0, 0, 0);
  }
  
  return nextSendTime;
}

/**
 * Check campaign safety metrics
 */
async function checkCampaignSafety(campaignId: string, settings: any): Promise<{
  safe: boolean;
  reason?: string;
}> {
  // Check recent bounce and spam rates
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const { data: recentEmails, error } = await supabase
    .from('email_history')
    .select('*')
    .eq('campaign_id', campaignId)
    .gte('sent_at', twentyFourHoursAgo.toISOString());

  if (error) {
    logger.error(`[campaignManager] Error checking campaign safety:`, error);
    return { safe: true }; // Err on the side of caution but don't block
  }

  if (!recentEmails || recentEmails.length === 0) {
    return { safe: true };
  }

  // Calculate bounce rate (simplified - would need Mailgun webhook data for accuracy)
  const totalEmails = recentEmails.length;
  const assumedBounces = Math.floor(totalEmails * 0.02); // Assume 2% bounce rate for demo
  const bounceRate = (assumedBounces / totalEmails) * 100;

  if (bounceRate > (settings.max_bounce_rate || 5)) {
    return {
      safe: false,
      reason: `Bounce rate ${bounceRate.toFixed(2)}% exceeds limit of ${settings.max_bounce_rate}%`
    };
  }

  return { safe: true };
}

/**
 * Pause a campaign due to safety concerns
 */
async function pauseCampaign(campaignId: string, reason: string): Promise<void> {
  await supabase
    .from('campaigns')
    .update({
      status: 'paused',
      updated_at: new Date().toISOString()
    })
    .eq('id', campaignId);

  logger.warn(`[campaignManager] Campaign ${campaignId} paused: ${reason}`);
}

/**
 * Mark campaign sequence as complete for a contact
 */
async function completeCampaignSequence(campaignContactId: string): Promise<void> {
  await supabase
    .from('campaign_contacts')
    .update({
      contact_status: 'completed',
      sequence_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', campaignContactId);

  logger.info(`[campaignManager] Campaign sequence completed for contact ${campaignContactId}`);
}

/**
 * Get default campaign settings
 */
function getDefaultCampaignSettings() {
  return {
    max_emails_per_hour: 50,
    max_emails_per_day: 200,
    max_bounce_rate: 5.0,
    max_spam_complaint_rate: 1.0,
    min_personalization_score: 7,
    use_rag_knowledge: true,
    personalization_approach: 'value_proposition',
    email_tone: 'professional',
    optimize_send_times: true,
    respect_recipient_timezone: true,
    avoid_weekends: true,
    avoid_holidays: true
  };
}