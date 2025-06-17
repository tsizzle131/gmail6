/**
 * Action Determination Tool for Response Handler Agent
 * Determines next actions based on response classification and conversation context
 */

export const actionDeterminationTool = {
  type: 'function' as const,
  function: {
    name: 'action_determination',
    description: 'Determine follow-up actions based on email response classification and conversation context',
    parameters: {
      type: 'object',
      properties: {
        classification: {
          type: 'object',
          description: 'The response classification result',
          properties: {
            category: { type: 'string' },
            sentiment_score: { type: 'number' },
            urgency_level: { type: 'string' },
            requires_response: { type: 'boolean' }
          }
        },
        context: {
          type: 'object',
          description: 'The conversation context including history and campaign info'
        },
        conversationId: {
          type: 'string',
          description: 'The ID of the conversation record to update'
        },
        currentCampaignStatus: {
          type: 'string',
          description: 'Current campaign status (active, paused, etc.)'
        },
        sequencePosition: {
          type: 'object',
          description: 'Current position in the email sequence',
          properties: {
            currentEmailNumber: { type: 'number' },
            totalEmails: { type: 'number' },
            nextScheduledAt: { type: 'string' }
          }
        }
      },
      required: ['classification', 'context']
    }
  }
};

export interface ActionDeterminationParams {
  classification: {
    category: string;
    sentiment_score: number;
    urgency_level: string;
    requires_response: boolean;
  };
  context: any;
  conversationId?: string;
  currentCampaignStatus?: string;
  sequencePosition?: {
    currentEmailNumber: number;
    totalEmails: number;
    nextScheduledAt?: string;
  };
}

export interface ActionDeterminationResult {
  success: boolean;
  actions?: {
    // Sequence management
    pauseSequence: boolean;
    resumeSequence: boolean;
    cancelSequence: boolean;
    sequencePauseReason?: string;
    
    // Response handling
    sendResponse: boolean;
    responseDelay: 'immediate' | '15min' | '1hour' | '4hours' | '24hours' | 'none';
    responseScheduledTime?: string;
    
    // Handoff and escalation
    requiresHandoff: boolean;
    handoffType?: 'sales' | 'support' | 'technical' | 'management';
    handoffReason?: string;
    handoffUrgency: 'low' | 'medium' | 'high' | 'urgent';
    
    // Conversation management
    conversationStage: 'cold_outreach' | 'engaged' | 'interested' | 'qualified' | 'objection_handling' | 'closing' | 'converted' | 'closed';
    nextAction: 'respond' | 'schedule_followup' | 'handoff' | 'close' | 'unsubscribe' | 'archive';
    nextActionScheduledFor?: string;
    
    // Contact status updates
    newContactStatus?: 'active' | 'paused' | 'responded' | 'converted' | 'unsubscribed' | 'bounced';
    progressionStage?: 'cold' | 'engaged' | 'interested' | 'qualified' | 'converted';
    
    // Analytics and tracking
    updateAnalytics: boolean;
    analyticsCategory: 'positive_response' | 'negative_response' | 'question' | 'objection' | 'unsubscribe';
    
    // Notifications
    notifyTeam: boolean;
    notificationLevel: 'info' | 'important' | 'urgent';
    notificationMessage?: string;
  };
  recommendations?: {
    suggestedResponseTiming: string;
    suggestedNextSteps: string[];
    riskAssessment: 'low' | 'medium' | 'high';
    conversionProbability: number; // 0-100
  };
  error?: string;
  message?: string;
}