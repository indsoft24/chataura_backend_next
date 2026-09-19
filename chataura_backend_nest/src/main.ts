import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';

(BigInt.prototype as any).toJSON = function () {
  const intVal = Number(this);
  return Number.isSafeInteger(intVal) ? intVal : this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true, trustProxy: true }),
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
  app.useWebSocketAdapter(new IoAdapter(app));
  const uploadsDir = join(process.cwd(), 'uploads');
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
  await app.register(multipart, { limits: { fileSize: 80 * 1024 * 1024 } });
  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: '/uploads/',
  });

  const config = app.get(ConfigService);
  const corsOrigin = config.get<string>('CORS_ORIGIN', '*');

  const apiPrefix = config.get<string>('API_PREFIX', 'api/v2').replace(/^\/+|\/+$/g, '');
  app.setGlobalPrefix(apiPrefix);
  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(','),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseTransformInterceptor());

  const port = Number(config.get<string>('PORT', '3000'));
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
