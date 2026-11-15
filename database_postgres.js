const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

let pool = null;

function initPostgres(connectionString) {
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false } // Required for Supabase
  });

  // إنشاء الجداول تلقائياً في Supabase عند أول اتصال
  const schemaSql = fs.readFileSync(path.join(__dirname, 'supabase_schema.sql'), 'utf8');
  return pool.query(schemaSql)
    .then(() => {
      console.log('✅ تم الاتصال بقاعدة بيانات Supabase السحابية وتهيئة الجداول بنجاح.');
      return pool;
    })
    .catch((err) => {
      console.error('❌ خطأ في الاتصال بقاعدة بيانات Supabase:', err.message);
      throw err;
    });
}

function getPool() {
  return pool;
}

module.exports = {
  initPostgres,
  getPool
};
