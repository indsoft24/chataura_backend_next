import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private app: App | null = null;
  private isConfigured = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.initFirebase();
  }

  private initFirebase() {
    try {
      const existingApps = getApps();
      if (existingApps.length > 0) {
        this.app = existingApps[0];
        this.isConfigured = true;
        this.logger.log('Reusing existing Firebase Admin app initialization');
        return;
      }

      const serviceAccountJson = this.config.get<string>(
        'FIREBASE_SERVICE_ACCOUNT_JSON',
      );
      const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
      const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY');

      if (serviceAccountJson) {
        let creds: any;
        try {
          creds = JSON.parse(serviceAccountJson);
        } catch {
          creds = serviceAccountJson;
        }
        this.app = initializeApp({
          credential: cert(creds),
        });
        this.isConfigured = true;
        this.logger.log('Firebase Admin initialized with service account JSON');
      } else if (clientEmail && privateKey) {
        const formattedKey = privateKey.replace(/\\n/g, '\n');
        this.app = initializeApp({
          credential: cert({
            projectId: projectId || 'chataura',
            clientEmail,
            privateKey: formattedKey,
          }),
        });
        this.isConfigured = true;
        this.logger.log('Firebase Admin initialized with client email and key');
      } else if (projectId) {
        this.app = initializeApp({
          projectId,
        });
        this.isConfigured = true;
        this.logger.log(`Firebase Admin initialized with project ID: ${projectId}`);
      } else {
        this.logger.warn(
          'Firebase Admin credentials not provided in environment. Background FCM push notifications will run in mock/log mode.',
        );
      }
    } catch (e) {
      this.logger.warn(
        `Failed to initialize Firebase Admin: ${String(e)}. Running in mock/fallback mode.`,
      );
    }
  }

  /**
   * Send background push notification for DIRECT CHAT MESSAGES ONLY.
   * Call-related push notifications are discarded and will never be dispatched.
   */
  async sendDirectChatMessageNotification(params: {
    recipientUserId: bigint;
    conversationId: number | string;
    senderId: number | string;
    senderName: string;
    messageText: string;
    messageType: string;
  }): Promise<void> {
    try {
      // Find recipient active tokens
      const [user, devices] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: params.recipientUserId },
          select: { fcmToken: true },
        }),
        this.prisma.userDevice.findMany({
          where: { userId: params.recipientUserId },
          select: { id: true, fcmToken: true },
        }),
      ]);

      const tokens = new Set<string>();
      if (user?.fcmToken && user.fcmToken.trim().length > 10) {
        tokens.add(user.fcmToken.trim());
      }
      for (const d of devices) {
        if (d.fcmToken && d.fcmToken.trim().length > 10) {
          tokens.add(d.fcmToken.trim());
        }
      }

      if (tokens.size === 0) {
        return;
      }

      const bodyText =
        params.messageType === 'image'
          ? 'Sent a photo'
          : params.messageType === 'gift'
            ? 'Sent a virtual gift'
            : params.messageText || 'Sent a message';

      const dataPayload: Record<string, string> = {
        type: 'new_message',
        conversation_id: String(params.conversationId),
        sender_id: String(params.senderId),
        sender_name: params.senderName || 'User',
        message: bodyText,
        msg_type: params.messageType || 'text',
      };

      if (!this.isConfigured || !this.app) {
        this.logger.debug(
          `[MOCK FCM] Dispatched chat notification to user ${params.recipientUserId} (${tokens.size} tokens): ${bodyText}`,
        );
        return;
      }

      const messaging = getMessaging(this.app);
      const targetTokens = Array.from(tokens);
      for (const token of targetTokens) {
        try {
          await messaging.send({
            token,
            data: dataPayload,
            notification: {
              title: params.senderName || 'ChatAura',
              body: bodyText,
            },
            android: {
              priority: 'high',
              notification: {
                clickAction: 'FLUTTER_NOTIFICATION_CLICK',
                sound: 'default',
              },
            },
          });
        } catch (err: any) {
          const errorCode = err?.code || '';
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            this.logger.debug(
              `Cleaning up stale FCM token: ${token.slice(0, 10)}...`,
            );
            await this.prisma.userDevice
              .deleteMany({ where: { fcmToken: token } })
              .catch(() => {});
            if (user?.fcmToken === token) {
              await this.prisma.user
                .update({
                  where: { id: params.recipientUserId },
                  data: { fcmToken: null },
                })
                .catch(() => {});
            }
          } else {
            this.logger.warn(
              `FCM message dispatch error: ${String(err?.message || err)}`,
            );
          }
        }
      }
    } catch (outerErr) {
      // Must NEVER throw or disrupt the chat message sending flow
      this.logger.warn(`FCM service outer failure: ${String(outerErr)}`);
    }
  }
}
