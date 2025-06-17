import { Router, Request, Response } from 'express';
import { craftPersonalizedEmail, createEmailCraftingAgent } from '../agents/emailCraftingAgent';
import { HumanMessage } from '@langchain/core/messages';

const router = Router();

/**
 * @swagger
 * /email/craft:
 *   post:
 *     summary: Craft personalized outreach email using AI
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
 *               websiteContent:
 *                 type: string
 *               businessDescription:
 *                 type: string
 *               companySize:
 *                 type: string
 *               contactName:
 *                 type: string
 *               senderName:
 *                 type: string
 *               senderCompany:
 *                 type: string
 *               serviceOffering:
 *                 type: string
 *               approach:
 *                 type: string
 *                 enum: [value_proposition, pain_point, case_study, industry_trend, consultative]
 *               tone:
 *                 type: string
 *                 enum: [professional, casual, direct, consultative, friendly]
 *             required:
 *               - companyName
 *               - industry
 *               - senderName
 *               - senderCompany
 *               - serviceOffering
 *     responses:
 *       200:
 *         description: Personalized email crafted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.post('/craft', async (req: Request, res: Response) => {
  const { 
    companyName, 
    industry, 
    websiteContent, 
    businessDescription, 
    companySize, 
    contactName,
    senderName, 
    senderCompany, 
    serviceOffering, 
    approach, 
    tone 
  } = req.body;

  // Validate required fields
  if (!companyName || !industry || !senderName || !senderCompany || !serviceOffering) {
    return res.status(400).json({ 
      error: 'Missing required fields: companyName, industry, senderName, senderCompany, serviceOffering' 
    });
  }

  try {
    console.log(`[emailCraftingRoute] Starting email crafting for ${companyName}`);
    
    const result = await craftPersonalizedEmail({
      companyName,
      industry,
      websiteContent,
      businessDescription,
      companySize,
      contactName,
      senderName,
      senderCompany,
      serviceOffering,
      approach,
      tone
    });

    // Extract relevant data for the API response
    const responseMessages = result.messages.map((msg: any) => ({
      type: msg.constructor.name,
      content: msg.content,
      tool_calls: msg.tool_calls || [],
      id: msg.id
    }));

    res.json({ 
      success: true,
      messages: responseMessages,
      companyName
    });

  } catch (err: any) {
    console.error(`[emailCraftingRoute] Error crafting email for ${companyName}:`, err);
    res.status(500).json({ 
      error: err.message,
      companyName
    });
  }
});

/**
 * @swagger
 * /email/craft-from-lead:
 *   post:
 *     summary: Craft personalized email from existing lead data
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               leadId:
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
 *             required:
 *               - leadId
 *               - senderName
 *               - senderCompany
 *               - serviceOffering
 *     responses:
 *       200:
 *         description: Email crafted from lead data
 */
router.post('/craft-from-lead', async (req: Request, res: Response) => {
  const { leadId, senderName, senderCompany, serviceOffering, approach, tone } = req.body;

  if (!leadId || !senderName || !senderCompany || !serviceOffering) {
    return res.status(400).json({ 
      error: 'Missing required fields: leadId, senderName, senderCompany, serviceOffering' 
    });
  }

  try {
    // TODO: Fetch lead data from database using leadId
    // For now, return a placeholder response
    res.status(501).json({ 
      error: 'Lead data fetching not yet implemented. Use /email/craft endpoint with lead data directly.' 
    });

  } catch (err: any) {
    console.error(`[emailCraftingRoute] Error crafting email from lead ${leadId}:`, err);
    res.status(500).json({ 
      error: err.message,
      leadId
    });
  }
});

/**
 * @swagger
 * /email/template:
 *   post:
 *     summary: Generate email template for specific industry and approach
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               industry:
 *                 type: string
 *               approach:
 *                 type: string
 *               tone:
 *                 type: string
 *               serviceOffering:
 *                 type: string
 *               companyName:
 *                 type: string
 *             required:
 *               - industry
 *               - approach
 *               - serviceOffering
 *     responses:
 *       200:
 *         description: Email template generated
 */
router.post('/template', async (req: Request, res: Response) => {
  const { industry, approach, tone, serviceOffering, companyName } = req.body;

  if (!industry || !approach || !serviceOffering) {
    return res.status(400).json({ 
      error: 'Missing required fields: industry, approach, serviceOffering' 
    });
  }

  try {
    const agent = createEmailCraftingAgent();
    
    const initialMessage = new HumanMessage({
      content: `Please generate an email template with the following parameters:
      - Industry: ${industry}
      - Approach: ${approach}  
      - Tone: ${tone || 'professional'}
      - Service Offering: ${serviceOffering}
      - Company: ${companyName || 'Not specified'}
      
      Just generate the template, no personalization needed.`
    });

    const result = await agent.invoke({
      messages: [initialMessage]
    });

    const responseMessages = result.messages.map((msg: any) => ({
      type: msg.constructor.name,
      content: msg.content,
      tool_calls: msg.tool_calls || [],
      id: msg.id
    }));

    res.json({ 
      success: true,
      messages: responseMessages,
      templateParams: { industry, approach, tone, serviceOffering }
    });

  } catch (err: any) {
    console.error(`[emailCraftingRoute] Error generating template:`, err);
    res.status(500).json({ 
      error: err.message 
    });
  }
});

export default router;