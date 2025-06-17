import Bull from 'bull';
import Redis from 'ioredis';
import config from '../config';
import logger from '../logger';
import { sendEmail } from './emailSender';
import { craftPersonalizedEmail } from '../agents/emailCraftingAgent';
import { supabase } from '../db/supabaseClient';

// Redis connection for Bull
const redis = new Redis(config.redisUrl);

// Create email queue
export const emailQueue = new Bull('email-sending', {
  redis: config.redisUrl,
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50, // Keep last 50 failed jobs
    attempts: 3, // Retry failed jobs up to 3 times
    backoff: {
      type: 'exponential',
      delay: 60000, // Start with 1 minute delay
    },
  },
});

/**
 * Email job data interface
 */
interface EmailJobData {
  scheduledEmailId: string;
  campaignContactId: string;
  campaignId: string;
  contactId: string;
  emailSequenceNumber: number;
  personalizationData: any;
  priority?: number;
}

/**
 * Process email sending jobs
 */
emailQueue.process('send-campaign-email', async (job) => {
  const data: EmailJobData = job.data;
  logger.info(`[emailQueue] Processing email job for contact ${data.contactId}, sequence ${data.emailSequenceNumber}`);

  try {
    // 1. Get the scheduled email record
    const { data: scheduledEmail, error: scheduleError } = await supabase
      .from('scheduled_emails')
      .select('*')
      .eq('id', data.scheduledEmailId)
      .single();

    if (scheduleError || !scheduledEmail) {
      throw new Error(`Scheduled email not found: ${scheduleError?.message}`);
    }

    // 2. Check if email is still valid to send
    if (scheduledEmail.status !== 'scheduled') {
      logger.info(`[emailQueue] Email ${data.scheduledEmailId} status is ${scheduledEmail.status}, skipping`);
      return { skipped: true, reason: `Status: ${scheduledEmail.status}` };
    }

    // 3. Get contact and campaign data
    const { data: campaignContact, error: contactError } = await supabase
      .from('campaign_contacts')
      .select(`
        *,
        contacts(*),
        campaigns(*)
      `)
      .eq('id', data.campaignContactId)
      .single();

    if (contactError || !campaignContact) {
      throw new Error(`Campaign contact not found: ${contactError?.message}`);
    }

    // 4. Check if contact is still active
    if (campaignContact.contact_status !== 'active') {
      logger.info(`[emailQueue] Contact ${data.contactId} status is ${campaignContact.contact_status}, cancelling email`);
      await cancelScheduledEmail(data.scheduledEmailId, 'Contact no longer active');
      return { cancelled: true, reason: `Contact status: ${campaignContact.contact_status}` };
    }

    // 5. Craft personalized email using AI
    const contact = campaignContact.contacts;
    const campaign = campaignContact.campaigns;

    logger.info(`[emailQueue] Crafting personalized email for ${contact.company_name}`);

    const craftingResult = await craftPersonalizedEmail({
      companyName: contact.company_name || 'Unknown Company',
      industry: contact.industry || 'Unknown',
      businessDescription: contact.enriched_data?.businessDescription || '',
      companySize: contact.enriched_data?.companySize || '',
      contactName: contact.enriched_data?.contactName || '',
      websiteContent: contact.website_content || '',
      senderName: 'Alex Rodriguez', // TODO: Get from campaign settings
      senderCompany: 'ReignOverTech',
      serviceOffering: 'Custom AI automation and software development solutions',
      approach: 'value_proposition',
      tone: 'professional'
    });

    // 6. Extract email content from AI response
    const finalMessage = craftingResult.messages[craftingResult.messages.length - 1];
    const emailContent = typeof finalMessage.content === 'string' ? finalMessage.content : JSON.stringify(finalMessage.content);
    
    // Parse subject and body (same logic as craft-and-send endpoint)
    const subjectMatch = emailContent.match(/\*\*Subject:\*\*\s*([^\n]+)/i);
    let subject = subjectMatch ? subjectMatch[1].trim() : `Follow-up from ReignOverTech - Sequence ${data.emailSequenceNumber}`;
    
    let body = emailContent
      .split('---')[0]
      .split('### Personalization Insights')[0]
      .split('### Approach Justification')[0]
      .trim();

    // Convert to HTML
    body = body
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <p>${body}</p>
          <br>
          <p style="font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 10px;">
            This email was sent by ReignOverTech as part of a business outreach campaign.
            If you'd prefer not to receive these emails, please reply with "unsubscribe".
          </p>
        </body>
      </html>
    `;

    // 7. Send the email
    const emailResult = await sendEmail({
      to: contact.email,
      from: 'Alex Rodriguez <alex@reignovertech.com>',
      subject,
      html: htmlContent,
      campaignId: data.campaignId,
      contactId: data.contactId,
      emailType: data.emailSequenceNumber === 1 ? 'outbound_cold' : 'outbound_followup',
      sequenceNumber: data.emailSequenceNumber
    });

    if (!emailResult.success) {
      throw new Error(`Email sending failed: ${emailResult.error}`);
    }

    // 8. Update scheduled email record
    await supabase
      .from('scheduled_emails')
      .update({
        status: 'sent',
        actual_send_time: new Date().toISOString(),
        mailgun_message_id: emailResult.messageId,
        subject: subject,
        email_content: htmlContent,
        updated_at: new Date().toISOString()
      })
      .eq('id', data.scheduledEmailId);

    // 9. Update campaign contact
    await supabase
      .from('campaign_contacts')
      .update({
        current_email_number: data.emailSequenceNumber,
        last_email_sent_at: new Date().toISOString(),
        total_emails_sent: campaignContact.total_emails_sent + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', data.campaignContactId);

    logger.info(`[emailQueue] Successfully sent email ${data.emailSequenceNumber} to ${contact.email}`);

    return {
      success: true,
      messageId: emailResult.messageId,
      subject,
      recipient: contact.email
    };

  } catch (error) {
    logger.error(`[emailQueue] Error processing email job:`, error);
    
    // Update scheduled email with error
    await supabase
      .from('scheduled_emails')
      .update({
        status: 'failed',
        last_error_message: (error as Error).message,
        send_attempt_count: (data.personalizationData?.attempt_count || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', data.scheduledEmailId);

    throw error;
  }
});

/**
 * Add email to sending queue
 */
export async function queueEmailForSending(emailJobData: EmailJobData): Promise<Bull.Job> {
  const job = await emailQueue.add(
    'send-campaign-email',
    emailJobData,
    {
      priority: emailJobData.priority || 5,
      delay: 0, // Send immediately when job is processed
    }
  );

  logger.info(`[emailQueue] Queued email job ${job.id} for contact ${emailJobData.contactId}`);
  return job;
}

/**
 * Process all scheduled emails that are ready to send
 */
export async function processScheduledEmails(): Promise<{
  emailsQueued: number;
  emailsSkipped: number;
  errors: string[];
}> {
  logger.info('[emailQueue] Processing scheduled emails');
  
  const results = {
    emailsQueued: 0,
    emailsSkipped: 0,
    errors: [] as string[]
  };

  try {
    // Get emails scheduled for now or earlier
    const { data: scheduledEmails, error } = await supabase
      .from('scheduled_emails')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_send_time', new Date().toISOString())
      .order('scheduled_send_time', { ascending: true })
      .limit(100); // Process max 100 at a time

    if (error) {
      throw new Error(`Failed to fetch scheduled emails: ${error.message}`);
    }

    if (!scheduledEmails || scheduledEmails.length === 0) {
      logger.info('[emailQueue] No scheduled emails ready for sending');
      return results;
    }

    logger.info(`[emailQueue] Found ${scheduledEmails.length} emails ready to send`);

    // Queue each email for sending
    for (const email of scheduledEmails) {
      try {
        // Mark as queued immediately to prevent duplicate processing
        await supabase
          .from('scheduled_emails')
          .update({ status: 'sending' })
          .eq('id', email.id);

        await queueEmailForSending({
          scheduledEmailId: email.id,
          campaignContactId: email.campaign_contact_id,
          campaignId: email.campaign_id,
          contactId: email.contact_id,
          emailSequenceNumber: email.email_sequence_number,
          personalizationData: email.personalization_data || {},
          priority: email.priority || 5
        });

        results.emailsQueued++;
      } catch (error) {
        const errorMsg = `Email ${email.id}: ${(error as Error).message}`;
        logger.error(`[emailQueue] ${errorMsg}`);
        results.errors.push(errorMsg);
        results.emailsSkipped++;
      }
    }

    logger.info(`[emailQueue] Queued ${results.emailsQueued} emails for sending`);
    return results;

  } catch (error) {
    logger.error('[emailQueue] Error processing scheduled emails:', error);
    results.errors.push((error as Error).message);
    return results;
  }
}

/**
 * Cancel a scheduled email
 */
async function cancelScheduledEmail(scheduledEmailId: string, reason: string): Promise<void> {
  await supabase
    .from('scheduled_emails')
    .update({
      status: 'cancelled',
      last_error_message: reason,
      updated_at: new Date().toISOString()
    })
    .eq('id', scheduledEmailId);
}

/**
 * Queue monitoring and logging
 */
emailQueue.on('completed', (job, result) => {
  logger.info(`[emailQueue] Job ${job.id} completed successfully`, result);
});

emailQueue.on('failed', (job, err) => {
  logger.error(`[emailQueue] Job ${job.id} failed:`, err);
});

emailQueue.on('stalled', (job) => {
  logger.warn(`[emailQueue] Job ${job.id} stalled`);
});

// Export queue for external monitoring
export { emailQueue as queue };