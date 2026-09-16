const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@gmail.com';
  const password = await bcrypt.hash('password123', 10);
  
  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      password,
      role: 'admin',
    },
    create: {
      email,
      name: 'Super Admin',
      password,
      role: 'admin',
      coinBalance: 1000000,
    },
  });
  
  console.log('Admin user created:', admin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
