import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { gmailAuthService } from './gmailAuthService';
import { gmailAccountManager } from './gmailAccountManager';
import { supabase } from '../db/supabaseClient';
import logger from '../logger';
import config from '../config';

export interface GmailEmailData {
  to: string;
  from?: string; // Will be set based on selected Gmail account
  subject: string;
  html: string;
  text?: string;
  campaignId?: string;
  contactId?: string;
  emailType?: 'outbound_cold' | 'outbound_followup' | 'outbound_response';
  sequenceNumber?: number;
  preferredAccountId?: string; // Optional: prefer specific Gmail account
}

export interface GmailSendResult {
  success: boolean;
  messageId?: string;
  threadId?: string;
  gmailAccountId?: string;
  accountEmail?: string;
  error?: string;
  deliveryStatus?: 'queued' | 'sent' | 'failed';
}

/**
 * Gmail Email Service
 * Handles email sending via Gmail API with account management and threading
 */
export class GmailEmailService {

  /**
   * Send email via Gmail API
   */
  async sendEmail(emailData: GmailEmailData, userId: string): Promise<GmailSendResult> {
    try {
      logger.info('[gmailEmailService] Sending email via Gmail API', {
        to: emailData.to,
        subject: emailData.subject,
        campaignId: emailData.campaignId,
        contactId: emailData.contactId,
        preferredAccountId: emailData.preferredAccountId
      });

      // Get the best sending account
      const sendingAccount = await gmailAccountManager.getBestSendingAccount(
        userId,
        emailData.preferredAccountId
      );

      if (!sendingAccount) {
        return {
          success: false,
          error: 'No available Gmail accounts for sending',
          deliveryStatus: 'failed'
        };
      }

      // Safety check: Only send to approved test emails in development
      const safeTestEmails = ['tristanwaite7@gmail.com', 'test@reignovertech.com'];
      const actualTo = this.shouldRedirectEmail(emailData.to, safeTestEmails);
      
      if (actualTo !== emailData.to) {
        logger.info('[gmailEmailService] 🛡️ SAFETY MODE: Redirecting email', {
          original: emailData.to,
          redirected: actualTo
        });
      }

      // Create Gmail API client with account's access token
      const oauth2Client = new OAuth2Client();
      oauth2Client.setCredentials({ access_token: sendingAccount.accessToken });
      
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // Compose email message
      const emailMessage = this.composeEmailMessage({
        ...emailData,
        to: actualTo,
        from: sendingAccount.email
      });

      // Send email via Gmail API
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: emailMessage
        }
      });

      const messageId = response.data.id || undefined;
      const threadId = response.data.threadId || undefined;

      if (!messageId) {
        throw new Error('Gmail API did not return message ID');
      }

      logger.info('[gmailEmailService] Email sent successfully via Gmail', {
        messageId,
        threadId,
        accountEmail: sendingAccount.email,
        to: actualTo
      });

      // Record successful send
      await gmailAccountManager.recordSuccessfulSend(sendingAccount.accountId, messageId);

      // Store email in database
      if (emailData.campaignId && emailData.contactId) {
        await this.storeGmailEmailHistory({
          contactId: emailData.contactId,
          campaignId: emailData.campaignId,
          gmailAccountId: sendingAccount.accountId,
          gmailMessageId: messageId,
          gmailThreadId: threadId,
          emailType: emailData.emailType || 'outbound_cold',
          subject: emailData.subject,
          content: emailData.html,
          sequenceNumber: emailData.sequenceNumber || 1,
          sentAt: new Date(),
          toEmail: actualTo,
          fromEmail: sendingAccount.email
        });
      }

      return {
        success: true,
        messageId,
        threadId,
        gmailAccountId: sendingAccount.accountId,
        accountEmail: sendingAccount.email,
        deliveryStatus: 'sent'
      };

    } catch (error) {
      const errorMessage = (error as Error).message;
      logger.error('[gmailEmailService] Failed to send email via Gmail', {
        error: errorMessage,
        to: emailData.to,
        campaignId: emailData.campaignId
      });

      // Record error if we had a sending account
      const sendingAccount = await gmailAccountManager.getBestSendingAccount(userId, emailData.preferredAccountId);
      if (sendingAccount) {
        await gmailAccountManager.recordSendError(sendingAccount.accountId, errorMessage);
      }

      return {
        success: false,
        error: errorMessage,
        deliveryStatus: 'failed'
      };
    }
  }

  /**
   * Send test email to verify Gmail account
   */
  async sendTestEmail(accountId: string, testEmail: string = 'tristanwaite7@gmail.com'): Promise<GmailSendResult> {
    try {
      // Get account details
      const account = await gmailAuthService.getAccountById(accountId);
      if (!account) {
        return {
          success: false,
          error: 'Gmail account not found',
          deliveryStatus: 'failed'
        };
      }

      // Get valid access token
      const accessToken = await gmailAuthService.getValidAccessToken(accountId);
      if (!accessToken) {
        return {
          success: false,
          error: 'Unable to obtain valid access token',
          deliveryStatus: 'failed'
        };
      }

      // Create Gmail API client
      const oauth2Client = new OAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // Compose test email
      const testEmailData: GmailEmailData = {
        to: testEmail,
        from: account.email,
        subject: '🚀 Gmail API Integration Test - ReignOverTech',
        html: `
          <h2>🚀 Gmail API Integration Test</h2>
          <p>This is a test email from the ReignOverTech Gmail API integration system.</p>
          
          <p><strong>Test Details:</strong></p>
          <ul>
            <li>Sent via Gmail API</li>
            <li>Account: ${account.email}</li>
            <li>Timestamp: ${new Date().toISOString()}</li>
            <li>System: Gmail6 Cold Outreach Agent</li>
          </ul>
          
          <p>If you received this email, the Gmail API integration is working correctly! 🎉</p>
          
          <hr>
          <p style="font-size: 12px; color: #666;">
            This is an automated test email from ReignOverTech.<br>
            If you received this in error, please ignore this message.
          </p>
        `,
      };

      const emailMessage = this.composeEmailMessage(testEmailData);

      // Send test email
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: emailMessage
        }
      });

      const messageId = response.data.id || undefined;
      const threadId = response.data.threadId || undefined;

      logger.info('[gmailEmailService] Test email sent successfully', {
        messageId,
        threadId,
        accountId,
        accountEmail: account.email,
        testEmail
      });

      // Record successful send
      await gmailAccountManager.recordSuccessfulSend(accountId, messageId || 'test');

      return {
        success: true,
        messageId,
        threadId,
        gmailAccountId: accountId,
        accountEmail: account.email,
        deliveryStatus: 'sent'
      };

    } catch (error) {
      const errorMessage = (error as Error).message;
      logger.error('[gmailEmailService] Test email failed', {
        error: errorMessage,
        accountId,
        testEmail
      });

      // Record error
      await gmailAccountManager.recordSendError(accountId, errorMessage);

      return {
        success: false,
        error: errorMessage,
        deliveryStatus: 'failed'
      };
    }
  }

  /**
   * Compose email message in Gmail's expected format
   */
  private composeEmailMessage(emailData: GmailEmailData): string {
    const boundary = '----=_Part_0_' + Date.now();
    
    // Prepare headers
    const headers = [
      `To: ${emailData.to}`,
      `From: ${emailData.from}`,
      `Subject: ${emailData.subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`
    ];

    // Prepare plain text version
    const textContent = emailData.text || this.stripHtml(emailData.html);

    // Compose multipart message
    const messageParts = [
      headers.join('\r\n'),
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      textContent,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      emailData.html,
      '',
      `--${boundary}--`
    ];

    const rawMessage = messageParts.join('\r\n');
    
    // Encode in base64url format
    return Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Store Gmail email in database history
   */
  private async storeGmailEmailHistory(data: {
    contactId: string;
    campaignId: string;
    gmailAccountId: string;
    gmailMessageId: string;
    gmailThreadId?: string;
    emailType: string;
    subject: string;
    content: string;
    sequenceNumber: number;
    sentAt: Date;
    toEmail: string;
    fromEmail: string;
  }): Promise<void> {
    try {
      // Store in email_history table (existing structure with Gmail fields)
      const { error: historyError } = await supabase
        .from('email_history')
        .insert({
          contact_id: data.contactId,
          campaign_id: data.campaignId,
          gmail_account_id: data.gmailAccountId,
          gmail_message_id: data.gmailMessageId,
          gmail_thread_id: data.gmailThreadId,
          email_type: data.emailType,
          subject: data.subject,
          content: data.content,
          email_sequence_number: data.sequenceNumber,
          sent_at: data.sentAt.toISOString(),
        });

      if (historyError) {
        logger.warn('[gmailEmailService] Failed to store email history', {
          error: historyError.message
        });
      }

      // Store in gmail_messages table (new Gmail-specific tracking)
      const { error: messageError } = await supabase
        .from('gmail_messages')
        .insert({
          gmail_account_id: data.gmailAccountId,
          campaign_id: data.campaignId,
          contact_id: data.contactId,
          gmail_message_id: data.gmailMessageId,
          gmail_thread_id: data.gmailThreadId || data.gmailMessageId,
          message_type: 'outbound',
          subject: data.subject,
          content_html: data.content,
          content_text: this.stripHtml(data.content),
          from_email: data.fromEmail,
          to_email: data.toEmail,
          sent_at: data.sentAt.toISOString(),
        });

      if (messageError) {
        logger.warn('[gmailEmailService] Failed to store Gmail message', {
          error: messageError.message
        });
      }

      logger.debug('[gmailEmailService] Email history stored successfully');

    } catch (error) {
      logger.error('[gmailEmailService] Error storing email history', {
        error: (error as Error).message
      });
    }
  }

  /**
   * Update contact last contacted timestamp
   */
  async updateContactLastContacted(contactId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ 
          last_contacted_at: new Date().toISOString()
        })
        .eq('id', contactId);

      if (error) {
        logger.warn('[gmailEmailService] Failed to update contact last contacted', {
          error: error.message,
          contactId
        });
      }
    } catch (error) {
      logger.error('[gmailEmailService] Error updating contact', {
        error: (error as Error).message,
        contactId
      });
    }
  }

  /**
   * Check if email should be redirected for safety
   */
  private shouldRedirectEmail(originalTo: string, safeEmails: string[]): string {
    // In production, remove this safety check
    if (config.nodeEnv === 'production') {
      return originalTo;
    }

    // In development, only allow safe test emails
    if (safeEmails.includes(originalTo)) {
      return originalTo;
    }

    // Redirect to first safe email
    return safeEmails[0] || 'tristanwaite7@gmail.com';
  }

  /**
   * Strip HTML tags for plain text version
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Get email thread history for conversation context
   */
  async getThreadHistory(threadId: string, accountId: string): Promise<any[]> {
    try {
      // Get access token for the account
      const accessToken = await gmailAuthService.getValidAccessToken(accountId);
      if (!accessToken) {
        throw new Error('Unable to get valid access token');
      }

      // Create Gmail API client
      const oauth2Client = new OAuth2Client();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // Get thread details
      const response = await gmail.users.threads.get({
        userId: 'me',
        id: threadId
      });

      const thread = response.data;
      const messages = thread.messages || [];

      // Process messages to extract relevant information
      const threadHistory = messages.map(message => ({
        id: message.id,
        threadId: message.threadId,
        snippet: message.snippet,
        internalDate: message.internalDate,
        headers: this.extractMessageHeaders(message.payload?.headers || []),
        body: this.extractMessageBody(message.payload)
      }));

      logger.debug('[gmailEmailService] Retrieved thread history', {
        threadId,
        messageCount: threadHistory.length
      });

      return threadHistory;

    } catch (error) {
      logger.error('[gmailEmailService] Failed to get thread history', {
        error: (error as Error).message,
        threadId,
        accountId
      });
      return [];
    }
  }

  /**
   * Extract message headers
   */
  private extractMessageHeaders(headers: any[]): Record<string, string> {
    const headerMap: Record<string, string> = {};
    
    headers.forEach(header => {
      if (header.name && header.value) {
        headerMap[header.name.toLowerCase()] = header.value;
      }
    });

    return headerMap;
  }

  /**
   * Extract message body from Gmail payload
   */
  private extractMessageBody(payload: any): { text?: string; html?: string } {
    const body: { text?: string; html?: string } = {};

    if (!payload) return body;

    // Handle simple message
    if (payload.body?.data) {
      const content = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      if (payload.mimeType === 'text/html') {
        body.html = content;
      } else {
        body.text = content;
      }
      return body;
    }

    // Handle multipart message
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body.text = Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.mimeType === 'text/html' && part.body?.data) {
          body.html = Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
      }
    }

    return body;
  }
}

// Export singleton instance
export const gmailEmailService = new GmailEmailService();