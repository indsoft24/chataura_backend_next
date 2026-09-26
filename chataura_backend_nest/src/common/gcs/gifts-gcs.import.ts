import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { contentTypeForPath, uploadPublicFile } from './gcs.storage';
import { resolveGiftsCdnBase } from './gifts-cdn';
import { ensureCpAffectionGiftCatalog } from '../../modules/room/cp-affection-gifts.catalog';
import { ensureExtraGiftCatalogs } from '../../modules/room/extra-gift-catalogs';

export type GiftManifestEntry = {
  gift_key: string;
  name: string;
  category: string;
  coin_cost: number;
  image_file: string;
  animation_file: string;
  gcs_image_object: string;
  gcs_animation_object: string;
};

export type GiftManifest = {
  pack?: string;
  version?: number;
  gcs_prefix?: string;
  gift_count?: number;
  gifts: GiftManifestEntry[];
};

export type GiftImportRow = {
  name: string;
  category: string;
  gift_id: string;
  gift_key: string;
  image_url: string;
  animation_url: string;
};

export type GiftImportResult = {
  bucket: string;
  prefix: string;
  ok_count: number;
  failed: { gift_key: string; reason: string }[];
  gifts: GiftImportRow[];
};

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export async function importGiftsFromDir(
  dir: string,
  opts?: { writeUrlsPath?: string; prisma?: PrismaClient },
): Promise<GiftImportResult> {
  const root = resolve(dir);
  const manifestPath = resolve(root, 'MANIFEST.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`MANIFEST.json not found in ${root}`);
  }

  const manifest = JSON.parse(
    readFileSync(manifestPath, 'utf8'),
  ) as GiftManifest;
  if (!Array.isArray(manifest.gifts) || manifest.gifts.length === 0) {
    throw new Error('MANIFEST.json has no gifts');
  }

  const bucket = (process.env.GCS_BUCKET ?? '').trim() || 'chataura';
  const prefix = (manifest.gcs_prefix ?? 'gifts/v1').replace(/\/+$/, '');
  const prisma = opts?.prisma ?? new PrismaClient();
  const ownsPrisma = !opts?.prisma;

  const failed: { gift_key: string; reason: string }[] = [];
  const gifts: GiftImportRow[] = [];

  try {
    for (const g of manifest.gifts) {
      const key = g.gift_key || g.name || '(unknown)';
      try {
        if (
          !g.name ||
          !g.category ||
          !g.image_file ||
          !g.animation_file ||
          !g.gcs_image_object ||
          !g.gcs_animation_object
        ) {
          throw new Error('Missing required MANIFEST fields');
        }
        const imagePath = resolve(root, g.image_file);
        const animPath = resolve(root, g.animation_file);
        if (!existsSync(imagePath)) throw new Error(`Missing image: ${g.image_file}`);
        if (!existsSync(animPath)) {
          throw new Error(`Missing animation: ${g.animation_file}`);
        }

        // Touch checksums so identical re-uploads stay idempotent in logs.
        void sha256File(imagePath);
        void sha256File(animPath);

        const imageUp = await uploadPublicFile({
          localPath: imagePath,
          objectPath: g.gcs_image_object,
          contentType: contentTypeForPath(imagePath),
          bucket,
        });
        const animUp = await uploadPublicFile({
          localPath: animPath,
          objectPath: g.gcs_animation_object,
          contentType: contentTypeForPath(animPath),
          bucket,
        });

        const existing = await prisma.gift.findFirst({
          where: { name: g.name, category: g.category },
        });
        const data = {
          name: g.name,
          category: g.category,
          coinCost: Number(g.coin_cost) || 0,
          imageUrl: imageUp.url,
          animationUrl: animUp.url,
          isActive: true,
        };
        const row = existing
          ? await prisma.gift.update({ where: { id: existing.id }, data })
          : await prisma.gift.create({ data });

        gifts.push({
          name: row.name,
          category: row.category,
          gift_id: String(row.id),
          gift_key: g.gift_key,
          image_url: row.imageUrl ?? imageUp.url,
          animation_url: row.animationUrl ?? animUp.url,
        });
      } catch (err) {
        failed.push({
          gift_key: key,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const publicBase =
      process.env.PUBLIC_BASE_URL ||
      process.env.APP_PUBLIC_URL ||
      'https://chataura.in';
    await ensureCpAffectionGiftCatalog(prisma, publicBase);
    await ensureExtraGiftCatalogs(prisma, publicBase);

    // Re-read URLs after ensure* (should remain GCS when GIFTS_PUBLIC_BASE set).
    const refreshed: GiftImportRow[] = [];
    for (const g of gifts) {
      const row = await prisma.gift.findFirst({
        where: { name: g.name, category: g.category },
      });
      if (!row) continue;
      refreshed.push({
        name: row.name,
        category: row.category,
        gift_id: String(row.id),
        gift_key: g.gift_key,
        image_url: row.imageUrl ?? g.image_url,
        animation_url: row.animationUrl ?? g.animation_url,
      });
    }

    const result: GiftImportResult = {
      bucket,
      prefix,
      ok_count: refreshed.length,
      failed,
      gifts: refreshed,
    };

    const payload = {
      ...result,
      gifts_public_base: resolveGiftsCdnBase(),
    };

    if (opts?.writeUrlsPath) {
      writeFileSync(
        opts.writeUrlsPath,
        JSON.stringify(payload, null, 2) + '\n',
        'utf8',
      );
    }

    return result;
  } finally {
    if (ownsPrisma) await prisma.$disconnect();
  }
}
