import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { requireUserId } from "@/lib/session";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ user: null });
  const [user] = await db
    .select({ id: users.id, email: users.email, balanceCents: users.balanceCents })
    .from(users)
    .where(eq(users.id, userId));
  return NextResponse.json({ user: user ?? null });
}
