-- Response Handler System Migration
-- Adds conversation management, email response tracking, and response classification

-- Email responses table - tracks incoming replies and their classifications
CREATE TABLE IF NOT EXISTS email_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_contact_id UUID REFERENCES campaign_contacts(id) ON DELETE CASCADE,
  
  -- Email identification
  original_email_id VARCHAR, -- Mailgun message ID of our outbound email
  response_email_id VARCHAR UNIQUE, -- Mailgun message ID of their reply
  response_subject VARCHAR,
  response_content TEXT NOT NULL,
  response_from_email VARCHAR NOT NULL,
  response_to_email VARCHAR NOT NULL,
  
  -- Classification results
  classification VARCHAR NOT NULL, -- interested/not_interested/question/objection/unsubscribe/auto_reply
  sentiment_score DECIMAL(3,2), -- -1.0 to 1.0 sentiment score
  confidence_score DECIMAL(3,2), -- 0.0 to 1.0 classification confidence
  intent_summary TEXT, -- Brief summary of what they want
  
  -- Response handling
  requires_response BOOLEAN DEFAULT true,
  urgency_level VARCHAR DEFAULT 'medium', -- low/medium/high/urgent
  response_generated BOOLEAN DEFAULT false,
  response_sent_at TIMESTAMP WITH TIME ZONE,
  
  -- Processing status
  processed_at TIMESTAMP WITH TIME ZONE,
  processing_status VARCHAR DEFAULT 'pending', -- pending/processed/failed/skipped
  processing_error TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversations table - manages email conversation context and state
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_contact_id UUID REFERENCES campaign_contacts(id) ON DELETE CASCADE,
  
  -- Conversation status
  conversation_status VARCHAR DEFAULT 'active', -- active/paused/responded/converted/closed/unsubscribed
  conversation_stage VARCHAR DEFAULT 'cold_outreach', -- cold_outreach/engaged/interested/qualified/objection_handling/closing
  
  -- Response tracking
  total_responses INTEGER DEFAULT 0,
  last_response_at TIMESTAMP WITH TIME ZONE,
  last_outbound_at TIMESTAMP WITH TIME ZONE,
  first_response_at TIMESTAMP WITH TIME ZONE,
  
  -- Context and summary
  context_summary TEXT, -- AI-generated summary of conversation so far
  key_points JSONB, -- Structured data about interests, objections, next steps
  conversation_sentiment DECIMAL(3,2), -- Overall sentiment trend
  
  -- Action flags
  requires_handoff BOOLEAN DEFAULT false,
  handoff_reason VARCHAR, -- qualified/meeting_request/complex_question/pricing_discussion
  handoff_triggered_at TIMESTAMP WITH TIME ZONE,
  
  sequence_paused BOOLEAN DEFAULT false,
  sequence_paused_at TIMESTAMP WITH TIME ZONE,
  sequence_pause_reason VARCHAR,
  
  -- Next actions
  next_action VARCHAR, -- respond/schedule_followup/handoff/close/archive
  next_action_scheduled_for TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one conversation per campaign-contact pair
  UNIQUE(campaign_id, contact_id)
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_responses_campaign_id ON email_responses(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_responses_contact_id ON email_responses(contact_id);
CREATE INDEX IF NOT EXISTS idx_email_responses_response_email_id ON email_responses(response_email_id);
CREATE INDEX IF NOT EXISTS idx_email_responses_classification ON email_responses(classification);
CREATE INDEX IF NOT EXISTS idx_email_responses_processing_status ON email_responses(processing_status);

CREATE INDEX IF NOT EXISTS idx_conversations_campaign_id ON conversations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(conversation_status);
CREATE INDEX IF NOT EXISTS idx_conversations_requires_handoff ON conversations(requires_handoff) WHERE requires_handoff = true;
CREATE INDEX IF NOT EXISTS idx_conversations_sequence_paused ON conversations(sequence_paused) WHERE sequence_paused = true;

CREATE INDEX IF NOT EXISTS idx_automated_responses_conversation_id ON automated_responses(conversation_id);
CREATE INDEX IF NOT EXISTS idx_automated_responses_send_status ON automated_responses(send_status);
CREATE INDEX IF NOT EXISTS idx_automated_responses_scheduled_time ON automated_responses(scheduled_send_time) WHERE send_status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_conversation_analytics_campaign_id ON conversation_analytics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_conversation_analytics_date ON conversation_analytics(analytics_date);

-- Comments for documentation
COMMENT ON TABLE email_responses IS 'Tracks incoming email replies and their AI classifications';
COMMENT ON TABLE conversations IS 'Manages email conversation context and state for each contact';
COMMENT ON TABLE automated_responses IS 'Stores AI-generated responses and their sending status';
COMMENT ON TABLE conversation_analytics IS 'Daily analytics for conversation performance tracking';