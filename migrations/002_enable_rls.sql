-- Enable Row-Level Security and create permissive policies for all core tables

-- Companies table
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on companies" ON companies FOR ALL USING (true) WITH CHECK (true);

-- Campaigns table
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on campaigns" ON campaigns FOR ALL USING (true) WITH CHECK (true);

-- Contacts table
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on contacts" ON contacts FOR ALL USING (true) WITH CHECK (true);

-- Email history table
ALTER TABLE email_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on email_history" ON email_history FOR ALL USING (true) WITH CHECK (true);

-- Conversations table
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on conversations" ON conversations FOR ALL USING (true) WITH CHECK (true);
