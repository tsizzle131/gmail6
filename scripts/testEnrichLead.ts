import 'dotenv/config';
import config from '../src/config';
import { enrichLead } from '../src/agents/tools/leadEnrichmentWrapper';

// Verify script execution
console.log('Script started');

(async () => {
  try {
    const result = await enrichLead({
      name: 'Example Company',
      website: 'https://example.com',
    });
    console.log('Lead Enrichment Result:\n', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error during enrichment:', err);
  }
})();