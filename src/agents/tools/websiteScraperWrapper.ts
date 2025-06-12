import { chromium, Browser } from 'playwright';

/**
 * Scrapes the HTML content of a webpage at the given URL using Playwright.
 */
async function getBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

export async function scrapeWebsite(url: string): Promise<string> {
  const browserInstance = await getBrowser();
  const context = await browserInstance.newContext();
  const page = await context.newPage();
  let mainContent = '';
  let contactPageContent = '';

  const commonContactPaths = [
    '/contact',
    '/contact-us',
    '/contactus',
    '/about/contact',
    '/about-us/contact',
    '/support',
    '/help',
    '/legal/contact',
    '/company/contact',
  ];

  try {
    console.log(`[scrapeWebsite] Scraping main URL: ${url}`);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!response) {
      console.warn(`[scrapeWebsite] Failed to navigate to ${url}, no response object.`);
      mainContent = `Scraping failed: Could not navigate to ${url}.`;
    } else {
      await page.waitForLoadState('load', { timeout: 30000 });
      mainContent = await page.evaluate(() => {
        return document.body?.innerText || '';
      });
      console.log(`[scrapeWebsite] Successfully scraped main URL: ${url}. Length: ${mainContent.length}`);

      // Attempt to find and scrape a contact page
      const baseUrlObject = new URL(url);
      const origin = baseUrlObject.origin;

      for (const path of commonContactPaths) {
        const contactUrl = origin + path;
        try {
          console.log(`[scrapeWebsite] Attempting to scrape contact page: ${contactUrl}`);
          const contactResponse = await page.goto(contactUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          if (contactResponse && contactResponse.ok()) {
            await page.waitForLoadState('load', { timeout: 15000 });
            const cpContent = await page.evaluate(() => document.body?.innerText || '');
            if (cpContent.length > 0) {
              contactPageContent = cpContent;
              console.log(`[scrapeWebsite] Successfully scraped contact page: ${contactUrl}. Length: ${contactPageContent.length}`);
              break; // Found a contact page, no need to check others
            }
          }
        } catch (contactError) {
          console.warn(`[scrapeWebsite] Could not scrape contact page ${contactUrl}: ${(contactError as Error).message}`);
          // Continue to try other paths
        }
      }
    }
  } catch (e) {
    console.error(`[scrapeWebsite] Error scraping ${url}:`, e);
    mainContent = `Scraping failed for ${url}: ${(e as Error).message}`;
  } finally {
    await context.close();
    // Consider closing browserInstance if it's not reused elsewhere or if many scrapers run
    // await browserInstance.close(); 
  }
  return contactPageContent + '\n\n--- Main Page Content ---\n\n' + mainContent;
}