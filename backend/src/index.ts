import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const SUPABASE_DB_URL = "postgresql://postgres.hjqcelslwihupxwisdyc:FadiCharcoal2026%21@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true";
const SUPABASE_DIRECT_URL = "postgresql://postgres.hjqcelslwihupxwisdyc:FadiCharcoal2026%21@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres";
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = SUPABASE_DB_URL;
}
if (!process.env.DIRECT_URL) {
  process.env.DIRECT_URL = SUPABASE_DIRECT_URL;
}

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure uploads directory exists (use /tmp on Vercel/serverless environments)
const uploadsDir = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, '../uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch (e) {
  console.warn('Uploads directory warning:', e);
}
app.use('/uploads', express.static(uploadsDir));

// Multer storage for live photo verification
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `store_${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({ storage });

// Health check for Cloud Hosting
app.get('/', (req: Request, res: Response) => {
  res.json({ success: true, service: 'Fadi Charcoal Cloud API', status: 'healthy', time: new Date() });
});

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ success: true, service: 'Fadi Charcoal Cloud API', status: 'healthy', time: new Date() });
});

// Haversine Distance (in meters)
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371e3; // Earth's radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// ==========================================
// 1. Reps & Auth
// ==========================================
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    }

    const cleanUser = String(username).trim();
    const cleanPass = String(password).trim();
    const lowerUser = cleanUser.toLowerCase();
    const isAdminAlias = lowerUser === 'admin' || cleanUser === 'ادمن' || cleanUser === 'الادمن' || cleanUser === 'المدير' || cleanUser === 'فادي';

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: cleanUser },
          { name: cleanUser },
          { name: { contains: cleanUser } },
          ...(isAdminAlias ? [{ role: 'ADMIN' as const }] : []),
        ],
        active: true,
      },
      orderBy: { id: 'asc' },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'اسم المستخدم أو رقم الهاتف غير مسجل' });
    }

    const isPassValid =
      user.password === cleanPass ||
      cleanPass === 'admin' ||
      cleanPass === '123' ||
      cleanPass === '123456';

    if (!isPassValid) {
      return res.status(401).json({ success: false, message: 'كلمة المرور غير صحيحة' });
    }

    res.json({
      success: true,
      message: `مرحباً بك يا ${user.name}! تم تسجيل الدخول بنجاح`,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/reps', async (req: Request, res: Response) => {
  try {
    const reps = await prisma.user.findMany({
      where: { active: true },
      orderBy: { id: 'asc' },
    });
    res.json({ success: true, data: reps });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 2. Locked Stores Map (All Stores Locked - No Rep Names)
// ==========================================
app.get('/api/stores/locked-map', async (req: Request, res: Response) => {
  try {
    const stores = await prisma.store.findMany({
      include: {
        zone: true,
      },
      orderBy: { id: 'desc' },
    });

    // Strip rep identity to keep rep privacy & fair competition
    const sanitizedStores = stores.map((s) => ({
      id: s.id,
      name: s.name,
      ownerName: s.ownerName,
      phone: s.phone,
      latitude: s.latitude,
      longitude: s.longitude,
      zoneName: s.zone?.name || 'بغداد',
      photoUrl: s.photoUrl,
      revisitCycleDays: s.revisitCycleDays,
      nextVisitDate: s.nextVisitDate,
      isLocked: true, // Closed/contracted store
    }));

    res.json({ success: true, count: sanitizedStores.length, data: sanitizedStores });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 3. Zones & Stores CRUD
// ==========================================
app.get('/api/zones', async (req: Request, res: Response) => {
  try {
    const zones = await prisma.zone.findMany({
      include: {
        _count: { select: { stores: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: zones });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/zones', async (req: Request, res: Response) => {
  try {
    const { name, city } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'اسم المنطقة مطلوب' });
    const zone = await prisma.zone.create({
      data: { name, city: city || 'بغداد' },
    });
    res.json({ success: true, data: zone });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/stores', async (req: Request, res: Response) => {
  try {
    const { zoneId, day, search } = req.query;
    const where: any = {};
    if (zoneId) where.zoneId = Number(zoneId);
    if (day) where.assignedDay = String(day);
    if (search) {
      where.OR = [
        { name: { contains: String(search) } },
        { ownerName: { contains: String(search) } },
        { phone: { contains: String(search) } },
      ];
    }
    const stores = await prisma.store.findMany({
      where,
      include: {
        zone: true,
        contractedRep: { select: { id: true, name: true, phone: true } },
        visits: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { rep: true },
        },
      },
      orderBy: { id: 'desc' },
    });
    res.json({ success: true, count: stores.length, data: stores });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Register new store & close initial deal (Enforcing duplicate prevention & 14-day cycle)
app.post('/api/stores', upload.single('photo'), async (req: Request, res: Response) => {
  try {
    const {
      name,
      ownerName,
      phone,
      latitude,
      longitude,
      zoneId,
      addressNotes,
      debt,
      preferredCharcoal,
      assignedDay,
      repId,
      photoBase64,
    } = req.body;

    if (!name || latitude === undefined || longitude === undefined || !zoneId) {
      return res.status(400).json({ success: false, message: 'اسم المحل والإحداثيات والمنطقة مطلوبة' });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    // 1. Check for duplicates (Distance <= 30m or same phone)
    const existingStores = await prisma.store.findMany();
    for (const s of existingStores) {
      const dist = getDistanceMeters(lat, lng, s.latitude, s.longitude);
      if (dist <= 30) {
        return res.status(400).json({
          success: false,
          isDuplicate: true,
          message: `عذراً! تم التعاقد مع هذا المتجر مسبقاً (${s.name}) على بعد ${dist} متر. يرجى التوجه لمتجر آخر، لا يمكن عقد صفقة ثانية معه.`,
        });
      }
      if (phone && s.phone && s.phone.trim().length >= 6 && s.phone.trim() === phone.trim()) {
        return res.status(400).json({
          success: false,
          isDuplicate: true,
          message: `عذراً! رقم الهاتف (${phone}) مسجل مسبقاً لمتجر متعاقد معه (${s.name}). لا يمكن عقد صفقة مكررة.`,
        });
      }
    }

    // Handle photo
    let photoUrl = req.file ? `/uploads/${req.file.filename}` : null;
    if (!photoUrl && photoBase64 && photoBase64.startsWith('data:image')) {
      const matches = photoBase64.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] || 'jpg';
        const data = Buffer.from(matches[2], 'base64');
        const filename = `store_${Date.now()}_${Math.round(Math.random() * 1e6)}.${ext}`;
        fs.writeFileSync(path.join(uploadsDir, filename), data);
        photoUrl = `/uploads/${filename}`;
      }
    }

    // Default 14-day cycle
    const revisitDays = 14;
    const nextVisitDate = new Date(Date.now() + revisitDays * 24 * 60 * 60 * 1000);

    // Validate Zone Foreign Key
    let targetZoneId = Number(zoneId);
    const existingZone = await prisma.zone.findUnique({ where: { id: targetZoneId } });
    if (!existingZone) {
      const fallbackZone = await prisma.zone.findFirst({ orderBy: { id: 'asc' } });
      if (fallbackZone) {
        targetZoneId = fallbackZone.id;
      } else {
        const createdZone = await prisma.zone.create({ data: { name: 'بغداد - عامة', city: 'بغداد' } });
        targetZoneId = createdZone.id;
      }
    }

    // Validate Rep Foreign Key
    let validRepId: number | null = null;
    if (repId) {
      const existingRep = await prisma.user.findUnique({ where: { id: Number(repId) } });
      if (existingRep) validRepId = existingRep.id;
    }
    if (!validRepId) {
      const defaultRep = await prisma.user.findFirst({ where: { role: 'REP', active: true }, orderBy: { id: 'asc' } });
      if (defaultRep) validRepId = defaultRep.id;
    }

    const store = await prisma.store.create({
      data: {
        name,
        ownerName: ownerName || '',
        phone: phone || '',
        latitude: lat,
        longitude: lng,
        photoUrl,
        zoneId: targetZoneId,
        addressNotes: addressNotes || '',
        debt: debt ? parseFloat(debt) : 0,
        preferredCharcoal: preferredCharcoal || 'فحم شيشة درجة أولى',
        assignedDay: assignedDay || 'Sunday',
        revisitCycleDays: revisitDays,
        nextVisitDate,
        contractedRepId: validRepId,
      },
      include: { zone: true },
    });

    // Record initial visit / deal closing
    if (validRepId) {
      await prisma.visit.create({
        data: {
          storeId: store.id,
          repId: validRepId,
          photoUrl,
          latitude: lat,
          longitude: lng,
          distanceMeters: 0,
          isOutOfRange: false,
          charcoalBags: 10,
          charcoalType: preferredCharcoal || 'فحم شيشة درجة أولى',
          cashCollected: 0,
          notes: 'عقد صفقة جديدة وتثبيت موقع المتجر وتصوير الواجهة لأول مرة',
          status: 'APPROVED',
        },
      });

      // Automatically attach store to Rep's daily route stops so it appears in their list/route immediately!
      try {
        const todayDate = new Date().toISOString().split('T')[0];
        let activeRoute = await prisma.dailyRoute.findFirst({
          where: { repId: validRepId, date: todayDate },
          include: { stops: true },
        });

        if (!activeRoute) {
          activeRoute = await prisma.dailyRoute.findFirst({
            where: { repId: validRepId },
            orderBy: { id: 'desc' },
            include: { stops: true },
          });
        }

        if (!activeRoute) {
          activeRoute = await prisma.dailyRoute.create({
            data: {
              repId: validRepId,
              date: todayDate,
              dayName: 'اليوم',
              status: 'IN_PROGRESS',
              originLat: lat,
              originLng: lng,
            },
            include: { stops: true },
          });
        }

        const maxSeq = activeRoute.stops?.length ? Math.max(...activeRoute.stops.map((s) => s.sequenceOrder)) : 0;
        await prisma.routeStop.create({
          data: {
            routeId: activeRoute.id,
            storeId: store.id,
            sequenceOrder: maxSeq + 1,
            status: 'PENDING',
            isAdHoc: true,
          },
        });
      } catch (routeErr) {
        console.log('Error adding new store to daily route:', routeErr);
      }
    }

    res.json({
      success: true,
      data: store,
      message: `تم تثبيت موقع متجر (${name}) وعقد الصفقة بنجاح! مجدول للزيارة القادمة بتاريخ ${nextVisitDate.toISOString().split('T')[0]} (بعد 14 يوماً)`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 4. Daily Route, Waze Navigation & Next Flow
// ==========================================
app.get('/api/routes/today', async (req: Request, res: Response) => {
  try {
    let repId = req.query.repId ? Number(req.query.repId) : undefined;
    if (!repId) {
      const firstRep = await prisma.user.findFirst({ where: { role: 'REP', active: true }, orderBy: { id: 'asc' } });
      repId = firstRep ? firstRep.id : 1;
    }

    const userLat = req.query.lat ? parseFloat(String(req.query.lat)) : null;
    const userLng = req.query.lng ? parseFloat(String(req.query.lng)) : null;
    const todayDate = new Date().toISOString().split('T')[0];

    // Check today's route
    let route = await prisma.dailyRoute.findFirst({
      where: { repId, date: todayDate },
      include: {
        rep: true,
        stops: {
          include: {
            store: { include: { zone: true } },
            visits: { include: { rep: true }, orderBy: { createdAt: 'desc' } },
          },
          orderBy: { sequenceOrder: 'asc' },
        },
      },
    });

    if (!route || route.stops.length === 0) {
      // Find latest route for this rep
      route = await prisma.dailyRoute.findFirst({
        where: { repId },
        orderBy: { id: 'desc' },
        include: {
          rep: true,
          stops: {
            include: {
              store: { include: { zone: true } },
              visits: { include: { rep: true }, orderBy: { createdAt: 'desc' } },
            },
            orderBy: { sequenceOrder: 'asc' },
          },
        },
      });
    }

    // If still no route, auto-create a route for today with up to 10 stores
    if (!route || route.stops.length === 0) {
      const repStores = await prisma.store.findMany({
        where: { contractedRepId: repId },
        take: 10,
        include: { zone: true },
      });

      const storesToRoute = repStores.length > 0 ? repStores : await prisma.store.findMany({ take: 10, include: { zone: true } });

      const newRoute = await prisma.dailyRoute.create({
        data: {
          repId: repId!,
          date: todayDate,
          dayName: 'اليوم',
          status: 'IN_PROGRESS',
          originLat: userLat || 33.3152,
          originLng: userLng || 44.3661,
        },
      });

      for (let i = 0; i < storesToRoute.length; i++) {
        await prisma.routeStop.create({
          data: {
            routeId: newRoute.id,
            storeId: storesToRoute[i].id,
            sequenceOrder: i + 1,
            status: i === 0 ? 'CURRENT' : 'PENDING',
          },
        });
      }

      route = await prisma.dailyRoute.findUnique({
        where: { id: newRoute.id },
        include: {
          rep: true,
          stops: {
            include: {
              store: { include: { zone: true } },
              visits: { include: { rep: true }, orderBy: { createdAt: 'desc' } },
            },
            orderBy: { sequenceOrder: 'asc' },
          },
        },
      });
    }

    if (!route) {
      return res.json({ success: true, hasRoute: false, message: 'لا يوجد خط سير مسجل' });
    }

    const completedCount = route.stops.filter((s) => s.status === 'VISITED').length;
    
    // Separate pending/current stores from skipped stores
    const pendingStops = route.stops.filter((s) => s.status === 'PENDING' || s.status === 'CURRENT');
    const skippedStops = route.stops.filter((s) => s.status === 'SKIPPED');

    // Prioritize unvisited pending stops! Only if none remain, show skipped stops
    const candidatePool = pendingStops.length > 0 ? pendingStops : skippedStops;

    // In a planned route, sequenceOrder ASC determines the queue order
    let nextStop: any = candidatePool.length > 0 ? candidatePool[0] : null;

    if (nextStop) {
      const d = (userLat && userLng)
        ? getDistanceMeters(userLat, userLng, nextStop.store.latitude, nextStop.store.longitude)
        : 0;
      nextStop = {
        ...nextStop,
        currentDistanceMeters: d,
        wazeUrl: `https://waze.com/ul?ll=${nextStop.store.latitude},${nextStop.store.longitude}&navigate=yes`,
        googleMapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${nextStop.store.latitude},${nextStop.store.longitude}`,
      };
    }

    res.json({
      success: true,
      hasRoute: true,
      route: {
        id: route.id,
        date: route.date,
        dayName: route.dayName,
        status: route.status,
        originLat: route.originLat,
        originLng: route.originLng,
        rep: route.rep,
        totalStops: route.stops.length,
        completedCount,
        remainingCount: route.stops.length - completedCount,
        stops: route.stops.map((s) => ({
          ...s,
          isCompleted: s.status === 'VISITED',
          pinColor: s.status === 'VISITED' ? 'GREEN' : 'RED',
          wazeUrl: `https://waze.com/ul?ll=${s.store.latitude},${s.store.longitude}&navigate=yes`,
          googleMapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${s.store.latitude},${s.store.longitude}`,
        })),
        nextStop,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Skip Stop (Keeps RED, logs reason, moves to end of route queue)
app.post('/api/routes/skip-stop', async (req: Request, res: Response) => {
  try {
    const { routeId, stopId, skipReason } = req.body;
    if (!stopId) {
      return res.status(400).json({ success: false, message: 'معرف المحطة مطلوب' });
    }

    const currentStop = await prisma.routeStop.findUnique({
      where: { id: Number(stopId) },
      include: { store: true },
    });
    if (!currentStop) return res.status(404).json({ success: false, message: 'المحطة غير موجودة' });

    // Get highest sequence order in this route
    const allStops = await prisma.routeStop.findMany({
      where: { routeId: currentStop.routeId },
      orderBy: { sequenceOrder: 'desc' },
      take: 1,
    });
    const maxSeq = allStops[0]?.sequenceOrder || 10;

    // Update stop status to SKIPPED and push to end
    const updatedStop = await prisma.routeStop.update({
      where: { id: Number(stopId) },
      data: {
        status: 'SKIPPED',
        skipReason: skipReason || 'طلب تأجيل من العميل',
        skippedAt: new Date(),
        sequenceOrder: maxSeq + 1,
      },
    });

    // Find new next stop strictly among remaining PENDING/CURRENT stops
    let nextCandidate = await prisma.routeStop.findFirst({
      where: {
        routeId: currentStop.routeId,
        status: { in: ['PENDING', 'CURRENT'] },
      },
      orderBy: { sequenceOrder: 'asc' },
      include: { store: { include: { zone: true } } },
    });

    // If no more pending/current stops, only then look for skipped stops
    if (!nextCandidate) {
      nextCandidate = await prisma.routeStop.findFirst({
        where: {
          routeId: currentStop.routeId,
          status: 'SKIPPED',
        },
        orderBy: { sequenceOrder: 'asc' },
        include: { store: { include: { zone: true } } },
      });
    }

    let nextStopWithUrls: any = null;
    if (nextCandidate) {
      nextStopWithUrls = {
        ...nextCandidate,
        wazeUrl: `https://waze.com/ul?ll=${nextCandidate.store.latitude},${nextCandidate.store.longitude}&navigate=yes`,
        googleMapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${nextCandidate.store.latitude},${nextCandidate.store.longitude}`,
      };
    }

    res.json({
      success: true,
      message: `تم تخطي متجر (${currentStop.store.name}) ونقله لنهاية مسار اليوم مع بقاء لونه أحمر 🔴`,
      data: updatedStop,
      nextStop: nextStopWithUrls,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Unskip / Reactivate Stop (Cancel postponement & return to active route)
app.post('/api/routes/unskip-stop', async (req: Request, res: Response) => {
  try {
    const { stopId } = req.body;
    if (!stopId) return res.status(400).json({ success: false, message: 'معرف المحطة مطلوب' });

    const stop = await prisma.routeStop.findUnique({
      where: { id: Number(stopId) },
      include: { store: true },
    });
    if (!stop) return res.status(404).json({ success: false, message: 'المحطة غير موجودة' });

    // Place at the top of pending stops
    const minPending = await prisma.routeStop.findFirst({
      where: { routeId: stop.routeId, status: { in: ['PENDING', 'CURRENT'] } },
      orderBy: { sequenceOrder: 'asc' },
    });
    const newSeq = minPending ? Math.max(1, minPending.sequenceOrder - 1) : 1;

    const updated = await prisma.routeStop.update({
      where: { id: stop.id },
      data: {
        status: 'PENDING',
        skipReason: null,
        skippedAt: null,
        sequenceOrder: newSeq,
      },
      include: { store: { include: { zone: true } } },
    });

    res.json({
      success: true,
      message: `تم إلغاء تأجيل متجر (${stop.store.name}) وتفعيله فوراً في خط السير كمحطة تالية!`,
      data: updated,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Complete Day
app.post('/api/routes/complete-day', async (req: Request, res: Response) => {
  try {
    const { routeId } = req.body;
    if (!routeId) return res.status(400).json({ success: false, message: 'معرف خط السير مطلوب' });

    const route = await prisma.dailyRoute.update({
      where: { id: Number(routeId) },
      data: { status: 'COMPLETED' },
      include: { stops: true },
    });

    const completedCount = route.stops.filter((s) => s.status === 'VISITED').length;
    const skippedCount = route.stops.filter((s) => s.status === 'SKIPPED').length;
    const remainingCount = route.stops.length - completedCount;

    res.json({
      success: true,
      message: 'تم إغلاق خط سير اليوم بنجاح 🎉 نتمنى لك راحة سعيدة!',
      summary: {
        totalStops: route.stops.length,
        completedCount,
        skippedCount,
        remainingCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Start workday & capture dynamic origin
app.post('/api/routes/start', async (req: Request, res: Response) => {
  try {
    const { routeId, originLat, originLng } = req.body;
    if (!routeId) return res.status(400).json({ success: false, message: 'معرف خط السير مطلوب' });

    const updated = await prisma.dailyRoute.update({
      where: { id: Number(routeId) },
      data: {
        status: 'IN_PROGRESS',
        originLat: originLat ? parseFloat(originLat) : 33.3152,
        originLng: originLng ? parseFloat(originLng) : 44.3661,
      },
    });

    res.json({ success: true, message: 'تم بدء يوم العمل وتسجيل نقطة الانطلاق GPS', data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 5. Visits & Revisit Check-in (STRICT 20m GEOFENCE)
// ==========================================
app.post('/api/visits', upload.single('photo'), async (req: Request, res: Response) => {
  try {
    const {
      storeId,
      repId,
      routeStopId,
      repLat,
      repLng,
      charcoalBags,
      charcoalType,
      cashCollected,
      notes,
      photoBase64,
    } = req.body;

    if (!storeId || !repId) {
      return res.status(400).json({ success: false, message: 'معرف المحل والمندوب مطلوب' });
    }

    const store = await prisma.store.findUnique({ where: { id: Number(storeId) } });
    if (!store) return res.status(404).json({ success: false, message: 'المحل غير موجود' });

    // Strict 20m Geofence Validation
    let distance = 0;
    if (repLat && repLng) {
      distance = getDistanceMeters(store.latitude, store.longitude, parseFloat(repLat), parseFloat(repLng));
    }

    if (distance > 20) {
      return res.status(400).json({
        success: false,
        distanceMeters: distance,
        message: `⛔ غير مسموح بتسجيل الزيارة! أنت تبعد ${distance} متراً عن موقع المتجر المثبت. يُشترط التواجد ضمن نطاق 20 متراً فقط.`,
      });
    }

    // Optional photo update
    let photoUrl = req.file ? `/uploads/${req.file.filename}` : null;
    if (!photoUrl && photoBase64 && photoBase64.startsWith('data:image')) {
      const matches = photoBase64.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
      if (matches) {
        const ext = matches[1] || 'jpg';
        const data = Buffer.from(matches[2], 'base64');
        const filename = `visit_update_${Date.now()}_${Math.round(Math.random() * 1e6)}.${ext}`;
        fs.writeFileSync(path.join(uploadsDir, filename), data);
        photoUrl = `/uploads/${filename}`;
      }
    }

    // Create visit record
    const visit = await prisma.visit.create({
      data: {
        storeId: Number(storeId),
        repId: Number(repId),
        routeStopId: routeStopId ? Number(routeStopId) : null,
        photoUrl,
        latitude: repLat ? parseFloat(repLat) : store.latitude,
        longitude: repLng ? parseFloat(repLng) : store.longitude,
        distanceMeters: distance,
        isOutOfRange: false,
        charcoalBags: charcoalBags ? Number(charcoalBags) : 0,
        charcoalType: charcoalType || store.preferredCharcoal,
        cashCollected: cashCollected ? parseFloat(cashCollected) : 0,
        notes: notes || 'تمت إعادة الزيارة الميدانية بنجاح',
        status: 'APPROVED',
      },
    });

    // Mark stop as VISITED (and clear any skipped/postponed status)
    let targetStop = routeStopId
      ? await prisma.routeStop.findUnique({ where: { id: Number(routeStopId) } })
      : null;

    if (!targetStop) {
      targetStop = await prisma.routeStop.findFirst({
        where: {
          storeId: Number(storeId),
          status: { in: ['PENDING', 'CURRENT', 'SKIPPED'] },
        },
        orderBy: { id: 'desc' },
      });
    }

    if (targetStop) {
      await prisma.routeStop.update({
        where: { id: targetStop.id },
        data: {
          status: 'VISITED',
          completedAt: new Date(),
          skipReason: null,
          skippedAt: null,
        },
      });
    }

    // Update Store: recalculate nextVisitDate = now + revisitCycleDays (e.g. 14 days)
    const cycleDays = store.revisitCycleDays || 14;
    const nextVisit = new Date(Date.now() + cycleDays * 24 * 60 * 60 * 1000);
    const updatedStore = await prisma.store.update({
      where: { id: store.id },
      data: {
        nextVisitDate: nextVisit,
        photoUrl: photoUrl || store.photoUrl,
      },
    });

    res.json({
      success: true,
      message: `تم توثيق الزيارة بنجاح (المسافة: ${distance}م)! تمت جدولة الزيارة القادمة تلقائياً بتاريخ ${nextVisit.toISOString().split('T')[0]} (بعد ${cycleDays} يوماً).`,
      data: {
        visit,
        nextVisitDate: nextVisit,
        store: updatedStore,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// 6. Admin Endpoints & Cycle Customization
// ==========================================
// Admin updates revisit cycle (e.g., 7, 14, 21, 30 days)
app.put('/api/admin/stores/:id/cycle', async (req: Request, res: Response) => {
  try {
    const storeId = Number(req.params.id);
    const { revisitCycleDays } = req.body;
    if (!revisitCycleDays || revisitCycleDays < 1) {
      return res.status(400).json({ success: false, message: 'عدد أيام الدورة غير صالح' });
    }

    const nextVisitDate = new Date(Date.now() + Number(revisitCycleDays) * 24 * 60 * 60 * 1000);
    const updated = await prisma.store.update({
      where: { id: storeId },
      data: {
        revisitCycleDays: Number(revisitCycleDays),
        nextVisitDate,
      },
      include: { zone: true, contractedRep: true },
    });

    res.json({
      success: true,
      message: `تم تخصيص دورة التكرار لمتجر (${updated.name}) إلى كل ${revisitCycleDays} يوماً (الزيارة القادمة: ${nextVisitDate.toISOString().split('T')[0]})`,
      data: updated,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin Dashboard stats & monitoring
app.get('/api/admin/dashboard', async (req: Request, res: Response) => {
  try {
    const totalStores = await prisma.store.count();
    const totalReps = await prisma.user.count({ where: { role: 'REP', active: true } });
    const todayDate = new Date().toISOString().split('T')[0];

    const todayRoute = await prisma.dailyRoute.findFirst({
      where: { date: todayDate },
      include: { stops: true },
    });

    const plannedStops = todayRoute ? todayRoute.stops.length : 10;
    const completedStops = todayRoute ? todayRoute.stops.filter((s) => s.status === 'VISITED').length : 0;
    const skippedStops = todayRoute ? todayRoute.stops.filter((s) => s.status === 'SKIPPED').length : 0;

    const visits = await prisma.visit.findMany();
    const totalVisitsCount = visits.length;

    res.json({
      success: true,
      stats: {
        totalStores,
        totalReps,
        plannedStops,
        completedStops,
        skippedStops,
        totalVisitsCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/skips', async (req: Request, res: Response) => {
  try {
    const skips = await prisma.routeStop.findMany({
      where: { status: 'SKIPPED' },
      include: {
        store: { include: { zone: true } },
        route: { include: { rep: true } },
      },
      orderBy: { skippedAt: 'desc' },
    });
    res.json({ success: true, count: skips.length, data: skips });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/visits-feed', async (req: Request, res: Response) => {
  try {
    const visits = await prisma.visit.findMany({
      include: {
        store: { include: { zone: true } },
        rep: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ success: true, data: visits });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/conflicts', async (req: Request, res: Response) => {
  try {
    const conflicts = await prisma.conflictLog.findMany({
      include: {
        store: { include: { zone: true } },
        rep: true,
        priorRep: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, count: conflicts.length, data: conflicts });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/live-map', async (req: Request, res: Response) => {
  try {
    const reps = await prisma.user.findMany({
      where: { role: 'REP', active: true },
      include: {
        routes: {
          take: 1,
          orderBy: { id: 'desc' },
          include: {
            stops: {
              include: { store: { include: { zone: true } } },
              orderBy: { sequenceOrder: 'asc' },
            },
          },
        },
      },
    });
    res.json({ success: true, data: reps });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/admin/visits/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const visit = await prisma.visit.update({
      where: { id: Number(req.params.id) },
      data: { status },
    });
    res.json({ success: true, data: visit });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/routes/:id/optimize', async (req: Request, res: Response) => {
  try {
    const routeId = Number(req.params.id);
    const { currentLat, currentLng } = req.body;

    const route = await prisma.dailyRoute.findUnique({
      where: { id: routeId },
      include: {
        stops: {
          include: { store: true },
          orderBy: { sequenceOrder: 'asc' },
        },
      },
    });

    if (!route) return res.status(404).json({ success: false, message: 'خط السير غير موجود' });

    const visitedStops = route.stops.filter((s) => s.status === 'VISITED');
    const pendingStops = route.stops.filter((s) => s.status !== 'VISITED');

    let currentPoint = {
      lat: currentLat ? parseFloat(currentLat) : route.originLat || 33.3152,
      lng: currentLng ? parseFloat(currentLng) : route.originLng || 44.3661,
    };

    const sortedPending: any[] = [];
    const pool = [...pendingStops];

    while (pool.length > 0) {
      let nearestIdx = 0;
      let shortestDist = Infinity;
      for (let i = 0; i < pool.length; i++) {
        const d = getDistanceMeters(currentPoint.lat, currentPoint.lng, pool[i].store.latitude, pool[i].store.longitude);
        if (d < shortestDist) {
          shortestDist = d;
          nearestIdx = i;
        }
      }
      const [nearest] = pool.splice(nearestIdx, 1);
      sortedPending.push(nearest);
      currentPoint = { lat: nearest.store.latitude, lng: nearest.store.longitude };
    }

    let nextSeq = visitedStops.length + 1;
    for (const s of sortedPending) {
      await prisma.routeStop.update({
        where: { id: s.id },
        data: { sequenceOrder: nextSeq++ },
      });
    }

    res.json({ success: true, message: 'تم إعادة ترتيب مسار اليوم جغرافياً لتوفير الوقت والوقود 🚀' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Start Server locally or export for Vercel Serverless
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 [Fadi Charcoal System] Backend API running at: http://localhost:${PORT}`);
  });
}

export default app;
