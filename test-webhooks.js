#!/usr/bin/env node

/**
 * Test script for webhook endpoints
 * Run this after starting your server to verify webhook functionality
 */

const fetch = require('node-fetch').default || require('node-fetch');

const BASE_URL = 'http://localhost:3000';

async function testWebhooks() {
  console.log('🧪 Testing webhook endpoints...\n');

  // Test 1: Basic webhook connectivity
  try {
    console.log('1. Testing webhook connectivity...');
    const response = await fetch(`${BASE_URL}/webhooks/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'webhook connectivity' })
    });
    
    if (response.ok) {
      console.log('✅ Webhook endpoint is responding');
    } else {
      console.log('❌ Webhook endpoint failed:', response.status);
    }
  } catch (error) {
    console.log('❌ Webhook endpoint not accessible:', error.message);
  }

  // Test 2: Mailgun incoming webhook format
  try {
    console.log('\n2. Testing Mailgun incoming webhook format...');
    const mockIncomingData = {
      timestamp: Math.floor(Date.now() / 1000).toString(),
      token: 'test-token-123',
      signature: 'test-signature',
      recipient: 'test@reignovertech.com',
      sender: 'prospect@example.com',
      subject: 'Re: Your automated email',
      'body-plain': 'Thanks for reaching out! I\'m interested.',
      'message-id': '<reply-123@mail.example.com>',
      'In-Reply-To': '<original-email-id@mailgun.net>'
    };

    const response = await fetch(`${BASE_URL}/webhooks/mailgun/incoming`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(mockIncomingData)
    });

    const result = await response.text();
    console.log('📧 Incoming webhook response:', response.status);
    if (response.status === 401) {
      console.log('🔒 Security validation working (signature check)');
    }
  } catch (error) {
    console.log('❌ Incoming webhook error:', error.message);
  }

  // Test 3: Mailgun delivery webhook
  try {
    console.log('\n3. Testing Mailgun delivery webhook format...');
    const mockDeliveryData = {
      timestamp: Math.floor(Date.now() / 1000).toString(),
      token: 'test-token-456',
      signature: 'test-signature',
      event: 'delivered',
      'message-id': '<test-email-id@mailgun.net>',
      recipient: 'prospect@example.com',
      severity: 'info'
    };

    const response = await fetch(`${BASE_URL}/webhooks/mailgun/delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(mockDeliveryData)
    });

    console.log('📤 Delivery webhook response:', response.status);
    if (response.status === 401) {
      console.log('🔒 Security validation working (signature check)');
    }
  } catch (error) {
    console.log('❌ Delivery webhook error:', error.message);
  }

  console.log('\n🏁 Webhook testing complete!');
  console.log('\n📋 Next steps:');
  console.log('1. Complete database migration in Supabase');
  console.log('2. Add real webhook signing key to .env');
  console.log('3. Configure webhook URLs in Mailgun dashboard');
  console.log('4. Test with real email responses');
}

if (require.main === module) {
  testWebhooks().catch(console.error);
}

module.exports = { testWebhooks };