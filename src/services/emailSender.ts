import Mailgun from 'mailgun.js';
import formData from 'form-data';
import config from '../config';
import logger from '../logger';
import { supabase } from '../db/supabaseClient';

// Initialize Mailgun client
const mailgun = new Mailgun(formData);
const mg = mailgun.client({
  username: 'api',
  key: config.mailgunApiKey,
});

export interface EmailData {
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string;
  campaignId?: string;
  contactId?: string;
  emailType?: 'outbound_cold' | 'outbound_followup' | 'outbound_response';
  sequenceNumber?: number;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  deliveryStatus?: 'queued' | 'sent' | 'delivered' | 'failed';
}

/**
 * Send email via Mailgun and track in database
 */
export async function sendEmail(emailData: EmailData): Promise<EmailSendResult> {
  try {
    logger.info(`[emailSender] Sending email to ${emailData.to}`, {
      subject: emailData.subject,
      campaignId: emailData.campaignId,
      contactId: emailData.contactId
    });

    // SAFETY FIRST: Always redirect to test email to protect domain reputation
    const testEmail = 'tristanwaite7@gmail.com';
    const safeTestEmails = ['tristanwaite7@gmail.com', 'test@reignovertech.com'];
    
    // Only allow emails to safe test addresses to protect domain reputation
    const actualTo = safeTestEmails.includes(emailData.to) ? emailData.to : testEmail;
    
    if (actualTo !== emailData.to) {
      logger.info(`[emailSender] 🛡️ SAFETY MODE: Redirecting email from ${emailData.to} to ${testEmail}`);
      logger.warn(`[emailSender] 🚨 PROTECTION: Prevented sending to ${emailData.to} to protect domain reputation`);
    }
    
    logger.info(`[emailSender] 📧 SAFE SEND: Delivering to ${actualTo}`);

    // Prepare Mailgun email data
    const mailgunData = {
      from: emailData.from,
      to: actualTo,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text || stripHtml(emailData.html),
      'o:tracking': 'yes', // Enable tracking
      'o:tracking-clicks': 'yes',
      'o:tracking-opens': 'yes',
    } as any;

    // Send email via Mailgun
    const response = await mg.messages.create(config.mailgunDomain, mailgunData);
    
    logger.info(`[emailSender] Email sent successfully`, {
      messageId: response.id,
      to: actualTo,
      subject: emailData.subject
    });

    // Store email in database
    if (emailData.campaignId && emailData.contactId) {
      await storeEmailHistory({
        contactId: emailData.contactId,
        campaignId: emailData.campaignId,
        emailType: emailData.emailType || 'outbound_cold',
        subject: emailData.subject,
        content: emailData.html,
        mailgunMessageId: response.id || 'unknown',
        sequenceNumber: emailData.sequenceNumber || 1,
        sentAt: new Date(),
      });
    }

    return {
      success: true,
      messageId: response.id || 'unknown',
      deliveryStatus: 'queued'
    };

  } catch (error) {
    logger.error(`[emailSender] Failed to send email to ${emailData.to}`, {
      error: (error as Error).message,
      campaignId: emailData.campaignId,
      contactId: emailData.contactId
    });

    return {
      success: false,
      error: (error as Error).message,
      deliveryStatus: 'failed'
    };
  }
}

/**
 * Store email history in database
 */
async function storeEmailHistory(data: {
  contactId: string;
  campaignId: string;
  emailType: string;
  subject: string;
  content: string;
  mailgunMessageId: string;
  sequenceNumber: number;
  sentAt: Date;
}) {
  try {
    const { error } = await supabase
      .from('email_history')
      .insert({
        contact_id: data.contactId,
        campaign_id: data.campaignId,
        email_type: data.emailType,
        subject: data.subject,
        content: data.content,
        mailgun_message_id: data.mailgunMessageId,
        email_sequence_number: data.sequenceNumber,
        sent_at: data.sentAt.toISOString(),
      });

    if (error) {
      logger.error(`[emailSender] Failed to store email history`, { error: error.message });
    } else {
      logger.info(`[emailSender] Email history stored successfully`);
    }
  } catch (error) {
    logger.error(`[emailSender] Error storing email history`, { error: (error as Error).message });
  }
}

/**
 * Update contact last contacted timestamp
 */
export async function updateContactLastContacted(contactId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('contacts')
      .update({ 
        last_contacted_at: new Date().toISOString()
      })
      .eq('id', contactId);

    if (error) {
      logger.error(`[emailSender] Failed to update contact last contacted`, { error: error.message });
    }
  } catch (error) {
    logger.error(`[emailSender] Error updating contact`, { error: (error as Error).message });
  }
}

/**
 * Send test email for verification
 */
export async function sendTestEmail(to: string = 'tristanwaite7@gmail.com'): Promise<EmailSendResult> {
  const testEmailData: EmailData = {
    to,
    from: 'ReignOverTech <test@reignovertech.com>',
    subject: 'ReignOverTech Email System Test',
    html: `
      <h2>🚀 ReignOverTech Email System Test</h2>
      <p>This is a test email from the ReignOverTech email automation system.</p>
      
      <p><strong>Test Details:</strong></p>
      <ul>
        <li>Sent via Mailgun API</li>
        <li>Timestamp: ${new Date().toISOString()}</li>
        <li>System: Gmail6 Cold Outreach Agent</li>
      </ul>
      
      <p>If you received this email, the email sending system is working correctly! 🎉</p>
      
      <hr>
      <p style="font-size: 12px; color: #666;">
        This is an automated test email from ReignOverTech.<br>
        If you received this in error, please ignore this message.
      </p>
    `,
  };

  return await sendEmail(testEmailData);
}

/**
 * Strip HTML tags for plain text version
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * Generate unsubscribe link
 */
export function generateUnsubscribeLink(contactId: string, campaignId: string): string {
  const baseUrl = config.frontendUrl.replace(':3001', ':3000'); // API URL
  return `${baseUrl}/unsubscribe?contact=${contactId}&campaign=${campaignId}`;
}

/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}