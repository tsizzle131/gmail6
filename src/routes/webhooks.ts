import { Router, Request, Response } from 'express';
import { createHash, createHmac } from 'crypto';
import config from '../config';
import logger from '../logger';
import { supabase } from '../db/supabaseClient';
import { processEmailResponse } from '../agents/responseHandlerAgent';

const router = Router();

/**
 * @swagger
 * /webhooks/mailgun/incoming:
 *   post:
 *     summary: Handle incoming email webhook from Mailgun
 *     description: Processes incoming email replies and triggers response handling workflow
 *     requestBody:
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               timestamp:
 *                 type: string
 *               token:
 *                 type: string
 *               signature:
 *                 type: string
 *               recipient:
 *                 type: string
 *               sender:
 *                 type: string
 *               subject:
 *                 type: string
 *               body-plain:
 *                 type: string
 *               body-html:
 *                 type: string
 *               message-id:
 *                 type: string
 *               In-Reply-To:
 *                 type: string
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       401:
 *         description: Invalid webhook signature
 *       500:
 *         description: Error processing webhook
 */
router.post('/mailgun/incoming', async (req: Request, res: Response) => {
  try {
    logger.info('[webhooks] Received Mailgun incoming email webhook');

    // Verify Mailgun webhook signature
    const isValid = verifyMailgunSignature(req.body);
    if (!isValid) {
      logger.warn('[webhooks] Invalid Mailgun webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const {
      timestamp,
      token,
      signature,
      recipient,
      sender,
      subject,
      'body-plain': bodyPlain,
      'body-html': bodyHtml,
      'message-id': messageId,
      'In-Reply-To': inReplyTo,
      'References': references
    } = req.body;

    logger.info('[webhooks] Processing incoming email', {
      from: sender,
      to: recipient,
      subject: subject,
      messageId: messageId,
      inReplyTo: inReplyTo
    });

    // Find the original campaign email this is replying to
    const campaignContext = await findOriginalCampaignEmail(sender, recipient, inReplyTo, references);

    if (!campaignContext) {
      logger.warn('[webhooks] Could not match incoming email to campaign', {
        sender,
        recipient,
        inReplyTo
      });
      return res.status(200).json({ 
        message: 'Email received but not matched to campaign',
        action: 'ignored'
      });
    }

    // Create email response record
    const emailResponseData = {
      campaign_id: campaignContext.campaignId,
      contact_id: campaignContext.contactId,
      campaign_contact_id: campaignContext.campaignContactId,
      original_email_id: campaignContext.originalEmailId,
      response_email_id: messageId,
      response_subject: subject,
      response_content: bodyPlain || bodyHtml || '',
      response_from_email: sender,
      response_to_email: recipient,
      classification: 'pending', // Will be classified by the agent
      processing_status: 'pending'
    };

    const { data: emailResponse, error: insertError } = await supabase
      .from('email_responses')
      .insert(emailResponseData)
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to create email response record: ${insertError.message}`);
    }

    // Create or update conversation record
    const conversationData = {
      campaign_id: campaignContext.campaignId,
      contact_id: campaignContext.contactId,
      campaign_contact_id: campaignContext.campaignContactId,
      conversation_status: 'active',
      last_response_at: new Date().toISOString(),
      total_responses: 1 // Will be updated if conversation exists
    };

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .upsert(conversationData, { 
        onConflict: 'campaign_id,contact_id',
        ignoreDuplicates: false 
      })
      .select()
      .single();

    if (conversationError) {
      logger.warn('[webhooks] Failed to create/update conversation:', conversationError);
    }

    // Trigger async response processing
    processEmailResponseAsync(emailResponse.id);

    logger.info('[webhooks] Email response created and processing triggered', {
      emailResponseId: emailResponse.id,
      campaignId: campaignContext.campaignId,
      contactId: campaignContext.contactId
    });

    res.status(200).json({
      message: 'Email response received and processing started',
      emailResponseId: emailResponse.id,
      campaignId: campaignContext.campaignId,
      processingStatus: 'started'
    });

  } catch (error) {
    logger.error('[webhooks] Error processing incoming email webhook:', error);
    res.status(500).json({
      error: 'Failed to process webhook',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /webhooks/mailgun/delivery:
 *   post:
 *     summary: Handle delivery status webhook from Mailgun
 *     description: Processes email delivery, bounce, and spam complaint notifications
 */
router.post('/mailgun/delivery', async (req: Request, res: Response) => {
  try {
    logger.info('[webhooks] Received Mailgun delivery webhook');

    // Verify Mailgun webhook signature
    const isValid = verifyMailgunSignature(req.body);
    if (!isValid) {
      logger.warn('[webhooks] Invalid Mailgun webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const {
      event,
      'message-id': messageId,
      recipient,
      severity,
      reason,
      description,
      timestamp
    } = req.body;

    logger.info('[webhooks] Processing delivery event', {
      event,
      messageId,
      recipient,
      severity,
      reason
    });

    // Update email delivery status in database
    await updateEmailDeliveryStatus(messageId, event, {
      recipient,
      severity,
      reason,
      description,
      timestamp: new Date(timestamp * 1000).toISOString()
    });

    // Handle bounces and complaints
    if (event === 'bounced' || event === 'complained') {
      await handleBounceOrComplaint(messageId, recipient, event, severity, reason);
    }

    res.status(200).json({
      message: 'Delivery webhook processed successfully',
      event,
      messageId
    });

  } catch (error) {
    logger.error('[webhooks] Error processing delivery webhook:', error);
    res.status(500).json({
      error: 'Failed to process delivery webhook',
      details: (error as Error).message
    });
  }
});

/**
 * Verify Mailgun webhook signature for security
 */
function verifyMailgunSignature(body: any): boolean {
  try {
    const { timestamp, token, signature } = body;
    
    if (!timestamp || !token || !signature) {
      logger.warn('[webhooks] Missing signature components');
      return false;
    }

    // Skip verification if signing key not configured (for development)
    if (!config.mailgunWebhookSigningKey) {
      logger.warn('[webhooks] Webhook signing key not configured, skipping verification');
      return true;
    }

    // Check timestamp (should be within 15 minutes)
    const timestampMs = parseInt(timestamp) * 1000;
    const now = Date.now();
    const fifteenMinutes = 15 * 60 * 1000;
    
    if (Math.abs(now - timestampMs) > fifteenMinutes) {
      logger.warn('[webhooks] Webhook timestamp too old');
      return false;
    }

    // Verify signature
    const data = timestamp + token;
    const expectedSignature = createHmac('sha256', config.mailgunWebhookSigningKey)
      .update(data)
      .digest('hex');

    const isValid = signature === expectedSignature;
    
    if (!isValid) {
      logger.warn('[webhooks] Signature mismatch', {
        expected: expectedSignature,
        received: signature
      });
    }

    return isValid;

  } catch (error) {
    logger.error('[webhooks] Error verifying signature:', error);
    return false;
  }
}

/**
 * Find the original campaign email that this incoming email is replying to
 */
async function findOriginalCampaignEmail(sender: string, recipient: string, inReplyTo?: string, references?: string) {
  try {
    // First try to match by In-Reply-To header (most reliable)
    if (inReplyTo) {
      const { data: scheduledEmail, error } = await supabase
        .from('scheduled_emails')
        .select(`
          id,
          campaign_id,
          contact_id,
          campaign_contact_id,
          mailgun_message_id
        `)
        .eq('mailgun_message_id', inReplyTo.replace(/[<>]/g, ''))
        .single();

      if (!error && scheduledEmail) {
        logger.info('[webhooks] Matched email by In-Reply-To header');
        return {
          campaignId: scheduledEmail.campaign_id,
          contactId: scheduledEmail.contact_id,
          campaignContactId: scheduledEmail.campaign_contact_id,
          originalEmailId: scheduledEmail.mailgun_message_id
        };
      }
    }

    // Try to match by sender email and recent campaign activity
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('id, email')
      .eq('email', sender)
      .single();

    if (contactError || !contact) {
      logger.warn('[webhooks] Contact not found for sender email:', sender);
      return null;
    }

    // Find recent campaign activity for this contact
    const { data: campaignContact, error: campaignError } = await supabase
      .from('campaign_contacts')
      .select(`
        id,
        campaign_id,
        contact_id,
        last_email_sent_at
      `)
      .eq('contact_id', contact.id)
      .eq('contact_status', 'active')
      .order('last_email_sent_at', { ascending: false })
      .limit(1)
      .single();

    if (campaignError || !campaignContact) {
      logger.warn('[webhooks] No active campaign found for contact:', contact.id);
      return null;
    }

    // Check if the last email was sent recently (within 30 days)
    const lastEmailDate = new Date(campaignContact.last_email_sent_at);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    if (lastEmailDate < thirtyDaysAgo) {
      logger.warn('[webhooks] Last email too old, ignoring response');
      return null;
    }

    logger.info('[webhooks] Matched email by sender and recent campaign activity');
    return {
      campaignId: campaignContact.campaign_id,
      contactId: campaignContact.contact_id,
      campaignContactId: campaignContact.id,
      originalEmailId: null // Don't have specific message ID
    };

  } catch (error) {
    logger.error('[webhooks] Error finding original campaign email:', error);
    return null;
  }
}

/**
 * Process email response asynchronously to avoid webhook timeout
 */
async function processEmailResponseAsync(emailResponseId: string) {
  try {
    // Add a small delay to avoid race conditions
    setTimeout(async () => {
      try {
        await processEmailResponse(emailResponseId);
        logger.info('[webhooks] Email response processing completed:', emailResponseId);
      } catch (error) {
        logger.error('[webhooks] Error in async response processing:', error);
      }
    }, 1000);

  } catch (error) {
    logger.error('[webhooks] Error starting async processing:', error);
  }
}

/**
 * Update email delivery status in database
 */
async function updateEmailDeliveryStatus(messageId: string, event: string, details: any) {
  try {
    // Update scheduled_emails table
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    switch (event) {
      case 'delivered':
        updateData.status = 'sent';
        updateData.actual_send_time = details.timestamp;
        break;
      case 'bounced':
        updateData.status = 'failed';
        updateData.last_error_message = `Bounced: ${details.reason} (${details.severity})`;
        break;
      case 'complained':
        updateData.status = 'failed';
        updateData.last_error_message = `Spam complaint: ${details.description}`;
        break;
      case 'unsubscribed':
        updateData.last_error_message = `Unsubscribed via ${details.description}`;
        break;
    }

    const { error } = await supabase
      .from('scheduled_emails')
      .update(updateData)
      .eq('mailgun_message_id', messageId);

    if (error) {
      logger.warn('[webhooks] Failed to update scheduled email status:', error);
    }

    // Update email_history table if it exists
    await supabase
      .from('email_history')
      .update({
        delivery_status: event,
        delivery_details: details,
        updated_at: new Date().toISOString()
      })
      .eq('mailgun_message_id', messageId);

  } catch (error) {
    logger.error('[webhooks] Error updating email delivery status:', error);
  }
}

/**
 * Handle email bounces and spam complaints
 */
async function handleBounceOrComplaint(messageId: string, recipient: string, event: string, severity: string, reason: string) {
  try {
    logger.info('[webhooks] Handling bounce/complaint', {
      messageId,
      recipient,
      event,
      severity,
      reason
    });

    // Find the contact
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('id')
      .eq('email', recipient)
      .single();

    if (contactError || !contact) {
      logger.warn('[webhooks] Contact not found for bounce/complaint:', recipient);
      return;
    }

    // Update contact status based on event and severity
    let newStatus = 'active';
    let pauseReason = '';

    if (event === 'bounced') {
      if (severity === 'hard' || severity === 'permanent') {
        newStatus = 'bounced';
        pauseReason = `Hard bounce: ${reason}`;
      } else {
        // Soft bounce - pause temporarily
        newStatus = 'paused';
        pauseReason = `Soft bounce: ${reason}`;
      }
    } else if (event === 'complained') {
      newStatus = 'unsubscribed';
      pauseReason = `Spam complaint: ${reason}`;
    }

    // Update all active campaign contacts for this email
    const { error: updateError } = await supabase
      .from('campaign_contacts')
      .update({
        contact_status: newStatus,
        is_manually_paused: true,
        pause_reason: pauseReason,
        updated_at: new Date().toISOString()
      })
      .eq('contact_id', contact.id)
      .in('contact_status', ['active', 'paused']);

    if (updateError) {
      logger.error('[webhooks] Failed to update campaign contacts for bounce/complaint:', updateError);
    }

    // Cancel any scheduled emails for this contact
    const { error: cancelError } = await supabase
      .from('scheduled_emails')
      .update({
        status: 'cancelled',
        last_error_message: pauseReason,
        updated_at: new Date().toISOString()
      })
      .eq('contact_id', contact.id)
      .eq('status', 'scheduled');

    if (cancelError) {
      logger.warn('[webhooks] Failed to cancel scheduled emails for bounce/complaint:', cancelError);
    }

    logger.info('[webhooks] Successfully handled bounce/complaint for contact:', contact.id);

  } catch (error) {
    logger.error('[webhooks] Error handling bounce/complaint:', error);
  }
}

/**
 * @swagger
 * /webhooks/test:
 *   post:
 *     summary: Test webhook endpoint for development
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    logger.info('[webhooks] Test webhook called', req.body);
    
    res.json({
      message: 'Test webhook received successfully',
      timestamp: new Date().toISOString(),
      body: req.body
    });

  } catch (error) {
    logger.error('[webhooks] Test webhook error:', error);
    res.status(500).json({
      error: 'Test webhook failed',
      details: (error as Error).message
    });
  }
});

export default router;