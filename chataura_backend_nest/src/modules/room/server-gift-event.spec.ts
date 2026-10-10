import { buildServerGiftCommand, commandToken } from './server-gift-event';

describe('server gift event', () => {
  it('builds the CMD:GIFT_V2 the app parses, with ids as Agora uids', () => {
    const text = buildServerGiftCommand({
      giftId: 12,
      senderName: 'A:li',
      receiverName: 'Bo\nb',
      giftName: 'Rose',
      quantity: 3,
      animUrl: 'https://cdn.x/rose.json',
      totalCost: 30,
      senderId: 5n,
      receiverId: 9n,
    });
    const parts = text.split(':');
    expect(parts.slice(0, 7)).toEqual(['CMD', 'GIFT_V2', '12', 'A li', 'Bo b', 'Rose', '3']);
    expect(parts[parts.length - 1]).toBe('9');
    expect(parts[parts.length - 2]).toBe('5');
    expect(parts[parts.length - 3]).toBe('30');
    expect(parts.slice(7, parts.length - 3).join(':')).toBe('https://cdn.x/rose.json');
  });

  it('never emits an empty or colon-bearing token', () => {
    expect(commandToken('')).toBe('User');
    expect(commandToken('a:b:c')).toBe('a b c');
  });
});
