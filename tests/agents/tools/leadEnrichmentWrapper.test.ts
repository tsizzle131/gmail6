// Mock config and AI client
// Mock ChatPromptTemplate from LangChain
jest.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: { fromMessages: jest.fn() },
}));

import { ChatPromptTemplate } from '@langchain/core/prompts';
jest.mock('../../../src/config', () => ({
  perplexityApiKey: 'PERP_KEY',
  perplexityApiUrl: 'https://api.perplexity.test/query',
}));
jest.mock('../../../src/ai/client', () => ({
  openai: { invoke: jest.fn() },
}));

import config from '../../../src/config';
import { openai } from '../../../src/ai/client';
import { enrichLead } from '../../../src/agents/tools/leadEnrichmentWrapper';

describe('enrichLead', () => {
  const globalAny: any = global;

  beforeEach(() => {
    jest.clearAllMocks();
    globalAny.fetch = jest.fn();
    // Stub ChatPromptTemplate.fromMessages for chain
    (ChatPromptTemplate.fromMessages as jest.Mock).mockReturnValue({
      pipe: () => ({ invoke: openai.invoke as jest.Mock }),
    });
  });

  it('uses Perplexity when configured and then OpenAI to generate enrichment', async () => {
    // Mock Perplexity response
    (globalAny.fetch as jest.Mock).mockResolvedValue({ json: () => Promise.resolve({ answer: 'Relevant context' }) });
    // Mock OpenAI
    (openai.invoke as jest.Mock).mockResolvedValue(JSON.stringify({
      industry: 'Software',
      description: 'Desc',
      headcount: '100-500',
      roles: ['CEO', 'CTO'],
      score: 85,
    }));

    const params = { name: 'TestCo', website: 'http://test.co' };
    const result = await enrichLead(params);

    expect(globalAny.fetch).toHaveBeenCalledWith('https://api.perplexity.test/query', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer PERP_KEY' }),
      body: JSON.stringify({ query: 'TestCo http://test.co industry insights and company overview' }),
    }));
    expect(openai.invoke).toHaveBeenCalledWith({
      name: 'TestCo',
      website: 'http://test.co',
      context: 'Relevant context',
    });
    expect(result).toEqual({
      industry: 'Software',
      description: 'Desc',
      headcount: '100-500',
      roles: ['CEO', 'CTO'],
      score: 85,
    });
  });

  it('skips Perplexity when not configured', async () => {
    // Disable Perplexity
    (config as any).perplexityApiUrl = '';
    (globalAny.fetch as jest.Mock).mockImplementation(() => { throw new Error('should not be called'); });
    // Mock OpenAI
    (openai.invoke as jest.Mock).mockResolvedValue(JSON.stringify({
      industry: 'Industry',
      description: 'Desc',
      headcount: '10-50',
      roles: [],
      score: 50,
    }));

    const params = { name: 'TestCo' };
    const result = await enrichLead(params);

    expect(globalAny.fetch).not.toHaveBeenCalled();
    expect(openai.invoke).toHaveBeenCalledWith({
      name: 'TestCo',
      website: '',
      context: '',
    });
    expect(result).toEqual({
      industry: 'Industry',
      description: 'Desc',
      headcount: '10-50',
      roles: [],
      score: 50,
    });
  });
});