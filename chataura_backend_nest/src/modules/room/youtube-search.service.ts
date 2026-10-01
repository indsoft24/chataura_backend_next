import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channel: string;
  duration: string;
  thumbnailUrl: string;
}

@Injectable()
export class YouTubeSearchService {
  private readonly logger = new Logger(YouTubeSearchService.name);

  constructor(private readonly redis: RedisService) {}

  async search(query: string): Promise<YouTubeSearchResult[]> {
    const trimmed = (query || '').trim();
    if (!trimmed) return [];

    const cacheKey = `yt_search:${trimmed.toLowerCase()}`;
    const redisClient = this.redis.getClient();

    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      this.logger.warn(`Redis get error: ${(e as Error).message}`);
    }

    const results: YouTubeSearchResult[] = [];

    try {
      const payload = {
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240101.01.00',
          },
        },
        query: trimmed,
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const response = await fetch('https://www.youtube.com/youtubei/v1/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        const json = (await response.json()) as any;
        const contents =
          json.contents?.twoColumnSearchResultsRenderer?.primaryContents
            ?.sectionListRenderer?.contents || [];

        for (const section of contents) {
          const items = section.itemSectionRenderer?.contents || [];
          for (const item of items) {
            const v = item.videoRenderer;
            if (v && v.videoId) {
              const videoId = String(v.videoId);
              const title =
                v.title?.runs?.map((r: any) => r.text).join('') ||
                v.title?.simpleText ||
                `YouTube Video (${videoId})`;
              const channel =
                v.ownerText?.runs?.map((r: any) => r.text).join('') || 'YouTube';
              const duration = v.lengthText?.simpleText || 'HD';
              const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

              if (!results.some((r) => r.videoId === videoId)) {
                results.push({ videoId, title, channel, duration, thumbnailUrl });
              }
            }
          }
        }
      }
    } catch (e) {
      this.logger.error(`YouTube live search failed: ${(e as Error).message}`);
    }

    if (results.length > 0) {
      try {
        await redisClient.set(cacheKey, JSON.stringify(results), 'EX', 1800); // 30 min cache
      } catch (e) {
        this.logger.warn(`Redis set error: ${(e as Error).message}`);
      }
    }

    return results;
  }
}
