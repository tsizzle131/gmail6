import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import config from '../config';
import logger from '../logger';
import { supabase } from '../db/supabaseClient';

// Gmail API scopes needed for sending and reading emails
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

export interface GmailAccount {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  profilePictureUrl?: string;
  accountStatus: 'active' | 'paused' | 'suspended' | 'error' | 'disconnected';
  healthScore: number;
  dailySendCount: number;
  dailySendLimit: number;
  createdAt: string;
  updatedAt: string;
}

export interface GmailAuthResult {
  success: boolean;
  authUrl?: string;
  account?: GmailAccount;
  error?: string;
}

export interface GmailTokens {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
}

/**
 * Gmail Authentication Service
 * Handles OAuth2 flow, token management, and account storage
 */
export class GmailAuthService {
  private oauth2Client: OAuth2Client;
  private encryptionKey: string;

  constructor() {
    // Initialize OAuth2 client
    this.oauth2Client = new OAuth2Client(
      config.googleClientId,
      config.googleClientSecret,
      config.googleRedirectUri
    );

    // Set encryption key for token storage
    this.encryptionKey = config.encryptionKey || 'default-key-change-in-production';
  }

  /**
   * Generate OAuth2 authorization URL
   */
  generateAuthUrl(userId: string, state?: string): string {
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: GMAIL_SCOPES,
      prompt: 'consent', // Force consent to get refresh token
      state: state || userId, // Include user ID in state for callback
      include_granted_scopes: true
    });

    logger.info('[gmailAuth] Generated OAuth2 URL for user', { userId });
    return authUrl;
  }

  /**
   * Handle OAuth2 callback and store account
   */
  async handleOAuthCallback(code: string, userId: string, state?: string): Promise<GmailAuthResult> {
    try {
      logger.info('[gmailAuth] Processing OAuth2 callback', { userId, state });

      // Exchange authorization code for tokens
      const { tokens } = await this.oauth2Client.getToken(code);
      
      if (!tokens.access_token || !tokens.refresh_token) {
        throw new Error('Failed to obtain required tokens from Google');
      }

      // Set credentials to get user info
      this.oauth2Client.setCredentials(tokens);

      // Get user profile information
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const { data: userInfo } = await oauth2.userinfo.get();

      if (!userInfo.email) {
        throw new Error('Unable to retrieve user email from Google');
      }

      // Check if account already exists
      const existingAccount = await this.getAccountByEmail(userInfo.email);
      if (existingAccount) {
        // Update existing account
        const updatedAccount = await this.updateAccountTokens(
          existingAccount.id,
          tokens.access_token,
          tokens.refresh_token!,
          tokens.expiry_date
        );
        
        return {
          success: true,
          account: updatedAccount
        };
      }

      // Store new account
      const account = await this.storeGmailAccount({
        userId,
        email: userInfo.email,
        displayName: userInfo.name || userInfo.email,
        profilePictureUrl: userInfo.picture || undefined,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date ? tokens.expiry_date : undefined
      });

      logger.info('[gmailAuth] Successfully connected Gmail account', {
        accountId: account.id,
        email: account.email,
        userId
      });

      return {
        success: true,
        account
      };

    } catch (error) {
      logger.error('[gmailAuth] OAuth2 callback failed', {
        error: (error as Error).message,
        userId
      });

      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Store Gmail account in database with encrypted tokens
   */
  private async storeGmailAccount(data: {
    userId: string;
    email: string;
    displayName: string;
    profilePictureUrl?: string;
    accessToken: string;
    refreshToken: string;
    expiryDate?: number;
  }): Promise<GmailAccount> {
    try {
      // Encrypt tokens before storage
      const encryptedRefreshToken = this.encryptToken(data.refreshToken);
      const encryptedAccessToken = this.encryptToken(data.accessToken);

      const accountData = {
        user_id: data.userId,
        email: data.email,
        display_name: data.displayName,
        profile_picture_url: data.profilePictureUrl,
        refresh_token_encrypted: encryptedRefreshToken,
        access_token_encrypted: encryptedAccessToken,
        token_expires_at: data.expiryDate ? new Date(data.expiryDate).toISOString() : null,
        scope: GMAIL_SCOPES.join(' '),
        account_status: 'active',
        health_score: 100,
        daily_send_limit: 500, // Default Gmail daily limit
        is_primary: false, // Will be set to true if it's the first account
        send_enabled: true
      };

      const { data: account, error } = await supabase
        .from('gmail_accounts')
        .insert(accountData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to store Gmail account: ${error.message}`);
      }

      // Check if this should be the primary account
      await this.updatePrimaryAccountIfNeeded(data.userId, account.id);

      return this.mapDatabaseAccountToInterface(account);

    } catch (error) {
      logger.error('[gmailAuth] Failed to store Gmail account', {
        error: (error as Error).message,
        email: data.email
      });
      throw error;
    }
  }

  /**
   * Update account tokens
   */
  private async updateAccountTokens(
    accountId: string,
    accessToken: string,
    refreshToken: string,
    expiryDate?: number
  ): Promise<GmailAccount> {
    try {
      const encryptedRefreshToken = this.encryptToken(refreshToken);
      const encryptedAccessToken = this.encryptToken(accessToken);

      const { data: account, error } = await supabase
        .from('gmail_accounts')
        .update({
          refresh_token_encrypted: encryptedRefreshToken,
          access_token_encrypted: encryptedAccessToken,
          token_expires_at: expiryDate ? new Date(expiryDate).toISOString() : null,
          account_status: 'active',
          consecutive_errors: 0,
          last_error_message: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', accountId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update account tokens: ${error.message}`);
      }

      return this.mapDatabaseAccountToInterface(account);

    } catch (error) {
      logger.error('[gmailAuth] Failed to update account tokens', {
        error: (error as Error).message,
        accountId
      });
      throw error;
    }
  }

  /**
   * Get Gmail account by email
   */
  async getAccountByEmail(email: string): Promise<GmailAccount | null> {
    try {
      const { data: account, error } = await supabase
        .from('gmail_accounts')
        .select('*')
        .eq('email', email)
        .single();

      if (error || !account) {
        return null;
      }

      return this.mapDatabaseAccountToInterface(account);

    } catch (error) {
      logger.error('[gmailAuth] Failed to get account by email', {
        error: (error as Error).message,
        email
      });
      return null;
    }
  }

  /**
   * Get Gmail account by ID
   */
  async getAccountById(accountId: string): Promise<GmailAccount | null> {
    try {
      const { data: account, error } = await supabase
        .from('gmail_accounts')
        .select('*')
        .eq('id', accountId)
        .single();

      if (error || !account) {
        return null;
      }

      return this.mapDatabaseAccountToInterface(account);

    } catch (error) {
      logger.error('[gmailAuth] Failed to get account by ID', {
        error: (error as Error).message,
        accountId
      });
      return null;
    }
  }

  /**
   * Get all Gmail accounts for a user
   */
  async getUserAccounts(userId: string): Promise<GmailAccount[]> {
    try {
      const { data: accounts, error } = await supabase
        .from('gmail_accounts')
        .select('*')
        .eq('user_id', userId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) {
        throw new Error(`Failed to get user accounts: ${error.message}`);
      }

      return accounts.map(account => this.mapDatabaseAccountToInterface(account));

    } catch (error) {
      logger.error('[gmailAuth] Failed to get user accounts', {
        error: (error as Error).message,
        userId
      });
      return [];
    }
  }

  /**
   * Get valid access token for account (refresh if needed)
   */
  async getValidAccessToken(accountId: string): Promise<string | null> {
    try {
      const { data: account, error } = await supabase
        .from('gmail_accounts')
        .select('*')
        .eq('id', accountId)
        .single();

      if (error || !account) {
        throw new Error('Account not found');
      }

      // Decrypt tokens
      const refreshToken = this.decryptToken(account.refresh_token_encrypted);
      let accessToken = this.decryptToken(account.access_token_encrypted);

      // Check if access token is expired
      const now = new Date();
      const expiryDate = account.token_expires_at ? new Date(account.token_expires_at) : null;

      if (!expiryDate || now >= expiryDate) {
        // Token is expired, refresh it
        logger.info('[gmailAuth] Access token expired, refreshing', { accountId });
        
        const newTokens = await this.refreshAccessToken(refreshToken);
        if (!newTokens) {
          throw new Error('Failed to refresh access token');
        }

        // Update account with new tokens
        await this.updateAccountTokens(
          accountId,
          newTokens.accessToken,
          refreshToken, // Keep same refresh token
          newTokens.expiryDate
        );

        accessToken = newTokens.accessToken;
      }

      return accessToken;

    } catch (error) {
      logger.error('[gmailAuth] Failed to get valid access token', {
        error: (error as Error).message,
        accountId
      });
      
      // Mark account as having an error
      await this.markAccountError(accountId, (error as Error).message);
      return null;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiryDate: number } | null> {
    try {
      this.oauth2Client.setCredentials({ refresh_token: refreshToken });
      
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      if (!credentials.access_token || !credentials.expiry_date) {
        throw new Error('Failed to refresh access token');
      }

      return {
        accessToken: credentials.access_token,
        expiryDate: credentials.expiry_date
      };

    } catch (error) {
      logger.error('[gmailAuth] Failed to refresh access token', {
        error: (error as Error).message
      });
      return null;
    }
  }

  /**
   * Disconnect Gmail account
   */
  async disconnectAccount(accountId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('gmail_accounts')
        .update({
          account_status: 'disconnected',
          send_enabled: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', accountId);

      if (error) {
        throw new Error(`Failed to disconnect account: ${error.message}`);
      }

      logger.info('[gmailAuth] Successfully disconnected Gmail account', { accountId });
      return true;

    } catch (error) {
      logger.error('[gmailAuth] Failed to disconnect account', {
        error: (error as Error).message,
        accountId
      });
      return false;
    }
  }

  /**
   * Mark account as having an error
   */
  private async markAccountError(accountId: string, errorMessage: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('gmail_accounts')
        .update({
          account_status: 'error',
          last_error_message: errorMessage,
          consecutive_errors: 0, // Will be incremented by trigger
          health_score: 90, // Will be calculated by trigger
          updated_at: new Date().toISOString()
        })
        .eq('id', accountId);

      if (error) {
        logger.warn('[gmailAuth] Failed to mark account error', { error: error.message });
      }

    } catch (error) {
      logger.error('[gmailAuth] Error marking account error', {
        error: (error as Error).message,
        accountId
      });
    }
  }

  /**
   * Update primary account if this is the first account for user
   */
  private async updatePrimaryAccountIfNeeded(userId: string, accountId: string): Promise<void> {
    try {
      const { count } = await supabase
        .from('gmail_accounts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('account_status', 'active');

      // If this is the only active account, make it primary
      if (count === 1) {
        await supabase
          .from('gmail_accounts')
          .update({ is_primary: true })
          .eq('id', accountId);
      }

    } catch (error) {
      logger.warn('[gmailAuth] Failed to update primary account', {
        error: (error as Error).message,
        userId,
        accountId
      });
    }
  }

  /**
   * Encrypt token for database storage
   */
  private encryptToken(token: string): string {
    const algorithm = 'aes-256-gcm';
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(algorithm, this.encryptionKey);
    
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt token from database storage
   */
  private decryptToken(encryptedToken: string): string {
    const algorithm = 'aes-256-gcm';
    const parts = encryptedToken.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipher(algorithm, this.encryptionKey);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Map database account to interface
   */
  private mapDatabaseAccountToInterface(account: any): GmailAccount {
    return {
      id: account.id,
      userId: account.user_id,
      email: account.email,
      displayName: account.display_name,
      profilePictureUrl: account.profile_picture_url,
      accountStatus: account.account_status,
      healthScore: account.health_score,
      dailySendCount: account.daily_send_count,
      dailySendLimit: account.daily_send_limit,
      createdAt: account.created_at,
      updatedAt: account.updated_at
    };
  }
}

// Export singleton instance
export const gmailAuthService = new GmailAuthService();