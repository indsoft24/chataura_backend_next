import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Gift, PrismaClient } from '@prisma/client';
import { normalizeGiftCategory } from './gift-category';
import { giftKeySlug } from './gift-key';

/**
 * Single source of truth for "which gift is the user paying for".
 *
 * Money safety rules:
 *  - Identify by `gift_key` or `gift_id` (exact). Never guess by partial name.
 *  - If the client also sends `gift_name` / `gift_category` and they disagree with
 *    the row found by id/key, the client catalog is stale → reject (no charge).
 *  - Name-only lookup (very old clients) is allowed only when exactly one active
 *    gift has that name (optionally filtered by category); otherwise reject.
 *  - Inactive gifts are rejected (admin "disable" is respected; never re-activated).
 *  - If the client sends `expected_coin_cost` (unit price it displayed) and it
 *    differs from the server price → reject with the current gift data so the
 *    app can refresh and re-confirm. The charge always uses the DB price.
 */
export type GiftSendSelector = {
  gift_id?: number | string | null;
  gift_key?: string | null;
  gift_name?: string | null;
  gift_category?: string | null;
  expected_coin_cost?: number | string | null;
};

type GiftDb = Pick<PrismaClient, 'gift'>;

const logger = new Logger('GiftResolve');

export function giftClientSummary(g: Gift) {
  return {
    id: Number(g.id),
    gift_key: g.giftKey ?? null,
    name: g.name,
    category: normalizeGiftCategory(g.category),
    coin_cost: g.coinCost,
    is_active: g.isActive,
  };
}

function conflict(code: string, message: string, gift?: Gift | null): never {
  throw new ConflictException({
    success: false,
    error: {
      code,
      message,
      ...(gift ? { details: { gift: giftClientSummary(gift) } } : {}),
    },
  });
}

function notFound(): never {
  throw new NotFoundException({
    success: false,
    error: { code: 'GIFT_NOT_FOUND', message: 'Gift not found' },
  });
}

function parseGiftId(raw: unknown): bigint | null {
  const s = raw == null ? '' : String(raw).trim();
  if (!/^\d+$/.test(s)) return null;
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

export async function resolveGiftForSend(
  prisma: GiftDb,
  input: GiftSendSelector,
): Promise<Gift> {
  const giftKey = input.gift_key ? String(input.gift_key).trim() : '';
  const giftId = parseGiftId(input.gift_id);
  const giftName = input.gift_name ? String(input.gift_name).trim() : '';
  const giftCategory = input.gift_category
    ? String(input.gift_category).trim().toLowerCase()
    : '';

  let gift: Gift | null = null;

  if (giftKey) {
    gift = await prisma.gift.findUnique({ where: { giftKey } });
    if (!gift) notFound();
    if (giftId != null && gift.id !== giftId) {
      logger.warn(
        `gift_key/gift_id mismatch key=${giftKey} id=${giftId} (row id=${gift.id})`,
      );
      conflict(
        'GIFT_MISMATCH',
        'Gift list is out of date. Please refresh and try again.',
        gift,
      );
    }
  } else if (giftId != null) {
    gift = await prisma.gift.findUnique({ where: { id: giftId } });
    if (!gift) notFound();
  } else if (giftName) {
    const matches = await prisma.gift.findMany({
      where: {
        name: { equals: giftName, mode: 'insensitive' },
        isActive: true,
      },
      orderBy: { id: 'asc' },
    });
    const filtered = giftCategory
      ? matches.filter((g) => normalizeGiftCategory(g.category) === giftCategory)
      : matches;
    if (filtered.length === 0) notFound();
    if (filtered.length > 1) {
      logger.warn(`ambiguous gift_name="${giftName}" category="${giftCategory}"`);
      conflict(
        'GIFT_AMBIGUOUS',
        'Multiple gifts share this name. Please refresh the gift list and try again.',
      );
    }
    gift = filtered[0];
  } else {
    throw new BadRequestException({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'gift_id or gift_key is required',
      },
    });
  }

  // Cross-check optional descriptors sent by the client against the real row.
  if (giftName && giftSlugDiffers(giftName, gift.name)) {
    logger.warn(
      `gift name mismatch id=${gift.id} sent="${giftName}" actual="${gift.name}"`,
    );
    conflict(
      'GIFT_MISMATCH',
      'Gift list is out of date. Please refresh and try again.',
      gift,
    );
  }
  if (giftCategory && normalizeGiftCategory(gift.category) !== giftCategory) {
    logger.warn(
      `gift category mismatch id=${gift.id} sent="${giftCategory}" actual="${gift.category}"`,
    );
    conflict(
      'GIFT_MISMATCH',
      'Gift list is out of date. Please refresh and try again.',
      gift,
    );
  }

  if (!gift.isActive) {
    conflict('GIFT_INACTIVE', 'This gift is no longer available.', gift);
  }

  const expectedRaw = input.expected_coin_cost;
  if (expectedRaw !== undefined && expectedRaw !== null && String(expectedRaw).trim() !== '') {
    const expected = Number(expectedRaw);
    if (!Number.isInteger(expected) || expected < 0) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'expected_coin_cost must be a non-negative integer',
        },
      });
    }
    if (expected !== gift.coinCost) {
      conflict(
        'GIFT_PRICE_CHANGED',
        `Gift price has changed to ${gift.coinCost} coins. Please confirm again.`,
        gift,
      );
    }
  }

  return gift;
}

function giftSlugDiffers(sent: string, actual: string): boolean {
  return giftKeySlug(sent) !== giftKeySlug(actual);
}
