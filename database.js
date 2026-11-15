const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(__dirname, 'sales_system.db');
const db = new DatabaseSync(dbPath);

// تهيئة الجداول في قاعدة البيانات
function initDatabase() {
  // جدول المندوبين
  db.exec(`
    CREATE TABLE IF NOT EXISTS reps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // جدول نقاط البيع والمحلات (قاعدة البيانات الجغرافية الدائمة)
  db.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      owner_name TEXT,
      phone TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      assigned_day TEXT NOT NULL,       -- Sunday, Monday, ...
      assigned_day_ar TEXT NOT NULL,    -- الأحد، الإثنين...
      rep_id INTEGER,
      address_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rep_id) REFERENCES reps(id)
    );
  `);

  // جدول سجل الزيارات الفعلية
  db.exec(`
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      rep_id INTEGER NOT NULL,
      visit_date TEXT NOT NULL,          -- YYYY-MM-DD
      visit_time TEXT NOT NULL,          -- HH:MM:SS
      visit_day_ar TEXT NOT NULL,        -- الأحد
      rep_lat REAL,
      rep_lng REAL,
      distance_meters REAL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (store_id) REFERENCES stores(id),
      FOREIGN KEY (rep_id) REFERENCES reps(id)
    );
  `);

  // إضافة مندوب افتراضي إن لم يوجد
  const countReps = db.prepare('SELECT COUNT(*) as count FROM reps').get();
  if (countReps.count === 0) {
    const insertRep = db.prepare('INSERT INTO reps (name, phone) VALUES (?, ?)');
    insertRep.run('أحمد المندوب', '07700000001');
    insertRep.run('محمد المندوب', '07700000002');
  }

  console.log('✅ تم تهيئة قاعدة بيانات نظام المندوبين ونقاط البيع بنجاح.');
}

// دالة حساب المسافة بين نقطتين جغرافيتين (بالمتر) للتأكد من تواجد المندوب في المحل
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371e3; // نصف قطر الأرض بالمتر
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

module.exports = {
  db,
  initDatabase,
  calculateDistanceMeters
};
