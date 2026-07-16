"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usd } from "@/lib/format";

type Me = { id: string; email: string; balanceCents: number } | null;

export default function Nav() {
  const [me, setMe] = useState<Me>(null);
  const router = useRouter();

  const refresh = useCallback(async () => {
    const res = await fetch("/api/me");
    const data = await res.json();
    setMe(data.user);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    window.addEventListener("balance-refresh", refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener("balance-refresh", refresh);
    };
  }, [refresh]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMe(null);
    router.push("/login");
  }

  return (
    <nav className="flex items-center gap-6 border-b border-zinc-800 bg-zinc-950 px-6 py-3 text-sm text-zinc-200">
      <Link href="/" className="font-bold text-white">
        Onyx Paper
      </Link>
      <Link href="/" className="hover:text-white">
        Markets
      </Link>
      <Link href="/portfolio" className="hover:text-white">
        Portfolio
      </Link>
      <div className="ml-auto flex items-center gap-4">
        {me ? (
          <>
            <span className="rounded bg-zinc-800 px-2 py-1 font-mono text-emerald-400">
              {usd(me.balanceCents)}
            </span>
            <span className="text-zinc-400">{me.email}</span>
            <button onClick={logout} className="text-zinc-400 hover:text-white">
              Log out
            </button>
          </>
        ) : (
          <Link href="/login" className="hover:text-white">
            Log in / Sign up
          </Link>
        )}
      </div>
    </nav>
  );
}
