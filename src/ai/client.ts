import { ChatOpenAI } from '@langchain/openai';
import config from '../config';

/**
 * OpenAI client via LangChain
 */
export const openai = new ChatOpenAI({
  openAIApiKey: config.openaiApiKey,
  temperature: 0.7, // Reason: set a default creativity level
  model: "gpt-4o-mini", // Specify the model
});

// Test if bindTools exists right after creation
console.log("TESTING: openai.bindTools in client.ts:", typeof openai.bindTools);
