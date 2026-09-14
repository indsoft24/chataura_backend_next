import { SetMetadata } from '@nestjs/common';

export const SKIP_EMAIL_VERIFIED_KEY = 'skipEmailVerified';
export const SkipEmailVerified = () =>
  SetMetadata(SKIP_EMAIL_VERIFIED_KEY, true);
