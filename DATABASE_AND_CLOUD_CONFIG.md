# 🗄️ إعدادات وبيانات السحابة وقاعدة البيانات - منظومة فادي الفهد

هذا المستند يحتوي على كافة بيانات الوصول الحساسة وطرق الربط لجميع أجزاء المشروع، لتمكين أي مطور من مواصلة العمل وتشغيل النظام فوراً دون انقطاع.

---

## 1. 🐘 قاعدة البيانات السحابية (Supabase PostgreSQL Cloud)

- **نوع المحرك:** PostgreSQL 16
- **الموقع الجغرافي:** AWS Tokyo (`ap-northeast-1`)
- **المضيف (Host):** `aws-1-ap-northeast-1.pooler.supabase.com`
- **المستخدم:** `postgres.hjqcelslwihupxwisdyc`
- **كلمة المرور:** `FadiCharcoal2026!`
- **اسم القاعدة:** `postgres`
- **المشروع:** `hjqcelslwihupxwisdyc`

### روابط الاتصال (Connection Strings):
```bash
# رابط الاتصال المجمع (Prisma Pooler - Port 6543)
DATABASE_URL="postgresql://postgres.hjqcelslwihupxwisdyc:FadiCharcoal2026%21@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# رابط الاتصال المباشر للهجرات (Direct Session - Port 5432)
DIRECT_URL="postgresql://postgres.hjqcelslwihupxwisdyc:FadiCharcoal2026%21@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres"
```

---

## 2. 🔥 الاستضافة السحابية للواجهات (Firebase Hosting)

- **حساب الإدارة:** `stevo199380@gmail.com`
- **معرف المشروع (Project ID):** `fadi-charcoal-app`
- **الموقع 1 (تطبيق المندوب / الموبايل PWA):**
  - الرابط: `https://fadi-charcoal-app.web.app`
  - الرابط البديل: `https://fadi-charcoal-app.firebaseapp.com`
  - مجلد البناء: `mobile-pwa/dist`
- **الموقع 2 (لوحة تحكم الكمبيوتر الشاملة):**
  - الرابط: `https://fadi-charcoal-admin.web.app`
  - الرابط البديل: `https://fadi-charcoal-admin.firebaseapp.com`
  - مجلد البناء: `admin-dashboard/dist`

### أمر النشر والتحديث المباشر:
```powershell
npx firebase-tools deploy --only hosting
```

---

## 3. ⚡ السيرفر السحابي (Vercel Serverless Backend API)

- **الرابط الإنتاجي للـ API:** `https://fadi-charcoal-api.vercel.app`
- **معرف المشروع في فيرسيل:** `prj_UmlUGwflngRbph0Wm2ejgBjMmPqz`
- **معرف المستودع في فيرسيل (GitHub Repo ID):** `1458622428`
- **توكن فيرسيل للنشر التلقائي:**
  - البادئة: `vcp_`
  - القيمة: `6cEHFni3Sqd0z3MWcF9k9lwzRUHoocbLedZDtVLK4kbcr8kxRR2dNn1b`
  - *(يتم دمج البادئة مع القيمة لتشكيل التوكن الكامل عند استدعاء الـ API)*

---

## 4. 👥 حسابات تسجيل الدخول والمسؤولين والمندوبين

| الدور | الاسم / الصفة | اسم المستخدم / الهاتف | كلمة المرور | الصلاحية |
|---|---|---|---|---|
| **المدير العام** | فادي الفهد | `admin` أو `07700000000` أو `فادي` | `admin` أو `123` | `ADMIN` (كامل الصلاحيات والإحصائيات والرقابة) |
| **مندوب ميداني 1** | أحمد التميمي (الرصافة) | `07701111111` | `123` | `REP` (مسار الرصافة والكرادة) |
| **مندوب ميداني 2** | حيدر الكرخي (الكرخ) | `07702222222` | `123` | `REP` (مسار الكرخ والمنصور) |
| **مندوب ميداني 3** | عمر الزيدي (المنصور) | `07703333333` | `123` | `REP` (مسار الجادرية والدورة) |

---

## 5. 🛠️ أوامر التشغيل المحلي السريع للمطورين

```powershell
# 1. تثبيت الحزم وتشغيل السيرفر
cd backend
npm install
npx tsx watch src/index.ts

# 2. تشغيل تطبيق الموبايل (PWA)
cd mobile-pwa
npm install
npm run dev

# 3. تشغيل لوحة تحكم الكمبيوتر
cd admin-dashboard
npm install
npm run dev
```
