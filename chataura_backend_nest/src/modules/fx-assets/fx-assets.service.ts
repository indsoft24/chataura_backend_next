import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { basename, resolve } from 'path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  contentTypeForPath,
  uploadPublicFile,
} from '../../common/gcs/gcs.storage';

export type FxManifestAsset = {
  asset_key: string;
  category: string;
  file: string;
  media_type: string;
  android_usage?: string;
};

export type FxManifest = {
  version?: number;
  assets: FxManifestAsset[];
};

export type FxImportResult = {
  ok: number;
  failed: { asset_key: string; reason: string }[];
  map: Record<string, string>;
  version: number;
};

function serializeItem(row: {
  assetKey: string;
  category: string;
  mediaType: string;
  url: string;
  version: number;
}) {
  return {
    asset_key: row.assetKey,
    category: row.category,
    media_type: row.mediaType,
    url: row.url,
    version: row.version,
  };
}

@Injectable()
export class FxAssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(category?: string) {
    const rows = await this.prisma.appFxAsset.findMany({
      where: {
        isActive: true,
        ...(category ? { category } : {}),
      },
      orderBy: [{ category: 'asc' }, { assetKey: 'asc' }],
    });
    return {
      version: 1,
      items: rows.map(serializeItem),
    };
  }

  async map(): Promise<Record<string, string>> {
    const rows = await this.prisma.appFxAsset.findMany({
      where: { isActive: true },
      select: { assetKey: true, url: true },
      orderBy: { assetKey: 'asc' },
    });
    const out: Record<string, string> = {};
    for (const row of rows) out[row.assetKey] = row.url;
    return out;
  }

  async getOne(assetKey: string) {
    const row = await this.prisma.appFxAsset.findFirst({
      where: { assetKey, isActive: true },
    });
    if (!row) {
      throw new NotFoundException({
        success: false,
        error: {
          code: 'FX_ASSET_NOT_FOUND',
          message: `Unknown asset_key: ${assetKey}`,
        },
      });
    }
    return serializeItem(row);
  }

  async importFromDir(
    dir: string,
    opts?: { writeUrlsPath?: string },
  ): Promise<FxImportResult> {
    const root = resolve(dir);
    const manifestPath = resolve(root, 'MANIFEST.json');
    if (!existsSync(manifestPath)) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'FX_MANIFEST_MISSING',
          message: `MANIFEST.json not found in ${root}`,
        },
      });
    }

    const manifest = JSON.parse(
      readFileSync(manifestPath, 'utf8'),
    ) as FxManifest;
    if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'FX_MANIFEST_EMPTY',
          message: 'MANIFEST.json has no assets',
        },
      });
    }

    const failed: { asset_key: string; reason: string }[] = [];
    const map: Record<string, string> = {};
    let ok = 0;

    for (const asset of manifest.assets) {
      const key = asset.asset_key;
      try {
        if (!key || !asset.file || !asset.category || !asset.media_type) {
          throw new Error('Missing required manifest fields');
        }
        const localPath = resolve(root, asset.file);
        if (!existsSync(localPath)) {
          throw new Error(`File missing: ${asset.file}`);
        }
        const buf = readFileSync(localPath);
        const bytes = buf.length;
        const checksum = createHash('sha256').update(buf).digest('hex');
        const objectPath = `fx/v1/${asset.category}/${basename(asset.file)}`;
        const uploaded = await uploadPublicFile({
          localPath,
          objectPath,
          contentType: contentTypeForPath(localPath),
        });

        const existing = await this.prisma.appFxAsset.findUnique({
          where: { assetKey: key },
        });
        const pathChanged =
          !existing ||
          existing.objectPath !== uploaded.objectPath ||
          existing.url !== uploaded.url ||
          existing.checksum !== checksum;
        const version = existing
          ? pathChanged
            ? existing.version + 1
            : existing.version
          : 1;

        await this.prisma.appFxAsset.upsert({
          where: { assetKey: key },
          create: {
            assetKey: key,
            category: asset.category,
            mediaType: asset.media_type,
            objectPath: uploaded.objectPath,
            url: uploaded.url,
            version,
            bytes,
            checksum,
            androidUsage: asset.android_usage ?? null,
            isActive: true,
          },
          update: {
            category: asset.category,
            mediaType: asset.media_type,
            objectPath: uploaded.objectPath,
            url: uploaded.url,
            version,
            bytes,
            checksum,
            androidUsage: asset.android_usage ?? null,
            isActive: true,
          },
        });

        map[key] = uploaded.url;
        ok += 1;
      } catch (err) {
        failed.push({
          asset_key: key || '(unknown)',
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (opts?.writeUrlsPath) {
      writeFileSync(
        opts.writeUrlsPath,
        JSON.stringify(map, null, 2) + '\n',
        'utf8',
      );
    }

    return {
      ok,
      failed,
      map,
      version: manifest.version ?? 1,
    };
  }
}
