const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.user.update({
    where: { email: 'admin@gmail.com' },
    data: { emailVerifiedAt: new Date() },
  });
  console.log('Admin email verified successfully!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
