import { extractEmails } from '../../../src/agents/tools/emailExtractionWrapper';
import dns from 'dns';

jest.mock('dns', () => ({
  promises: {
    resolveMx: jest.fn(),
  },
}));

const { resolveMx } = dns.promises as jest.Mocked<typeof dns.promises>;

describe('extractEmails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('extracts, deduplicates, and validates domains with MX records', async () => {
    const text = 'Contact us at Test@Example.com or test@example.COM and ignore no-reply@invalid.tld';
    // Mock domain validation
    (resolveMx as jest.Mock).mockImplementation(async (domain: string) => {
      if (domain === 'example.com') return [{ exchange: 'mail.example.com', priority: 10 } as any];
      throw new Error('No MX records');
    });

    const emails = await extractEmails(text);
    expect(resolveMx).toHaveBeenCalledWith('example.com');
    expect(resolveMx).toHaveBeenCalledWith('invalid.tld');
    expect(emails).toEqual(['test@example.com']);
  });

  it('returns empty array when no emails found', async () => {
    const text = 'No emails here!';
    const emails = await extractEmails(text);
    expect(emails).toEqual([]);
    expect(resolveMx).not.toHaveBeenCalled();
  });
});