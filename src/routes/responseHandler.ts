import { Router, Request, Response } from 'express';
import { supabase } from '../db/supabaseClient';
import { processEmailResponse } from '../agents/responseHandlerAgent';
import { 
  getConversationSummary,
  updateConversationStatus,
  scheduleAutomatedResponse,
  sendAutomatedResponse,
  triggerHandoff,
  processScheduledResponses,
  getConversationAnalytics
} from '../services/conversationManager';
import logger from '../logger';

const router = Router();

/**
 * @swagger
 * /response-handler/process/{responseId}:
 *   post:
 *     summary: Manually trigger response processing for a specific email response
 *     parameters:
 *       - in: path
 *         name: responseId
 *         required: true
 *         schema:
 *           type: string
 *         description: Email response ID to process
 *     responses:
 *       200:
 *         description: Response processed successfully
 *       404:
 *         description: Email response not found
 *       500:
 *         description: Processing failed
 */
router.post('/process/:responseId', async (req: Request, res: Response) => {
  try {
    const { responseId } = req.params;

    logger.info(`[responseHandler] Manual processing triggered for response ${responseId}`);

    // Verify the response exists and is in pending status
    const { data: emailResponse, error: responseError } = await supabase
      .from('email_responses')
      .select('*')
      .eq('id', responseId)
      .single();

    if (responseError || !emailResponse) {
      return res.status(404).json({
        error: 'Email response not found'
      });
    }

    if (emailResponse.processing_status === 'processed') {
      return res.status(400).json({
        error: 'Response already processed',
        processingStatus: emailResponse.processing_status,
        processedAt: emailResponse.processed_at
      });
    }

    // Process the response
    const result = await processEmailResponse(responseId);

    res.json({
      success: true,
      message: 'Response processed successfully',
      result,
      emailResponse: {
        id: emailResponse.id,
        classification: emailResponse.classification,
        processingStatus: 'processed'
      }
    });

  } catch (error) {
    logger.error('[responseHandler] Error processing response:', error);
    res.status(500).json({
      error: 'Failed to process response',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /response-handler/responses/{campaignId}:
 *   get:
 *     summary: Get all email responses for a campaign
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processed, failed]
 *       - in: query
 *         name: classification
 *         schema:
 *           type: string
 *           enum: [interested, not_interested, question, objection, unsubscribe, auto_reply]
 *     responses:
 *       200:
 *         description: Email responses retrieved successfully
 */
router.get('/responses/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { status, classification, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('email_responses')
      .select(`
        id,
        response_subject,
        response_content,
        response_from_email,
        classification,
        sentiment_score,
        confidence_score,
        intent_summary,
        urgency_level,
        requires_response,
        processing_status,
        processed_at,
        created_at,
        contacts(email, company_name, industry)
      `)
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) {
      query = query.eq('processing_status', status);
    }

    if (classification) {
      query = query.eq('classification', classification);
    }

    const { data: responses, error } = await query;

    if (error) {
      throw new Error(`Failed to get responses: ${error.message}`);
    }

    // Get summary statistics
    const { data: stats, error: statsError } = await supabase
      .from('email_responses')
      .select('classification, processing_status')
      .eq('campaign_id', campaignId);

    const summary = stats?.reduce((acc: any, response: any) => {
      acc.total++;
      acc.byClassification[response.classification] = (acc.byClassification[response.classification] || 0) + 1;
      acc.byStatus[response.processing_status] = (acc.byStatus[response.processing_status] || 0) + 1;
      return acc;
    }, {
      total: 0,
      byClassification: {},
      byStatus: {}
    }) || { total: 0, byClassification: {}, byStatus: {} };

    res.json({
      success: true,
      responses: responses || [],
      summary,
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        total: summary.total
      }
    });

  } catch (error) {
    logger.error('[responseHandler] Error getting responses:', error);
    res.status(500).json({
      error: 'Failed to get responses',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /response-handler/conversations/{campaignId}:
 *   get:
 *     summary: Get conversation history for a campaign
 */
router.get('/conversations/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { status, requiresHandoff } = req.query;

    let query = supabase
      .from('conversations')
      .select(`
        id,
        conversation_status,
        conversation_stage,
        total_responses,
        last_response_at,
        requires_handoff,
        handoff_reason,
        sequence_paused,
        sequence_pause_reason,
        next_action,
        created_at,
        contacts(email, company_name, industry)
      `)
      .eq('campaign_id', campaignId)
      .order('last_response_at', { ascending: false });

    if (status) {
      query = query.eq('conversation_status', status);
    }

    if (requiresHandoff === 'true') {
      query = query.eq('requires_handoff', true);
    }

    const { data: conversations, error } = await query;

    if (error) {
      throw new Error(`Failed to get conversations: ${error.message}`);
    }

    res.json({
      success: true,
      conversations: conversations || [],
      total: conversations?.length || 0
    });

  } catch (error) {
    logger.error('[responseHandler] Error getting conversations:', error);
    res.status(500).json({
      error: 'Failed to get conversations',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /response-handler/conversations/{conversationId}/handoff:
 *   post:
 *     summary: Trigger handoff for a conversation
 */
router.post('/conversations/:conversationId/handoff', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { 
      handoffType = 'sales', 
      reason = 'Manual handoff request',
      urgency = 'medium' 
    } = req.body;

    const result = await triggerHandoff(conversationId, handoffType, reason, urgency);

    res.json({
      ...result,
      message: 'Handoff triggered successfully'
    });

  } catch (error) {
    logger.error('[responseHandler] Error triggering handoff:', error);
    res.status(500).json({
      error: 'Failed to trigger handoff',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /response-handler/conversations/{conversationId}/status:
 *   put:
 *     summary: Update conversation status
 */
router.put('/conversations/:conversationId/status', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { status, stage, additionalData } = req.body;

    if (!status) {
      return res.status(400).json({
        error: 'Status is required'
      });
    }

    await updateConversationStatus(conversationId, status, stage, additionalData);

    res.json({
      success: true,
      message: 'Conversation status updated successfully',
      conversationId,
      newStatus: status,
      newStage: stage
    });

  } catch (error) {
    logger.error('[responseHandler] Error updating conversation status:', error);
    res.status(500).json({
      error: 'Failed to update conversation status',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /response-handler/automated-responses/send/{responseId}:
 *   post:
 *     summary: Manually send a scheduled automated response
 */
router.post('/automated-responses/send/:responseId', async (req: Request, res: Response) => {
  try {
    const { responseId } = req.params;

    logger.info(`[responseHandler] Manual send triggered for automated response ${responseId}`);

    const result = await sendAutomatedResponse(responseId);

    res.json({
      ...result,
      message: 'Automated response sent successfully'
    });

  } catch (error) {
    logger.error('[responseHandler] Error sending automated response:', error);
    res.status(500).json({
      error: 'Failed to send automated response',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /response-handler/process-scheduled:
 *   post:
 *     summary: Process all scheduled responses (manual trigger for cron job)
 */
router.post('/process-scheduled', async (req: Request, res: Response) => {
  try {
    logger.info('[responseHandler] Manual processing of scheduled responses triggered');

    const result = await processScheduledResponses();

    res.json({
      success: true,
      message: 'Scheduled responses processed successfully',
      ...result
    });

  } catch (error) {
    logger.error('[responseHandler] Error processing scheduled responses:', error);
    res.status(500).json({
      error: 'Failed to process scheduled responses',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /response-handler/analytics/{campaignId}:
 *   get:
 *     summary: Get conversation analytics for a campaign
 */
router.get('/analytics/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { days = 30 } = req.query;

    const analytics = await getConversationAnalytics(campaignId, Number(days));

    res.json(analytics);

  } catch (error) {
    logger.error('[responseHandler] Error getting conversation analytics:', error);
    res.status(500).json({
      error: 'Failed to get conversation analytics',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /response-handler/dashboard/{campaignId}:
 *   get:
 *     summary: Get comprehensive dashboard data for a campaign
 */
router.get('/dashboard/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    // Get recent responses
    const { data: recentResponses, error: responsesError } = await supabase
      .from('email_responses')
      .select(`
        id,
        response_subject,
        response_from_email,
        classification,
        sentiment_score,
        urgency_level,
        created_at,
        contacts(company_name)
      `)
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (responsesError) {
      throw new Error(`Failed to get recent responses: ${responsesError.message}`);
    }

    // Get conversations requiring handoff
    const { data: handoffConversations, error: handoffError } = await supabase
      .from('conversations')
      .select(`
        id,
        handoff_reason,
        conversation_stage,
        total_responses,
        handoff_triggered_at,
        contacts(email, company_name)
      `)
      .eq('campaign_id', campaignId)
      .eq('requires_handoff', true)
      .order('handoff_triggered_at', { ascending: false })
      .limit(5);

    if (handoffError) {
      throw new Error(`Failed to get handoff conversations: ${handoffError.message}`);
    }

    // Get pending scheduled responses
    const { data: scheduledResponses, error: scheduledError } = await supabase
      .from('automated_responses')
      .select(`
        id,
        response_type,
        scheduled_send_time,
        response_subject,
        conversations(contacts(email, company_name))
      `)
      .eq('send_status', 'scheduled')
      .gte('scheduled_send_time', new Date().toISOString())
      .order('scheduled_send_time', { ascending: true })
      .limit(10);

    if (scheduledError) {
      throw new Error(`Failed to get scheduled responses: ${scheduledError.message}`);
    }

    // Get response classification summary
    const { data: classificationStats, error: classificationError } = await supabase
      .from('email_responses')
      .select('classification')
      .eq('campaign_id', campaignId);

    const classificationSummary = classificationStats?.reduce((acc: any, response: any) => {
      acc[response.classification] = (acc[response.classification] || 0) + 1;
      return acc;
    }, {}) || {};

    res.json({
      success: true,
      dashboard: {
        recentResponses: recentResponses || [],
        handoffConversations: handoffConversations || [],
        scheduledResponses: scheduledResponses || [],
        classificationSummary,
        summary: {
          totalResponses: recentResponses?.length || 0,
          pendingHandoffs: handoffConversations?.length || 0,
          scheduledResponses: scheduledResponses?.length || 0
        }
      }
    });

  } catch (error) {
    logger.error('[responseHandler] Error getting dashboard data:', error);
    res.status(500).json({
      error: 'Failed to get dashboard data',
      details: (error as Error).message
    });
  }
});

export default router;