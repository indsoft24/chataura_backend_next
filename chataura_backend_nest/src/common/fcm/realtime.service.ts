import { Injectable, Logger } from '@nestjs/common';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { FcmService } from './fcm.service';

/** Room chat document written by the server (`origin: 'server'`, which clients cannot write). */
export type ServerRoomEvent = { text: string };

/** Mirrors the shape ConversationFirebaseHelper (Android) reads. */
export type ConversationRealtimeMessage = {
  messageId: number;
  senderId: number;
  senderName: string;
  senderAvatar: string;
  message: string;
  messageType: string;
  messageMedia: string;
  giftId: string;
  giftName: string;
  giftImageUrl: string;
  giftAnimationUrl: string;
  createdAt: string;
  clientUuid: string;
  status: string;
};

/**
 * Server-side realtime delivery through Firestore. The server is the source of truth: chat
 * messages, deletions, read receipts and room gift events are written here after the database
 * commit, so delivery no longer depends on the sender's phone staying alive — and clients can
 * no longer forge them. Every method returns false (never throws) when Firebase is unavailable,
 * so callers can tell the app to fall back to client delivery.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(private readonly fcm: FcmService) {}

  private db() {
    const app = this.fcm.getApp();
    return app ? getFirestore(app) : null;
  }

  async publishRoomEvent(roomId: string, event: ServerRoomEvent): Promise<boolean> {
    const db = this.db();
    if (!db) return false;
    try {
      await db.collection('rooms').doc(roomId).collection('messages').add({
        origin: 'server',
        senderId: 'server',
        apiUserId: 0,
        agoraUid: 0,
        senderName: '',
        text: event.text,
        timestamp: FieldValue.serverTimestamp(),
      });
      return true;
    } catch (e) {
      this.logger.warn(`publishRoomEvent(${roomId}) failed: ${String(e)}`);
      return false;
    }
  }

  async publishConversationMessage(
    conversationId: bigint,
    msg: ConversationRealtimeMessage,
  ): Promise<boolean> {
    const db = this.db();
    if (!db) return false;
    try {
      await db
        .collection('conversations')
        .doc(String(conversationId))
        .collection('messages')
        .doc(String(msg.messageId))
        .set({ ...msg, origin: 'server', timestamp: FieldValue.serverTimestamp() });
      return true;
    } catch (e) {
      this.logger.warn(`publishConversationMessage(${conversationId}) failed: ${String(e)}`);
      return false;
    }
  }

  async deleteConversationMessage(conversationId: bigint, messageId: bigint): Promise<boolean> {
    const db = this.db();
    if (!db) return false;
    try {
      await db
        .collection('conversations')
        .doc(String(conversationId))
        .collection('messages')
        .doc(String(messageId))
        .delete();
      return true;
    } catch (e) {
      this.logger.warn(`deleteConversationMessage(${conversationId}/${messageId}) failed: ${String(e)}`);
      return false;
    }
  }

  async publishReadReceipt(conversationId: bigint, userId: bigint): Promise<boolean> {
    const db = this.db();
    if (!db) return false;
    try {
      await db
        .collection('conversations')
        .doc(String(conversationId))
        .collection('reads')
        .doc(String(userId))
        .set({ userId: Number(userId), readAt: new Date(), readAtMs: Date.now() });
      return true;
    } catch (e) {
      this.logger.warn(`publishReadReceipt(${conversationId}) failed: ${String(e)}`);
      return false;
    }
  }

  /** Removes a deleted group's realtime copy (messages, receipts, member list). */
  async deleteConversation(conversationId: bigint): Promise<void> {
    const db = this.db();
    if (!db) return;
    try {
      await db.recursiveDelete(db.collection('conversations').doc(String(conversationId)));
    } catch (e) {
      this.logger.warn(`deleteConversation(${conversationId}) failed: ${String(e)}`);
    }
  }
}
