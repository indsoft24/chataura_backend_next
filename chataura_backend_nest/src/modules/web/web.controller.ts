import { Controller, Get, Param, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import { existsSync } from 'fs';
import { join } from 'path';
import { Public } from '../../common/decorators/public.decorator';
import { renderLandingPage } from './templates/landing.template';
import {
  renderPrivacyPolicy,
  renderTermsAndConditions,
  renderDeleteAccount,
  renderChildSafety,
} from './templates/legal.templates';
import { renderReferralPage } from './templates/referral.template';

const ASSET_LINKS = [
  {
    relation: [
      'delegate_permission/common.handle_all_urls',
      'delegate_permission/common.get_login_creds',
    ],
    target: {
      namespace: 'android_app',
      package_name: 'com.chataura.app',
      sha256_cert_fingerprints: [
        'AF:BC:02:70:44:1C:96:D7:18:6E:DD:B1:99:B7:67:19:6C:AF:57:B5:1A:06:C1:3B:C9:6D:21:8F:B0:0E:B2:6D',
        '54:40:8C:7C:83:43:74:11:A6:1B:6A:62:73:76:94:8A:92:2C:39:5F:D5:5B:85:D8:7F:6C:E2:B6:78:D2:B2:53',
      ],
    },
  },
];

const APP_ADS_TXT = 'google.com, pub-2860578009648608, DIRECT, f08c47fec0942fa0\n';
const ROBOTS_TXT = 'User-agent: *\nAllow: /\n';

@Controller()
export class WebController {
  constructor(private readonly config: ConfigService) {}

  private getAppConfig() {
    const baseUrl = this.config.get<string>('PUBLIC_BASE_URL', 'https://chataura.in');
    const playStoreUrl = this.config.get<string>(
      'PLAY_STORE_URL',
      'https://play.google.com/store/apps/details?id=com.chataura.app',
    );
    const localApkPath = join(process.cwd(), 'public', 'apk', 'ChatAura.apk');
    const hasLocalApk = existsSync(localApkPath);
    return {
      appName: 'Chat Aura',
      baseUrl,
      playStoreUrl,
      hasLocalApk,
      apkDownloadUrl: `${baseUrl}/apk/ChatAura.apk`,
    };
  }

  @Get()
  @Public()
  getLandingPage(@Res() res: FastifyReply) {
    const html = renderLandingPage(this.getAppConfig());
    return res.type('text/html; charset=utf-8').send(html);
  }

  @Get('privacy-policy')
  @Public()
  getPrivacyPolicy(@Res() res: FastifyReply) {
    const html = renderPrivacyPolicy();
    return res.type('text/html; charset=utf-8').send(html);
  }

  @Get('terms-and-conditions')
  @Public()
  getTermsAndConditions(@Res() res: FastifyReply) {
    const html = renderTermsAndConditions();
    return res.type('text/html; charset=utf-8').send(html);
  }

  @Get('delete-account')
  @Public()
  getDeleteAccount(@Res() res: FastifyReply) {
    const html = renderDeleteAccount();
    return res.type('text/html; charset=utf-8').send(html);
  }

  @Get('child-safety')
  @Public()
  getChildSafety(@Res() res: FastifyReply) {
    const html = renderChildSafety();
    return res.type('text/html; charset=utf-8').send(html);
  }

  @Get('register')
  @Public()
  getRegisterLanding(@Res() res: FastifyReply) {
    const appConfig = this.getAppConfig();
    const html = renderReferralPage(null, appConfig.baseUrl, appConfig.playStoreUrl);
    return res.type('text/html; charset=utf-8').send(html);
  }

  @Get('invite/:code')
  @Public()
  getInviteLanding(@Param('code') code: string, @Res() res: FastifyReply) {
    const appConfig = this.getAppConfig();
    const html = renderReferralPage(code, appConfig.baseUrl, appConfig.playStoreUrl);
    return res.type('text/html; charset=utf-8').send(html);
  }

  @Get('.well-known/assetlinks.json')
  @Public()
  getAssetLinks(@Res() res: FastifyReply) {
    return res
      .type('application/json; charset=utf-8')
      .send(JSON.stringify(ASSET_LINKS, null, 2));
  }

  @Get('app-ads.txt')
  @Public()
  getAppAdsTxt(@Res() res: FastifyReply) {
    return res.type('text/plain; charset=utf-8').send(APP_ADS_TXT);
  }

  @Get('robots.txt')
  @Public()
  getRobotsTxt(@Res() res: FastifyReply) {
    return res.type('text/plain; charset=utf-8').send(ROBOTS_TXT);
  }
}
