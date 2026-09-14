import { ForbiddenException, Injectable } from '@nestjs/common';

export const CALLS_DISABLED = {
  success: false,
  error: {
    code: 'FEATURE_DISABLED',
    message: '1-1 audio and video calls are disabled',
  },
};

@Injectable()
export class CallService {
  disabled(): never {
    throw new ForbiddenException(CALLS_DISABLED);
  }
}
