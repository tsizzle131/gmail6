/**
 * Response Classification Tool for Response Handler Agent
 * Classifies incoming email replies by intent, sentiment, and urgency
 */

export const responseClassificationTool = {
  type: 'function' as const,
  function: {
    name: 'response_classification',
    description: 'Classify an incoming email response by intent, sentiment, and urgency level',
    parameters: {
      type: 'object',
      properties: {
        emailResponseId: {
          type: 'string',
          description: 'The ID of the email response record to classify'
        },
        responseContent: {
          type: 'string',
          description: 'The content of the email response to analyze'
        },
        responseFromEmail: {
          type: 'string',
          description: 'The email address of the person who replied'
        },
        originalEmailSubject: {
          type: 'string',
          description: 'The subject line of the original email they are replying to'
        }
      },
      required: ['emailResponseId', 'responseContent', 'responseFromEmail']
    }
  }
};

export interface ResponseClassificationParams {
  emailResponseId: string;
  responseContent: string;
  responseFromEmail: string;
  originalEmailSubject?: string;
}

export interface ResponseClassificationResult {
  success: boolean;
  classification?: {
    category: 'interested' | 'not_interested' | 'question' | 'objection' | 'unsubscribe' | 'auto_reply' | 'other';
    sentiment_score: number; // -1.0 to 1.0
    confidence_score: number; // 0.0 to 1.0
    intent_summary: string;
    key_points: string[];
    urgency_level: 'low' | 'medium' | 'high' | 'urgent';
    requires_response: boolean;
    response_tone_suggestion: 'professional' | 'enthusiastic' | 'consultative' | 'understanding' | 'respectful';
  };
  error?: string;
  message?: string;
}