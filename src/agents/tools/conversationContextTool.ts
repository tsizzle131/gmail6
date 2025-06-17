/**
 * Conversation Context Tool for Response Handler Agent
 * Retrieves conversation history and context for intelligent response generation
 */

export const conversationContextTool = {
  type: 'function' as const,
  function: {
    name: 'conversation_context',
    description: 'Retrieve conversation history, campaign context, and contact information for contextual response generation',
    parameters: {
      type: 'object',
      properties: {
        campaignId: {
          type: 'string',
          description: 'The ID of the campaign this response belongs to'
        },
        contactId: {
          type: 'string',
          description: 'The ID of the contact who sent the response'
        },
        emailResponseId: {
          type: 'string',
          description: 'The ID of the current email response'
        },
        includeCompanyData: {
          type: 'boolean',
          description: 'Whether to include detailed company and service information',
          default: true
        }
      },
      required: ['campaignId', 'contactId', 'emailResponseId']
    }
  }
};

export interface ConversationContextParams {
  campaignId: string;
  contactId: string;
  emailResponseId: string;
  includeCompanyData?: boolean;
}

export interface ConversationContextResult {
  success: boolean;
  context?: {
    conversation: {
      id?: string;
      status: string;
      stage: string;
      totalResponses: number;
      lastResponseAt?: string;
      contextSummary?: string;
      keyPoints?: any;
    };
    emailHistory: Array<{
      id: string;
      responseContent: string;
      classification: string;
      sentimentScore?: number;
      createdAt: string;
    }>;
    campaign: {
      id: string;
      name: string;
      productName: string;
      productDescription: string;
      status: string;
    };
    contact: {
      id: string;
      email: string;
      companyName: string;
      industry?: string;
      websiteContent?: string;
      enrichedData?: any;
    };
    company?: {
      id: string;
      name: string;
      description: string;
      services?: any[];
      caseStudies?: any[];
      teamCredentials?: any[];
    };
    campaignSequence?: {
      currentEmailNumber: number;
      totalEmails: number;
      sequenceStage: string;
    };
  };
  error?: string;
  message?: string;
}