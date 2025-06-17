-- Missing tables for Response Handler System
-- Run this in Supabase SQL Editor

-- Scheduled emails table (for campaign management)
CREATE TABLE IF NOT EXISTS scheduled_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_contact_id UUID REFERENCES campaign_contacts(id) ON DELETE CASCADE,
  
  -- Email content
  subject VARCHAR NOT NULL,
  content TEXT NOT NULL,
  email_type VARCHAR DEFAULT 'campaign', -- campaign/followup/response
  sequence_number INTEGER DEFAULT 1,
  
  -- Scheduling
  scheduled_send_time TIMESTAMP WITH TIME ZONE NOT NULL,
  actual_send_time TIMESTAMP WITH TIME ZONE,
  
  -- Status tracking
  status VARCHAR DEFAULT 'scheduled', -- scheduled/sent/failed/cancelled
  mailgun_message_id VARCHAR,
  
  -- Error handling
  send_attempt_count INTEGER DEFAULT 0,
  last_error_message TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Automated responses table - tracks AI-generated responses
CREATE TABLE IF NOT EXISTS automated_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  email_response_id UUID REFERENCES email_responses(id) ON DELETE CASCADE,
  
  -- Response details
  response_type VARCHAR NOT NULL, -- answer/clarification/objection_handling/scheduling/closing
  response_subject VARCHAR,
  response_content TEXT NOT NULL,
  response_tone VARCHAR DEFAULT 'professional', -- professional/friendly/urgent/consultative
  
  -- AI generation data
  personalization_score INTEGER, -- 1-10 quality score
  generation_prompt TEXT, -- The prompt used to generate response
  generation_model VARCHAR DEFAULT 'gpt-4', -- Model used for generation
  
  -- Sending status
  send_status VARCHAR DEFAULT 'draft', -- draft/scheduled/sent/failed
  scheduled_send_time TIMESTAMP WITH TIME ZONE,
  actual_send_time TIMESTAMP WITH TIME ZONE,
  mailgun_message_id VARCHAR,
  
  -- Performance tracking
  send_attempt_count INTEGER DEFAULT 0,
  last_error_message TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversation analytics table - track conversation performance
CREATE TABLE IF NOT EXISTS conversation_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  analytics_date DATE NOT NULL,
  
  -- Response metrics
  total_responses_received INTEGER DEFAULT 0,
  positive_responses INTEGER DEFAULT 0,
  negative_responses INTEGER DEFAULT 0,
  questions_received INTEGER DEFAULT 0,
  objections_received INTEGER DEFAULT 0,
  unsubscribe_requests INTEGER DEFAULT 0,
  
  -- Conversation metrics
  conversations_started INTEGER DEFAULT 0,
  conversations_active INTEGER DEFAULT 0,
  conversations_converted INTEGER DEFAULT 0,
  conversations_closed INTEGER DEFAULT 0,
  
  -- Response handling metrics
  automated_responses_sent INTEGER DEFAULT 0,
  handoffs_triggered INTEGER DEFAULT 0,
  sequences_paused INTEGER DEFAULT 0,
  
  -- Performance metrics
  avg_response_time_hours DECIMAL(5,2), -- Average time to respond
  avg_conversation_length INTEGER, -- Average number of email exchanges
  response_quality_score DECIMAL(3,2), -- Average personalization score
  
  -- Conversion tracking
  meetings_scheduled INTEGER DEFAULT 0,
  sales_qualified_leads INTEGER DEFAULT 0,
  closed_deals INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one record per campaign per date
  UNIQUE(campaign_id, analytics_date)
);

-- Indexes for the missing tables
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_campaign_id ON scheduled_emails(campaign_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_contact_id ON scheduled_emails(contact_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_scheduled_time ON scheduled_emails(scheduled_send_time);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_status ON scheduled_emails(status);

CREATE INDEX IF NOT EXISTS idx_automated_responses_conversation_id ON automated_responses(conversation_id);
CREATE INDEX IF NOT EXISTS idx_automated_responses_send_status ON automated_responses(send_status);
CREATE INDEX IF NOT EXISTS idx_automated_responses_scheduled_time ON automated_responses(scheduled_send_time) WHERE send_status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_conversation_analytics_campaign_id ON conversation_analytics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_conversation_analytics_date ON conversation_analytics(analytics_date);

-- Comments for documentation
COMMENT ON TABLE scheduled_emails IS 'Queue for scheduled campaign emails and follow-ups';
COMMENT ON TABLE automated_responses IS 'Stores AI-generated responses and their sending status';
COMMENT ON TABLE conversation_analytics IS 'Daily analytics for conversation performance tracking';