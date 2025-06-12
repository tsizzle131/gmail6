-- Initial schema migration for Email Agent

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Companies table
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  domain VARCHAR,
  industry VARCHAR,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  product_name VARCHAR NOT NULL,
  product_description TEXT NOT NULL,
  product_link VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'active', -- active, paused, completed
  emails_per_week INTEGER DEFAULT 2,
  campaign_duration_weeks INTEGER DEFAULT 6,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  email VARCHAR NOT NULL,
  company_name VARCHAR,
  domain VARCHAR,
  industry VARCHAR,
  website_content TEXT,
  contact_attempts INTEGER DEFAULT 0,
  response_status VARCHAR DEFAULT 'no_response', -- no_response, responded, converted, unsubscribed
  last_contacted_at TIMESTAMP WITHOUT TIME ZONE,
  responded_at TIMESTAMP WITHOUT TIME ZONE,
  conversation_stage VARCHAR DEFAULT 'cold', -- cold, engaged, negotiating, converted
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  UNIQUE (campaign_id, email)
);

-- Email history table
CREATE TABLE IF NOT EXISTS email_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  email_type VARCHAR, -- outbound_cold, outbound_followup, inbound_response, outbound_response
  subject VARCHAR,
  content TEXT,
  sent_at TIMESTAMP WITHOUT TIME ZONE,
  opened_at TIMESTAMP WITHOUT TIME ZONE,
  replied_at TIMESTAMP WITHOUT TIME ZONE,
  mailgun_message_id VARCHAR,
  email_sequence_number INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  message_type VARCHAR, -- inbound, outbound
  content TEXT,
  ai_generated BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);
