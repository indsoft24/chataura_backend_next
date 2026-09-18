import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AgoraService {
  constructor(private readonly config: ConfigService) {}

  buildToken(
    channel: string,
    uid: number,
    publisher: boolean,
  ): {
    agora_token: string;
    agora_uid: number;
    rtc_role: 'publisher' | 'audience';
    expires_in: number;
  } {
    const expiresIn = Number(this.config.get('AGORA_TOKEN_EXPIRY', '3600'));
    const appId = this.config.get<string>('AGORA_APP_ID') ?? '';
    const cert = this.config.get<string>('AGORA_APP_CERTIFICATE') ?? '';
    const rtcRole = publisher ? 'publisher' : 'audience';

    if (!appId || !cert) {
      return {
        agora_token: `mock_agora_${channel}_${uid}`,
        agora_uid: uid,
        rtc_role: rtcRole,
        expires_in: expiresIn,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RtcTokenBuilder, RtcRole } = require('agora-token') as {
      RtcTokenBuilder: {
        buildTokenWithUid: (
          appId: string,
          cert: string,
          channel: string,
          uid: number,
          role: number,
          privilegeExpire: number,
          tokenExpire: number,
        ) => string;
      };
      RtcRole: { PUBLISHER: number; SUBSCRIBER: number };
    };
    const expireTs = Math.floor(Date.now() / 1000) + expiresIn;
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      cert,
      channel,
      uid,
      publisher ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER,
      expireTs,
      expireTs,
    );
    return {
      agora_token: token,
      agora_uid: uid,
      rtc_role: rtcRole,
      expires_in: expiresIn,
    };
  }
}
