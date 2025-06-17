-- Company Knowledge System Migration
-- Adds structured company profile data for AI email personalization

-- Company Profiles table - core company information
CREATE TABLE IF NOT EXISTS company_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Basic company info
  company_name VARCHAR NOT NULL,
  tagline VARCHAR,
  description TEXT,
  founded_year INTEGER,
  employee_count_range VARCHAR, -- e.g., "10-50", "500+"
  headquarters_location VARCHAR,
  website_url VARCHAR,
  
  -- Value propositions and positioning
  primary_value_proposition TEXT,
  secondary_value_propositions TEXT[], -- Array of additional value props
  competitive_advantages TEXT[],
  target_markets TEXT[], -- e.g., ["Enterprise", "Mid-Market", "Startups"]
  industry_specializations TEXT[],
  
  -- Company culture and values
  company_values TEXT[],
  mission_statement TEXT,
  company_culture_description TEXT,
  
  -- Contact and social
  primary_contact_email VARCHAR,
  primary_contact_phone VARCHAR,
  linkedin_url VARCHAR,
  twitter_url VARCHAR,
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Services/Products table - what the company offers
CREATE TABLE IF NOT EXISTS company_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_profile_id UUID REFERENCES company_profiles(id) ON DELETE CASCADE,
  
  -- Service details
  service_name VARCHAR NOT NULL,
  service_category VARCHAR, -- e.g., "Consulting", "Development", "Strategy"
  short_description TEXT,
  detailed_description TEXT,
  
  -- Value and positioning
  key_benefits TEXT[],
  target_audience VARCHAR, -- e.g., "CTOs", "Marketing Directors"
  typical_project_duration VARCHAR,
  price_range VARCHAR, -- e.g., "$10k-50k", "Contact for pricing"
  
  -- Differentiation
  unique_approach TEXT,
  technologies_used TEXT[],
  methodologies TEXT[],
  
  -- Metadata
  is_primary_service BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Case Studies table - success stories and social proof
CREATE TABLE IF NOT EXISTS case_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_profile_id UUID REFERENCES company_profiles(id) ON DELETE CASCADE,
  service_id UUID REFERENCES company_services(id) ON DELETE SET NULL,
  
  -- Case study details
  title VARCHAR NOT NULL,
  client_name VARCHAR, -- Can be anonymized like "Fortune 500 Retailer"
  client_industry VARCHAR,
  client_size VARCHAR, -- e.g., "500+ employees"
  
  -- Problem and solution
  client_challenge TEXT,
  solution_provided TEXT,
  implementation_approach TEXT,
  
  -- Results and metrics
  quantitative_results TEXT[], -- e.g., ["50% increase in efficiency", "$2M cost savings"]
  qualitative_results TEXT[], -- e.g., ["Improved team morale", "Better customer satisfaction"]
  timeline_duration VARCHAR,
  
  -- Additional context
  technologies_used TEXT[],
  team_size INTEGER,
  client_testimonial TEXT,
  testimonial_author VARCHAR,
  testimonial_author_title VARCHAR,
  
  -- Usage permissions
  can_use_client_name BOOLEAN DEFAULT false,
  can_use_publicly BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  
  -- Metadata
  completion_date DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Team Credentials table - expertise and backgrounds
CREATE TABLE IF NOT EXISTS team_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_profile_id UUID REFERENCES company_profiles(id) ON DELETE CASCADE,
  
  -- Team member info
  name VARCHAR NOT NULL,
  title VARCHAR,
  bio TEXT,
  
  -- Expertise
  expertise_areas TEXT[],
  years_experience INTEGER,
  certifications TEXT[],
  previous_companies TEXT[],
  education TEXT[],
  
  -- Achievements
  notable_projects TEXT[],
  publications TEXT[],
  speaking_engagements TEXT[],
  awards TEXT[],
  
  -- Usage
  is_public_facing BOOLEAN DEFAULT false,
  can_use_in_proposals BOOLEAN DEFAULT true,
  linkedin_url VARCHAR,
  
  -- Metadata
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Knowledge Assets table - for RAG content (Phase 2)
CREATE TABLE IF NOT EXISTS knowledge_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_profile_id UUID REFERENCES company_profiles(id) ON DELETE CASCADE,
  
  -- Content details
  title VARCHAR NOT NULL,
  content_type VARCHAR, -- e.g., "whitepaper", "blog_post", "proposal", "presentation"
  content_text TEXT,
  file_url VARCHAR,
  
  -- Categorization
  topics TEXT[],
  target_audience TEXT[],
  industry_relevance TEXT[],
  
  -- Embeddings for RAG (will be added in Phase 2)
  embedding VECTOR(1536), -- OpenAI embedding dimension
  
  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITHOUT TIME ZONE,
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_company_profiles_company_id ON company_profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_company_services_company_profile_id ON company_services(company_profile_id);
CREATE INDEX IF NOT EXISTS idx_case_studies_company_profile_id ON case_studies(company_profile_id);
CREATE INDEX IF NOT EXISTS idx_case_studies_client_industry ON case_studies(client_industry);
CREATE INDEX IF NOT EXISTS idx_team_credentials_company_profile_id ON team_credentials(company_profile_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_assets_company_profile_id ON knowledge_assets(company_profile_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_assets_content_type ON knowledge_assets(content_type);

-- Comments for documentation
COMMENT ON TABLE company_profiles IS 'Core company information for AI email personalization';
COMMENT ON TABLE company_services IS 'Services and products offered by the company';
COMMENT ON TABLE case_studies IS 'Success stories and client results for social proof';
COMMENT ON TABLE team_credentials IS 'Team member expertise and credentials';
COMMENT ON TABLE knowledge_assets IS 'Content repository for RAG-based knowledge retrieval';