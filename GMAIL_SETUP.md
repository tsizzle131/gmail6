# Gmail API Integration Setup Guide

This guide will help you set up the Gmail API integration to transform your cold outreach system into a Reply.io-style platform.

## 🎯 Overview

The Gmail API integration allows users to:
- Connect their own Gmail accounts via OAuth2
- Send emails that appear as regular Gmail messages (no "via service.com" headers)
- Achieve better deliverability (70-80% vs 50-60% with ESPs)
- Use native Gmail conversation threading
- Scale with multiple Gmail accounts

## 📋 Prerequisites

- Google Cloud Console account
- Access to your domain's DNS settings (for production)
- Basic understanding of OAuth2 flow

## 🔧 Step 1: Google Cloud Console Setup

### 1.1 Create/Select Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note down your Project ID

### 1.2 Enable Required APIs
1. Navigate to **"APIs & Services" > "Library"**
2. Search for and enable:
   - **Gmail API** (required)
   - **Pub/Sub API** (optional, for real-time notifications)

### 1.3 Configure OAuth2 Consent Screen
1. Go to **"APIs & Services" > "OAuth consent screen"**
2. Choose **"External"** (unless you're using Google Workspace)
3. Fill in required information:
   - **App name**: "ReignOverTech Email Agent"
   - **User support email**: Your email
   - **Developer contact email**: Your email
4. Add scopes:
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`

### 1.4 Create OAuth2 Credentials
1. Go to **"APIs & Services" > "Credentials"**
2. Click **"Create Credentials" > "OAuth 2.0 Client IDs"**
3. Choose **"Web application"**
4. Set up authorized redirect URIs:
   - Development: `http://localhost:3000/gmail-auth/callback`
   - Production: `https://yourdomain.com/gmail-auth/callback`
5. Copy the **Client ID** and **Client Secret**

## 🔐 Step 2: Environment Configuration

### 2.1 Copy Environment Template
```bash
cp .env.example .env
```

### 2.2 Update Gmail API Configuration
```env
# Gmail API Configuration
GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/gmail-auth/callback

# Generate a secure encryption key
ENCRYPTION_KEY=your_32_character_encryption_key_here
```

### 2.3 Generate Encryption Key
Choose one method:

**Node.js:**
```javascript
require('crypto').randomBytes(32).toString('hex')
```

**OpenSSL:**
```bash
openssl rand -hex 32
```

**Python:**
```python
import secrets
secrets.token_hex(32)
```

## 📊 Step 3: Database Migration

Run the Gmail integration migration:

```bash
# Execute the migration in your Supabase dashboard or via CLI
psql -f migrations/007_gmail_integration.sql
```

This creates the following tables:
- `gmail_accounts` - OAuth2 tokens and account management
- `gmail_push_subscriptions` - Real-time notification setup
- `gmail_messages` - Message tracking and threading
- `gmail_quota_usage` - Usage monitoring and limits

## 🚀 Step 4: Test the Integration

### 4.1 Start the Development Server
```bash
npm run dev
```

### 4.2 Test Gmail Authentication
1. Navigate to `http://localhost:3000/docs`
2. Find the Gmail Auth section
3. Use the `/gmail-auth/connect` endpoint
4. Complete the OAuth2 flow in your browser

### 4.3 Send Test Email
1. Use the `/gmail-sending/test` endpoint
2. Verify the email is sent from your Gmail account
3. Check that it appears in your Gmail Sent folder

## 🔄 Step 5: Replace Mailgun with Gmail

### 5.1 Update Email Sending Logic
The system provides backward compatibility. You can:

**Option A: Gradual Migration**
- Keep existing Mailgun code
- Add Gmail support for new campaigns
- Migrate existing campaigns gradually

**Option B: Complete Switch**
- Replace Mailgun imports with Gmail equivalents
- Update campaign manager to use Gmail accounts

### 5.2 Example Code Changes

**Before (Mailgun):**
```typescript
import { sendEmail } from '../services/emailSender';

const result = await sendEmail({
  to: 'prospect@company.com',
  subject: 'Hello',
  html: '<p>Content</p>'
});
```

**After (Gmail):**
```typescript
import { gmailEmailService } from '../services/gmailEmailService';

const result = await gmailEmailService.sendEmail({
  to: 'prospect@company.com',
  subject: 'Hello',
  html: '<p>Content</p>'
}, userId);
```

## 📈 Step 6: Scale with Multiple Accounts

### 6.1 Account Strategy
- **Free Gmail accounts**: 100-500 emails/day each
- **Google Workspace accounts**: 2000 emails/day each
- **Recommended**: 5-10 accounts for 2500-5000 emails/day

### 6.2 Account Management
- Use the account manager for automatic rotation
- Monitor health scores and sending limits
- Implement account warming for new accounts

## 🔒 Step 7: Production Deployment

### 7.1 Update OAuth2 Settings
1. Add production domain to Google Cloud Console
2. Update `GOOGLE_REDIRECT_URI` to production URL
3. Verify domain ownership if required

### 7.2 Security Checklist
- [ ] Use HTTPS for all OAuth2 flows
- [ ] Secure encryption key storage
- [ ] Implement proper access controls
- [ ] Monitor for suspicious activity
- [ ] Set up log rotation and monitoring

### 7.3 Performance Optimization
- [ ] Set up Redis for caching
- [ ] Implement connection pooling
- [ ] Configure monitoring and alerting
- [ ] Set up backup strategies

## 📊 Step 8: Monitoring and Analytics

### 8.1 Key Metrics to Track
- **Account Health Scores**: Monitor for deliverability issues
- **Daily Send Counts**: Ensure staying within limits
- **Response Rates**: Compare Gmail vs Mailgun performance
- **Delivery Status**: Track bounces and complaints

### 8.2 Dashboard Setup
The system provides endpoints for:
- Account usage statistics
- Sending performance metrics
- Health monitoring
- Error tracking

## 🔧 Troubleshooting

### Common Issues

**OAuth2 Errors:**
- Verify redirect URI matches exactly
- Check OAuth2 consent screen approval
- Ensure correct scopes are requested

**Token Refresh Issues:**
- Check encryption key consistency
- Verify refresh token storage
- Monitor token expiration handling

**Sending Limits:**
- Monitor daily quotas
- Implement proper account rotation
- Check for account suspension

**Deliverability Issues:**
- Warm up new accounts gradually
- Monitor bounce/complaint rates
- Ensure proper SPF/DKIM setup for custom domains

### Debug Mode
Set environment variables for debugging:
```env
NODE_ENV=development
DEBUG=gmail:*
```

## 🎉 Success Criteria

Your Gmail integration is working correctly when:
- [ ] Users can connect Gmail accounts via OAuth2
- [ ] Emails send successfully through Gmail API
- [ ] Messages appear in Gmail Sent folder
- [ ] Recipients see regular Gmail messages (no service headers)
- [ ] Response detection works with conversation threading
- [ ] Account rotation distributes sends properly
- [ ] Usage stats and health monitoring function

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review the server logs for detailed error messages
3. Verify your Google Cloud Console configuration
4. Test with a single account before scaling

## 🚀 Next Steps

After successful setup:
1. **Gradual Migration**: Start with test campaigns
2. **Monitor Performance**: Compare deliverability metrics
3. **Scale Accounts**: Add more Gmail accounts as needed
4. **Optimize Sending**: Fine-tune timing and frequency
5. **Dashboard Integration**: Build UI for account management

Your system is now a Reply.io-style platform with superior AI personalization and knowledge integration! 🎯