import { gmailEmailService } from './gmailEmailService';
import { EmailData, EmailSendResult } from './emailSender';
import logger from '../logger';

/**
 * Gmail-compatible email sender that implements the same interface as the Mailgun sender
 * This allows for easy replacement in existing code
 */
export class GmailSender {
  
  /**
   * Send email via Gmail API with the same interface as Mailgun sender
   */
  async sendEmail(emailData: EmailData, userId?: string): Promise<EmailSendResult> {
    try {
      if (!userId) {
        throw new Error('User ID is required for Gmail sending');
      }

      logger.info('[gmailSender] Sending email via Gmail API', {
        to: emailData.to,
        subject: emailData.subject,
        campaignId: emailData.campaignId,
        userId
      });

      // Convert EmailData to GmailEmailData format
      const gmailEmailData = {
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
        campaignId: emailData.campaignId,
        contactId: emailData.contactId,
        emailType: emailData.emailType,
        sequenceNumber: emailData.sequenceNumber
      };

      // Send via Gmail
      const result = await gmailEmailService.sendEmail(gmailEmailData, userId);

      // Convert GmailSendResult to EmailSendResult format
      return {
        success: result.success,
        messageId: result.messageId || 'unknown',
        error: result.error,
        deliveryStatus: result.deliveryStatus
      };

    } catch (error) {
      logger.error('[gmailSender] Failed to send email', {
        error: (error as Error).message,
        to: emailData.to,
        userId
      });

      return {
        success: false,
        error: (error as Error).message,
        deliveryStatus: 'failed'
      };
    }
  }

  /**
   * Send test email for verification
   */
  async sendTestEmail(to: string = 'tristanwaite7@gmail.com', userId?: string): Promise<EmailSendResult> {
    if (!userId) {
      return {
        success: false,
        error: 'User ID is required for Gmail test email',
        deliveryStatus: 'failed'
      };
    }

    const testEmailData: EmailData = {
      to,
      from: 'test@gmail.com', // Will be replaced by actual Gmail account
      subject: 'Gmail API Integration Test - ReignOverTech',
      html: `
        <h2>🚀 Gmail API Integration Test</h2>
        <p>This is a test email from the ReignOverTech Gmail API integration system.</p>
        
        <p><strong>Test Details:</strong></p>
        <ul>
          <li>Sent via Gmail API</li>
          <li>Timestamp: ${new Date().toISOString()}</li>
          <li>System: Gmail6 Cold Outreach Agent</li>
          <li>Integration: Gmail API (Reply.io style)</li>
        </ul>
        
        <p>If you received this email, the Gmail API integration is working correctly! 🎉</p>
        
        <hr>
        <p style="font-size: 12px; color: #666;">
          This is an automated test email from ReignOverTech Gmail integration.<br>
          If you received this in error, please ignore this message.
        </p>
      `,
    };

    return await this.sendEmail(testEmailData, userId);
  }

  /**
   * Update contact last contacted timestamp
   * Delegates to the Gmail service
   */
  async updateContactLastContacted(contactId: string): Promise<void> {
    await gmailEmailService.updateContactLastContacted(contactId);
  }
}

// Export singleton instance
export const gmailSender = new GmailSender();