import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow phones/tablets to load the dev server's scripts. Without this, Next 16
  // serves the HTML but blocks the JS, so the join button silently does nothing.
  // Patterns are hostnames (no scheme/port), matched per dot-separated segment.
  allowedDevOrigins: [
    "localhost",
    "192.168.*.*", // home LAN
    "10.*.*.*",    // other private LANs
    "100.*.*.*",   // Tailscale IPs (100.64.0.0/10)
    "**.ts.net",   // Tailscale MagicDNS names
  ],

  // Allow the browser to connect to our Socket.io server on port 3001
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
    ];
  },
};

export default nextConfig;
