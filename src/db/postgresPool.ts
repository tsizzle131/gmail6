import { Pool } from 'pg';
import config from '../config';

/**
 * Postgres connection pool for direct SQL queries and migrations.
 * Reason: improves performance via connection reuse.
 */
export const pgPool = new Pool({
  connectionString: config.databaseUrl,
  max: 20, // max connections
  idleTimeoutMillis: 30000, // close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // return an error after 2 seconds if connection could not be established
});