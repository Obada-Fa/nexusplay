import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow phones/tablets on the LAN to connect to the Next.js dev server
  // (enables Hot Module Replacement over the local network)
  allowedDevOrigins: [
    "http://192.168.2.*:3000",
    "http://localhost:*",
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
