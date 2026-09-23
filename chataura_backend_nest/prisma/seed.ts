import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.adminSetting.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });

  const pkgCount = await prisma.coinPackage.count();
  if (pkgCount === 0) {
    await prisma.coinPackage.createMany({
      data: [
        {
          audience: 'user',
          coins: 100,
          currency: 'INR',
          price: 10,
          originalPrice: 10,
          basePriceInr: 10,
          sortOrder: 1,
        },
        {
          audience: 'user',
          coins: 500,
          currency: 'INR',
          price: 45,
          originalPrice: 50,
          basePriceInr: 50,
          sortOrder: 2,
        },
        {
          audience: 'user',
          coins: 1200,
          currency: 'INR',
          price: 99,
          originalPrice: 120,
          basePriceInr: 120,
          sortOrder: 3,
        },
        {
          audience: 'coin_seller',
          coins: 10000,
          currency: 'INR',
          price: 700,
          originalPrice: 800,
          basePriceInr: 800,
          sortOrder: 10,
        },
      ],
    });
  }

  const levelCount = await prisma.level.count();
  if (levelCount === 0) {
    const levels = [];
    for (let i = 1; i <= 50; i++) {
      levels.push({
        level: i,
        minXp: (i - 1) * (i - 1) * 100,
        maxXp: i * i * 100 - 1,
        label: `Level ${i}`,
      });
    }
    await prisma.level.createMany({ data: levels });
  }

  const frameCount = await prisma.frame.count();
  if (frameCount === 0) {
    await prisma.frame.createMany({
      data: [
        {
          name: 'Starter Glow',
          slug: 'starter-glow',
          levelRequired: 1,
          coinCost: 0,
          isPremium: false,
        },
        {
          name: 'Gold Ring',
          slug: 'gold-ring',
          levelRequired: 5,
          coinCost: 200,
          isPremium: true,
        },
        {
          name: 'Neon Pulse',
          slug: 'neon-pulse',
          levelRequired: 10,
          coinCost: 500,
          isPremium: true,
        },
      ],
    });
  }

  const barCount = await prisma.entryBar.count();
  if (barCount === 0) {
    await prisma.entryBar.createMany({
      data: [
        { name: 'Default Entry', levelRequired: 1 },
        { name: 'Spark Entry', levelRequired: 5 },
        { name: 'Royal Entry', levelRequired: 15 },
      ],
    });
  }

  const giftCount = await prisma.gift.count();
  if (giftCount === 0) {
    await prisma.gift.createMany({
      data: [
        { name: 'Rose', coinCost: 10 },
        { name: 'Heart', coinCost: 50 },
        { name: 'Crown', coinCost: 200 },
      ],
    });
  }

  const themeCount = await prisma.roomTheme.count();
  if (themeCount === 0) {
    await prisma.roomTheme.createMany({
      data: [
        { name: 'Midnight Lounge', coinCost: 0 },
        { name: 'Neon Party', coinCost: 0 },
        { name: 'Gold VIP', coinCost: 200 },
      ],
    });
  }

  const stickerCount = await prisma.sticker.count();
  if (stickerCount === 0) {
    await prisma.sticker.createMany({
      data: [
        { name: 'Wave', coinCost: 0 },
        { name: 'Fire', coinCost: 50 },
        { name: 'Crown Sticker', coinCost: 100 },
      ],
    });
  }

  const liveRooms = await prisma.room.count({ where: { isLive: true } });
  if (liveRooms === 0) {
    const owner = await prisma.user.findFirst({
      where: { accountStatus: 'active' },
    });
    if (owner) {
      const theme = await prisma.roomTheme.findFirst();
      await prisma.room.create({
        data: {
          title: 'ChatAura Lobby',
          displayId: '100001',
          ownerId: owner.id,
          hostId: owner.id,
          agoraChannelName: 'room_100001',
          maxSeats: 8,
          themeId: theme?.id ?? null,
          lastActivityAt: new Date(),
        },
      });
    }
  }

  const bannerCount = await prisma.banner.count();
  if (bannerCount === 0) {
    await prisma.banner.createMany({
      data: [
        {
          title: 'Recharge Bonus',
          subtitle: 'Extra coins this week',
          category: 'recharge',
          actionType: 'recharge',
          sortOrder: 1,
        },
        {
          title: 'Lucky77 Night',
          subtitle: 'Play the wheel',
          category: 'game',
          actionType: 'game',
          actionTarget: 'lucky77',
          sortOrder: 2,
        },
      ],
    });
  }

  const musicCount = await prisma.musicTrack.count();
  if (musicCount === 0) {
    await prisma.musicTrack.createMany({
      data: [
        {
          title: 'Lobby Beat',
          artist: 'ChatAura',
          fileUrl: 'https://cdn.chataura.local/music/lobby.mp3',
          isTrending: true,
        },
        {
          title: 'Night Drive',
          artist: 'Aura FM',
          fileUrl: 'https://cdn.chataura.local/music/night.mp3',
          isTrending: false,
        },
      ],
    });
  }

  const faqCount = await prisma.faqItem.count();
  if (faqCount === 0) {
    await prisma.faqItem.createMany({
      data: [
        {
          question: 'How do I recharge coins?',
          answer: 'Open Wallet and choose a package.',
          sortOrder: 1,
        },
        {
          question: 'How does star chat billing work?',
          answer: 'You are billed per started minute while the session is active.',
          sortOrder: 2,
        },
      ],
    });
  }

  const mediaCount = await prisma.mediaItem.count();
  if (mediaCount === 0) {
    const author = await prisma.user.findFirst({
      where: { accountStatus: 'active' },
    });
    if (author) {
      await prisma.mediaItem.createMany({
        data: [
          {
            userId: author.id,
            kind: 'post',
            mediaType: 'image',
            fileUrl: 'https://cdn.chataura.local/posts/demo.jpg',
            caption: 'Welcome to ChatAura',
          },
          {
            userId: author.id,
            kind: 'reel',
            mediaType: 'video',
            fileUrl: 'https://cdn.chataura.local/reels/demo.mp4',
            thumbnailUrl: 'https://cdn.chataura.local/reels/demo.jpg',
            caption: 'Demo reel',
          },
        ],
      });
    }
  }

  console.log('Seed complete (through Phase 5)');

  // Relationship engine defaults (CP / BCP)
  const cpVisual = {
    color_primary: '#FF4D8D',
    color_accent: '#F5C542',
    motif: 'twin_hearts',
  };
  const bcpVisual = {
    color_primary: '#00E5FF',
    color_accent: '#F5C542',
    motif: 'linked_stars',
  };
  for (const d of [
    {
      code: 'cp',
      name: 'CP',
      description: 'Couple relationship',
      sortOrder: 1,
      visual: cpVisual,
    },
    {
      code: 'bcp',
      name: 'BCP',
      description: 'Best Couple relationship',
      sortOrder: 2,
      visual: bcpVisual,
    },
  ]) {
    await prisma.relationshipType.upsert({
      where: { code: d.code },
      create: {
        code: d.code,
        name: d.name,
        description: d.description,
        enabled: true,
        sortOrder: d.sortOrder,
        exclusivityMode: 'none',
        formationRule: 'first_qualifying_gift',
        requiresAccept: false,
        bidirectionalScoring: true,
        quantityMultipliesPoints: true,
        levelsEnabled: false,
        dmGiftsCount: true,
        roomGiftsCount: true,
        visual: d.visual,
        leaderboard: {
          periods: ['daily', 'weekly', 'monthly', 'all_time'],
          scopes: ['global', 'room'],
        },
        rank1Rewards: { xp_bonus: 100, badge: true },
      },
      update: { enabled: true, name: d.name },
    });
  }
  const types = await prisma.relationshipType.findMany();
  const byCode = new Map(types.map((t) => [t.code, t]));
  const gifts = await prisma.gift.findMany({ where: { isActive: true } });
  for (const g of gifts) {
    const cat = String(g.category ?? '')
      .trim()
      .toLowerCase();
    const type = byCode.get(cat);
    if (!type) continue;
    await prisma.relationshipGiftRule.upsert({
      where: {
        giftId_relationshipTypeId: {
          giftId: g.id,
          relationshipTypeId: type.id,
        },
      },
      create: {
        giftId: g.id,
        relationshipTypeId: type.id,
        pointValue: g.coinCost,
        enabled: true,
      },
      update: { enabled: true },
    });
  }
  console.log('Relationship types seeded (cp/bcp)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
