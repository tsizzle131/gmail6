import { chromium } from 'playwright';

export interface Place {
  name: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviews?: number;
  latitude?: number;
  longitude?: number;
}

/**
 * Uses Playwright to scrape Google Maps search results for place data.
 * Reason: Replace external CLI scraper with an in-process browser-based scraper for better control and cross-platform support.
 */
export async function scrapeGoogleMaps(query: string): Promise<Place[]> {
  console.log(`[scrapeGoogleMaps] Starting Google Maps scrape for query: "${query}"`);
  try {
    const browser = await chromium.launch({ headless: true }); // Changed back to headless for production
    const context = await browser.newContext();
    const page = await context.newPage();
  console.log(`[scrapeGoogleMaps] Navigating to: https://www.google.com/maps/search/${encodeURIComponent(query)}`);
  try {
    await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log("[scrapeGoogleMaps] Page loaded. Waiting for result items ('a.hfpxzc')...");
    // Increased timeout and added a small delay to see if it helps with dynamic content loading
    await page.waitForTimeout(2000); // Wait 2 seconds for any dynamic content
    await page.waitForSelector('a.hfpxzc', { timeout: 25000, state: 'visible' });
    console.log("[scrapeGoogleMaps] Selector 'a.hfpxzc' found.");
  } catch (e: any) {
    console.error(`[scrapeGoogleMaps] Timeout or error before finding results selector: ${e.message}`);
    await page.screenshot({ path: 'error_screenshot.png' });
    console.error("[scrapeGoogleMaps] Screenshot saved to error_screenshot.png");
    await browser.close();
    throw e; // Re-throw the error to be caught by the tool
  }

  // Extract basic place info and detail page URLs
  const rawPlaces = await page.evaluate(() => {
    const linkEls = Array.from(document.querySelectorAll('a.hfpxzc')) as HTMLAnchorElement[];
    return linkEls.map(linkEl => {
      const container = linkEl.parentElement as HTMLElement;
      const name = linkEl.getAttribute('aria-label')?.trim() || '';
      const href = linkEl.href;
      // Extract address and phone from info divs
      const infoDivs = Array.from(container.querySelectorAll('div.W4Efsd')) as HTMLElement[];
      let address = '';
      let phone = '';
      if (infoDivs.length >= 3) {
        const parts = infoDivs[2].innerText.split('·').map((p: string) => p.trim()).filter((p: string) => Boolean(p));
        address = parts[parts.length - 1] || '';
      }
      if (infoDivs.length >= 4) {
        const parts2 = infoDivs[3].innerText.split('·').map((p: string) => p.trim()).filter((p: string) => Boolean(p));
        phone = parts2[parts2.length - 1] || '';
      }
      // Coordinates from link
      const coordsMatch = href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      const latitude = coordsMatch ? parseFloat(coordsMatch[1]) : undefined;
      const longitude = coordsMatch ? parseFloat(coordsMatch[2]) : undefined;
      return { name, address, phone, latitude, longitude, href };
    });
  });

  // Filter out any items without a valid href
  const validRawPlaces = rawPlaces.filter((p: any) => typeof p.href === 'string' && p.href);

  const results: Place[] = [];
  for (const raw of validRawPlaces) {
    const detailPage = await context.newPage();
    let website: string | undefined;
    try {
      await detailPage.goto(raw.href, { waitUntil: 'domcontentloaded' });
      // Attempt to extract website URL
      try {
        await detailPage.waitForSelector('a[data-tooltip="Open website"]', { timeout: 5000 });
        website = await detailPage.$eval('a[data-tooltip="Open website"]', (el: HTMLAnchorElement) => el.href);
      } catch {
        // No website link found
      }
      await detailPage.close();
    } catch (err: any) {
      console.warn(`[scrapeGoogleMaps] Failed to load detail page for ${raw.href}: ${err.message}`);
    }
    // Push even if website extraction failed
    results.push({
      name: raw.name,
      address: raw.address,
      phone: raw.phone,
      latitude: raw.latitude,
      longitude: raw.longitude,
      website,
    });
  }

    await browser.close();
    console.log(`[scrapeGoogleMaps] Successfully scraped ${results.length} places for query: "${query}"`);
    return results;
  } catch (error) {
    console.error(`[scrapeGoogleMaps] Error in scrapeGoogleMaps for query "${query}":`, error);
    throw error;
  }
}
