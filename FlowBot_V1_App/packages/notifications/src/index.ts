export type NotificationOutboxPayload = {
  kind: "handoff";
  conversationId: string;
  tenantId: string;
};

export type NotificationProvider = {
  send(payload: NotificationOutboxPayload): Promise<void>;
};

export class TestNotificationProvider implements NotificationProvider {
  readonly sent: NotificationOutboxPayload[] = [];

  async send(payload: NotificationOutboxPayload): Promise<void> {
    this.sent.push(payload);
  }
}
