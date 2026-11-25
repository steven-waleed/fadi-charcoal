import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Ensuring clean database state for production...');

  // 1. Upsert clean primary admin: 'admin' / 'admin'
  const admin = await prisma.user.upsert({
    where: { phone: 'admin' },
    update: {
      name: 'مدير النظام',
      password: 'admin',
      role: 'ADMIN',
      active: true,
    },
    create: {
      name: 'مدير النظام',
      phone: 'admin',
      password: 'admin',
      role: 'ADMIN',
      active: true,
    },
  });
  console.log('✅ Admin account confirmed:', admin.phone);

  // 2. Ensure 5 Baghdad Zones exist
  const baghdadZones = ['الكرادة', 'المنصور', 'الدورة', 'زيونة', 'الأعظمية'];
  for (const name of baghdadZones) {
    await prisma.zone.upsert({
      where: { name },
      update: {},
      create: { name, city: 'بغداد' },
    });
  }
  console.log('✅ 5 Baghdad Zones confirmed.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
