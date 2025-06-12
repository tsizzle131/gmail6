-- Add new columns to the contacts table to store enriched lead information

ALTER TABLE public.contacts
ADD COLUMN description TEXT NULL,
ADD COLUMN headcount VARCHAR(255) NULL,
ADD COLUMN roles TEXT[] NULL, -- PostgreSQL array of strings
ADD COLUMN lead_score INTEGER NULL,
ADD COLUMN source_google_maps_data JSONB NULL, -- To store raw Google Maps JSON
ADD COLUMN source_perplexity_research TEXT NULL, -- To store raw Perplexity research text
ADD COLUMN phone_number VARCHAR(50) NULL,
ADD COLUMN address TEXT NULL,
ADD COLUMN last_enriched_at TIMESTAMPTZ NULL; -- Timestamp with time zone

-- Ensure company_id column exists as per databaseWriterWrapper logic (it should from PLANNING.md)
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES public.companies(id);

-- Optional: Add/confirm index for domain if not present from PLANNING.md schema for contacts
-- The original PLANNING.md schema for contacts didn't explicitly show an index on domain, but it's good for lookups.
CREATE INDEX IF NOT EXISTS idx_contacts_domain ON public.contacts(domain);

COMMENT ON COLUMN public.contacts.description IS 'Company description obtained from enrichment process.';
COMMENT ON COLUMN public.contacts.headcount IS 'Estimated company headcount.';
COMMENT ON COLUMN public.contacts.roles IS 'Potential roles or job titles identified.';
COMMENT ON COLUMN public.contacts.lead_score IS 'Calculated lead quality score (e.g., 0-100).';
COMMENT ON COLUMN public.contacts.source_google_maps_data IS 'Raw data returned from Google Maps API for this contact/company.';
COMMENT ON COLUMN public.contacts.source_perplexity_research IS 'Raw research text obtained from Perplexity for this contact/company.';
COMMENT ON COLUMN public.contacts.phone_number IS 'Contact phone number, typically from Google Maps.';
COMMENT ON COLUMN public.contacts.address IS 'Company address, typically from Google Maps.';
COMMENT ON COLUMN public.contacts.last_enriched_at IS 'Timestamp of when this lead was last enriched by the agent.';

-- Note: The `website_content` column is assumed to exist as per PLANNING.md and Supabase list_tables output.
-- If `campaign_id` needs to be nullable and it isn't:
-- ALTER TABLE public.contacts ALTER COLUMN campaign_id DROP NOT NULL; 