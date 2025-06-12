import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true, debug: true });
console.log('Loaded SUPABASE_URL:', process.env.SUPABASE_URL, '— using .env at', path.resolve(process.cwd(), '.env'));

// Application configuration interface
type AppConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  databaseUrl: string;
  redisUrl: string;
  port: number;
  frontendUrl: string;
  mailgunApiKey: string;
  mailgunDomain: string;
  openaiApiKey: string;
  perplexityApiKey?: string;
  perplexityApiUrl?: string;
};

// Validate required environment variables
const requiredEnv = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'REDIS_URL',
  'PORT',
  'NEXT_PUBLIC_API_URL',
  'MAILGUN_API_KEY',
  'MAILGUN_DOMAIN',
  'OPENAI_API_KEY',
];
requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

// Exported configuration object
const config: AppConfig = {
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY!,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL!,
  port: parseInt(process.env.PORT!, 10),
  frontendUrl: process.env.NEXT_PUBLIC_API_URL!,
  mailgunApiKey: process.env.MAILGUN_API_KEY!,
  mailgunDomain: process.env.MAILGUN_DOMAIN!,
  openaiApiKey: process.env.OPENAI_API_KEY!,
  perplexityApiKey: process.env.PERPLEXITY_API_KEY,
  perplexityApiUrl: process.env.PERPLEXITY_API_URL,
};

export default config;
