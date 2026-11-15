-- =======================================================
-- مخطط قاعدة بيانات نظام المندوبين ونقاط البيع (Supabase PostgreSQL)
-- =======================================================

-- 1. جدول المندوبين
CREATE TABLE IF NOT EXISTS reps (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(50),
  active SMALLINT DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. جدول نقاط البيع والمحلات (قاعدة البيانات الجغرافية الدائمة)
CREATE TABLE IF NOT EXISTS stores (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  owner_name VARCHAR(150),
  phone VARCHAR(50),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  assigned_day VARCHAR(30) NOT NULL,       -- Sunday, Monday...
  assigned_day_ar VARCHAR(50) NOT NULL,    -- الأحد، الإثنين...
  rep_id INTEGER REFERENCES reps(id) ON DELETE SET NULL,
  address_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. جدول سجل الزيارات الفعلية وتدقيق الـ GPS
CREATE TABLE IF NOT EXISTS visits (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  rep_id INTEGER NOT NULL REFERENCES reps(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL,
  visit_time TIME NOT NULL,
  visit_day_ar VARCHAR(50) NOT NULL,
  rep_lat DOUBLE PRECISION,
  rep_lng DOUBLE PRECISION,
  distance_meters DOUBLE PRECISION DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- إضافة المندوبين الافتراضيين إذا لم يكونوا موجودين
INSERT INTO reps (name, phone)
SELECT 'أحمد المندوب', '07700000001'
WHERE NOT EXISTS (SELECT 1 FROM reps WHERE name = 'أحمد المندوب');

INSERT INTO reps (name, phone)
SELECT 'محمد المندوب', '07700000002'
WHERE NOT EXISTS (SELECT 1 FROM reps WHERE name = 'محمد المندوب');

-- إضافة مؤشرات للبحث السريع (Indexes)
CREATE INDEX IF NOT EXISTS idx_stores_day ON stores(assigned_day);
CREATE INDEX IF NOT EXISTS idx_stores_rep ON stores(rep_id);
CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_visits_store ON visits(store_id);
