"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const leadEnrichmentWrapper_1 = require("../src/agents/tools/leadEnrichmentWrapper");
// Verify script execution
console.log('Script started');
(async () => {
    try {
        const result = await (0, leadEnrichmentWrapper_1.enrichLead)({
            name: 'Example Company',
            website: 'https://example.com',
        });
        console.log('Lead Enrichment Result:\n', JSON.stringify(result, null, 2));
    }
    catch (err) {
        console.error('Error during enrichment:', err);
    }
})();
