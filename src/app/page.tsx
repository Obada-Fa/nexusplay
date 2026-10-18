"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { entryRoute } from "@/lib/device";
export default function HomePage() {
  const router = useRouter();
  useEffect(() => { router.replace(entryRoute(navigator.userAgent, navigator.maxTouchPoints)); }, [router]);
  return <main className="min-h-screen grid place-content-center gap-6 bg-[#06060e] text-white text-center"><h1 className="text-3xl font-bold">NexusPlay</h1><p>Opening your game screen…</p><Link href="/join">Join as player</Link><Link href="/host">Open as host</Link></main>;
}
