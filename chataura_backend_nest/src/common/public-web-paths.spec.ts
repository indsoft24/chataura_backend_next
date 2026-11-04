import { Controller, Get, Post } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PUBLIC_WEB_PATHS } from './public-web-paths';

@Controller()
class Probe {
  @Get('invite/:code') page() { return 'page'; }
  @Post('invite/apply') apply() { return 'apply'; }
}

describe('public web paths', () => {
  it('keeps the invite landing page outside the prefix but POST invite/apply inside it', async () => {
    const mod = await Test.createTestingModule({ controllers: [Probe] }).compile();
    const app = mod.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api/v2', { exclude: PUBLIC_WEB_PATHS });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const inject = (method: 'GET' | 'POST', url: string) => app.inject({ method, url }).then((r) => r.statusCode);
    expect(await inject('GET', '/invite/abc123')).toBe(200);
    expect(await inject('POST', '/api/v2/invite/apply')).toBe(201);
    expect(await inject('POST', '/invite/apply')).toBe(404);
    await app.close();
  });
});
