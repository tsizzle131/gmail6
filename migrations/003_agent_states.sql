-- Agent states table migration

-- Create agent_states table for workflow state management
CREATE TABLE IF NOT EXISTS agent_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name VARCHAR NOT NULL,
  workflow_id UUID NOT NULL,
  state JSONB NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
  last_error TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);