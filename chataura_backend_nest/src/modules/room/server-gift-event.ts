/**
 * Room gift event text in the CMD:GIFT_V2 format the app already parses:
 * CMD:GIFT_V2:<giftId>:<senderName>:<receiverName>:<giftName>:<quantity>:<animUrl>:<totalCost>:<senderUid>:<receiverUid>
 * Pure — unit tested.
 */
const AGORA_UID_MODULUS = 2_147_483_647n;

/** Names are free text; ':' and line breaks would break field parsing. */
export function commandToken(raw: string): string {
  const t = (raw ?? '').replace(/[:\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
  return (t || 'User').slice(0, 64);
}

export function buildServerGiftCommand(e: {
  giftId: number;
  senderName: string;
  receiverName: string;
  giftName: string;
  quantity: number;
  animUrl: string;
  totalCost: number;
  senderId: bigint;
  receiverId: bigint;
}): string {
  const senderUid = Number(e.senderId % AGORA_UID_MODULUS);
  const receiverUid = Number(e.receiverId % AGORA_UID_MODULUS);
  return [
    'CMD',
    'GIFT_V2',
    String(e.giftId),
    commandToken(e.senderName),
    commandToken(e.receiverName),
    commandToken(e.giftName),
    String(Math.max(1, Math.floor(e.quantity))),
    (e.animUrl ?? '').replace(/[\r\n]/g, ''),
    String(Math.max(0, Math.floor(e.totalCost))),
    String(senderUid),
    String(receiverUid),
  ].join(':');
}
