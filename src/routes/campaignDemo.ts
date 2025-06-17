import { Router, Request, Response } from 'express';
import { supabase } from '../db/supabaseClient';
import logger from '../logger';

const router = Router();

/**
 * @swagger
 * /demo/create-campaign:
 *   post:
 *     summary: Create a demo campaign with sample contacts for testing
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               campaignName:
 *                 type: string
 *                 default: "Demo AI Outreach Campaign"
 *               testEmail:
 *                 type: string
 *                 default: "tristanwaite7@gmail.com"
 *                 description: Email address to receive test emails
 *     responses:
 *       200:
 *         description: Demo campaign created successfully
 */
router.post('/create-campaign', async (req: Request, res: Response) => {
  try {
    const { campaignName = 'Demo AI Outreach Campaign', testEmail = 'tristanwaite7@gmail.com' } = req.body;

    logger.info(`[campaignDemo] Creating demo campaign: ${campaignName}`);

    // 1. Create a demo campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        company_id: 'f6671298-5a59-4da2-a084-1af9d3f735cb', // Use existing company ID
        name: campaignName,
        product_name: 'ReignOverTech AI Solutions',
        product_description: 'Custom AI automation and software development solutions for businesses',
        product_link: 'https://reignovertech.com',
        status: 'draft',
        emails_per_week: 2,
        campaign_duration_weeks: 6
      })
      .select()
      .single();

    if (campaignError) {
      throw new Error(`Failed to create campaign: ${campaignError.message}`);
    }

    // 2. Create unique demo contacts for this campaign
    const timestamp = Date.now();
    const demoContacts = [
      {
        campaign_id: campaign.id,
        email: `demo+1+${timestamp}@test.com`, // Unique email for testing
        company_name: `TechFlow Solutions ${timestamp}`,
        domain: 'techflow.example.com',
        industry: 'SaaS',
        website_content: 'TechFlow Solutions provides cloud-based project management tools for remote teams',
        enriched_data: {
          businessDescription: 'Project management platform for distributed teams',
          companySize: '25-50 employees',
          contactName: 'Sarah Johnson',
          industry: 'SaaS'
        }
      },
      {
        campaign_id: campaign.id,
        email: `demo+2+${timestamp}@test.com`, // Unique email for testing
        company_name: `DataSync Technologies ${timestamp}`,
        domain: 'datasync.example.com',
        industry: 'FinTech',
        website_content: 'DataSync Technologies helps financial institutions automate compliance and reporting',
        enriched_data: {
          businessDescription: 'Financial data automation and compliance platform',
          companySize: '75-150 employees',
          contactName: 'Michael Chen',
          industry: 'FinTech'
        }
      },
      {
        campaign_id: campaign.id,
        email: testEmail, // Your actual email for the final demo contact
        company_name: `HealthTech Innovations ${timestamp}`,
        domain: 'healthtech.example.com',
        industry: 'Healthcare',
        website_content: 'HealthTech Innovations develops AI-powered diagnostic tools for hospitals',
        enriched_data: {
          businessDescription: 'AI medical diagnosis platform for healthcare providers',
          companySize: '40-80 employees',
          contactName: 'Dr. Emily Rodriguez',
          industry: 'Healthcare'
        }
      }
    ];

    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .insert(demoContacts)
      .select();

    if (contactsError) {
      throw new Error(`Failed to create demo contacts: ${contactsError.message}`);
    }

    logger.info(`[campaignDemo] Created demo campaign with ${contacts?.length} contacts`);

    res.json({
      success: true,
      message: 'Demo campaign created successfully',
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status
      },
      contacts: contacts?.map(contact => ({
        id: contact.id,
        companyName: contact.company_name,
        industry: contact.industry,
        email: contact.email
      })) || [],
      nextSteps: [
        `Use POST /campaign-manager/start/${campaign.id} to start the campaign`,
        'The system will automatically schedule and send personalized emails',
        `Emails will be sent to ${testEmail} for testing`,
        'Use GET /campaign-manager/status/{campaignId} to monitor progress'
      ]
    });

  } catch (error) {
    logger.error('[campaignDemo] Error creating demo campaign:', error);
    res.status(500).json({
      error: 'Failed to create demo campaign',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /demo/quick-test:
 *   post:
 *     summary: Create demo campaign and immediately start it for testing
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               testEmail:
 *                 type: string
 *                 default: "tristanwaite7@gmail.com"
 *     responses:
 *       200:
 *         description: Demo campaign created and started
 */
router.post('/quick-test', async (req: Request, res: Response) => {
  try {
    const { testEmail = 'tristanwaite7@gmail.com' } = req.body;

    // 1. Create demo campaign
    const createResponse = await fetch(`${req.protocol}://${req.get('host')}/demo/create-campaign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        campaignName: 'Quick Test Campaign',
        testEmail 
      })
    });

    if (!createResponse.ok) {
      throw new Error('Failed to create demo campaign');
    }

    const createResult = await createResponse.json();
    const campaignId = createResult.campaign.id;
    const contactIds = createResult.contacts.map((c: any) => c.id);

    // 2. Start the campaign immediately
    const startResponse = await fetch(`${req.protocol}://${req.get('host')}/campaign-manager/start/${campaignId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        contactIds,
        sequenceConfig: {
          totalEmails: 3, // Shorter sequence for testing
          intervalDays: 1, // Faster for demo (1 day instead of 3)
          sendDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          sendHour: new Date().getHours() + 1 // Start in 1 hour
        }
      })
    });

    if (!startResponse.ok) {
      throw new Error('Failed to start demo campaign');
    }

    const startResult = await startResponse.json();

    logger.info(`[campaignDemo] Quick test campaign created and started: ${campaignId}`);

    res.json({
      success: true,
      message: '🚀 Demo campaign created and started successfully!',
      campaign: startResult.campaign,
      sequence: startResult.sequence,
      contacts: startResult.contacts,
      testDetails: {
        emailsWillBeSentTo: testEmail,
        totalEmailsInSequence: 3,
        intervalBetweenEmails: '1 day (accelerated for demo)',
        firstEmailScheduledIn: '~1 hour'
      },
      monitoring: {
        statusEndpoint: `/campaign-manager/status/${campaignId}`,
        analyticsEndpoint: `/campaign-manager/analytics/${campaignId}`,
        manualProcessTrigger: '/campaign-manager/process'
      }
    });

  } catch (error) {
    logger.error('[campaignDemo] Error in quick test:', error);
    res.status(500).json({
      error: 'Failed to create quick test campaign',
      details: (error as Error).message
    });
  }
});

export default router;