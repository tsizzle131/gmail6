import { z } from 'zod';

export const campaignSchema = z.object({
  name: z.string().min(1),
  product_name: z.string().min(1),
  product_description: z.string().min(1),
  product_link: z.string().url(),
  company_id: z.string().uuid(),
  emails_per_week: z.number().optional(),
  campaign_duration_weeks: z.number().optional(),
});

type CampaignInput = z.infer<typeof campaignSchema>;
export type { CampaignInput };
