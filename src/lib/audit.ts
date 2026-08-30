import { db } from "@/lib/db";
import { AuditLog, Notification } from "@prisma/client";

export async function logAudit(input: {
  actorName: string;
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: string | null;
}): Promise<void> {
  await db.auditLog.create({
    data: {
      actorName: input.actorName,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      detail: input.detail ?? null,
    },
  });
}

export async function notifyStaff(input: {
  title: string;
  body: string;
  type?: string;
  link?: string | null;
  role?: string | null;
}): Promise<void> {
  await db.notification.create({
    data: {
      title: input.title,
      body: input.body,
      type: input.type ?? "INFO",
      link: input.link ?? null,
      role: input.role ?? null,
    },
  });
}

export async function notifyRoles(roles: string[], payload: { title: string; body: string; type?: string; link?: string | null }) {
  await db.$transaction(
    roles.map((role) =>
      db.notification.create({
        data: { title: payload.title, body: payload.body, type: payload.type ?? "INFO", link: payload.link ?? null, role },
      })
    )
  );
}

export type { AuditLog, Notification };
