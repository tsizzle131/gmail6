import { z } from 'zod';

export const contactSchema = z.object({
  campaign_id: z.string().uuid(),
  email: z.string().email(),
  company_name: z.string().optional(),
  domain: z.string().optional(),
  industry: z.string().optional(),
  website_content: z.string().optional(),
});

type ContactInput = z.infer<typeof contactSchema>;
export type { ContactInput };
