import { randomUUID } from "node:crypto";
import { createPlatformContext, createTenantContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { PlatformSupportTicketStore, SupportAttachmentWorkerStore, TenantSupportTicketStore } from "./support-ticket-store";

const tenantUrl = process.env.TENANT_DATABASE_URL;
const platformUrl = process.env.PLATFORM_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const workerUrl = process.env.WORKER_DATABASE_URL;
const enabled = Boolean(tenantUrl && platformUrl && adminUrl && workerUrl);
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const platformClient = enabled ? createDatabaseClient(platformUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;
const workerClient = enabled ? createDatabaseClient(workerUrl!) : null;

afterAll(async () => { await tenantClient?.end(); await platformClient?.end(); await adminClient?.end(); await workerClient?.end(); });

describe.runIf(enabled)("merchant support ticket lifecycle", () => {
  it("isolates tenants and preserves an idempotent customer/platform conversation through close", async () => {
    const tenantA = createTenantContext({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10",
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "ticket-tenant-a",
    });
    const tenantB = createTenantContext({
      tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "ticket-tenant-b",
    });
    const unauthorizedTenantA = createTenantContext({
      tenantId: tenantA.tenantId, userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11", sessionId: randomUUID(),
      role: "tenant_admin", requestId: "ticket-mismatched-tenant-a",
    });
    const owners = await adminClient!<{ id: string }[]>`
      SELECT app_user.id FROM platform.users app_user
      JOIN platform.role_assignments assignment ON assignment.platform_user_id = app_user.id
      WHERE assignment.role = 'platform_owner' AND assignment.revoked_at IS NULL LIMIT 1
    `;
    expect(owners[0]).toBeTruthy();
    const platform = createPlatformContext({
      platformUserId: owners[0]!.id, sessionId: randomUUID(), role: "platform_owner",
      requestId: "ticket-platform", reauthenticatedAt: new Date(),
    });
    const tenantStore = new TenantSupportTicketStore(tenantClient!);
    const platformStore = new PlatformSupportTicketStore(platformClient!);
    const idempotencyKey = randomUUID();
    const input = {
      category: "onboarding" as const, priority: "normal" as const,
      subject: "Website setup needs help", description: "The website check remains pending after installation.",
      contextPath: "/workspace/setup", diagnosticCode: "INSTALL.PENDING", idempotencyKey,
    };
    await expect(tenantStore.createTicket(unauthorizedTenantA, input)).resolves.toEqual({ status: "not_found" });
    const created = await tenantStore.createTicket(tenantA, input);
    expect(created).toMatchObject({ status: "created" });
    if (created.status !== "created") throw new Error("Expected support ticket.");
    await expect(tenantStore.createTicket(tenantA, input)).resolves.toMatchObject({
      status: "created", ticketId: created.ticketId, replayed: true,
    });
    await expect(tenantStore.overview(tenantB)).resolves.toEqual({ tickets: [], messages: [], attachments: [], notifications: [] });

    const attachmentWorker = new SupportAttachmentWorkerStore(workerClient!);
    const attachmentKey = randomUUID();
    const attachment = await tenantStore.initiateAttachment(tenantA, {
      ticketId: created.ticketId, filename: "installation.txt", mediaType: "text/plain", size: 17,
      idempotencyKey: attachmentKey,
    });
    expect(attachment).toMatchObject({ status: "created" });
    if (attachment.status !== "created") throw new Error("Expected support attachment.");
    await expect(tenantStore.initiateAttachment(tenantA, {
      ticketId: created.ticketId, filename: "installation.txt", mediaType: "text/plain", size: 17,
      idempotencyKey: attachmentKey,
    })).resolves.toMatchObject({ status: "created", attachmentId: attachment.attachmentId });
    await expect(tenantStore.pendingAttachment(tenantB, created.ticketId, attachment.attachmentId)).resolves.toBeNull();
    await expect(tenantStore.completeAttachmentUpload(tenantB, attachment.attachmentId, 17))
      .resolves.toEqual({ status: "not_completable" });
    await expect(tenantStore.completeAttachmentUpload(tenantA, attachment.attachmentId, 17))
      .resolves.toEqual({ status: "queued" });
    const cleanClaim = await attachmentWorker.claim();
    expect(cleanClaim).toMatchObject({ attachment_id: attachment.attachmentId, declared_size: 17 });
    if (!cleanClaim) throw new Error("Expected support attachment scan claim.");
    await expect(attachmentWorker.complete(cleanClaim.job_id, 16, Buffer.alloc(32, 1))).resolves.toBe(false);
    await expect(attachmentWorker.complete(cleanClaim.job_id, 17, Buffer.alloc(32, 1))).resolves.toBe(true);
    await expect(tenantStore.cleanAttachment(tenantB, created.ticketId, attachment.attachmentId)).resolves.toBeNull();
    await expect(tenantStore.cleanAttachment(tenantA, created.ticketId, attachment.attachmentId))
      .resolves.toMatchObject({ filename: "installation.txt", mediaType: "text/plain" });

    const infected = await tenantStore.initiateAttachment(tenantA, {
      ticketId: created.ticketId, filename: "unsafe.pdf", mediaType: "application/pdf", size: 20,
      idempotencyKey: randomUUID(),
    });
    if (infected.status !== "created") throw new Error("Expected infected support attachment fixture.");
    await tenantStore.completeAttachmentUpload(tenantA, infected.attachmentId, 20);
    const infectedClaim = await attachmentWorker.claim();
    expect(infectedClaim?.attachment_id).toBe(infected.attachmentId);
    if (!infectedClaim) throw new Error("Expected infected support attachment scan claim.");
    await expect(attachmentWorker.fail(infectedClaim.job_id, "malware_detected", false)).resolves.toBe(true);
    await expect(tenantStore.cleanAttachment(tenantA, created.ticketId, infected.attachmentId)).resolves.toBeNull();
    await expect(tenantStore.overview(tenantA)).resolves.toMatchObject({ attachments: expect.arrayContaining([
      expect.objectContaining({ id: attachment.attachmentId, status: "clean" }),
      expect.objectContaining({ id: infected.attachmentId, status: "infected", safeErrorCode: "malware_detected" }),
    ]), notifications: expect.arrayContaining([
      expect.objectContaining({ ticketId: created.ticketId, eventKind: "attachment_clean", read: false }),
      expect.objectContaining({ ticketId: created.ticketId, eventKind: "attachment_blocked", read: false }),
    ]) });

    const customerReplyKey = randomUUID();
    await expect(tenantStore.addMessage(tenantA, {
      ticketId: created.ticketId, body: "The diagnostic code is shown above.", idempotencyKey: customerReplyKey,
    })).resolves.toMatchObject({ status: "updated" });
    await expect(tenantStore.addMessage(tenantA, {
      ticketId: created.ticketId, body: "The diagnostic code is shown above.", idempotencyKey: customerReplyKey,
    })).resolves.toMatchObject({ status: "updated", replayed: true });

    const platformReplyKey = randomUUID();
    await expect(platformStore.respond(platform, {
      ticketId: created.ticketId, body: "Please rerun the installation check after clearing the site cache.",
      status: "waiting_on_customer", idempotencyKey: platformReplyKey,
    })).resolves.toMatchObject({ status: "updated" });
    await expect(platformStore.respond(platform, {
      ticketId: created.ticketId, body: "Please rerun the installation check after clearing the site cache.",
      status: "waiting_on_customer", idempotencyKey: platformReplyKey,
    })).resolves.toMatchObject({ status: "updated", replayed: true });
    const supportAfterResponse = await tenantStore.overview(tenantA);
    const responseNotification = supportAfterResponse.notifications.find((item) => item.eventKind === "platform_response");
    expect(responseNotification).toBeTruthy();
    if (!responseNotification) throw new Error("Expected platform response notification.");
    await expect(tenantStore.markNotificationRead(tenantB, created.ticketId, responseNotification.id))
      .resolves.toEqual({ status: "not_found" });
    await expect(tenantStore.markNotificationRead(tenantA, created.ticketId, responseNotification.id))
      .resolves.toEqual({ status: "read" });
    await expect(tenantStore.overview(tenantA)).resolves.toMatchObject({
      notifications: expect.arrayContaining([expect.objectContaining({ id: responseNotification.id, read: true })]),
    });
    await expect(platformStore.queue(platform)).resolves.toMatchObject({
      tickets: expect.arrayContaining([expect.objectContaining({ id: created.ticketId, serviceLevel: "standard", responseState: "responded" })]),
    });

    await expect(tenantStore.addMessage(tenantA, {
      ticketId: created.ticketId, body: "The check is now passing. Thank you.", idempotencyKey: randomUUID(),
    })).resolves.toMatchObject({ status: "updated" });
    const overview = await tenantStore.overview(tenantA);
    expect(overview.tickets).toMatchObject([{ id: created.ticketId, status: "open" }]);
    expect(overview.messages.map((message) => message.authorKind)).toEqual(["customer", "platform", "customer"]);
    await expect(platformStore.queue(platform)).resolves.toMatchObject({
      tickets: expect.arrayContaining([expect.objectContaining({ id: created.ticketId, businessName: "Tenant A" })]),
    });
    await expect(tenantStore.closeTicket(tenantA, created.ticketId, {
      rating: 5, comment: "Clear answer and quick follow-up.",
    })).resolves.toEqual({ status: "closed", replayed: false });
    await expect(tenantStore.closeTicket(tenantA, created.ticketId, { rating: 1 }))
      .resolves.toEqual({ status: "closed", replayed: true });
    await expect(tenantStore.overview(tenantA)).resolves.toMatchObject({
      tickets: [{ id: created.ticketId, status: "closed", feedbackRating: 5, feedbackComment: "Clear answer and quick follow-up." }],
    });
    await expect(platformStore.queue(platform)).resolves.toMatchObject({
      tickets: expect.arrayContaining([expect.objectContaining({ id: created.ticketId, feedbackRating: 5 })]),
    });
    await expect(tenantStore.addMessage(tenantA, {
      ticketId: created.ticketId, body: "This must not be accepted.", idempotencyKey: randomUUID(),
    })).resolves.toEqual({ status: "ticket_closed" });
  });
});
