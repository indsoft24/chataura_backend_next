import { Injectable } from '@nestjs/common';

@Injectable()
export class GameEvents {
  emitTick: (game: string, payload: unknown) => void = () => undefined;
  emitResult: (game: string, payload: unknown) => void = () => undefined;
}
