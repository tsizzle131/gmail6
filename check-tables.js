#!/usr/bin/env node

/**
 * Check if all required tables exist in Supabase database
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTables() {
  console.log('🔍 Checking Supabase database tables...\n');

  const requiredTables = [
    'companies',
    'campaigns', 
    'contacts',
    'campaign_contacts',
    'scheduled_emails',
    'email_responses',
    'conversations',
    'automated_responses',
    'conversation_analytics'
  ];

  const results = {};

  for (const tableName of requiredTables) {
    try {
      console.log(`Checking table: ${tableName}...`);
      
      // Try to query the table structure
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);

      if (error) {
        if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
          results[tableName] = '❌ Missing';
          console.log(`  ❌ Table '${tableName}' does not exist`);
        } else if (error.code === '42501' || error.message.includes('permission denied')) {
          results[tableName] = '⚠️  Exists (permission issue)';
          console.log(`  ⚠️  Table '${tableName}' exists but has permission issues`);
        } else {
          results[tableName] = `❌ Error: ${error.message}`;
          console.log(`  ❌ Error checking '${tableName}': ${error.message}`);
        }
      } else {
        results[tableName] = '✅ Exists';
        console.log(`  ✅ Table '${tableName}' exists and accessible`);
      }
    } catch (err) {
      results[tableName] = `❌ Exception: ${err.message}`;
      console.log(`  ❌ Exception checking '${tableName}': ${err.message}`);
    }
  }

  console.log('\n📊 Summary:');
  console.log('='.repeat(50));
  
  let existingCount = 0;
  let missingCount = 0;
  
  for (const [table, status] of Object.entries(results)) {
    console.log(`${table.padEnd(25)} ${status}`);
    if (status === '✅ Exists') existingCount++;
    if (status === '❌ Missing') missingCount++;
  }

  console.log('='.repeat(50));
  console.log(`✅ Existing tables: ${existingCount}/${requiredTables.length}`);
  console.log(`❌ Missing tables: ${missingCount}/${requiredTables.length}`);

  if (missingCount > 0) {
    console.log('\n🔧 Missing tables detected. You may need to:');
    console.log('1. Run the migration SQL in Supabase SQL Editor');
    console.log('2. Check for syntax errors in the SQL');
    console.log('3. Ensure you have proper database permissions');
  } else {
    console.log('\n🎉 All required tables exist!');
  }

  // Check for recent response handler tables specifically
  const responseHandlerTables = ['email_responses', 'conversations', 'automated_responses', 'conversation_analytics'];
  const missingResponseTables = responseHandlerTables.filter(table => results[table] === '❌ Missing');
  
  if (missingResponseTables.length > 0) {
    console.log('\n🚨 Response Handler tables missing:');
    missingResponseTables.forEach(table => console.log(`   - ${table}`));
    console.log('\nThis means the response automation system won\'t work properly.');
  }
}

if (require.main === module) {
  checkTables().catch(console.error);
}

module.exports = { checkTables };