# Mailgun Webhook Configuration Guide

## Common Webhook Event Names in Mailgun

### For Incoming Messages:
- `message` or `incoming` - This handles replies to your emails

### For Delivery Tracking:
- `delivered` - Email successfully delivered
- `failed` or `permanent_fail` - Hard bounces (bad email addresses)
- `temporary_fail` - Soft bounces (mailbox full, etc.)
- `complained` - Spam complaints
- `unsubscribed` - Unsubscribe requests
- `opened` - Email opens (if tracking enabled)
- `clicked` - Link clicks (if tracking enabled)

## Minimum Required Webhooks

### Essential for Response Automation:
1. **Incoming Messages** (highest priority)
   - Event: `message` or `incoming`
   - URL: `https://your-domain.com/webhooks/mailgun/incoming`

### Important for Deliverability:
2. **Delivery Status** (recommended)
   - Events: `delivered`, `failed`, `complained`
   - URL: `https://your-domain.com/webhooks/mailgun/delivery`

## If Some Events Don't Exist:

### Option 1: Use Available Events
- Start with just `message`/`incoming` for replies
- Add `delivered` and `failed` if available
- System will work without all events

### Option 2: Check Your Mailgun Plan
- Some events require paid plans
- Free tier has limited webhook options
- Upgrade if needed for full functionality

### Option 3: Alternative Setup
If webhooks are limited, you can:
1. Set up just incoming message webhooks
2. Use Mailgun API polling for delivery status
3. Implement manual monitoring initially

## Testing Your Setup

1. Set up available webhooks
2. Send a test email
3. Check webhook delivery in Mailgun logs
4. Verify your endpoint receives data

The system will work with just incoming message webhooks - that's the most critical part for conversation automation!