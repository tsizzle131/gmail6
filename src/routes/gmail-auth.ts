import { Router, Request, Response } from 'express';
import { gmailAuthService } from '../services/gmailAuthService';
import logger from '../logger';
import { authenticate } from '../middleware/auth'; // Assuming you have auth middleware

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * /gmail-auth/connect:
 *   post:
 *     summary: Initiate Gmail OAuth2 connection
 *     description: Generates OAuth2 authorization URL for connecting a Gmail account
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               returnUrl:
 *                 type: string
 *                 description: URL to redirect to after successful connection
 *     responses:
 *       200:
 *         description: OAuth2 authorization URL generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 authUrl:
 *                   type: string
 *                 state:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/connect', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id; // From auth middleware
    const { returnUrl } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    logger.info('[gmail-auth] Initiating Gmail connection', { userId, returnUrl });

    // Generate state parameter with user info
    const state = JSON.stringify({
      userId,
      returnUrl: returnUrl || '/dashboard',
      timestamp: Date.now()
    });

    // Generate OAuth2 authorization URL
    const authUrl = gmailAuthService.generateAuthUrl(userId, state);

    res.json({
      success: true,
      authUrl,
      state,
      message: 'Please complete the authorization in the opened window'
    });

  } catch (error) {
    logger.error('[gmail-auth] Failed to initiate Gmail connection', {
      error: (error as Error).message,
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Failed to initiate Gmail connection',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /gmail-auth/callback:
 *   get:
 *     summary: Handle Gmail OAuth2 callback
 *     description: Processes the OAuth2 callback from Google and stores the account
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Authorization code from Google
 *       - in: query
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *         description: State parameter containing user info
 *       - in: query
 *         name: error
 *         schema:
 *           type: string
 *         description: Error parameter if authorization failed
 *     responses:
 *       200:
 *         description: Account connected successfully
 *       302:
 *         description: Redirect to return URL
 *       400:
 *         description: Invalid request or authorization denied
 *       500:
 *         description: Internal server error
 */
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error } = req.query;

    // Handle authorization errors
    if (error) {
      logger.warn('[gmail-auth] OAuth2 authorization denied', { error });
      return res.redirect(`/dashboard?error=authorization_denied&message=${encodeURIComponent(error as string)}`);
    }

    if (!code || !state) {
      logger.warn('[gmail-auth] Missing required OAuth2 parameters');
      return res.status(400).json({ error: 'Missing authorization code or state' });
    }

    // Parse state parameter
    let stateData;
    try {
      stateData = JSON.parse(state as string);
    } catch (parseError) {
      logger.error('[gmail-auth] Invalid state parameter', { state });
      return res.status(400).json({ error: 'Invalid state parameter' });
    }

    const { userId, returnUrl } = stateData;

    if (!userId) {
      logger.error('[gmail-auth] Missing user ID in state');
      return res.status(400).json({ error: 'Missing user ID in state' });
    }

    logger.info('[gmail-auth] Processing OAuth2 callback', { userId });

    // Handle OAuth2 callback
    const result = await gmailAuthService.handleOAuthCallback(code as string, userId, state as string);

    if (!result.success) {
      logger.error('[gmail-auth] OAuth2 callback failed', { 
        error: result.error,
        userId 
      });
      
      const errorUrl = `${returnUrl}?error=connection_failed&message=${encodeURIComponent(result.error || 'Unknown error')}`;
      return res.redirect(errorUrl);
    }

    logger.info('[gmail-auth] Gmail account connected successfully', {
      accountId: result.account?.id,
      email: result.account?.email,
      userId
    });

    // Redirect to success page
    const successUrl = `${returnUrl}?success=true&email=${encodeURIComponent(result.account?.email || '')}&accountId=${result.account?.id}`;
    res.redirect(successUrl);

  } catch (error) {
    logger.error('[gmail-auth] Callback processing failed', {
      error: (error as Error).message,
      query: req.query
    });

    res.status(500).json({
      error: 'Failed to process OAuth2 callback',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /gmail-auth/accounts:
 *   get:
 *     summary: Get user's connected Gmail accounts
 *     description: Returns all Gmail accounts connected by the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of connected Gmail accounts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accounts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       email:
 *                         type: string
 *                       displayName:
 *                         type: string
 *                       accountStatus:
 *                         type: string
 *                       healthScore:
 *                         type: number
 *                       dailySendCount:
 *                         type: number
 *                       dailySendLimit:
 *                         type: number
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/accounts', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    logger.info('[gmail-auth] Fetching user Gmail accounts', { userId });

    const accounts = await gmailAuthService.getUserAccounts(userId);

    res.json({
      success: true,
      accounts: accounts.map(account => ({
        id: account.id,
        email: account.email,
        displayName: account.displayName,
        profilePictureUrl: account.profilePictureUrl,
        accountStatus: account.accountStatus,
        healthScore: account.healthScore,
        dailySendCount: account.dailySendCount,
        dailySendLimit: account.dailySendLimit,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt
      })),
      count: accounts.length
    });

  } catch (error) {
    logger.error('[gmail-auth] Failed to fetch Gmail accounts', {
      error: (error as Error).message,
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Failed to fetch Gmail accounts',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /gmail-auth/accounts/{accountId}:
 *   get:
 *     summary: Get specific Gmail account details
 *     description: Returns details for a specific Gmail account
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *         description: Gmail account ID
 *     responses:
 *       200:
 *         description: Gmail account details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Account not found
 *       500:
 *         description: Internal server error
 */
router.get('/accounts/:accountId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { accountId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    logger.info('[gmail-auth] Fetching Gmail account details', { userId, accountId });

    const account = await gmailAuthService.getAccountById(accountId);

    if (!account) {
      return res.status(404).json({ error: 'Gmail account not found' });
    }

    // Verify account belongs to user
    if (account.userId !== userId) {
      return res.status(403).json({ error: 'Access denied to this account' });
    }

    res.json({
      success: true,
      account: {
        id: account.id,
        email: account.email,
        displayName: account.displayName,
        profilePictureUrl: account.profilePictureUrl,
        accountStatus: account.accountStatus,
        healthScore: account.healthScore,
        dailySendCount: account.dailySendCount,
        dailySendLimit: account.dailySendLimit,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt
      }
    });

  } catch (error) {
    logger.error('[gmail-auth] Failed to fetch Gmail account details', {
      error: (error as Error).message,
      userId: req.user?.id,
      accountId: req.params.accountId
    });

    res.status(500).json({
      error: 'Failed to fetch Gmail account details',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /gmail-auth/accounts/{accountId}/disconnect:
 *   post:
 *     summary: Disconnect Gmail account
 *     description: Disconnects a Gmail account from the user's profile
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *         description: Gmail account ID to disconnect
 *     responses:
 *       200:
 *         description: Account disconnected successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Account not found
 *       500:
 *         description: Internal server error
 */
router.post('/accounts/:accountId/disconnect', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { accountId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    logger.info('[gmail-auth] Disconnecting Gmail account', { userId, accountId });

    // Verify account exists and belongs to user
    const account = await gmailAuthService.getAccountById(accountId);

    if (!account) {
      return res.status(404).json({ error: 'Gmail account not found' });
    }

    if (account.userId !== userId) {
      return res.status(403).json({ error: 'Access denied to this account' });
    }

    // Disconnect the account
    const success = await gmailAuthService.disconnectAccount(accountId);

    if (!success) {
      return res.status(500).json({ error: 'Failed to disconnect account' });
    }

    logger.info('[gmail-auth] Gmail account disconnected successfully', {
      userId,
      accountId,
      email: account.email
    });

    res.json({
      success: true,
      message: 'Gmail account disconnected successfully',
      accountId,
      email: account.email
    });

  } catch (error) {
    logger.error('[gmail-auth] Failed to disconnect Gmail account', {
      error: (error as Error).message,
      userId: req.user?.id,
      accountId: req.params.accountId
    });

    res.status(500).json({
      error: 'Failed to disconnect Gmail account',
      details: (error as Error).message
    });
  }
});

/**
 * @swagger
 * /gmail-auth/accounts/{accountId}/test:
 *   post:
 *     summary: Test Gmail account connection
 *     description: Sends a test email to verify the account is working
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *         description: Gmail account ID to test
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               testEmail:
 *                 type: string
 *                 description: Email address to send test email to (optional)
 *     responses:
 *       200:
 *         description: Test email sent successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Account not found
 *       500:
 *         description: Internal server error
 */
router.post('/accounts/:accountId/test', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { accountId } = req.params;
    const { testEmail } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    logger.info('[gmail-auth] Testing Gmail account connection', { userId, accountId });

    // Verify account exists and belongs to user
    const account = await gmailAuthService.getAccountById(accountId);

    if (!account) {
      return res.status(404).json({ error: 'Gmail account not found' });
    }

    if (account.userId !== userId) {
      return res.status(403).json({ error: 'Access denied to this account' });
    }

    // Test account by getting a valid access token
    const accessToken = await gmailAuthService.getValidAccessToken(accountId);

    if (!accessToken) {
      return res.status(500).json({ 
        error: 'Failed to get valid access token',
        message: 'Account may need to be reconnected'
      });
    }

    // TODO: Implement actual test email sending via Gmail API
    // For now, just verify we can get a valid token

    logger.info('[gmail-auth] Gmail account test successful', {
      userId,
      accountId,
      email: account.email
    });

    res.json({
      success: true,
      message: 'Gmail account connection test successful',
      accountId,
      email: account.email,
      hasValidToken: true
    });

  } catch (error) {
    logger.error('[gmail-auth] Gmail account test failed', {
      error: (error as Error).message,
      userId: req.user?.id,
      accountId: req.params.accountId
    });

    res.status(500).json({
      error: 'Gmail account test failed',
      details: (error as Error).message
    });
  }
});

export default router;