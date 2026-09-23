import { Injectable } from '@nestjs/common';

@Injectable()
export class RoomEvents {
  // Set by RoomGateway after init (optional WS)
  emitSeatUpdated: (roomId: string, payload: unknown) => void = () => undefined;
  emitGiftOverlay: (roomId: string, payload: unknown) => void = () => undefined;
  emitRocketLaunch: (roomId: string, payload: unknown) => void = () => undefined;
}
