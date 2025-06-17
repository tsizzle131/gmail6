-- Campaign Manager System Migration
-- Adds campaign sequence management, contact progression tracking, and email scheduling

-- Campaign Sequences table - predefined email templates for campaigns
CREATE TABLE IF NOT EXISTS campaign_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  
  -- Sequence details
  sequence_name VARCHAR NOT NULL, -- e.g., "6-Week SaaS Outreach"
  total_emails INTEGER DEFAULT 12, -- 6 weeks * 2 emails per week
  email_interval_days INTEGER DEFAULT 3, -- Days between emails (3-4 day pattern)
  
  -- Sequence templates
  email_templates JSONB, -- Array of email template configs
  
  -- Timing configuration
  send_days VARCHAR[] DEFAULT ARRAY['Tuesday', 'Thursday'], -- Days of week to send
  send_time_hour INTEGER DEFAULT 10, -- Hour to send (24hr format)
  send_time_timezone VARCHAR DEFAULT 'America/New_York',
  
  -- Status and settings
  is_active BOOLEAN DEFAULT true,
  auto_progression BOOLEAN DEFAULT true, -- Auto-advance contacts through sequence
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Campaign Contacts table - tracks individual contact progression through campaigns
CREATE TABLE IF NOT EXISTS campaign_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  sequence_id UUID REFERENCES campaign_sequences(id) ON DELETE SET NULL,
  
  -- Contact progression
  current_email_number INTEGER DEFAULT 0, -- Which email in sequence (0 = not started)
  contact_status VARCHAR DEFAULT 'active', -- active, paused, responded, converted, unsubscribed, bounced
  progression_stage VARCHAR DEFAULT 'cold', -- cold, engaged, interested, qualified, converted
  
  -- Scheduling
  next_email_scheduled_at TIMESTAMP WITH TIME ZONE,
  last_email_sent_at TIMESTAMP WITH TIME ZONE,
  sequence_started_at TIMESTAMP WITH TIME ZONE,
  sequence_completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Response tracking
  total_emails_sent INTEGER DEFAULT 0,
  total_opens INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  responded_at TIMESTAMP WITH TIME ZONE,
  converted_at TIMESTAMP WITH TIME ZONE,
  
  -- Campaign performance
  engagement_score INTEGER DEFAULT 0, -- 0-100 based on opens/clicks/responses
  personalization_score INTEGER DEFAULT 0, -- AI personalization score for this contact
  
  -- Manual overrides
  is_manually_paused BOOLEAN DEFAULT false,
  pause_reason VARCHAR,
  notes TEXT,
  
  -- Metadata
  added_to_campaign_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one contact per campaign
  UNIQUE(campaign_id, contact_id)
);

-- Scheduled Emails table - email queue for campaign automation
CREATE TABLE IF NOT EXISTS scheduled_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_contact_id UUID REFERENCES campaign_contacts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  
  -- Email details
  email_sequence_number INTEGER NOT NULL,
  email_template_id VARCHAR, -- Reference to template in sequence
  subject VARCHAR,
  email_content TEXT,
  
  -- Scheduling
  scheduled_send_time TIMESTAMP WITH TIME ZONE NOT NULL,
  actual_send_time TIMESTAMP WITH TIME ZONE,
  
  -- Status
  status VARCHAR DEFAULT 'scheduled', -- scheduled, sending, sent, failed, cancelled
  priority INTEGER DEFAULT 5, -- 1-10 priority for queue processing
  
  -- Tracking
  mailgun_message_id VARCHAR,
  send_attempt_count INTEGER DEFAULT 0,
  last_error_message TEXT,
  
  -- Personalization data (stored for email generation)
  personalization_data JSONB,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Campaign Analytics table - track campaign performance metrics
CREATE TABLE IF NOT EXISTS campaign_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  
  -- Date tracking
  analytics_date DATE NOT NULL,
  
  -- Email metrics
  emails_scheduled INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  emails_delivered INTEGER DEFAULT 0,
  emails_bounced INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  emails_clicked INTEGER DEFAULT 0,
  
  -- Response metrics
  responses_received INTEGER DEFAULT 0,
  positive_responses INTEGER DEFAULT 0,
  negative_responses INTEGER DEFAULT 0,
  meetings_scheduled INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  
  -- Contact progression
  contacts_active INTEGER DEFAULT 0,
  contacts_engaged INTEGER DEFAULT 0,
  contacts_responded INTEGER DEFAULT 0,
  contacts_converted INTEGER DEFAULT 0,
  contacts_unsubscribed INTEGER DEFAULT 0,
  
  -- Performance calculations
  open_rate DECIMAL(5,2), -- Percentage
  click_rate DECIMAL(5,2),
  response_rate DECIMAL(5,2),
  conversion_rate DECIMAL(5,2),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one record per campaign per date
  UNIQUE(campaign_id, analytics_date)
);

-- Campaign Settings table - additional campaign configuration
CREATE TABLE IF NOT EXISTS campaign_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  
  -- Rate limiting
  max_emails_per_hour INTEGER DEFAULT 50,
  max_emails_per_day INTEGER DEFAULT 200,
  
  -- Safety thresholds
  max_bounce_rate DECIMAL(5,2) DEFAULT 5.0, -- Auto-pause if bounce rate exceeds
  max_spam_complaint_rate DECIMAL(5,2) DEFAULT 1.0,
  
  -- AI personalization settings
  min_personalization_score INTEGER DEFAULT 7, -- Don't send if score below this
  use_rag_knowledge BOOLEAN DEFAULT true,
  personalization_approach VARCHAR DEFAULT 'value_proposition',
  email_tone VARCHAR DEFAULT 'professional',
  
  -- Timing optimization
  optimize_send_times BOOLEAN DEFAULT true,
  respect_recipient_timezone BOOLEAN DEFAULT true,
  avoid_weekends BOOLEAN DEFAULT true,
  avoid_holidays BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- One settings record per campaign
  UNIQUE(campaign_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaign_sequences_campaign_id ON campaign_sequences(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign_id ON campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_contact_id ON campaign_contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_status ON campaign_contacts(contact_status);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_next_scheduled ON campaign_contacts(next_email_scheduled_at) WHERE contact_status = 'active';

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_campaign_id ON scheduled_emails(campaign_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_contact_id ON scheduled_emails(contact_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_scheduled_time ON scheduled_emails(scheduled_send_time) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_status ON scheduled_emails(status);

CREATE INDEX IF NOT EXISTS idx_campaign_analytics_campaign_id ON campaign_analytics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_analytics_date ON campaign_analytics(analytics_date);

-- Comments for documentation
COMMENT ON TABLE campaign_sequences IS 'Email sequence templates and configuration for campaigns';
COMMENT ON TABLE campaign_contacts IS 'Individual contact progression tracking through campaigns';
COMMENT ON TABLE scheduled_emails IS 'Email queue for automated campaign sending';
COMMENT ON TABLE campaign_analytics IS 'Daily campaign performance metrics and analytics';
COMMENT ON TABLE campaign_settings IS 'Campaign configuration and safety settings';