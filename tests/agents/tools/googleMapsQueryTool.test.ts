// Mock 'langchain' module for tests
jest.mock('langchain', () => ({ OpenAI: jest.fn() }), { virtual: true });
// Mock OpenAI client to avoid importing 'langchain'
jest.mock('../../../src/ai/client', () => ({
  openai: {},
}));
// Mock ChatPromptTemplate
jest.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: jest.fn(),
  },
}));

import { generateGoogleMapsQuery } from '../../../src/agents/tools/googleMapsQueryTool';
import { ChatPromptTemplate } from '@langchain/core/prompts';

describe('generateGoogleMapsQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns expected query string based on parameters', async () => {
    const mockInvoke = jest.fn().mockResolvedValue('coffee shops in San Francisco open now');
    // Stub prompt.chain.invoke
    (ChatPromptTemplate.fromMessages as jest.Mock).mockReturnValue({
      pipe: () => ({ invoke: mockInvoke }),
    });

    const result = await generateGoogleMapsQuery({ industry: 'coffee shops', location: 'San Francisco', filters: 'open now' });

    expect(ChatPromptTemplate.fromMessages).toHaveBeenCalledWith([
      ['system', 'You are a helpful assistant that generates concise Google Maps search queries.'],
      ['user', 'Generate a Google Maps search string given the following parameters:'],
      ['assistant', 'Industry: {industry}\nLocation: {location}\nFilters: {filters}'],
    ]);
    expect(mockInvoke).toHaveBeenCalledWith({ industry: 'coffee shops', location: 'San Francisco', filters: 'open now' });
    expect(result).toBe('coffee shops in San Francisco open now');
  });

  it('defaults filters to empty string when not provided', async () => {
    const mockInvoke = jest.fn().mockResolvedValue('restaurants in New York');
    (ChatPromptTemplate.fromMessages as jest.Mock).mockReturnValue({
      pipe: () => ({ invoke: mockInvoke }),
    });

    const result = await generateGoogleMapsQuery({ industry: 'restaurants', location: 'New York' });

    expect(mockInvoke).toHaveBeenCalledWith({ industry: 'restaurants', location: 'New York', filters: '' });
    expect(result).toBe('restaurants in New York');
  });
});
