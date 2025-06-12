# Email Agent 6

This repository contains the backend and frontend components for the Email Agent system, a cold outreach automation platform.

## Development Setup

1. Copy `.env.example` to `.env` and fill in your Supabase project settings:
   ```
   SUPABASE_URL=https://<your-project-ref>.supabase.co
   SUPABASE_ANON_KEY=<your-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
   DATABASE_URL=postgresql://postgres:<your-password>@db.<region>.supabase.co:5432/postgres
   REDIS_URL=redis://redis:6379
   PORT=3000
   NEXT_PUBLIC_API_URL=http://localhost:3001
   # LangSmith (agent monitoring and error recovery)
   # Optional: enable LangSmith tracing for observability
   LANGSMITH_TRACING=true
   LANGSMITH_API_KEY=<your-langsmith-api-key>
   # If not in a serverless environment, to reduce latency:
   LANGCHAIN_CALLBACKS_BACKGROUND=true
   ```

**2. Install the Google Maps Scraper CLI**
We leverage the `gosom/google-maps-scraper` Go-based scraper for place data. To install:
```bash
git clone https://github.com/gosom/google-maps-scraper.git
cd google-maps-scraper
# Build the binary named `google-maps-scraper`
go build -o google-maps-scraper
# Move it into your PATH
mv google-maps-scraper /usr/local/bin/
```
After this, the `google-maps-scraper` command will be available to our Node.js wrapper.

2. Run services:
   ```bash
   docker-compose up
   ```
3. Link and push migrations:
   ```