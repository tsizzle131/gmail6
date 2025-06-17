import { supabase } from '../db/supabaseClient';
import { gmailAuthService, GmailAccount } from './gmailAuthService';
import logger from '../logger';

export interface AccountUsageStats {
  accountId: string;
  email: string;
  todaySentCount: number;
  dailyLimit: number;
  remainingToday: number;
  healthScore: number;
  accountStatus: string;
  consecutiveErrors: number;
  lastErrorMessage?: string;
}

export interface SendingAccount {
  accountId: string;
  email: string;
  accessToken: string;
  remainingQuota: number;
  priority: number; // Higher is better
}

/**
 * Gmail Account Manager Service
 * Handles account health, rotation, quota management, and optimization
 */
export class GmailAccountManager {
  
  /**
   * Get the best available account for sending emails
   * Considers health score, quota remaining, and current status
   */
  async getBestSendingAccount(userId: string, preferredAccountId?: string): Promise<SendingAccount | null> {
    try {
      logger.info('[gmailAccountManager] Finding best sending account', { userId, preferredAccountId });

      // Get all active accounts for user
      const accounts = await gmailAuthService.getUserAccounts(userId);
      const activeAccounts = accounts.filter(account => 
        account.accountStatus === 'active' && 
        account.dailySendCount < account.dailySendLimit
      );

      if (activeAccounts.length === 0) {
        logger.warn('[gmailAccountManager] No active accounts available for sending', { userId });
        return null;
      }

      // If preferred account is specified and available, use it
      if (preferredAccountId) {
        const preferredAccount = activeAccounts.find(acc => acc.id === preferredAccountId);
        if (preferredAccount) {
          const accessToken = await gmailAuthService.getValidAccessToken(preferredAccountId);
          if (accessToken) {
            return {
              accountId: preferredAccount.id,
              email: preferredAccount.email,
              accessToken,
              remainingQuota: preferredAccount.dailySendLimit - preferredAccount.dailySendCount,
              priority: 100
            };
          }
        }
      }

      // Score and rank accounts
      const scoredAccounts = await Promise.all(
        activeAccounts.map(async (account) => {
          const accessToken = await gmailAuthService.getValidAccessToken(account.id);
          if (!accessToken) {
            return null; // Skip accounts with token issues
          }

          const remainingQuota = account.dailySendLimit - account.dailySendCount;
          
          // Calculate priority score (0-100)
          let score = account.healthScore; // Start with health score
          
          // Boost accounts with more remaining quota
          const quotaPercentage = remainingQuota / account.dailySendLimit;
          score += quotaPercentage * 20; // Up to 20 bonus points for quota
          
          // Penalize accounts with recent errors
          if (account.accountStatus === 'error') {
            score -= 30;
          }
          
          return {
            accountId: account.id,
            email: account.email,
            accessToken,
            remainingQuota,
            priority: Math.max(0, Math.min(100, score))
          };
        })
      );

      // Filter out null results and sort by priority
      const validAccounts = scoredAccounts
        .filter((account): account is SendingAccount => account !== null)
        .sort((a, b) => b.priority - a.priority);

      if (validAccounts.length === 0) {
        logger.warn('[gmailAccountManager] No valid accounts with tokens available', { userId });
        return null;
      }

      const bestAccount = validAccounts[0];
      logger.info('[gmailAccountManager] Selected best sending account', {
        accountId: bestAccount.accountId,
        email: bestAccount.email,
        priority: bestAccount.priority,
        remainingQuota: bestAccount.remainingQuota
      });

      return bestAccount;

    } catch (error) {
      logger.error('[gmailAccountManager] Failed to get best sending account', {
        error: (error as Error).message,
        userId
      });
      return null;
    }
  }

  /**
   * Get usage statistics for all user accounts
   */
  async getAccountUsageStats(userId: string): Promise<AccountUsageStats[]> {
    try {
      const accounts = await gmailAuthService.getUserAccounts(userId);
      
      const stats = await Promise.all(accounts.map(async (account) => {
        // Get today's quota usage
        const today = new Date().toISOString().split('T')[0];
        
        const { data: quotaData, error } = await supabase
          .from('gmail_quota_usage')
          .select('emails_sent_count')
          .eq('gmail_account_id', account.id)
          .eq('date', today)
          .single();

        const todaySentCount = quotaData?.emails_sent_count || account.dailySendCount;

        // Get error information
        const { data: accountData, error: accountError } = await supabase
          .from('gmail_accounts')
          .select('consecutive_errors, last_error_message')
          .eq('id', account.id)
          .single();

        return {
          accountId: account.id,
          email: account.email,
          todaySentCount,
          dailyLimit: account.dailySendLimit,
          remainingToday: Math.max(0, account.dailySendLimit - todaySentCount),
          healthScore: account.healthScore,
          accountStatus: account.accountStatus,
          consecutiveErrors: accountData?.consecutive_errors || 0,
          lastErrorMessage: accountData?.last_error_message
        };
      }));

      return stats;

    } catch (error) {
      logger.error('[gmailAccountManager] Failed to get usage stats', {
        error: (error as Error).message,
        userId
      });
      return [];
    }
  }

