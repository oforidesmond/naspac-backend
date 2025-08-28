import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Clear existing data (optional, for clean slate)
  await prisma.auditLog.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.user.deleteMany();

  // Seed Admins
  await prisma.user.createMany({
    data: [
      {
        name: 'Admin One',
        staffId: 'admin123',
        email: 'admin1@cocobod.gh',
        password: await bcrypt.hash('admin123', 10),
        role: 'ADMIN',
      },
      // {
      //   name: 'Admin Two',
      //   staffId: 'staff002',
      //   email: 'admin2@cocobod.gh',
      //   password: await bcrypt.hash('admin123', 10),
      //   role: 'ADMIN',
      // },
    ],
  });

  // // Seed Staff
  // await prisma.user.createMany({
  //   data: [
  //     {
  //       name: 'Staff One',
  //       staffId: 'staff003',
  //       email: 'staff1@cocobod.gh',
  //       password: await bcrypt.hash('staff123', 10),
  //       role: 'STAFF',
  //     },
  //     {
  //       name: 'Staff Two',
  //       staffId: 'staff004',
  //       email: 'staff2@cocobod.gh',
  //       password: await bcrypt.hash('staff123', 10),
  //       role: 'STAFF',
  //     },
  //   ],
  // });

  // // Seed Personnel
  // const personnel1 = await prisma.user.create({
  //   data: {
  //     name: 'Personnel One',
  //     nssNumber: 'nss001',
  //     email: 'student1@example.com',
  //     password: await bcrypt.hash('student123', 10),
  //     role: 'PERSONNEL',
  //   },
  // });

  // await prisma.user.create({
  //   data: {
  //     name: 'Personnel Two',
  //     nssNumber: 'nss002',
  //     email: 'student2@example.com',
  //     password: await bcrypt.hash('student123', 10),
  //     role: 'PERSONNEL',
  //   },
  // });

  // // Seed a Submission for personnel1
  // await prisma.submission.create({
  //   data: {
  //     userId: personnel1.id,
  //     fullName: 'Personnel One',
  //     school: 'University of Ghana',
  //     course: 'Computer Science',
  //     status: 'PENDING',
  //     postingLetterUrl: 'https://[YOUR_SUPABASE_PROJECT].supabase.co/storage/v1/object/public/onboarding-documents/test-posting-letter.pdf',
  //   },
  // });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });