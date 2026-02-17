import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, resources, tenants, users } from "@booking-agent/db";
import { createUserSession, hashPassword } from "../../_lib/session";

const schema = z.object({
  tenant_name: z.string().min(2),
  tenant_slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/),
  timezone: z.string().min(3),
  owner_name: z.string().min(2),
  owner_email: z.string().email(),
  password: z.string().min(8)
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = schema.parse(body);

    const [usersCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    if ((usersCount?.count ?? 0) > 0) {
      return NextResponse.json({ error: "bootstrap already completed" }, { status: 409 });
    }

    const [existing] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, input.tenant_slug)).limit(1);
    if (existing) {
      return NextResponse.json({ error: "tenant slug already exists" }, { status: 409 });
    }

    const result = await db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({
          name: input.tenant_name,
          slug: input.tenant_slug,
          timezone: input.timezone
        })
        .returning();
      if (!tenant) throw new Error("failed to create tenant");

      const [owner] = await tx
        .insert(users)
        .values({
          tenantId: tenant.id,
          email: input.owner_email,
          name: input.owner_name,
          role: "owner",
          passwordHash: hashPassword(input.password),
          isActive: true
        })
        .returning();
      if (!owner) throw new Error("failed to create owner");

      await tx.insert(resources).values({
        tenantId: tenant.id,
        userId: owner.id,
        displayName: owner.name,
        isDefault: true,
        isActive: true
      });

      return { tenant, owner };
    });

    await createUserSession({
      id: result.owner.id,
      tenantId: result.owner.tenantId,
      email: result.owner.email,
      name: result.owner.name,
      role: result.owner.role
    });

    return NextResponse.json(
      {
        tenant: {
          id: result.tenant.id,
          name: result.tenant.name,
          slug: result.tenant.slug,
          timezone: result.tenant.timezone
        },
        user: {
          id: result.owner.id,
          tenant_id: result.owner.tenantId,
          email: result.owner.email,
          name: result.owner.name,
          role: result.owner.role
        }
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
