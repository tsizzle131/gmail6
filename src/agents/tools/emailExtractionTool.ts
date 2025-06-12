import { tool } from '@langchain/core/tools';
import { extractEmails } from './emailExtractionWrapper';

/**
 * LangChain Tool that extracts email addresses from text.
 */
export const emailExtractionTool = tool(
  async ({ input }: { input: string }) => {
    const emails = await extractEmails(input);
    return JSON.stringify(emails);
  },
  {
    name: 'email_extraction',
    description: 'Extracts email addresses from provided text. The input argument must be named \'input\'.',
  }
);
