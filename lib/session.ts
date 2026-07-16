import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

export type SessionData = { userId?: string };

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), {
    password: process.env.SESSION_SECRET!,
    cookieName: "onyx_session",
    cookieOptions: { secure: process.env.NODE_ENV === "production" },
  });
}

export async function requireUserId(): Promise<string | null> {
  const session = await getSession();
  return session.userId ?? null;
}