  /**
   * Update account send count after sending an email
   */
  async updateAccountSendCount(accountId: string): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Update daily send count in gmail_accounts
      const { error: accountError } = await supabase
        .from('gmail_accounts')
        .update({
          daily_send_count: 1, // Will be incremented by trigger
          successful_sends: 1, // Will be incremented by trigger  
          updated_at: new Date().toISOString()
        })
        .eq('id', accountId);

      if (accountError) {
        logger.warn('[gmailAccountManager] Failed to update account send count', {
          error: accountError.message,
          accountId
        });
      }

      // Update or insert quota usage record
      const { error: quotaError } = await supabase
        .from('gmail_quota_usage')
        .upsert({
          gmail_account_id: accountId,
          date: today,
          emails_sent_count: 1, // Will be handled by database trigger
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'gmail_account_id,date'
        });

      if (quotaError) {
        logger.warn('[gmailAccountManager] Failed to update quota usage', {
          error: quotaError.message,
          accountId
        });
      }

      logger.debug('[gmailAccountManager] Updated account send count', { accountId });

    } catch (error) {
      logger.error('[gmailAccountManager] Error updating account send count', {
        error: (error as Error).message,
        accountId
      });
    }
  }

  /**
   * Record successful email send
   */
  async recordSuccessfulSend(accountId: string, messageId: string): Promise<void> {
    try {
      await this.updateAccountSendCount(accountId);
      
      // Reset consecutive errors on successful send
      const { error } = await supabase
        .from('gmail_accounts')
        .update({
          consecutive_errors: 0,
          last_error_message: null,
          account_status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('id', accountId);

      if (error) {
        logger.warn('[gmailAccountManager] Failed to reset error count', {
          error: error.message,
          accountId
        });
      }

      logger.debug('[gmailAccountManager] Recorded successful send', { accountId, messageId });

    } catch (error) {
      logger.error('[gmailAccountManager] Error recording successful send', {
        error: (error as Error).message,
        accountId
      });
    }
  }

  /**
   * Record email send error
   */
  async recordSendError(accountId: string, errorMessage: string): Promise<void> {
    try {
      const { data: account, error: fetchError } = await supabase
        .from('gmail_accounts')
        .select('consecutive_errors, health_score')
        .eq('id', accountId)
        .single();

      if (fetchError || !account) {
        logger.warn('[gmailAccountManager] Account not found for error recording', { accountId });
        return;
      }

      const newConsecutiveErrors = account.consecutive_errors + 1;
      const healthPenalty = Math.min(20, newConsecutiveErrors * 5);
      const newHealthScore = Math.max(0, account.health_score - healthPenalty);

      // Determine new status based on error count
      let newStatus = 'active';
      if (newConsecutiveErrors >= 5) {
        newStatus = 'suspended';
      } else if (newConsecutiveErrors >= 3) {
        newStatus = 'error';
      }

      const { error } = await supabase
        .from('gmail_accounts')
        .update({
          consecutive_errors: newConsecutiveErrors,
          last_error_message: errorMessage,
          account_status: newStatus,
          health_score: newHealthScore,
          updated_at: new Date().toISOString()
        })
        .eq('id', accountId);

      if (error) {
        logger.warn('[gmailAccountManager] Failed to record send error', {
          error: error.message,
          accountId
        });
      }

      logger.warn('[gmailAccountManager] Recorded send error', {
        accountId,
        errorMessage,
        consecutiveErrors: newConsecutiveErrors,
        newStatus,
        newHealthScore
      });

    } catch (error) {
      logger.error('[gmailAccountManager] Error recording send error', {
        error: (error as Error).message,
        accountId
      });
    }
  }

  /**
   * Check account health and update scores
   */
  async performHealthCheck(accountId: string): Promise<boolean> {
    try {
      logger.info('[gmailAccountManager] Performing health check', { accountId });

      // Try to get a valid access token
      const accessToken = await gmailAuthService.getValidAccessToken(accountId);
      
      if (!accessToken) {
        await this.recordSendError(accountId, 'Failed to obtain valid access token');
        return false;
      }

      // Update last health check timestamp
      const { error } = await supabase
        .from('gmail_accounts')
        .update({
          last_health_check: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', accountId);

      if (error) {
        logger.warn('[gmailAccountManager] Failed to update health check timestamp', {
          error: error.message,
          accountId
        });
      }

      logger.info('[gmailAccountManager] Health check passed', { accountId });
      return true;

    } catch (error) {
      logger.error('[gmailAccountManager] Health check failed', {
        error: (error as Error).message,
        accountId
      });

      await this.recordSendError(accountId, `Health check failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Reset daily counters (should be called daily via cron job)
   */
  async resetDailyCounters(): Promise<void> {
    try {
      logger.info('[gmailAccountManager] Resetting daily counters');

      const { error } = await supabase
        .from('gmail_accounts')
        .update({
          daily_send_count: 0,
          last_send_reset: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString()
        })
        .lt('last_send_reset', new Date().toISOString().split('T')[0]);

      if (error) {
        throw new Error(`Failed to reset daily counters: ${error.message}`);
      }

      logger.info('[gmailAccountManager] Daily counters reset successfully');

    } catch (error) {
      logger.error('[gmailAccountManager] Error resetting daily counters', {
        error: (error as Error).message
      });
    }
  }

  /**
   * Pause account temporarily
   */
  async pauseAccount(accountId: string, reason: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('gmail_accounts')
        .update({
          account_status: 'paused',
          last_error_message: reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', accountId);

      if (error) {
        logger.error('[gmailAccountManager] Failed to pause account', {
          error: error.message,
          accountId
        });
        return false;
      }

      logger.info('[gmailAccountManager] Account paused', { accountId, reason });
      return true;

    } catch (error) {
      logger.error('[gmailAccountManager] Error pausing account', {
        error: (error as Error).message,
        accountId
      });
      return false;
    }
  }

  /**
   * Resume paused account
   */
  async resumeAccount(accountId: string): Promise<boolean> {
    try {
      // Perform health check before resuming
      const isHealthy = await this.performHealthCheck(accountId);
      
      if (!isHealthy) {
        logger.warn('[gmailAccountManager] Cannot resume unhealthy account', { accountId });
        return false;
      }

      const { error } = await supabase
        .from('gmail_accounts')
        .update({
          account_status: 'active',
          last_error_message: null,
          consecutive_errors: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', accountId);

      if (error) {
        logger.error('[gmailAccountManager] Failed to resume account', {
          error: error.message,
          accountId
        });
        return false;
      }

      logger.info('[gmailAccountManager] Account resumed', { accountId });
      return true;

    } catch (error) {
      logger.error('[gmailAccountManager] Error resuming account', {
        error: (error as Error).message,
        accountId
      });
      return false;
    }
  }

  /**
   * Get account rotation strategy for high-volume sending
   */
  async getAccountRotationStrategy(userId: string, emailCount: number): Promise<{ accountId: string; emailsToSend: number }[]> {
    try {
      const stats = await this.getAccountUsageStats(userId);
      const availableAccounts = stats.filter(stat => 
        stat.accountStatus === 'active' && 
        stat.remainingToday > 0 &&
        stat.healthScore > 50
      );

      if (availableAccounts.length === 0) {
        return [];
      }

      // Distribute emails across accounts based on remaining quota
      const totalQuota = availableAccounts.reduce((sum, acc) => sum + acc.remainingToday, 0);
      
      if (totalQuota < emailCount) {
        logger.warn('[gmailAccountManager] Insufficient quota for requested email count', {
          requested: emailCount,
          available: totalQuota
        });
      }

      const strategy = availableAccounts.map(account => {
        const proportion = account.remainingToday / totalQuota;
        const emailsForAccount = Math.min(
          Math.floor(emailCount * proportion),
          account.remainingToday
        );
        
        return {
          accountId: account.accountId,
          emailsToSend: emailsForAccount
        };
      }).filter(item => item.emailsToSend > 0);

      logger.info('[gmailAccountManager] Generated rotation strategy', {
        totalEmails: emailCount,
        accountsUsed: strategy.length,
        strategy
      });

      return strategy;

    } catch (error) {
      logger.error('[gmailAccountManager] Error generating rotation strategy', {
        error: (error as Error).message,
        userId
      });
      return [];
    }
  }
}

// Export singleton instance
export const gmailAccountManager = new GmailAccountManager();