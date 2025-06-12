# Cold Outreach Agent - Task Breakdown

## 📋 MASTER TASK LIST

### 🏗️ PHASE 1: FOUNDATION (Week 1-2)

#### Infrastructure Setup
- [x] **1.1** Set up Docker environment with multi-service architecture (using Supabase, no local Postgres)
  - Configure Docker Compose for development
  - Set up production Docker configuration
  - Create environment variable management
  - Configure service networking and volumes

- [x] **1.2** Configure Supabase database with all required tables

  - Set up Supabase project and API keys
  - Create database schema migrations
  - Configure row-level security policies
  - Set up database backup strategy

- [x] **1.3** Set up Redis for job queuing and caching
  - Configure Redis instance in Docker
  - Set up connection pooling
  - Configure persistence and backup
  - Test queue functionality

- [x] **1.4** Create environment configuration system for multi-tenant support
  - Design configuration schema
  - Implement environment variable loading
  - Create tenant-specific config management
  - Set up secret management system

- [x] **1.5** Implement logging and monitoring infrastructure
  - Set up Winston logging with multiple levels
  - Configure log rotation and archiving
  - Implement error tracking and alerting
  - Create health check endpoints

#### Core Database Design
- [x] **2.1** Design and implement Supabase schema
  - Create companies table with indexes
  - Create campaigns table with relationships
  - Create contacts table with unique constraints
  - Create email_history table for tracking
  - Create conversations table for AI context

- [x] **2.2** Create database migration system
  - Set up migration framework
  - Create initial migration scripts
  - Implement rollback functionality
  - Document migration procedures

- [x] **2.3** Set up row-level security policies
  - Configure tenant isolation policies
  - Set up user access controls
  - Implement data encryption for sensitive fields
  - Test security boundaries

- [x] **2.4** Implement database connection pooling and optimization
  - Configure connection pooling parameters
  - Set up query optimization
  - Implement database monitoring
  - Create performance benchmarks

#### Basic API Framework
- [x] **3.1** Set up Express.js server with TypeScript
  - Initialize project with TypeScript configuration
  - Set up Express with middleware stack
  - Configure CORS and security headers
  - Implement request/response typing

- [x] **3.2** Implement authentication middleware
  - Set up JWT-based authentication
  - Create user session management
  - Implement role-based access control
  - Set up password hashing and validation

- [x] **3.3** Create basic CRUD operations for campaigns and contacts
  - Build campaigns REST API endpoints
  - Build contacts REST API endpoints
  - Implement validation and error handling
  - Add pagination and filtering

- [x] **3.4** Set up API documentation with Swagger
  - Configure Swagger/OpenAPI specification
  - Document all API endpoints
  - Add request/response examples
  - Set up interactive API documentation

- [x] **3.5** Implement error handling and validation
  - Create centralized error handling middleware
  - Implement input validation with Zod
  - Set up error logging and monitoring
  - Create user-friendly error responses

### 🤖 PHASE 2: LANGGRAPH AGENT SYSTEM (Week 3-4)

#### LangGraph Orchestrator Setup
- [x] **4.1** Install and configure LangGraph + LangChain dependencies
  - Set up LangGraph and LangChain packages
  - Configure OpenAI API integration
  - Set up environment variables for AI services
  - Test basic agent functionality

- [x] **4.2** Design state management schema for agent workflows
  - Define agent state interfaces
  - Create state transition logic
  - Implement state persistence layer
  - Design error recovery mechanisms

- [x] **4.3** Create base LangGraph workflow with conditional routing
  - Build main orchestrator graph
  - Implement conditional nodes and edges
  - Set up agent communication protocols
  - Create workflow visualization tools

- [x] **4.4** Implement agent state persistence in Supabase
  - Create agent_states table
  - Implement state serialization/deserialization
  - Set up state recovery mechanisms
  - Add state cleanup and archiving

- [x] **4.5** Set up agent execution monitoring and error recovery
  - Implement execution logging
  - Create retry mechanisms for failed operations
  - Set up agent health monitoring
  - Implement graceful degradation strategies

