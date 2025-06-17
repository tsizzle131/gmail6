-- Supabase-optimized SQL for missing tables
-- Copy and paste this into Supabase SQL Editor

-- Table 1: scheduled_emails
CREATE TABLE scheduled_emails (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_contact_id uuid REFERENCES campaign_contacts(id) ON DELETE CASCADE,
  subject text NOT NULL,
  content text NOT NULL,
  email_type text DEFAULT 'campaign',
  sequence_number integer DEFAULT 1,
  scheduled_send_time timestamptz NOT NULL,
  actual_send_time timestamptz,
  status text DEFAULT 'scheduled',
  mailgun_message_id text,
  send_attempt_count integer DEFAULT 0,
  last_error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table 2: automated_responses  
CREATE TABLE automated_responses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  email_response_id uuid REFERENCES email_responses(id) ON DELETE CASCADE,
  response_type text NOT NULL,
  response_subject text,
  response_content text NOT NULL,
  response_tone text DEFAULT 'professional',
  personalization_score integer,
  generation_prompt text,
  generation_model text DEFAULT 'gpt-4',
  send_status text DEFAULT 'draft',
  scheduled_send_time timestamptz,
  actual_send_time timestamptz,
  mailgun_message_id text,
  send_attempt_count integer DEFAULT 0,
  last_error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table 3: conversation_analytics
CREATE TABLE conversation_analytics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  analytics_date date NOT NULL,
  total_responses_received integer DEFAULT 0,
  positive_responses integer DEFAULT 0,
  negative_responses integer DEFAULT 0,
  questions_received integer DEFAULT 0,
  objections_received integer DEFAULT 0,
  unsubscribe_requests integer DEFAULT 0,
  conversations_started integer DEFAULT 0,
  conversations_active integer DEFAULT 0,
  conversations_converted integer DEFAULT 0,
  conversations_closed integer DEFAULT 0,
  automated_responses_sent integer DEFAULT 0,
  handoffs_triggered integer DEFAULT 0,
  sequences_paused integer DEFAULT 0,
  avg_response_time_hours numeric(5,2),
  avg_conversation_length integer,
  response_quality_score numeric(3,2),
  meetings_scheduled integer DEFAULT 0,
  sales_qualified_leads integer DEFAULT 0,
  closed_deals integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(campaign_id, analytics_date)
);

-- Create indexes
CREATE INDEX idx_scheduled_emails_campaign_id ON scheduled_emails(campaign_id);
CREATE INDEX idx_scheduled_emails_status ON scheduled_emails(status);
CREATE INDEX idx_automated_responses_conversation_id ON automated_responses(conversation_id);
CREATE INDEX idx_conversation_analytics_campaign_id ON conversation_analytics(campaign_id);