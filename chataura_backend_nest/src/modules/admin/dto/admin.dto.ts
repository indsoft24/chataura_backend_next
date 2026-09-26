import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

// ──────────────────────────────────────────────
// Packages
// ──────────────────────────────────────────────

export class CreatePackageDto {
  @IsInt()
  @Min(1)
  coins!: number;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  audience?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  original_price?: number;
}

export class UpdatePackageDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  coins?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  audience?: string;
}

// ──────────────────────────────────────────────
// Gifts
// ──────────────────────────────────────────────

export class CreateGiftDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  coin_cost?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  coinCost?: number;

  @IsOptional()
  @IsIn(['standard', 'customize', 'lucky', 'cp', 'bcp'])
  category?: string;

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  animation_url?: string;

  @IsOptional()
  @IsString()
  animationUrl?: string;

  @IsOptional()
  @IsString()
  video_url?: string;
}

export class UpdateGiftDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  coin_cost?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  coinCost?: number;

  @IsOptional()
  @IsIn(['standard', 'customize', 'lucky', 'cp', 'bcp'])
  category?: string;

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  animation_url?: string;

  @IsOptional()
  @IsString()
  animationUrl?: string;

  @IsOptional()
  @IsString()
  video_url?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

// ──────────────────────────────────────────────
// Levels
// ──────────────────────────────────────────────

export class CreateLevelDto {
  @IsInt()
  @Min(1)
  level!: number;

  @IsInt()
  @Min(0)
  min_xp!: number;

  @IsInt()
  @Min(1)
  max_xp!: number;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  badge_url?: string;

  @IsOptional()
  @IsString()
  icon_url?: string;
}

export class UpdateLevelDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  min_xp?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  max_xp?: number;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  badge_url?: string;

  @IsOptional()
  @IsString()
  icon_url?: string;
}

// ──────────────────────────────────────────────
// Frames
// ──────────────────────────────────────────────

export class CreateFrameDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  level_required?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  coin_cost?: number;

  @IsOptional()
  @IsBoolean()
  is_premium?: boolean;

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsString()
  animation_url?: string;

  @IsOptional()
  @IsString()
  animation_key?: string;

  @IsOptional()
  @IsIn(['alpha', 'screen'])
  composite_mode?: 'alpha' | 'screen';
}

export class UpdateFrameDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  level_required?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  coin_cost?: number;

  @IsOptional()
  @IsBoolean()
  is_premium?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsString()
  animation_url?: string;

  @IsOptional()
  @IsString()
  animation_key?: string;

  @IsOptional()
  @IsIn(['alpha', 'screen'])
  composite_mode?: 'alpha' | 'screen';
}

// ──────────────────────────────────────────────
// Entry Bars
// ──────────────────────────────────────────────

export class CreateEntryBarDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  level_required?: number;

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsString()
  animation_url?: string;
}

export class UpdateEntryBarDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  level_required?: number;

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsString()
  animation_url?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

// ──────────────────────────────────────────────
// Room Themes
// ──────────────────────────────────────────────

export class CreateRoomThemeDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  coin_cost?: number;

  @IsOptional()
  @IsString()
  image_url?: string;
}

export class UpdateRoomThemeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  coin_cost?: number;

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

// ──────────────────────────────────────────────
// Stickers
// ──────────────────────────────────────────────

export class CreateStickerDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  coin_cost?: number;

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsString()
  animation_url?: string;
}

export class UpdateStickerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  coin_cost?: number;

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsString()
  animation_url?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

// ──────────────────────────────────────────────
// User management actions
// ──────────────────────────────────────────────

export class SuspendDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RejectWithdrawalDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class LinkUserDto {
  @IsOptional()
  @IsIn(['agency', 'user', 'seller', 'admin'])
  role?: 'agency' | 'user' | 'seller' | 'admin';

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  staff_badge_type?: string;

  @IsOptional()
  @IsString()
  badge_type?: string;
}

export class StarDto {
  @IsOptional()
  @IsBoolean()
  is_star?: boolean;
}

export class AdjustBalanceDto {
  @IsIn(['coins', 'gems'])
  asset!: 'coins' | 'gems';

  /** add = credit, deduct = debit */
  @IsIn(['add', 'deduct', 'credit', 'debit'])
  action!: 'add' | 'deduct' | 'credit' | 'debit';

  @IsInt()
  @Min(1)
  amount!: number;

  /** Required when deducting; recommended when crediting. */
  @IsOptional()
  @IsString()
  note?: string;
}