#### Lead Generation Agent
- [] **5.1** Create Google Maps query generation tool using LangChain
  - Build query generation prompts
  - Implement query validation and filtering
  - Create query optimization logic
  - Add industry-specific query templates

- [x] **5.2** Leverage headless scraping logic from `google-maps-scraper` to implement a generic website scraper
  - Evaluate headless orchestration patterns in `external/google-maps-scraper/gmaps` as blueprint
  - Build Playwright/Puppeteer wrapper replicating concurrency and anti-detection
  - Implement generic content extraction and cleaning for arbitrary URLs
  - Add rate-limiting and error-recovery strategies
  - Write unit tests for website scraper wrapper
  - [x] **5.2.1** Modify `websiteScraperWrapper.ts` to extract `body.innerText` instead of full HTML to reduce token usage. (07/26/2024)

- [x] **5.3** Build email extraction and validation tool
  - Create email regex patterns and validation
  - Implement email format verification
  - Add domain validation and reputation checking
  - Create email deduplication logic

- [x] **5.4** Create lead enrichment tool (company info, industry detection)
  - Implement company information lookup
  - Add industry classification logic
  - Create contact role detection
  - Build lead scoring algorithms
  - [x] **5.4.1** Create a new LangChain tool `perplexityResearchTool.ts` that uses Perplexity API to research a company based on name and website. (07/26/2024)
  - [x] **5.4.2** Integrate `perplexityResearchTool.ts` into the Lead Gen Agent workflow after website scraping. (07/26/2024)
  - [x] **5.4.3** Ensure Perplexity API key and URL are managed via the config system. (07/26/2024)

- [x] **5.5** Integrate all tools into Lead Gen Agent workflow
  - Create agent workflow orchestration
  - Implement tool chaining and error handling
  - Add parallel processing capabilities
  - Create lead quality assessment
  - [x] **5.5.1** Add `enriched_data` JSONB column to `contacts` table for storing the output of `leadEnrichmentTool`. (07/27/2024) - User confirmed done
  - [x] **5.5.2** Ensure `databaseWriterTool` populates the new `enriched_data` column in the `contacts` table. (07/27/2024) - Schema fixed, wrapper stores it
  - [x] **5.5.3** Update `databaseWriterTool` to also save extracted emails to the `contacts` table if available. (07/27/2024) - Handled in wrapper

#### Email Crafting Agent  
- [ ] **6.1** Design email personalization prompt templates
  - Create base email templates for different industries
  - Build dynamic personalization logic
  - Implement tone and style variations
  - Add A/B testing template variants

- [ ] **6.2** Create website content analysis tool
  - Implement content summarization
  - Extract key business information
  - Identify pain points and opportunities
  - Create relevance scoring system

- [ ] **6.3** Implement email generation with multiple angles/approaches
  - Build multiple email approach strategies
  - Create angle variation logic
  - Implement email sequence planning
  - Add personalization depth controls

- [ ] **6.4** Build email history tracking to avoid duplication
  - Create email fingerprinting system
  - Implement content similarity detection
  - Add approach tracking per contact
  - Create variation enforcement rules

- [ ] **6.5** Create A/B testing capabilities for email variants
  - Build A/B test configuration system
  - Implement statistical significance testing
  - Create performance tracking metrics
  - Add automatic winner selection

#### Campaign Manager Agent
- [ ] **7.1** Design campaign scheduling and progression logic
  - Create campaign timeline management
  - Implement contact progression tracking
  - Build scheduling optimization algorithms
  - Add campaign milestone management

- [ ] **7.2** Implement 6-week, 2x/week email sequence management
  - Create sequence scheduling system
  - Implement contact state management
  - Build sequence customization options
  - Add sequence performance tracking

- [ ] **7.3** Create contact status tracking and workflow routing
  - Implement contact lifecycle management
  - Create status transition logic
  - Build workflow routing algorithms
  - Add manual override capabilities

