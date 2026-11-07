import { RequestMethod } from '@nestjs/common';
import type { RouteInfo } from '@nestjs/common/interfaces';

/** Public pages served without the API prefix. */
export const PUBLIC_WEB_PATHS: (string | RouteInfo)[] = [
  '/',
  'privacy-policy',
  'terms-and-conditions',
  'delete-account',
  'child-safety',
  'register',
  'download',
  // GET only: the landing page. A bare path here also pulled POST invite/apply out of the API prefix (404 for the app).
  { path: 'invite/:code', method: RequestMethod.GET },
  '.well-known/assetlinks.json',
  'app-ads.txt',
  'robots.txt',
  'apk',
  'apk/:file',
];
