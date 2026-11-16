const SUPABASE_DB_URL = "postgresql://postgres.hjqcelslwihupxwisdyc:FadiCharcoal2026%21@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true";
const SUPABASE_DIRECT_URL = "postgresql://postgres.hjqcelslwihupxwisdyc:FadiCharcoal2026%21@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres";
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = SUPABASE_DB_URL;
}
if (!process.env.DIRECT_URL) {
  process.env.DIRECT_URL = SUPABASE_DIRECT_URL;
}

import app from '../src/index';

export default app;
