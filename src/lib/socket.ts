// src/lib/socket.ts — Singleton Socket.io client
// Ensures one connection is shared across the entire Next.js app.
//
// The socket server URL is derived dynamically from window.location.hostname
// at call time — this means:
//   • On PC (localhost:3000)  → connects to localhost:3001
//   • On Phone (192.168.x.x:3000) → connects to 192.168.x.x:3001
// No hardcoded IPs needed.

import { io, Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@/types/socket";

const SOCKET_PORT = 3001;

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

function getSocketServerUrl(): string {
  if (typeof window === "undefined") {
    // SSR safety — never actually used for connections
    return `http://localhost:${SOCKET_PORT}`;
  }
  // Use the same hostname the browser used to load the page.
  // This automatically resolves to the correct LAN IP on mobile.
  return `http://${window.location.hostname}:${SOCKET_PORT}`;
}

export function getSocket(): AppSocket {
  if (!socket) {
    socket = io(getSocketServerUrl(), {
      autoConnect: false,
      transports: ["websocket", "polling"],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      randomizationFactor: 0.3,
    });
  }
  return socket;
}

/**
 * Disconnects and destroys the singleton so a fresh connection can be made.
 * Call this in cleanup effects when navigating away.
 */
export function destroySocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
