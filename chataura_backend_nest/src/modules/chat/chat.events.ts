import { Injectable } from '@nestjs/common';

@Injectable()
export class ChatEvents {
  emitReceive: (userId: string, payload: unknown) => void = () => undefined;
  emitRead: (userId: string, payload: unknown) => void = () => undefined;
}
