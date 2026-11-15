const express = require('express');
const cors = require('cors');
const path = require('path');
const { db, initDatabase, calculateDistanceMeters } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// تهيئة قاعدة البيانات
initDatabase();

// أسماء الأيام بالإنجليزية والعربية
const DAYS_AR = {
  Sunday: 'الأحد',
  Monday: 'الإثنين',
  Tuesday: 'الثلاثاء',
  Wednesday: 'الأربعاء',
  Thursday: 'الخميس',
  Friday: 'الجمعة',
  Saturday: 'السبت'
};

const DAYS_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getCurrentDayInfo() {
  const now = new Date();
  const dayName = DAYS_NAMES[now.getDay()];
  const dayNameAr = DAYS_AR[dayName];
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = now.toTimeString().split(' ')[0]; // HH:MM:SS
  return { now, dayName, dayNameAr, dateStr, timeStr };
}

// 1. جلب قائمة المندوبين
app.get('/api/reps', (req, res) => {
  try {
    const reps = db.prepare('SELECT * FROM reps WHERE active = 1 ORDER BY name ASC').all();
    res.json({ success: true, data: reps });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. إضافة مندوب جديد
app.post('/api/reps', (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'اسم المندوب مطلوب' });

    const insert = db.prepare('INSERT INTO reps (name, phone) VALUES (?, ?)');
    const result = insert.run(name, phone || '');
    res.json({ success: true, id: result.lastInsertRowid, message: 'تمت إضافة المندوب بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. إضافة نقطة بيع / محل جديد مع حفظ الـ GPS واليوم التلقائي
app.post('/api/stores', (req, res) => {
  try {
    const { name, owner_name, phone, latitude, longitude, rep_id, address_notes, assigned_day } = req.body;

    if (!name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, message: 'اسم المحل وإحداثيات الموقع (GPS) مطلوبة' });
    }

    const current = getCurrentDayInfo();
    // إذا لم يحدد يوم، نعتمد اليوم الحالي ليكون يوم الزيارة الأسبوعي الدوري
    const targetDay = assigned_day || current.dayName;
    const targetDayAr = DAYS_AR[targetDay] || current.dayNameAr;

    const stmt = db.prepare(`
      INSERT INTO stores (name, owner_name, phone, latitude, longitude, assigned_day, assigned_day_ar, rep_id, address_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      name,
      owner_name || '',
      phone || '',
      parseFloat(latitude),
      parseFloat(longitude),
      targetDay,
      targetDayAr,
      rep_id || 1,
      address_notes || ''
    );

    const storeId = result.lastInsertRowid;

    // تسجيل الزيارة الأولى تلقائياً عند حفظ المحل لأول مرة
    const visitStmt = db.prepare(`
      INSERT INTO visits (store_id, rep_id, visit_date, visit_time, visit_day_ar, rep_lat, rep_lng, distance_meters, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'زيارة التأسيس وتسجيل الموقع لأول مرة')
    `);
    visitStmt.run(storeId, rep_id || 1, current.dateStr, current.timeStr, current.dayNameAr, parseFloat(latitude), parseFloat(longitude));

    res.json({
      success: true,
      message: `تم حفظ المحل (${name}) وتثبيت موقعه الجغرافي وجدولته ليوم (${targetDayAr})`,
      storeId,
      assignedDay: targetDayAr
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. جلب خطة اليوم والمحلات المطلوب زيارتها (التذكير الأسبوعي التلقائي)
app.get('/api/stores/today', (req, res) => {
  try {
    const repId = req.query.rep_id ? parseInt(req.query.rep_id) : null;
    const current = getCurrentDayInfo();

    let query = `
      SELECT s.*, r.name as rep_name,
        (SELECT COUNT(*) FROM visits v WHERE v.store_id = s.id AND v.visit_date = ?) as visited_today,
        (SELECT v.visit_time FROM visits v WHERE v.store_id = s.id AND v.visit_date = ? ORDER BY v.id DESC LIMIT 1) as last_visit_time
      FROM stores s
      LEFT JOIN reps r ON s.rep_id = r.id
      WHERE s.assigned_day = ?
    `;
    const params = [current.dateStr, current.dateStr, current.dayName];

    if (repId) {
      query += ` AND s.rep_id = ?`;
      params.push(repId);
    }

    query += ` ORDER BY s.id ASC`;

    const stores = db.prepare(query).all(...params);

    res.json({
      success: true,
      today: {
        dayName: current.dayName,
        dayNameAr: current.dayNameAr,
        date: current.dateStr,
        totalRequired: stores.length,
        visitedCount: stores.filter(s => s.visited_today > 0).length
      },
      stores
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 5. تسجيل وصول وزيارة للمحل
app.post('/api/visits', (req, res) => {
  try {
    const { store_id, rep_id, rep_lat, rep_lng, notes } = req.body;
    if (!store_id) {
      return res.status(400).json({ success: false, message: 'معرف المحل مطلوب' });
    }

    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id);
    if (!store) {
      return res.status(404).json({ success: false, message: 'المحل غير موجود' });
    }

    const current = getCurrentDayInfo();

    // حساب المسافة بين المندوب وموقع المحل المسجل
    let distance = 0;
    if (rep_lat && rep_lng) {
      distance = calculateDistanceMeters(store.latitude, store.longitude, parseFloat(rep_lat), parseFloat(rep_lng));
    }

    const stmt = db.prepare(`
      INSERT INTO visits (store_id, rep_id, visit_date, visit_time, visit_day_ar, rep_lat, rep_lng, distance_meters, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      store_id,
      rep_id || store.rep_id || 1,
      current.dateStr,
      current.timeStr,
      current.dayNameAr,
      rep_lat ? parseFloat(rep_lat) : null,
      rep_lng ? parseFloat(rep_lng) : null,
      distance,
      notes || 'تمت الزيارة بنجاح'
    );

    res.json({
      success: true,
      message: `تم تسجيل وصولك لمحل (${store.name}) بنجاح الساعة ${current.timeStr}`,
      distanceMeters: distance,
      isCloseEnough: distance <= 150 // نطاق 150 متر
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 5.5. جلب سجل الزيارات وتدقيق التحقق الجغرافي (كشف الزيارات المشبوهة خارج النطاق)
app.get('/api/visits', (req, res) => {
  try {
    const { rep_id, date, suspicious } = req.query;
    let query = `
      SELECT v.*, s.name as store_name, s.latitude as store_lat, s.longitude as store_lng, 
             s.owner_name, s.phone as store_phone, r.name as rep_name,
             (CASE WHEN v.distance_meters > 150 THEN 1 ELSE 0 END) as is_out_of_range
      FROM visits v
      INNER JOIN stores s ON v.store_id = s.id
      LEFT JOIN reps r ON v.rep_id = r.id
      WHERE 1=1
    `;
    const params = [];

    if (rep_id) {
      query += ` AND v.rep_id = ?`;
      params.push(parseInt(rep_id));
    }
    if (date) {
      query += ` AND v.visit_date = ?`;
      params.push(date);
    }
    if (suspicious === 'true') {
      query += ` AND v.distance_meters > 150`;
    }

    query += ` ORDER BY v.id DESC LIMIT 100`;

    const visits = db.prepare(query).all(...params);
    res.json({ success: true, count: visits.length, data: visits });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 6. جلب جميع المحلات للأونر (مع إمكانية الفلترة باليوم أو المندوب)
app.get('/api/stores', (req, res) => {
  try {
    const { day, rep_id, search } = req.query;
    let query = `
      SELECT s.*, r.name as rep_name,
        (SELECT COUNT(*) FROM visits WHERE store_id = s.id) as total_visits,
        (SELECT MAX(visit_date || ' ' || visit_time) FROM visits WHERE store_id = s.id) as last_visit
      FROM stores s
      LEFT JOIN reps r ON s.rep_id = r.id
      WHERE 1=1
    `;
    const params = [];

    if (day) {
      query += ` AND s.assigned_day = ?`;
      params.push(day);
    }
    if (rep_id) {
      query += ` AND s.rep_id = ?`;
      params.push(parseInt(rep_id));
    }
    if (search) {
      query += ` AND (s.name LIKE ? OR s.owner_name LIKE ? OR s.phone LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY s.id DESC`;

    const stores = db.prepare(query).all(...params);
    res.json({ success: true, count: stores.length, data: stores });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 7. لوحة إحصائيات الأونر (Dashboard Overview)
app.get('/api/dashboard/stats', (req, res) => {
  try {
    const current = getCurrentDayInfo();

    const totalStores = db.prepare('SELECT COUNT(*) as count FROM stores').get().count;
    const totalReps = db.prepare('SELECT COUNT(*) as count FROM reps WHERE active = 1').get().count;
    const todayTarget = db.prepare('SELECT COUNT(*) as count FROM stores WHERE assigned_day = ?').get(current.dayName).count;
    const todayCompleted = db.prepare(`
      SELECT COUNT(DISTINCT v.store_id) as count 
      FROM visits v 
      INNER JOIN stores s ON v.store_id = s.id 
      WHERE v.visit_date = ? AND s.assigned_day = ?
    `).get(current.dateStr, current.dayName).count;

    const dayDistribution = db.prepare(`
      SELECT assigned_day_ar as day, COUNT(*) as count 
      FROM stores 
      GROUP BY assigned_day_ar
    `).all();

    const totalVisits = db.prepare('SELECT COUNT(*) as count FROM visits').get().count;
    const suspiciousVisits = db.prepare('SELECT COUNT(*) as count FROM visits WHERE distance_meters > 150').get().count;
    const validVisits = totalVisits - suspiciousVisits;
    const complianceRate = totalVisits > 0 ? Math.round((validVisits / totalVisits) * 100) : 100;

    res.json({
      success: true,
      current: {
        date: current.dateStr,
        dayAr: current.dayNameAr
      },
      stats: {
        totalStores,
        totalReps,
        todayTarget,
        todayCompleted,
        completionRate: todayTarget > 0 ? Math.min(100, Math.round((todayCompleted / todayTarget) * 100)) : 0,
        totalVisits,
        suspiciousVisits,
        validVisits,
        complianceRate
      },
      dayDistribution
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 8. تصدير قاعدة بيانات المحلات إلى CSV للأونر
app.get('/api/export/csv', (req, res) => {
  try {
    const stores = db.prepare(`
      SELECT s.id, s.name, s.owner_name, s.phone, s.assigned_day_ar, s.latitude, s.longitude, 
             s.address_notes, s.created_at, r.name as rep_name
      FROM stores s
      LEFT JOIN reps r ON s.rep_id = r.id
      ORDER BY s.id ASC
    `).all();

    let csv = '\uFEFF'; // UTF-8 BOM for Excel Arabic support
    csv += 'المعرف,اسم المحل,اسم المسؤول,الهاتف,يوم الزيارة الدوري,خط العرض (Latitude),خط الطول (Longitude),المندوب,ملاحظات,تاريخ التسجيل\n';

    for (const s of stores) {
      csv += `"${s.id}","${s.name}","${s.owner_name || ''}","${s.phone || ''}","${s.assigned_day_ar}","${s.latitude}","${s.longitude}","${s.rep_name || ''}","${s.address_notes || ''}","${s.created_at}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=points_of_sale_database.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 السيرفر يعمل الآن على: http://localhost:${PORT}`);
});
