import dns from 'dns';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Extracts and validates email addresses from text.
 * - Uses regex to find candidates
 * - Normalizes to lowercase and deduplicates
 * - Validates domain via MX record lookup
 */
export async function extractEmails(text: string): Promise<string[]> {
  if (!text || typeof text !== 'string') {
    return [];
  }
  const matches = text.match(EMAIL_REGEX) || [];
  const uniqueEmails = Array.from(new Set(matches.map(e => e.toLowerCase())));
  const validEmails: string[] = [];
  for (const email of uniqueEmails) {
    const domain = email.split('@')[1];
    try {
      const mxRecords = await dns.promises.resolveMx(domain);
      if (mxRecords && mxRecords.length > 0) {
        validEmails.push(email);
      }
    } catch {
      // skip domains without MX records
    }
  }
  return validEmails;
}