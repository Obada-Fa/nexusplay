// src/app/api/local-ip/route.ts
// Returns the machine's local network (LAN) IP address.
// Used by the Host page to generate QR codes and join links that work on mobile.

import { networkInterfaces } from "os";
import { NextResponse } from "next/server";

export function GET() {
  const nets = networkInterfaces();
  const nonInternal: { name: string; address: string }[] = [];

  for (const name of Object.keys(nets)) {
    for (const iface of nets[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        nonInternal.push({ name, address: iface.address });
      }
    }
  }

  const localIp = nonInternal.find((iface) =>
    /^(wlan|wl|wifi|en0|en[1-9])/.test(iface.name)
  )?.address ?? nonInternal[0]?.address ?? "localhost";

  return NextResponse.json({ ip: localIp });
}
