import { Router, Request, Response } from 'express';
import { supabase } from '../db/supabaseClient';
import { processCampaignScheduling } from '../agents/campaignManagerAgent';
// import { processScheduledEmails, queueEmailForSending } from '../services/emailQueue';
import logger from '../logger';

const router = Router();

/**
 * @swagger
 * /campaign-manager/start/{campaignId}:
 *   post:
 *     summary: Start an automated email campaign
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *         description: Campaign ID to start
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               contactIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of contact IDs to add to campaign
 *               sequenceConfig:
 *                 type: object
 *                 properties:
 *                   totalEmails:
 *                     type: integer
 *                     default: 12
 *                   intervalDays:
 *                     type: integer
 *                     default: 3
 *                   sendDays:
 *                     type: array
 *                     items:
 *                       type: string
 *                     default: ["Tuesday", "Thursday"]
 *                   sendHour:
 *                     type: integer
 *                     default: 10
 *     responses:
 *       200:
 *         description: Campaign started successfully
 */
router.post('/start/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { contactIds, sequenceConfig } = req.body;

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({
        error: 'contactIds array is required and must not be empty'
      });
    }

    logger.info(`[campaignManager] Starting campaign ${campaignId} with ${contactIds.length} contacts`);

    // 1. Verify campaign exists and is not already running
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({
        error: 'Campaign not found'
      });
    }

    if (campaign.status === 'active') {
      return res.status(400).json({
        error: 'Campaign is already active'
      });
    }

    // 2. Create or update campaign sequence
    const sequenceData = {
      campaign_id: campaignId,
      sequence_name: `${campaign.name} - 6 Week Sequence`,
      total_emails: sequenceConfig?.totalEmails || 12,
      email_interval_days: sequenceConfig?.intervalDays || 3,
      send_days: sequenceConfig?.sendDays || ['Tuesday', 'Thursday'],
      send_time_hour: sequenceConfig?.sendHour || 10,
      is_active: true,
      auto_progression: true
    };

    const { data: sequence, error: sequenceError } = await supabase
      .from('campaign_sequences')
      .upsert(sequenceData, { onConflict: 'campaign_id' })
      .select()
      .single();

    if (sequenceError) {
      throw new Error(`Failed to create sequence: ${sequenceError.message}`);
    }

    // 3. Add contacts to campaign
    const campaignContactsData = contactIds.map((contactId: string) => ({
      campaign_id: campaignId,
      contact_id: contactId,
      sequence_id: sequence.id,
      contact_status: 'active',
      progression_stage: 'cold',
      current_email_number: 0,
      next_email_scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // Start in 1 hour
      sequence_started_at: new Date().toISOString()
    }));

    const { data: campaignContacts, error: contactsError } = await supabase
      .from('campaign_contacts')
      .upsert(campaignContactsData, { onConflict: 'campaign_id,contact_id' })
      .select();

    if (contactsError) {
      throw new Error(`Failed to add contacts to campaign: ${contactsError.message}`);
    }

    // 4. Create default campaign settings if they don't exist
    const { error: settingsError } = await supabase
      .from('campaign_settings')
      .upsert({
        campaign_id: campaignId,
        max_emails_per_hour: 50,
        max_emails_per_day: 200,
        max_bounce_rate: 5.0,
        max_spam_complaint_rate: 1.0,
        min_personalization_score: 7,
        use_rag_knowledge: true,
        personalization_approach: 'value_proposition',
        email_tone: 'professional'
      }, { onConflict: 'campaign_id' });

    if (settingsError) {
      logger.warn(`[campaignManager] Failed to create campaign settings: ${settingsError.message}`);
    }

    // 5. Activate campaign
    const { error: updateError } = await supabase
      .from('campaigns')
      .update({
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId);

    if (updateError) {
      throw new Error(`Failed to activate campaign: ${updateError.message}`);
    }

    logger.info(`[campaignManager] Campaign ${campaignId} started successfully with ${campaignContacts?.length} contacts`);

    res.json({
      success: true,
      message: 'Campaign started successfully',
      campaign: {
        id: campaignId,
        name: campaign.name,
        status: 'active'
      },
      sequence: {
        id: sequence.id,
        totalEmails: sequence.total_emails,
        intervalDays: sequence.email_interval_days
      },
      contacts: {
        added: campaignContacts?.length || 0,
        total: contactIds.length
      }
    });

  } catch (error) {
    logger.error('[campaignManager] Error starting campaign:', error);
    res.status(500).json({
      error: 'Failed to start campaign',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /campaign-manager/pause/{campaignId}:
 *   post:
 *     summary: Pause an active campaign
 */
router.post('/pause/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { reason } = req.body;

    // Update campaign status
    const { data, error } = await supabase
      .from('campaigns')
      .update({
        status: 'paused',
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to pause campaign: ${error.message}`);
    }

    // Cancel any scheduled emails for this campaign
    await supabase
      .from('scheduled_emails')
      .update({
        status: 'cancelled',
        last_error_message: reason || 'Campaign paused',
        updated_at: new Date().toISOString()
      })
      .eq('campaign_id', campaignId)
      .eq('status', 'scheduled');

    logger.info(`[campaignManager] Campaign ${campaignId} paused: ${reason || 'Manual pause'}`);

    res.json({
      success: true,
      message: 'Campaign paused successfully',
      campaign: data
    });

  } catch (error) {
    logger.error('[campaignManager] Error pausing campaign:', error);
    res.status(500).json({
      error: 'Failed to pause campaign',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /campaign-manager/resume/{campaignId}:
 *   post:
 *     summary: Resume a paused campaign
 */
router.post('/resume/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    // Update campaign status
    const { data, error } = await supabase
      .from('campaigns')
      .update({
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to resume campaign: ${error.message}`);
    }

    logger.info(`[campaignManager] Campaign ${campaignId} resumed`);

    res.json({
      success: true,
      message: 'Campaign resumed successfully',
      campaign: data
    });

  } catch (error) {
    logger.error('[campaignManager] Error resuming campaign:', error);
    res.status(500).json({
      error: 'Failed to resume campaign',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /campaign-manager/process:
 *   post:
 *     summary: Manually trigger campaign processing (scheduling and email sending)
 */
router.post('/process', async (req: Request, res: Response) => {
  try {
    logger.info('[campaignManager] Manual campaign processing triggered');

    // 1. Process campaign scheduling (determine which emails to schedule)
    const schedulingResults = await processCampaignScheduling();

    // 2. Process scheduled emails (send emails that are ready)
    // const emailResults = await processScheduledEmails();
    const emailResults = { emailsQueued: 0, emailsSkipped: 0, errors: ['Redis queue disabled for demo'] };

    const results = {
      success: true,
      scheduling: schedulingResults,
      emailSending: emailResults,
      summary: {
        campaignsProcessed: schedulingResults.campaignsProcessed,
        emailsScheduled: schedulingResults.emailsScheduled,
        emailsQueued: emailResults.emailsQueued,
        totalErrors: schedulingResults.errors.length + emailResults.errors.length
      }
    };

    logger.info('[campaignManager] Manual processing completed', results.summary);

    res.json(results);

  } catch (error) {
    logger.error('[campaignManager] Error in manual processing:', error);
    res.status(500).json({
      error: 'Failed to process campaigns',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /campaign-manager/status/{campaignId}:
 *   get:
 *     summary: Get detailed campaign status and analytics
 */
router.get('/status/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    // Get campaign with sequence and settings
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select(`
        *,
        campaign_sequences(*),
        campaign_settings(*)
      `)
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({
        error: 'Campaign not found'
      });
    }

    // Get contact statistics
    const { data: contactStats, error: statsError } = await supabase
      .from('campaign_contacts')
      .select('contact_status, progression_stage, current_email_number')
      .eq('campaign_id', campaignId);

    if (statsError) {
      throw new Error(`Failed to get contact stats: ${statsError.message}`);
    }

    // Calculate statistics
    const totalContacts = contactStats?.length || 0;
    const statusCounts = contactStats?.reduce((acc: any, contact: any) => {
      acc[contact.contact_status] = (acc[contact.contact_status] || 0) + 1;
      return acc;
    }, {}) || {};

    const stageCounts = contactStats?.reduce((acc: any, contact: any) => {
      acc[contact.progression_stage] = (acc[contact.progression_stage] || 0) + 1;
      return acc;
    }, {}) || {};

    // Get recent email activity
    const { data: recentEmails, error: emailsError } = await supabase
      .from('scheduled_emails')
      .select('status, scheduled_send_time, actual_send_time')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (emailsError) {
      logger.warn(`[campaignManager] Failed to get recent emails: ${emailsError.message}`);
    }

    res.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        createdAt: campaign.created_at,
        updatedAt: campaign.updated_at
      },
      sequence: campaign.campaign_sequences?.[0] || null,
      settings: campaign.campaign_settings?.[0] || null,
      contacts: {
        total: totalContacts,
        statusBreakdown: statusCounts,
        stageBreakdown: stageCounts
      },
      recentActivity: recentEmails || []
    });

  } catch (error) {
    logger.error('[campaignManager] Error getting campaign status:', error);
    res.status(500).json({
      error: 'Failed to get campaign status',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /campaign-manager/analytics/{campaignId}:
 *   get:
 *     summary: Get campaign performance analytics
 */
router.get('/analytics/:campaignId', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));

    // Get campaign analytics
    const { data: analytics, error: analyticsError } = await supabase
      .from('campaign_analytics')
      .select('*')
      .eq('campaign_id', campaignId)
      .gte('analytics_date', startDate.toISOString().split('T')[0])
      .order('analytics_date', { ascending: true });

    if (analyticsError) {
      throw new Error(`Failed to get analytics: ${analyticsError.message}`);
    }

    // Calculate totals
    const totals = analytics?.reduce((acc: any, day: any) => {
      acc.emailsSent += day.emails_sent || 0;
      acc.emailsDelivered += day.emails_delivered || 0;
      acc.emailsBounced += day.emails_bounced || 0;
      acc.emailsOpened += day.emails_opened || 0;
      acc.emailsClicked += day.emails_clicked || 0;
      acc.responsesReceived += day.responses_received || 0;
      acc.conversions += day.conversions || 0;
      return acc;
    }, {
      emailsSent: 0,
      emailsDelivered: 0,
      emailsBounced: 0,
      emailsOpened: 0,
      emailsClicked: 0,
      responsesReceived: 0,
      conversions: 0
    }) || {};

    // Calculate rates
    const rates = {
      deliveryRate: totals.emailsSent > 0 ? (totals.emailsDelivered / totals.emailsSent * 100) : 0,
      bounceRate: totals.emailsSent > 0 ? (totals.emailsBounced / totals.emailsSent * 100) : 0,
      openRate: totals.emailsDelivered > 0 ? (totals.emailsOpened / totals.emailsDelivered * 100) : 0,
      clickRate: totals.emailsDelivered > 0 ? (totals.emailsClicked / totals.emailsDelivered * 100) : 0,
      responseRate: totals.emailsDelivered > 0 ? (totals.responsesReceived / totals.emailsDelivered * 100) : 0,
      conversionRate: totals.emailsDelivered > 0 ? (totals.conversions / totals.emailsDelivered * 100) : 0
    };

    res.json({
      success: true,
      campaignId,
      period: {
        days: Number(days),
        startDate: startDate.toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
      },
      totals,
      rates,
      dailyData: analytics || []
    });

  } catch (error) {
    logger.error('[campaignManager] Error getting campaign analytics:', error);
    res.status(500).json({
      error: 'Failed to get campaign analytics',
      details: (error as Error).message
    });
  }
});

export default router;