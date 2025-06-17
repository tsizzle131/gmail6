import * as cron from 'node-cron';
import { processCampaignScheduling } from '../agents/campaignManagerAgent';
import { processScheduledEmails } from './emailQueue';
import logger from '../logger';

/**
 * Campaign Scheduler Service
 * Automatically processes campaigns and sends scheduled emails
 */
export class CampaignScheduler {
  private isRunning = false;
  private schedulingTask: cron.ScheduledTask | null = null;
  private emailProcessingTask: cron.ScheduledTask | null = null;

  /**
   * Start the campaign scheduler
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('[campaignScheduler] Scheduler is already running');
      return;
    }

    logger.info('[campaignScheduler] Starting campaign scheduler');

    // Schedule campaign processing every 30 minutes
    // This determines which emails should be scheduled next
    this.schedulingTask = cron.schedule('*/30 * * * *', async () => {
      try {
        logger.info('[campaignScheduler] Running automated campaign scheduling');
        const results = await processCampaignScheduling();
        logger.info('[campaignScheduler] Campaign scheduling completed', {
          campaignsProcessed: results.campaignsProcessed,
          emailsScheduled: results.emailsScheduled,
          errors: results.errors.length
        });
      } catch (error) {
        logger.error('[campaignScheduler] Error in automated campaign scheduling:', error);
      }
    });

    this.schedulingTask.stop(); // Don't start immediately

    // Process scheduled emails every 5 minutes
    // This sends emails that are ready to go
    this.emailProcessingTask = cron.schedule('*/5 * * * *', async () => {
      try {
        logger.info('[campaignScheduler] Processing scheduled emails');
        const results = await processScheduledEmails();
        
        if (results.emailsQueued > 0) {
          logger.info('[campaignScheduler] Email processing completed', {
            emailsQueued: results.emailsQueued,
            emailsSkipped: results.emailsSkipped,
            errors: results.errors.length
          });
        }
      } catch (error) {
        logger.error('[campaignScheduler] Error in email processing:', error);
      }
    });

    this.emailProcessingTask.stop(); // Don't start immediately

    // Start both tasks
    this.schedulingTask.start();
    this.emailProcessingTask.start();
    this.isRunning = true;

    logger.info('[campaignScheduler] Campaign scheduler started successfully');
    logger.info('[campaignScheduler] - Campaign scheduling: every 30 minutes');
    logger.info('[campaignScheduler] - Email processing: every 5 minutes');
  }

  /**
   * Stop the campaign scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('[campaignScheduler] Scheduler is not running');
      return;
    }

    logger.info('[campaignScheduler] Stopping campaign scheduler');

    if (this.schedulingTask) {
      this.schedulingTask.stop();
      this.schedulingTask = null;
    }

    if (this.emailProcessingTask) {
      this.emailProcessingTask.stop();
      this.emailProcessingTask = null;
    }

    this.isRunning = false;
    logger.info('[campaignScheduler] Campaign scheduler stopped');
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    isRunning: boolean;
    nextSchedulingRun?: string;
    nextEmailProcessingRun?: string;
  } {
    return {
      isRunning: this.isRunning,
      nextSchedulingRun: this.isRunning ? 'Every 30 minutes' : undefined,
      nextEmailProcessingRun: this.isRunning ? 'Every 5 minutes' : undefined
    };
  }

  /**
   * Force run campaign scheduling (for testing/manual triggers)
   */
  async runCampaignScheduling(): Promise<void> {
    logger.info('[campaignScheduler] Manual campaign scheduling triggered');
    try {
      const results = await processCampaignScheduling();
      logger.info('[campaignScheduler] Manual campaign scheduling completed', results);
    } catch (error) {
      logger.error('[campaignScheduler] Error in manual campaign scheduling:', error);
      throw error;
    }
  }

  /**
   * Force run email processing (for testing/manual triggers)
   */
  async runEmailProcessing(): Promise<void> {
    logger.info('[campaignScheduler] Manual email processing triggered');
    try {
      const results = await processScheduledEmails();
      logger.info('[campaignScheduler] Manual email processing completed', results);
    } catch (error) {
      logger.error('[campaignScheduler] Error in manual email processing:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const campaignScheduler = new CampaignScheduler();