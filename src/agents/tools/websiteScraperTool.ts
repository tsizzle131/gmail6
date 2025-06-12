import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { scrapeWebsite } from './websiteScraperWrapper';

/**
 * LangChain Tool that wraps a website scraper for arbitrary URLs.
 */
export const websiteScraperTool = tool(
  async ({ url }: { url: string }) => {
    const content: string = await scrapeWebsite(url);
    return content;
  },
  {
    name: 'website_scraper',
    description: 'Scrape website content from the given URL. The content can then be used by other tools, for example to extract email addresses or understand more about the company.',
    schema: z.object({
      url: z.string().describe("The fully qualified URL of the website to scrape (e.g., https://www.example.com)")
    })
  }
);
