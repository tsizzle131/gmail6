import { chromium, Browser } from 'playwright';

/**
 * Summarizes website content to extract only essential business information
 */
function summarizeWebsiteContent(content: string): string {
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  
  // Extract key information patterns
  const businessInfo: string[] = [];
  const contactInfo: string[] = [];
  const services: string[] = [];
  
  // Keywords for business information
  const businessKeywords = ['about', 'company', 'business', 'industry', 'founded', 'established', 'mission', 'vision', 'team', 'employees', 'staff'];
  const contactKeywords = ['contact', 'email', 'phone', 'address', 'location', '@', 'tel:', 'mailto:'];
  const serviceKeywords = ['services', 'products', 'solutions', 'offerings', 'expertise', 'specializes', 'consulting'];
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    // Skip navigation, footer, and common website elements
    if (lowerLine.includes('cookie') || lowerLine.includes('privacy') || 
        lowerLine.includes('terms') || lowerLine.includes('copyright') ||
        lowerLine.includes('all rights reserved') || lowerLine.includes('menu') ||
        lowerLine.includes('navigation') || line.length < 10) {
      continue;
    }
    
    // Extract contact information
    if (contactKeywords.some(keyword => lowerLine.includes(keyword)) || 
        line.includes('@') || line.match(/\d{3}[-.]?\d{3}[-.]?\d{4}/)) {
      contactInfo.push(line.trim());
    }
    
    // Extract business information
    else if (businessKeywords.some(keyword => lowerLine.includes(keyword))) {
      businessInfo.push(line.trim());
    }
    
    // Extract services information
    else if (serviceKeywords.some(keyword => lowerLine.includes(keyword))) {
      services.push(line.trim());
    }
  }
  
  // Build summary with limits to prevent token explosion
  const summary = [];
  
  if (businessInfo.length > 0) {
    summary.push('BUSINESS INFO:');
    summary.push(...businessInfo.slice(0, 5)); // Limit to 5 lines
    summary.push('');
  }
  
  if (services.length > 0) {
    summary.push('SERVICES:');
    summary.push(...services.slice(0, 3)); // Limit to 3 lines
    summary.push('');
  }
  
  if (contactInfo.length > 0) {
    summary.push('CONTACT INFO:');
    summary.push(...contactInfo.slice(0, 5)); // Limit to 5 lines
  }
  
  const result = summary.join('\n').substring(0, 2000); // Hard limit to 2000 chars
  console.log(`[summarizeWebsiteContent] Reduced content from ${content.length} to ${result.length} characters`);
  
  return result || 'No relevant business information found on website.';
}

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
  console.log(`[scrapeWebsite] Starting scrape for: ${url}`);
  try {  
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
  
    // Summarize content to reduce token usage
    const fullContent = contactPageContent + '\n\n--- Main Page Content ---\n\n' + mainContent;
    const result = summarizeWebsiteContent(fullContent);
    console.log(`[scrapeWebsite] Successfully scraped and summarized: ${url}`);
    return result;
  } catch (error) {
    console.error(`[scrapeWebsite] Error in scrapeWebsite for ${url}:`, error);
    throw error;
  }
}