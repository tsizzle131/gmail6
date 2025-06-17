-- Gmail Integration Migration
-- Adds Gmail account management and authentication infrastructure

-- Gmail accounts table - stores user's connected Gmail accounts
CREATE TABLE IF NOT EXISTS gmail_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- Account information
  email VARCHAR NOT NULL UNIQUE,
  display_name VARCHAR,
  profile_picture_url VARCHAR,
  
  -- OAuth2 tokens (encrypted)
  refresh_token_encrypted TEXT NOT NULL,
  access_token_encrypted TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  scope VARCHAR NOT NULL DEFAULT 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',
  
  -- Usage tracking
  daily_send_count INTEGER DEFAULT 0,
  daily_send_limit INTEGER DEFAULT 500,
  weekly_send_count INTEGER DEFAULT 0,
  monthly_send_count INTEGER DEFAULT 0,
  last_send_reset DATE DEFAULT CURRENT_DATE,
  
  -- Account health
  account_status VARCHAR DEFAULT 'active' CHECK (account_status IN ('active', 'paused', 'suspended', 'error', 'disconnected')),
  health_score INTEGER DEFAULT 100 CHECK (health_score >= 0 AND health_score <= 100),
  last_health_check TIMESTAMP WITH TIME ZONE,
  last_error_message TEXT,
  consecutive_errors INTEGER DEFAULT 0,
  
  -- Reputation tracking
  bounce_count INTEGER DEFAULT 0,
  complaint_count INTEGER DEFAULT 0,
  unsubscribe_count INTEGER DEFAULT 0,
  successful_sends INTEGER DEFAULT 0,
  
  -- Account settings
  is_primary BOOLEAN DEFAULT false,
  send_enabled BOOLEAN DEFAULT true,
  timezone VARCHAR DEFAULT 'UTC',
  preferred_send_times JSONB, -- Array of hour ranges like [{"start": 9, "end": 17}]
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_gmail_accounts_user_id ON gmail_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_gmail_accounts_email ON gmail_accounts(email);
CREATE INDEX IF NOT EXISTS idx_gmail_accounts_status ON gmail_accounts(account_status);

-- Gmail push subscriptions table - for real-time notifications
CREATE TABLE IF NOT EXISTS gmail_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_account_id UUID REFERENCES gmail_accounts(id) ON DELETE CASCADE,
  
  -- Google Pub/Sub configuration
  topic_name VARCHAR NOT NULL,
  subscription_name VARCHAR NOT NULL,
  push_endpoint VARCHAR NOT NULL,
  
  -- Subscription management
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE,
  last_notification_at TIMESTAMP WITH TIME ZONE,
  notification_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for push subscriptions
CREATE INDEX IF NOT EXISTS idx_gmail_push_subscriptions_account ON gmail_push_subscriptions(gmail_account_id);
CREATE INDEX IF NOT EXISTS idx_gmail_push_subscriptions_active ON gmail_push_subscriptions(is_active);

-- Gmail messages table - tracks sent/received messages
CREATE TABLE IF NOT EXISTS gmail_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_account_id UUID REFERENCES gmail_accounts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  
  -- Gmail message identification
  gmail_message_id VARCHAR NOT NULL, -- Gmail's internal message ID
  gmail_thread_id VARCHAR NOT NULL, -- Gmail's thread ID for conversation grouping
  message_type VARCHAR NOT NULL CHECK (message_type IN ('outbound', 'inbound')),
  
  -- Message content
  subject VARCHAR,
  snippet TEXT, -- Gmail's snippet preview
  content_text TEXT,
  content_html TEXT,
  
  -- Message metadata
  from_email VARCHAR NOT NULL,
  to_email VARCHAR NOT NULL,
  cc_emails JSONB, -- Array of CC email addresses
  bcc_emails JSONB, -- Array of BCC email addresses
  
  -- Tracking
  sent_at TIMESTAMP WITH TIME ZONE,
  received_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  
  -- Labels and flags
  gmail_labels JSONB, -- Array of Gmail label IDs
  is_read BOOLEAN DEFAULT false,
  is_starred BOOLEAN DEFAULT false,
  is_important BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(gmail_account_id, gmail_message_id)
);

-- Indexes for Gmail messages
CREATE INDEX IF NOT EXISTS idx_gmail_messages_account ON gmail_messages(gmail_account_id);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_thread ON gmail_messages(gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_campaign ON gmail_messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_contact ON gmail_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_type ON gmail_messages(message_type);

-- Gmail quota usage table - tracks API usage
CREATE TABLE IF NOT EXISTS gmail_quota_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_account_id UUID REFERENCES gmail_accounts(id) ON DELETE CASCADE,
  
  -- Usage tracking
  date DATE NOT NULL,
  api_calls_count INTEGER DEFAULT 0,
  emails_sent_count INTEGER DEFAULT 0,
  emails_received_count INTEGER DEFAULT 0,
  
  -- Quota limits
  daily_api_limit INTEGER DEFAULT 1000000, -- Gmail API limit
  daily_send_limit INTEGER DEFAULT 500, -- Per account send limit
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(gmail_account_id, date)
);

