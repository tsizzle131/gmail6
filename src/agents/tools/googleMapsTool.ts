import { tool } from '@langchain/core/tools';
import { z } from 'zod'; // Import Zod
import { scrapeGoogleMaps, Place } from './googleMapsWrapper';

/**
 * LangChain Tool that wraps the Google Maps scraper.
 */
export const googleMapsTool = tool(
  async ({ input }: { input: string }) => { // Changed from query to input
    console.log("[googleMapsTool] Entering with input:", JSON.stringify(input, null, 2));
    const results: Place[] = await scrapeGoogleMaps(input); // Pass input as query
    console.log("[googleMapsTool] Exiting with results (first 3 shown if many):", JSON.stringify(results.slice(0,3), null, 2));
    // Return JSON string for downstream parsers
    return results;
  },
  {
    name: 'google_maps_search',
    description: 'Scrape Google Maps for business listings matching a query; returns JSON array of place objects',
    schema: z.object({ // Define explicit schema
      input: z.string().describe("The search query string for Google Maps")
    })
  }
);
