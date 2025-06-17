/**
 * Response Generation Tool for Response Handler Agent
 * Generates intelligent, contextual email responses based on classification and conversation history
 */

export const responseGenerationTool = {
  type: 'function' as const,
  function: {
    name: 'response_generation',
    description: 'Generate an intelligent, personalized email response based on classification and conversation context',
    parameters: {
      type: 'object',
      properties: {
        classification: {
          type: 'object',
          description: 'The classification result from response_classification tool',
          properties: {
            category: { type: 'string' },
            sentiment_score: { type: 'number' },
            confidence_score: { type: 'number' },
            intent_summary: { type: 'string' },
            key_points: { type: 'array', items: { type: 'string' } },
            urgency_level: { type: 'string' },
            requires_response: { type: 'boolean' },
            response_tone_suggestion: { type: 'string' }
          }
        },
        context: {
          type: 'object',
          description: 'The conversation context from conversation_context tool'
        },
        responseContent: {
          type: 'string',
          description: 'The original email content they sent'
        },
        companyInfo: {
          type: 'object',
          description: 'Company information and services for personalization'
        },
        responseStyle: {
          type: 'string',
          description: 'Preferred response style: professional, consultative, enthusiastic, understanding',
          default: 'professional'
        },
        includeNextSteps: {
          type: 'boolean',
          description: 'Whether to include clear next steps in the response',
          default: true
        }
      },
      required: ['classification', 'context', 'responseContent']
    }
  }
};

export interface ResponseGenerationParams {
  classification: {
    category: string;
    sentiment_score: number;
    confidence_score: number;
    intent_summary: string;
    key_points: string[];
    urgency_level: string;
    requires_response: boolean;
    response_tone_suggestion: string;
  };
  context: any;
  responseContent: string;
  companyInfo?: any;
  responseStyle?: string;
  includeNextSteps?: boolean;
}

export interface ResponseGenerationResult {
  success: boolean;
  response?: {
    subject: string;
    content: string;
    tone: string;
    personalizationScore: number;
    responseType: 'answer' | 'clarification' | 'objection_handling' | 'scheduling' | 'closing' | 'unsubscribe_confirmation';
    estimatedReadTime: string;
    nextSteps?: string[];
    schedulingSuggestion?: {
      type: 'call' | 'demo' | 'meeting' | 'consultation';
      duration: string;
      urgency: string;
    };
  };
  error?: string;
  message?: string;
}