import { createHmac } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AgoraService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Every room/seat response spreads this. Agora fields are always present (old apps keep working);
   * `provider`/`url`/`token` are added so new apps use LiveKit. LiveKit is the first choice whenever
   * LIVEKIT_URL / KEY / SECRET are all set; otherwise (or with RTC_PROVIDER=agora) it is 'agora'.
   * LIVEKIT_ROOM_PREFIX keeps two backends that share one LiveKit server (staging / production) apart.
   */
  buildToken(channel: string, uid: number, publisher: boolean) {
    const base = this.buildAgoraToken(channel, uid, publisher);
    const lk = this.livekit(channel, uid, publisher, base.expires_in);
    return lk
      ? { ...base, provider: 'livekit' as const, url: lk.url, token: lk.token, identity: String(uid) }
      : { ...base, provider: 'agora' as const };
  }

  private livekit(channel: string, uid: number, publisher: boolean, expiresIn: number) {
    if (this.config.get('RTC_PROVIDER') === 'agora') return null;
    const url = this.config.get<string>('LIVEKIT_URL');
    const key = this.config.get<string>('LIVEKIT_API_KEY');
    const secret = this.config.get<string>('LIVEKIT_API_SECRET');
    if (!url || !key || !secret) return null;
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const head = b64({ alg: 'HS256', typ: 'JWT' });
    const body = b64({
      iss: key,
      sub: String(uid),
      nbf: now,
      exp: now + expiresIn,
      video: {
        room: `${this.config.get<string>('LIVEKIT_ROOM_PREFIX') ?? ''}${channel}`,
        roomJoin: true,
        canSubscribe: true,
        canPublish: publisher, // the server decides; the client can never grant itself the mic
        canPublishData: true,
      },
    });
    const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
    return { url, token: `${head}.${body}.${sig}` };
  }

  private buildAgoraToken(
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
