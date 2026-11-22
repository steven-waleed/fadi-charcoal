# 🚀 منظومة فادي الفهد لتوزيع الفحم (Fadi Charcoal Enterprise System)

نظام متكامل لإدارة وتتبع مندوبي مبيعات وتوزيع الفحم في بغداد، مزود بنظام قفل جغرافي صارم (20 متراً)، ربط فوري بنظام الملاحة Waze، جدولة خطوط سير دورية كل 14 يوماً، وإدارة النواقص والديون.

---

## 🌐 الروابط الرسمية الحية (Live Production URLs)

| الخدمة | الرابط المباشر | المستضيف | الوصف |
| :--- | :--- | :--- | :--- |
| 📱 **تطبيق المندوبين (Mobile PWA)** | [https://fadi-charcoal-app.web.app](https://fadi-charcoal-app.web.app) | Firebase Hosting | تطبيق ميداني للهاتف للمندوبين (Waze، GPS 20m) |
| 💻 **لوحة الإدارة العامة (Admin)** | [https://fadi-charcoal-admin.web.app](https://fadi-charcoal-admin.web.app) | Firebase Hosting | مراقبة حية، خريطة بغداد، إدارة الديون والنواقص |
| ⚡ **السيرفر السحابي (Backend API)** | [https://fadi-charcoal-api.vercel.app](https://fadi-charcoal-api.vercel.app) | Vercel Serverless | عقل النظام، معالجة الـ GPS، والجدولة الدورية |
| 🗄️ **قاعدة البيانات السحابية (DB)** | `aws-1-ap-northeast-1.pooler.supabase.com` | Supabase PostgreSQL | قاعدة بيانات سحابية دائمة في طوكيو |

---

## 🔑 البيانات الحساسة والاتصال بقاعدة البيانات (Sensitive Credentials)

### 1. قاعدة بيانات Supabase Cloud PostgreSQL:
* **المشروع:** `hjqcelslwihupxwisdyc` (Tokyo Region)
* **كلمة مرور قاعدة البيانات:** `FadiCharcoal2026!`
* **رابط Transaction Pooler (المنفذ 6543):**
  ```env
  DATABASE_URL="postgresql://postgres.hjqcelslwihupxwisdyc:FadiCharcoal2026%21@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
  ```
* **رابط Direct Session (المنفذ 5432):**
  ```env
  DIRECT_URL="postgresql://postgres.hjqcelslwihupxwisdyc:FadiCharcoal2026%21@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres"
  ```
* **لوحة تحكم Supabase Dashboard:** [https://supabase.com/dashboard/project/hjqcelslwihupxwisdyc](https://supabase.com/dashboard/project/hjqcelslwihupxwisdyc)

### 2. بيانات تسجيل دخول المستخدمين والمندوبين:
* **الإدارة (المدير العام):**
  * المستخدم: `admin` أو `07700000000`
  * كلمة المرور: `admin`
* **المندوب 1 (حيدر الكرخي):**
  * الهاتف: `07702222222` | كلمة المرور: `123`
  * *(المتجر الأول في مساره هو: كافيه ومقهى السلطان - الإحداثيات: 33.306164, 44.328395)*
* **المندوب 2 (أحمد التميمي):**
  * الهاتف: `07701111111` | كلمة المرور: `123`
* **المندوب 3 (عمر الزيدي):**
  * الهاتف: `07703333333` | كلمة المرور: `123`

### 3. إعدادات حسابات الاستضافة:
* **Firebase Project:** `fadi-charcoal-app` (المالك: `stevo199380@gmail.com`)
* **Vercel Project:** `fadi-charcoal-api` (المالك: `stevenwaleed`)

---

## 🛠️ دليل تشغيل المشروع محلياً للمطور الجديد (Local Setup Guide)

### 1. استنساخ المشروع (Clone):
```bash
git clone https://github.com/steven-waleed/fadi-charcoal.git
cd fadi-charcoal
```

### 2. تثبيت الحزم (Install Dependencies):
```bash
# تثبيت وتوليد عميل Prisma للسيرفر
cd backend
npm install
npx prisma generate

# تثبيت تطبيق المندوبين
cd ../mobile-pwa
npm install

# تثبيت لوحة الإدارة
cd ../admin-dashboard
npm install
```

### 3. تشغيل الخدمات محلياً (Run Dev Servers):
* **تشغيل السيرفر الخلفي (Port 5000):**
  ```bash
  cd backend
  npm run dev
  ```
* **تشغيل تطبيق المندوبين (Port 5173):**
  ```bash
  cd mobile-pwa
  npm run dev
  ```
* **تشغيل لوحة الإدارة (Port 5174):**
  ```bash
  cd admin-dashboard
  npm run dev
  ```

---

## 🚀 دليل النشر والتحديث السحابي (Deployment)

### 1. تحديث السيرفر على Vercel:
بمجرد إجراء أي تعديل وعمل `git push origin master` أو `git push origin main`، يقوم Vercel بإعادة البناء والنشر تلقائياً فوراً دون أي تدخل يدوي.

### 2. تحديث الواجهات على Firebase Hosting:
لبناء الواجهات ورفعها إلى Firebase:
```bash
# بناء تطبيق المندوبين
cd mobile-pwa
npx vite build

# بناء لوحة الإدارة
cd ../admin-dashboard
npx vite build

# النشر إلى Firebase
cd ..
firebase deploy --only hosting --project fadi-charcoal-app
```

---

## 🏗️ هيكلية المشروع (Architecture)

```
fadi-charcoal/
├── backend/                     # سيرفر Express + Prisma + Serverless Handler
│   ├── api/index.ts             # مدخل Vercel Serverless
│   ├── prisma/                  # مخطط قاعدة البيانات وبذور البيانات الأولية
│   │   ├── schema.prisma        # جداول PostgreSQL (Stores, Reps, Routes, Visits)
│   │   └── seed.ts              # بيانات بذور متاجر ومندوبي بغداد
│   ├── src/index.ts             # كامل مسارات الـ API وخوارزميات الـ Haversine
│   ├── vercel.json              # إعدادات إعادة التوجيه لـ Vercel
│   └── .env                     # روابط قاعدة بيانات Supabase
├── mobile-pwa/                  # تطبيق المندوبين الميداني (React + Vite + Tailwind)
│   ├── src/App.tsx              # واجهة المندوب، زر Waze، وقفل الـ 20 متر
│   ├── .env                     # بيئة التطوير المحلية (localhost:5000)
│   └── .env.production          # بيئة الإنتاج السحابية (Vercel API)
├── admin-dashboard/             # لوحة تحكم المدير العام (React + Vite + Tailwind)
│   ├── src/App.tsx              # خريطة بغداد، جدول الزيارات، الديون، وحل التضارب
│   ├── .env                     # بيئة التطوير المحلية (localhost:5000)
│   └── .env.production          # بيئة الإنتاج السحابية (Vercel API)
├── firebase.json                # إعدادات استضافة Firebase لكلا الموقعين
├── .firebaserc                  # ربط مشروع Firebase (fadi-charcoal-app)
└── README.md                    # هذا الدليل الشامل
```
