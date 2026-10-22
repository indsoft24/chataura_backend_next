import { SetMetadata } from '@nestjs/common';
import type { AdminTier } from '../admin-tier';

/** Minimum admin tier an endpoint needs. Superset-by-rank: any higher tier also passes. */
export const MIN_TIER_KEY = 'minTier';
export const MinTier = (tier: AdminTier) => SetMetadata(MIN_TIER_KEY, tier);
