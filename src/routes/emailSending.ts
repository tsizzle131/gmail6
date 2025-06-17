import { Router, Request, Response } from 'express';
import { sendEmail, sendTestEmail, updateContactLastContacted, isValidEmail, EmailData } from '../services/emailSender';
import { sendEmailMock, sendTestEmailMock } from '../services/mockEmailSender';
import { craftPersonalizedEmail } from '../agents/emailCraftingAgent';
import logger from '../logger';

const router = Router();

/**
 * @swagger
 * /email/send/test-mock:
 *   post:
 *     summary: Send a mock test email (safe, no real sending)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               to:
 *                 type: string
 *                 description: Email address to send test to (defaults to tristanwaite7@gmail.com)
 *     responses:
 *       200:
 *         description: Mock test email logged successfully
 */
router.post('/send/test-mock', async (req: Request, res: Response) => {
  try {
    const { to } = req.body;
    const recipient = to || 'tristanwaite7@gmail.com';

    if (!isValidEmail(recipient)) {
      return res.status(400).json({
        error: 'Invalid email address format'
      });
    }

    logger.info(`[emailSending] Sending MOCK test email to: ${recipient}`);
    
    const result = await sendTestEmailMock(recipient);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Mock test email logged successfully (no real email sent)',
        messageId: result.messageId,
        sentTo: recipient,
        mode: 'MOCK'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        message: 'Failed to log mock test email'
      });
    }
  } catch (error) {
    logger.error('[emailSending] Error in mock test email endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /email/send/test:
 *   post:
 *     summary: Send a REAL test email via Mailgun (PROTECTED - only sends to safe addresses)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               to:
 *                 type: string
 *                 description: Email address to send test to (defaults to tristanwaite7@gmail.com)
 *     responses:
 *       200:
 *         description: Test email sent successfully
 */
router.post('/send/test', async (req: Request, res: Response) => {
  try {
    const { to } = req.body;
    const recipient = to || 'tristanwaite7@gmail.com';

    if (!isValidEmail(recipient)) {
      return res.status(400).json({
        error: 'Invalid email address format'
      });
    }

    logger.info(`[emailSending] Sending test email to: ${recipient}`);
    
    // Use REAL Mailgun but with safety protections
    const result = await sendTestEmail(recipient);
    
    if (result.success) {
      res.json({
        success: true,
        message: '🛡️ PROTECTED: Real test email sent via Mailgun (domain reputation protected)',
        messageId: result.messageId,
        sentTo: recipient,
        mode: 'REAL_PROTECTED'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        message: 'Failed to send test email'
      });
    }
  } catch (error) {
    logger.error('[emailSending] Error in test email endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /email/send:
 *   post:
 *     summary: Send a custom email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               to:
 *                 type: string
 *                 description: Recipient email address
 *               from:
 *                 type: string
 *                 description: Sender email address
 *               subject:
 *                 type: string
 *                 description: Email subject
 *               html:
 *                 type: string
 *                 description: HTML email content
 *               text:
 *                 type: string
 *                 description: Plain text email content (optional)
 *               campaignId:
 *                 type: string
 *                 description: Campaign ID for tracking
 *               contactId:
 *                 type: string
 *                 description: Contact ID for tracking
 *             required:
 *               - to
 *               - from
 *               - subject
 *               - html
 *     responses:
 *       200:
 *         description: Email sent successfully
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { to, from, subject, html, text, campaignId, contactId, emailType, sequenceNumber } = req.body;

    // Validate required fields
    if (!to || !from || !subject || !html) {
      return res.status(400).json({
        error: 'Missing required fields: to, from, subject, html'
      });
    }

    if (!isValidEmail(to)) {
      return res.status(400).json({
        error: 'Invalid recipient email address format'
      });
    }

    if (!isValidEmail(from)) {
      return res.status(400).json({
        error: 'Invalid sender email address format'
      });
    }

    const emailData: EmailData = {
      to,
      from,
      subject,
      html,
      text,
      campaignId,
      contactId,
      emailType: emailType || 'outbound_cold',
      sequenceNumber: sequenceNumber || 1
    };

    logger.info(`[emailSending] Sending email to: ${to}`, {
      subject,
      campaignId,
      contactId
    });

    // Use REAL Mailgun with protection 
    const result = await sendEmail(emailData);

    // Update contact last contacted if we have a contact ID
    if (contactId && result.success) {
      await updateContactLastContacted(contactId);
    }

    if (result.success) {
      res.json({
        success: true,
        message: 'Email sent successfully',
        messageId: result.messageId,
        deliveryStatus: result.deliveryStatus
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        deliveryStatus: result.deliveryStatus
      });
    }
  } catch (error) {
    logger.error('[emailSending] Error in send email endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /email/craft-and-send:
 *   post:
 *     summary: Craft personalized email using AI and send it immediately
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               companyName:
 *                 type: string
 *               industry:
 *                 type: string
 *               businessDescription:
 *                 type: string
 *               companySize:
 *                 type: string
 *               contactName:
 *                 type: string
 *               websiteContent:
 *                 type: string
 *               senderName:
 *                 type: string
 *               senderCompany:
 *                 type: string
 *               serviceOffering:
 *                 type: string
 *               approach:
 *                 type: string
 *               tone:
 *                 type: string
 *               recipientEmail:
 *                 type: string
 *                 description: Email address to send the crafted email to
 *               senderEmail:
 *                 type: string
 *                 description: Sender email address
 *               campaignId:
 *                 type: string
 *               contactId:
 *                 type: string
 *             required:
 *               - companyName
 *               - industry
 *               - senderName
 *               - senderCompany
 *               - serviceOffering
 *               - recipientEmail
 *               - senderEmail
 *     responses:
 *       200:
 *         description: Email crafted and sent successfully
 */
router.post('/craft-and-send', async (req: Request, res: Response) => {
  try {
    const {
      companyName,
      industry,
      businessDescription,
      companySize,
      contactName,
      websiteContent,
      senderName,
      senderCompany,
      serviceOffering,
      approach,
      tone,
      recipientEmail,
      senderEmail,
      campaignId,
      contactId
    } = req.body;

    // Validate required fields
    if (!companyName || !industry || !senderName || !senderCompany || !serviceOffering || !recipientEmail || !senderEmail) {
      return res.status(400).json({
        error: 'Missing required fields'
      });
    }

    if (!isValidEmail(recipientEmail)) {
      return res.status(400).json({
        error: 'Invalid recipient email address format'
      });
    }

    if (!isValidEmail(senderEmail)) {
      return res.status(400).json({
        error: 'Invalid sender email address format'
      });
    }

    logger.info(`[emailSending] Crafting and sending email to: ${recipientEmail}`, {
      companyName,
      industry,
      senderName
    });

    // Step 1: Craft personalized email using AI
    const craftingResult = await craftPersonalizedEmail({
      companyName,
      industry,
      businessDescription,
      companySize,
      contactName,
      websiteContent,
      senderName,
      senderCompany,
      serviceOffering,
      approach,
      tone
    });

    // Extract the final email content from the AI response
    const finalMessage = craftingResult.messages[craftingResult.messages.length - 1];
    const emailContent = typeof finalMessage.content === 'string' ? finalMessage.content : JSON.stringify(finalMessage.content);

    // Parse the AI response to extract subject and body
    // The AI formats it as:
    // **Subject:** [subject text]
    // **Body:**
    // [body text]
    
    const subjectMatch = emailContent.match(/\*\*Subject:\*\*\s*([^\n]+)/i);
    const bodyMatch = emailContent.match(/\*\*Body:\*\*\s*([\s\S]*?)(?=\n---|\n### |$)/i);
    
    let subject = subjectMatch ? subjectMatch[1].trim() : `Partnership Opportunity - ${senderCompany} & ${companyName}`;
    let body = bodyMatch ? bodyMatch[1].trim() : emailContent;
    
    // If we still don't have a good extraction, look for the content between subject and insights
    if (!bodyMatch && emailContent.includes('**Subject:**')) {
      const afterSubject = emailContent.split('**Subject:**')[1];
      if (afterSubject) {
        const beforeInsights = afterSubject.split('---')[0] || afterSubject.split('### Personalization Insights')[0] || afterSubject;
        body = beforeInsights.replace(/^[^\n]*\n\**Body:\**\s*/i, '').trim();
      }
    }
    
    // Always clean up any remaining analysis sections
    body = body
      .split('---')[0]  // Remove everything after ---
      .split('### Personalization Insights')[0]  // Remove personalization insights
      .split('### Approach Justification')[0]  // Remove approach justification
      .trim();

    // Convert markdown-like formatting to HTML
    body = body
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    // Wrap in HTML structure
    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <p>${body}</p>
          <br>
          <p style="font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 10px;">
            This email was sent by ${senderCompany}. 
            If you'd prefer not to receive these emails, please reply with "unsubscribe".
          </p>
        </body>
      </html>
    `;

    // Step 2: Send the crafted email
    const emailData: EmailData = {
      to: recipientEmail,
      from: `${senderName} <${senderEmail}>`,
      subject,
      html: htmlContent,
      campaignId,
      contactId,
      emailType: 'outbound_cold',
      sequenceNumber: 1
    };

    // Use REAL Mailgun with protection for complete workflow test
    const sendResult = await sendEmail(emailData);

    // Update contact last contacted if we have a contact ID
    if (contactId && sendResult.success) {
      await updateContactLastContacted(contactId);
    }

    if (sendResult.success) {
      res.json({
        success: true,
        message: 'Email crafted and sent successfully',
        messageId: sendResult.messageId,
        deliveryStatus: sendResult.deliveryStatus,
        emailDetails: {
          subject,
          to: recipientEmail,
          from: emailData.from
        },
        craftingResult: {
          companyName,
          personalizationInsights: 'Email crafted using AI with company knowledge and lead analysis'
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: sendResult.error,
        deliveryStatus: sendResult.deliveryStatus,
        craftingResult: {
          subject,
          emailContent: htmlContent
        }
      });
    }

  } catch (error) {
    logger.error('[emailSending] Error in craft-and-send endpoint:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: (error as Error).message
    });
  }
});

export default router;