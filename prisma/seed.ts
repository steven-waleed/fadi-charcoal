import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed for "نظام إدارة وتوزيع الفحم"...');

  // 1. Clean existing records
  await prisma.conflictLog.deleteMany();
  await prisma.visit.deleteMany();
  await prisma.routeStop.deleteMany();
  await prisma.dailyRoute.deleteMany();
  await prisma.store.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.user.deleteMany();

  // 2. Users (Admin + 3 Reps)
  const admin = await prisma.user.create({
    data: {
      name: 'مدير النظام',
      phone: 'admin',
      role: 'ADMIN',
      password: 'admin',
    },
  });

  const rep1 = await prisma.user.create({
    data: {
      name: 'أحمد التميمي',
      phone: '07701111111',
      role: 'REP',
      password: '123',
    },
  });

  const rep2 = await prisma.user.create({
    data: {
      name: 'حيدر الكرخي',
      phone: '07702222222',
      role: 'REP',
      password: '123',
    },
  });

  const rep3 = await prisma.user.create({
    data: {
      name: 'عمر الزيدي',
      phone: '07703333333',
      role: 'REP',
      password: '123',
    },
  });

  console.log('✅ Created 1 Admin and 3 Reps');

  // 3. 5 Baghdad Zones
  const zoneKarrada = await prisma.zone.create({ data: { name: 'الكرادة', city: 'بغداد' } });
  const zoneMansour = await prisma.zone.create({ data: { name: 'المنصور', city: 'بغداد' } });
  const zoneDora = await prisma.zone.create({ data: { name: 'الدورة', city: 'بغداد' } });
  const zoneZayouna = await prisma.zone.create({ data: { name: 'زيونة', city: 'بغداد' } });
  const zoneAdhamiya = await prisma.zone.create({ data: { name: 'الأعظمية', city: 'بغداد' } });

  console.log('✅ Created 5 Baghdad Zones');

  // 4. 15 Realistic Baghdad Stores with 14-day Revisit Cycle & Rep Assignments
  const storesData = [
    // الكرادة
    { name: 'كافيه وليالي الكرادة', owner: 'أبو فهد', phone: '07801000001', lat: 33.3125, lng: 44.4250, zoneId: zoneKarrada.id, debt: 45000, pref: 'فحم شيشة ليمون ممتاز', day: 'Sunday', repId: rep1.id },
    { name: 'مطعم ومشويات دجلة', owner: 'عمار الشمري', phone: '07801000002', lat: 33.3080, lng: 44.4310, zoneId: zoneKarrada.id, debt: 120000, pref: 'فحم مشاوي بلوط خشن', day: 'Sunday', repId: rep1.id },
    { name: 'أسواق بابل المركزية', owner: 'حسين علي', phone: '07801000003', lat: 33.3050, lng: 44.4220, zoneId: zoneKarrada.id, debt: 0, pref: 'فحم أقراص سريع الاشتعال', day: 'Sunday', repId: rep1.id },
    { name: 'لاونج النخيل', owner: 'سعد التميمي', phone: '07801000004', lat: 33.3150, lng: 44.4190, zoneId: zoneKarrada.id, debt: 80000, pref: 'فحم شيشة درجة أولى', day: 'Sunday', repId: rep1.id },

    // المنصور
    { name: 'كافيه الأمير - 14 رمضان', owner: 'أبو مصطفى', phone: '07702000001', lat: 33.3150, lng: 44.3520, zoneId: zoneMansour.id, debt: 65000, pref: 'فحم شيشة جوز هند', day: 'Sunday', repId: rep1.id },
    { name: 'مشويات الرواد', owner: 'قصي الجبوري', phone: '07702000002', lat: 33.3190, lng: 44.3480, zoneId: zoneMansour.id, debt: 210000, pref: 'فحم مشاوي سندي نخب أول', day: 'Sunday', repId: rep1.id },
    { name: 'هايبر ماركت المنصور', owner: 'باسم كمال', phone: '07702000003', lat: 33.3110, lng: 44.3580, zoneId: zoneMansour.id, debt: 0, pref: 'فحم شيشة ومشاوي منوع', day: 'Monday', repId: rep2.id },

    // زيونة
    { name: 'استراحة الربيع - شارع الربيعي', owner: 'أركان عادل', phone: '07903000001', lat: 33.3350, lng: 44.4480, zoneId: zoneZayouna.id, debt: 30000, pref: 'فحم شيشة درجة أولى', day: 'Sunday', repId: rep1.id },
    { name: 'كافيه ميرامار', owner: 'محمد الدليمي', phone: '07903000002', lat: 33.3320, lng: 44.4520, zoneId: zoneZayouna.id, debt: 95000, pref: 'فحم شيشة ليمون ممتاز', day: 'Sunday', repId: rep1.id },
    { name: 'ماركت الضفاف', owner: 'وسام سالم', phone: '07903000003', lat: 33.3380, lng: 44.4440, zoneId: zoneZayouna.id, debt: 15000, pref: 'فحم أقراص سريع الاشتعال', day: 'Tuesday', repId: rep3.id },

    // الدورة
    { name: 'مطاعم أسماك الفرات', owner: 'حجي قاسم', phone: '07504000001', lat: 33.2650, lng: 44.3850, zoneId: zoneDora.id, debt: 180000, pref: 'فحم مشاوي طبيعي خشن', day: 'Sunday', repId: rep1.id },
    { name: 'كافيه البستان', owner: 'مهند حسن', phone: '07504000002', lat: 33.2720, lng: 44.3790, zoneId: zoneDora.id, debt: 40000, pref: 'فحم شيشة جوز هند', day: 'Sunday', repId: rep1.id },
    { name: 'أسواق الجمعية', owner: 'صالح مهدي', phone: '07504000003', lat: 33.2690, lng: 44.3890, zoneId: zoneDora.id, debt: 0, pref: 'فحم أكياس 5 كغم', day: 'Wednesday', repId: rep2.id },

    // الأعظمية
    { name: 'كافيه راس الحواش', owner: 'ياسين طه', phone: '07705000001', lat: 33.3720, lng: 44.3650, zoneId: zoneAdhamiya.id, debt: 70000, pref: 'فحم شيشة ليمون ممتاز', day: 'Thursday', repId: rep3.id },
    { name: 'مشويات السفير الأعظمي', owner: 'أبو عمر', phone: '07705000002', lat: 33.3680, lng: 44.3600, zoneId: zoneAdhamiya.id, debt: 150000, pref: 'فحم مشاوي سنديان', day: 'Thursday', repId: rep3.id },
  ];

  const stores = [];
  const fourteenDaysLater = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  for (const s of storesData) {
    const store = await prisma.store.create({
      data: {
        name: s.name,
        ownerName: s.owner,
        phone: s.phone,
        latitude: s.lat,
        longitude: s.lng,
        zoneId: s.zoneId,
        addressNotes: `بغداد - ${s.name}`,
        debt: s.debt,
        preferredCharcoal: s.pref,
        assignedDay: s.day,
        revisitCycleDays: 14,
        nextVisitDate: fourteenDaysLater,
        contractedRepId: s.repId,
      },
    });
    stores.push(store);
  }
  console.log(`✅ Created ${stores.length} realistic Baghdad stores with 14-day revisit cycles`);

  // 5. Today's route for Rep 1 (أحمد التميمي) - 10 stops
  const rep1Stores = stores.filter(s => s.contractedRepId === rep1.id).slice(0, 10);
  const todayRoute = await prisma.dailyRoute.create({
    data: {
      repId: rep1.id,
      date: new Date().toISOString().split('T')[0],
      dayName: 'اليوم',
      status: 'IN_PROGRESS',
      originLat: 33.3152, // نقطة انطلاق المندوب الحي
      originLng: 44.3661,
    },
  });

  for (let i = 0; i < rep1Stores.length; i++) {
    await prisma.routeStop.create({
      data: {
        routeId: todayRoute.id,
        storeId: rep1Stores[i].id,
        sequenceOrder: i + 1,
        status: i === 0 ? 'CURRENT' : 'PENDING',
        isAdHoc: false,
      },
    });
  }

  console.log(`✅ Created Route with ${rep1Stores.length} stops for Rep 1 (${rep1.name})`);
  console.log('🎉 Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
