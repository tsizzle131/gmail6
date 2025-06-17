import { Router, Request, Response } from 'express';
import { gmailEmailService } from '../services/gmailEmailService';
import { gmailAccountManager } from '../services/gmailAccountManager';
import { gmailAuthService } from '../services/gmailAuthService';
import logger from '../logger';
import { authenticate } from '../middleware/auth'; // Assuming you have auth middleware

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * /gmail-sending/send:
 *   post:
 *     summary: Send email via Gmail API
 *     description: Send an email using the user's connected Gmail account
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - subject
 *               - html
 *             properties:
 *               to:
 *                 type: string
 *                 description: Recipient email address
 *               subject:
 *                 type: string
 *                 description: Email subject
 *               html:
 *                 type: string
 *                 description: HTML email content
 *               text:
 *                 type: string
 *                 description: Plain text version (optional)
 *               preferredAccountId:
 *                 type: string
 *                 description: Preferred Gmail account ID (optional)
 *               campaignId:
 *                 type: string
 *                 description: Campaign ID for tracking (optional)
 *               contactId:
 *                 type: string
 *                 description: Contact ID for tracking (optional)
 *     responses:
 *       200:
 *         description: Email sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 messageId:
 *                   type: string
 *                 threadId:
 *                   type: string
 *                 accountEmail:
 *                   type: string
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const {
      to,
      subject,
      html,
      text,
      preferredAccountId,
      campaignId,
      contactId,
      emailType = 'outbound_cold',
      sequenceNumber = 1
    } = req.body;

    // Validate required fields
    if (!to || !subject || !html) {
      return res.status(400).json({
        error: 'Missing required fields: to, subject, html'
      });
    }

    logger.info('[gmailSending] Sending email via Gmail API', {
      to,
      subject,
      userId,
      preferredAccountId,
      campaignId
    });

    // Send email via Gmail
    const result = await gmailEmailService.sendEmail({
      to,
      subject,
      html,
      text,
      preferredAccountId,
      campaignId,
      contactId,
      emailType,
      sequenceNumber
    }, userId);

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to send email',
        details: result.error
      });
    }

    res.json({
      success: true,
      messageId: result.messageId,
      threadId: result.threadId,
      accountEmail: result.accountEmail,
      gmailAccountId: result.gmailAccountId,
      deliveryStatus: result.deliveryStatus
    });

  } catch (error) {
    logger.error('[gmailSending] Error sending email', {
      error: (error as Error).message,
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Internal server error',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /gmail-sending/test:
 *   post:
 *     summary: Send test email
 *     description: Send a test email to verify Gmail integration
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               testEmail:
 *                 type: string
 *                 description: Email address to send test to (optional)
 *               accountId:
 *                 type: string
 *                 description: Specific Gmail account to test (optional)
 *     responses:
 *       200:
 *         description: Test email sent successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { testEmail = 'tristanwaite7@gmail.com', accountId } = req.body;

    logger.info('[gmailSending] Sending test email', {
      testEmail,
      accountId,
      userId
    });

    let result;

    if (accountId) {
      // Test specific account
      result = await gmailEmailService.sendTestEmail(accountId, testEmail);
    } else {
      // Use best available account
      result = await gmailEmailService.sendEmail({
        to: testEmail,
        subject: 'Gmail API Integration Test - ReignOverTech',
        html: `
          <h2>🚀 Gmail API Integration Test</h2>
          <p>This is a test email from the ReignOverTech Gmail API integration.</p>
          <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          <p>If you received this, the integration is working! 🎉</p>
        `
      }, userId);
    }

    if (!result.success) {
      return res.status(500).json({
        error: 'Failed to send test email',
        details: result.error
      });
    }

    res.json({
      success: true,
      message: 'Test email sent successfully',
      messageId: result.messageId,
      threadId: result.threadId,
      accountEmail: result.accountEmail,
      testEmail
    });

  } catch (error) {
    logger.error('[gmailSending] Error sending test email', {
      error: (error as Error).message,
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Failed to send test email',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /gmail-sending/accounts/usage:
 *   get:
 *     summary: Get account usage statistics
 *     description: Returns usage stats for all user's Gmail accounts
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account usage statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 accounts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       accountId:
 *                         type: string
 *                       email:
 *                         type: string
 *                       todaySentCount:
 *                         type: number
 *                       dailyLimit:
 *                         type: number
 *                       remainingToday:
 *                         type: number
 *                       healthScore:
 *                         type: number
 *                       accountStatus:
 *                         type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/accounts/usage', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    logger.info('[gmailSending] Fetching account usage stats', { userId });

    const usageStats = await gmailAccountManager.getAccountUsageStats(userId);

    res.json({
      success: true,
      accounts: usageStats,
      totalAccounts: usageStats.length,
      activeAccounts: usageStats.filter(acc => acc.accountStatus === 'active').length,
      totalRemainingQuota: usageStats.reduce((sum, acc) => sum + acc.remainingToday, 0)
    });

  } catch (error) {
    logger.error('[gmailSending] Error fetching usage stats', {
      error: (error as Error).message,
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Failed to fetch account usage statistics',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /gmail-sending/accounts/{accountId}/pause:
 *   post:
 *     summary: Pause Gmail account
 *     description: Temporarily pause a Gmail account from sending
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *         description: Gmail account ID to pause
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for pausing the account
 *     responses:
 *       200:
 *         description: Account paused successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Account not found
 *       500:
 *         description: Internal server error
 */
router.post('/accounts/:accountId/pause', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { accountId } = req.params;
    const { reason = 'Manually paused by user' } = req.body;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Verify account belongs to user
    const account = await gmailAuthService.getAccountById(accountId);
    if (!account) {
      return res.status(404).json({ error: 'Gmail account not found' });
    }

    if (account.userId !== userId) {
      return res.status(403).json({ error: 'Access denied to this account' });
    }

    logger.info('[gmailSending] Pausing Gmail account', { userId, accountId, reason });

    const success = await gmailAccountManager.pauseAccount(accountId, reason);

    if (!success) {
      return res.status(500).json({ error: 'Failed to pause account' });
    }

    res.json({
      success: true,
      message: 'Account paused successfully',
      accountId,
      reason
    });

  } catch (error) {
    logger.error('[gmailSending] Error pausing account', {
      error: (error as Error).message,
      userId: req.user?.id,
      accountId: req.params.accountId
    });

    res.status(500).json({
      error: 'Failed to pause account',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /gmail-sending/accounts/{accountId}/resume:
 *   post:
 *     summary: Resume Gmail account
 *     description: Resume a paused Gmail account
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *         description: Gmail account ID to resume
 *     responses:
 *       200:
 *         description: Account resumed successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Account not found
 *       500:
 *         description: Internal server error
 */
router.post('/accounts/:accountId/resume', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { accountId } = req.params;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Verify account belongs to user
    const account = await gmailAuthService.getAccountById(accountId);
    if (!account) {
      return res.status(404).json({ error: 'Gmail account not found' });
    }

    if (account.userId !== userId) {
      return res.status(403).json({ error: 'Access denied to this account' });
    }

    logger.info('[gmailSending] Resuming Gmail account', { userId, accountId });

    const success = await gmailAccountManager.resumeAccount(accountId);

    if (!success) {
      return res.status(500).json({ 
        error: 'Failed to resume account',
        message: 'Account may have health issues or token problems'
      });
    }

    res.json({
      success: true,
      message: 'Account resumed successfully',
      accountId
    });

  } catch (error) {
    logger.error('[gmailSending] Error resuming account', {
      error: (error as Error).message,
      userId: req.user?.id,
      accountId: req.params.accountId
    });

    res.status(500).json({
      error: 'Failed to resume account',
      details: (error as Error).message
    });
  }
});

export default router;