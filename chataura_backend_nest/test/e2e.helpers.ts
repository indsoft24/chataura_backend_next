import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ResponseTransformInterceptor } from '../src/common/interceptors/response-transform.interceptor';

export const prisma = new PrismaClient();

export type Envelope<T = Record<string, unknown>> = {
  success: boolean;
  data?: T;
  error?: { code: string; message?: string };
  current_page?: number;
  has_more?: boolean;
  last_page?: number;
  per_page?: number;
};

export type AuthedUser = {
  id: number;
  email: string;
  password: string;
  token: string;
  refresh: string;
  inviteCode: string;
};

export async function createTestApp(): Promise<NestFastifyApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
    { bodyParser: false },
  );
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      if (!body || (typeof body === 'string' && body.length === 0)) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseTransformInterceptor());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

export function parse<T = Record<string, unknown>>(
  payload: string,
): Envelope<T> {
  return JSON.parse(payload) as Envelope<T>;
}

export function authHeader(token: string) {
  return { authorization: `Bearer ${token}` };
}

let seq = 0;
export function uniqueGmail(prefix = 'p6') {
  seq += 1;
  return `${prefix}.${Date.now()}.${seq}.${Math.random().toString(36).slice(2, 8)}@gmail.com`;
}

export async function registerVerified(
  app: NestFastifyApplication,
  opts?: { email?: string; password?: string; name?: string; invite?: string },
): Promise<AuthedUser> {
  const email = opts?.email ?? uniqueGmail();
  const password = opts?.password ?? 'secret12';
  const clientIp = `10.77.${Math.floor(seq / 250)}.${(seq % 250) + 1}`;
  const register = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers: { 'x-forwarded-for': clientIp },
    payload: {
      email,
      password,
      display_name: opts?.name ?? email.split('@')[0],
      ...(opts?.invite ? { invite_code: opts.invite } : {}),
    },
  });
  const reg = parse<{
    access_token: string;
    refresh_token: string;
    user: { id: number; invite_code: string };
  }>(register.payload);
  if (!reg.success || !reg.data?.access_token) {
    throw new Error(`register failed: ${register.payload}`);
  }
  const token = reg.data.access_token;
  const otpRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/send-email-otp',
    headers: { ...authHeader(token), 'x-forwarded-for': clientIp },
    payload: {},
  });
  const otpBody = parse<{ dev_otp?: string }>(otpRes.payload);
  const otp = otpBody.data?.dev_otp;
  if (!otp) {
    throw new Error(`dev OTP missing: ${otpRes.payload}`);
  }
  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/verify-email-otp',
    headers: { ...authHeader(token), 'x-forwarded-for': clientIp },
    payload: { otp },
  });
  return {
    id: Number(reg.data.user.id),
    email,
    password,
    token,
    refresh: reg.data.refresh_token,
    inviteCode: String(reg.data.user.invite_code ?? ''),
  };
}

export async function creditCoins(userId: number, amount: number) {
  await prisma.user.update({
    where: { id: BigInt(userId) },
    data: {
      walletBalance: { increment: BigInt(amount) },
      coinBalance: { increment: BigInt(amount) },
    },
  });
}

export async function setRole(
  userId: number,
  role: 'user' | 'seller' | 'admin' | 'agency',
) {
  await prisma.user.update({
    where: { id: BigInt(userId) },
    data: { role },
  });
}

export async function firstGiftId() {
  const gift = await prisma.gift.findFirst({ where: { isActive: true } });
  if (!gift) throw new Error('seed gifts missing — run prisma seed');
  return Number(gift.id);
}

export async function firstUserPackageId() {
  const pkg = await prisma.coinPackage.findFirst({
    where: { isActive: true, audience: 'user' },
    orderBy: { sortOrder: 'asc' },
  });
  if (!pkg) throw new Error('seed packages missing — run prisma seed');
  return Number(pkg.id);
}

export async function mockRecharge(app: NestFastifyApplication, token: string) {
  const packageId = await firstUserPackageId();
  const init = await app.inject({
    method: 'POST',
    url: '/api/v1/wallet/recharge/initiate',
    headers: authHeader(token),
    payload: { package_id: packageId, country: 'IN', currency: 'INR' },
  });
  const started = parse<{ razorpay_order_id: string }>(init.payload);
  const verify = await app.inject({
    method: 'POST',
    url: '/api/v1/wallet/recharge/verify',
    headers: authHeader(token),
    payload: {
      razorpay_order_id: started.data!.razorpay_order_id,
      razorpay_payment_id: `pay_mock_${Date.now()}`,
      razorpay_signature: 'mock',
    },
  });
  return parse(verify.payload);
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
