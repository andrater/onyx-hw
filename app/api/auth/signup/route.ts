import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || !email.includes("@") || typeof password !== "string" || password.length < 6) {
    return NextResponse.json({ error: "Valid email and password (min 6 chars) required" }, { status: 400 });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const [user] = await db
      .insert(users)
      .values({ email: email.toLowerCase().trim(), passwordHash })
      .returning({ id: users.id });
    const session = await getSession();
    session.userId = user.id;
    await session.save();
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "23505") {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }
    throw e;
  }
}
