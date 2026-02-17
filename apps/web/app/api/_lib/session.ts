import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, tenants, userSessions, users } from "@booking-agent/db";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE_NAME = "booking_agent_session";
const SESSION_TTL_DAYS = 14;

function requireSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error("SESSION_SECRET must be set and at least 24 characters");
  }
  return secret;
}

function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function tokenHash(rawToken: string) {
  const secret = requireSessionSecret();
  return sha256(`${rawToken}.${secret}`);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [scheme, salt, encoded] = storedHash.split("$");
  if (scheme !== "scrypt" || !salt || !encoded) return false;

  const input = Buffer.from(scryptSync(password, salt, 64).toString("hex"), "hex");
  const stored = Buffer.from(encoded, "hex");
  if (input.length !== stored.length) return false;
  return timingSafeEqual(input, stored);
}

function expiresAtFromNow() {
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_TTL_DAYS);
  return expires;
}

function publicUser(user: {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "staff" | "viewer";
}) {
  return {
    id: user.id,
    tenant_id: user.tenantId,
    email: user.email,
    name: user.name,
    role: user.role
  };
}

export type AuthSession = {
  user: {
    id: string;
    tenant_id: string;
    email: string;
    name: string;
    role: "owner" | "admin" | "staff" | "viewer";
  };
  tenant: {
    id: string;
    name: string;
    timezone: string;
  };
  sessionId: string;
};

type GetAuthSessionOptions = {
  mutateCookies?: boolean;
};

export async function createUserSession(user: {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "staff" | "viewer";
}) {
  const rawToken = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = expiresAtFromNow();

  const [created] = await db
    .insert(userSessions)
    .values({
      tenantId: user.tenantId,
      userId: user.id,
      sessionTokenHash: tokenHash(rawToken),
      expiresAt,
      lastSeenAt: now,
      updatedAt: now
    })
    .returning({ id: userSessions.id });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });

  if (!created) {
    throw new Error("failed to create session");
  }

  return { sessionId: created.id, user: publicUser(user) };
}

export async function clearUserSession() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (rawToken) {
    const hashed = tokenHash(rawToken);
    await db.delete(userSessions).where(eq(userSessions.sessionTokenHash, hashed));
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getAuthSession(options: GetAuthSessionOptions = {}): Promise<AuthSession | null> {
  const mutateCookies = options.mutateCookies ?? false;
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) return null;

  const hashed = tokenHash(rawToken);

  const [row] = await db
    .select({
      sessionId: userSessions.id,
      tenantId: users.tenantId,
      userId: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      tenantName: tenants.name,
      tenantTimezone: tenants.timezone,
      expiresAt: userSessions.expiresAt
    })
    .from(userSessions)
    .innerJoin(users, and(eq(users.id, userSessions.userId), eq(users.tenantId, userSessions.tenantId)))
    .innerJoin(tenants, eq(tenants.id, userSessions.tenantId))
    .where(and(eq(userSessions.sessionTokenHash, hashed), gt(userSessions.expiresAt, new Date())));

  if (!row || !row.isActive) {
    if (mutateCookies) {
      cookieStore.delete(SESSION_COOKIE_NAME);
    }
    return null;
  }

  const refreshedExpiry = expiresAtFromNow();
  await db
    .update(userSessions)
    .set({ lastSeenAt: new Date(), expiresAt: refreshedExpiry, updatedAt: new Date() })
    .where(eq(userSessions.id, row.sessionId));

  if (mutateCookies) {
    cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: refreshedExpiry
    });
  }

  return {
    sessionId: row.sessionId,
    user: {
      id: row.userId,
      tenant_id: row.tenantId,
      email: row.email,
      name: row.name,
      role: row.role
    },
    tenant: {
      id: row.tenantId,
      name: row.tenantName,
      timezone: row.tenantTimezone
    }
  };
}
