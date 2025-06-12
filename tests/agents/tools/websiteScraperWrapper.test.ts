import { scrapeWebsite } from '../../../src/agents/tools/websiteScraperWrapper';
import { chromium, Browser, BrowserContext, Page } from 'playwright';

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn()
  }
}));

describe('scrapeWebsite', () => {
  let mockBrowser: Partial<Browser>;
  let mockContext: Partial<BrowserContext>;
  let mockPage: Partial<Page>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPage = {
      goto: jest.fn(),
      waitForLoadState: jest.fn(),
      content: jest.fn()
    } as any;

    mockContext = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockBrowser = {
      newContext: jest.fn().mockResolvedValue(mockContext)
    } as any;

    (chromium.launch as jest.Mock).mockResolvedValue(mockBrowser);
  });

  it('returns page content when navigation succeeds', async () => {
    const url = 'http://example.com';
    // @ts-ignore
    mockPage.goto.mockResolvedValue({} as any);
    // @ts-ignore
    mockPage.waitForLoadState.mockResolvedValue(undefined);
    // @ts-ignore
    mockPage.content.mockResolvedValue('<html>hello</html>');

    const result = await scrapeWebsite(url);

    expect(chromium.launch).toHaveBeenCalledWith({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    // @ts-ignore
    expect(mockBrowser.newContext).toHaveBeenCalled();
    expect(mockContext.newPage).toHaveBeenCalled();
    // @ts-ignore
    expect(mockPage.goto).toHaveBeenCalledWith(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // @ts-ignore
    expect(mockPage.waitForLoadState).toHaveBeenCalledWith('networkidle', { timeout: 30000 });
    expect(result).toBe('<html>hello</html>');
    // @ts-ignore
    expect(mockContext.close).toHaveBeenCalled();
  });

  it('throws when navigation fails', async () => {
    const url = 'http://example.com';
    // simulate goto returning null
    // @ts-ignore
    mockPage.goto.mockResolvedValue(null);

    await expect(scrapeWebsite(url)).rejects.toThrow(`Failed to navigate to ${url}`);
    // @ts-ignore
    expect(mockContext.close).toHaveBeenCalled();
  });
});