- [ ] **7.4** Build campaign pause/resume functionality
  - Create campaign state management
  - Implement graceful pause mechanisms
  - Build resume logic with state recovery
  - Add campaign modification capabilities

- [ ] **7.5** Implement rate limiting and deliverability optimization
  - Create sending rate controls
  - Implement domain reputation monitoring
  - Build deliverability scoring system
  - Add automatic throttling mechanisms

#### Response Handler Agent
- [ ] **8.1** Set up Mailgun webhook integration for response detection
  - Configure webhook endpoints
  - Implement webhook security and validation
  - Create response parsing logic
  - Add response categorization system

- [ ] **8.2** Create response classification system
  - Build response intent detection
  - Implement sentiment analysis
  - Create response type categorization
  - Add confidence scoring for classifications

- [ ] **8.3** Implement conversation context management
  - Create conversation memory system
  - Implement context retrieval and storage
  - Build conversation threading logic
  - Add context-aware response generation

- [ ] **8.4** Build intelligent response generation for different scenarios
  - Create scenario-specific response templates
  - Implement dynamic response generation
  - Add tone matching and style consistency
  - Build objection handling logic

- [ ] **8.5** Create handoff mechanism to close sales or schedule consultations
  - Implement closing trigger detection
  - Create consultation scheduling integration
  - Build sales handoff workflows
  - Add conversion tracking systems

### 📧 PHASE 3: EMAIL SYSTEM INTEGRATION (Week 4-5)

#### Mailgun Integration
- [ ] **9.1** Set up Mailgun API integration with multiple sender addresses
  - Configure Mailgun API credentials
  - Implement multiple sender management
  - Create sender rotation logic
  - Add sender reputation monitoring

- [ ] **9.2** Implement email sending queue with Bull/Redis
  - Set up Bull queue configuration
  - Create job processing logic
  - Implement priority queuing
  - Add retry mechanisms and dead letter queues

- [ ] **9.3** Create email delivery tracking and status updates
  - Implement delivery status webhooks
  - Create tracking database updates
  - Build delivery analytics system
  - Add real-time status monitoring

- [ ] **9.4** Set up bounce and complaint handling
  - Configure bounce webhook processing
  - Implement complaint handling logic
  - Create automatic list cleaning
  - Add suppression list management

- [ ] **9.5** Implement unsubscribe management system
  - Create unsubscribe link generation
  - Build unsubscribe processing logic
  - Implement suppression list updates
  - Add compliance reporting features

#### Deliverability & Compliance
- [ ] **10.1** Implement CAN-SPAM compliance features
  - Add required header information
  - Implement sender identification
  - Create physical address inclusion
  - Add clear unsubscribe mechanisms

- [ ] **10.2** Create domain warming and reputation management
  - Implement sending volume ramping
  - Create reputation monitoring system
  - Build IP warming strategies
  - Add domain health tracking

- [ ] **10.3** Set up email authentication (SPF, DKIM, DMARC)
  - Configure SPF records
  - Set up DKIM signing
  - Implement DMARC policies  
  - Add authentication monitoring

- [ ] **10.4** Implement smart sending patterns to avoid spam filters
  - Create sending time optimization
  - Implement volume distribution
  - Build content variation systems
  - Add spam score monitoring

- [ ] **10.5** Create email content analysis for spam score optimization
  - Implement content scoring algorithms
  - Create spam trigger detection
  - Build content optimization suggestions
  - Add pre-send content validation

### 🎨 PHASE 4: DASHBOARD & UI (Week 5-6)

#### Frontend Foundation
- [ ] **11.1** Set up Next.js with TypeScript and Tailwind CSS
  - Initialize Next.js project with TypeScript
  - Configure Tailwind CSS with custom design system
  - Set up development environment and hot reloading
  - Create responsive layout foundation

- [ ] **11.2** Create responsive layout and navigation structure
  - Build main layout components
  - Implement responsive navigation menu
  - Create sidebar and header components
  - Add mobile-first responsive design

- [ ] **11.3** Implement authentication and session management
  - Set up NextAuth.js or custom auth
  - Create login/logout functionality
  -