-- Index for quota usage
CREATE INDEX IF NOT EXISTS idx_gmail_quota_usage_account_date ON gmail_quota_usage(gmail_account_id, date);

-- Update email_history table to support Gmail message IDs
ALTER TABLE email_history 
ADD COLUMN IF NOT EXISTS gmail_message_id VARCHAR,
ADD COLUMN IF NOT EXISTS gmail_thread_id VARCHAR,
ADD COLUMN IF NOT EXISTS gmail_account_id UUID REFERENCES gmail_accounts(id);

-- Update scheduled_emails table to support Gmail accounts
ALTER TABLE scheduled_emails
ADD COLUMN IF NOT EXISTS gmail_account_id UUID REFERENCES gmail_accounts(id),
ADD COLUMN IF NOT EXISTS gmail_message_id VARCHAR,
ADD COLUMN IF NOT EXISTS gmail_thread_id VARCHAR;

-- Update email_responses table to support Gmail thread tracking
ALTER TABLE email_responses
ADD COLUMN IF NOT EXISTS gmail_thread_id VARCHAR,
ADD COLUMN IF NOT EXISTS gmail_message_id VARCHAR;

-- Create function to update account health score
CREATE OR REPLACE FUNCTION update_gmail_account_health()
RETURNS TRIGGER AS $$
BEGIN
  -- Update health score based on recent activity
  UPDATE gmail_accounts 
  SET 
    health_score = GREATEST(0, LEAST(100, 
      100 - (bounce_count * 10) - (complaint_count * 20) - (consecutive_errors * 5)
    )),
    updated_at = NOW()
  WHERE id = NEW.gmail_account_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for health score updates
CREATE TRIGGER trigger_update_gmail_health_on_quota
  AFTER INSERT OR UPDATE ON gmail_quota_usage
  FOR EACH ROW EXECUTE FUNCTION update_gmail_account_health();

-- Create function to reset daily counters
CREATE OR REPLACE FUNCTION reset_gmail_daily_counters()
RETURNS void AS $$
BEGIN
  UPDATE gmail_accounts 
  SET 
    daily_send_count = 0,
    last_send_reset = CURRENT_DATE,
    updated_at = NOW()
  WHERE last_send_reset < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- Add RLS policies for Gmail accounts (if RLS is enabled)
ALTER TABLE gmail_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_quota_usage ENABLE ROW LEVEL SECURITY;

-- RLS policies for gmail_accounts
CREATE POLICY "Users can view their own Gmail accounts" ON gmail_accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Gmail accounts" ON gmail_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Gmail accounts" ON gmail_accounts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Gmail accounts" ON gmail_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for related tables
CREATE POLICY "Users can access their Gmail subscriptions" ON gmail_push_subscriptions
  FOR ALL USING (gmail_account_id IN (SELECT id FROM gmail_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Users can access their Gmail messages" ON gmail_messages
  FOR ALL USING (gmail_account_id IN (SELECT id FROM gmail_accounts WHERE user_id = auth.uid()));

CREATE POLICY "Users can access their Gmail quota data" ON gmail_quota_usage
  FOR ALL USING (gmail_account_id IN (SELECT id FROM gmail_accounts WHERE user_id = auth.uid()));

-- Create view for account health summary
CREATE OR REPLACE VIEW gmail_account_health_summary AS
SELECT 
  ga.id,
  ga.email,
  ga.account_status,
  ga.health_score,
  ga.daily_send_count,
  ga.daily_send_limit,
  ga.consecutive_errors,
  ga.last_health_check,
  gqu.emails_sent_count as today_sent,
  gqu.api_calls_count as today_api_calls
FROM gmail_accounts ga
LEFT JOIN gmail_quota_usage gqu ON ga.id = gqu.gmail_account_id AND gqu.date = CURRENT_DATE;

-- Insert initial data comment
COMMENT ON TABLE gmail_accounts IS 'Stores user Gmail accounts connected via OAuth2 for email sending';
COMMENT ON TABLE gmail_push_subscriptions IS 'Manages Gmail push notification subscriptions for real-time email detection';
COMMENT ON TABLE gmail_messages IS 'Tracks all Gmail messages sent and received through the system';
COMMENT ON TABLE gmail_quota_usage IS 'Monitors Gmail API usage and sending quotas per account';