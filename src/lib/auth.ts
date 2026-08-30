import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { Role, SessionUser } from "@/lib/crm-types";

const SECRET = process.env.SESSION_SECRET || "grupa-kreasi-dev-secret-change-me";
const COOKIE_NAME = "gk_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 hari

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function createSessionToken(user: SessionUser): string {
  const body = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + MAX_AGE * 1000 })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function parseSessionToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig !== expected) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!data.exp || Date.now() > data.exp) return null;
    return { id: data.id, name: data.name, email: data.email, role: data.role as Role, companyId: data.companyId ?? null };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return parseSessionToken(store.get(COOKIE_NAME)?.value);
}

export async function setSessionCookie(user: SessionUser) {
  const store = await cookies();
  store.set(COOKIE_NAME, createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

/** Guard untuk route handler. Mengembalikan user atau null (caller balas 401/403). */
export async function requireAuth(allowed?: Role[]): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;
  if (allowed && !allowed.includes(session.role)) return null;
  return session;
}

export async function authenticate(email: string, password: string): Promise<SessionUser | null> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() }, include: { company: true } });
  if (!user || !user.active) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    companyId: user.companyId ?? null,
  };
}
