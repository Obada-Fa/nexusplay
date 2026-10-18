This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## SlitherPlay

Run `npm install` and `npm run dev`. Open `/host` on the shared screen and have
players scan its QR code or open `/join` on the same network. Select SlitherPlay
and press Enter (or START on a phone). Keep the host tab visible while playing.

- Designed for 2–4 players; the room accepts up to 8, with a larger arena for 5–8.
- Three-minute rounds. Eat orbs for points and length; cut off another snake for
  100 points. Head-on collisions eliminate both players. Your own tail is safe.
- Steer with the phone joystick; hold the lightning button to boost. Boost burns
  earned length, but banked points survive boosts and deaths.
- After a crash, respawn from your phone after a short cooldown. A dotted shield
  provides 2.5 seconds of protection. Highest points wins; eliminations and then
  current length break ties. Start a rematch from the host's results screen.
- Desktop controllers also support WASD/arrow keys and Space/Shift to boost.
- Returning to the gallery preserves the connected player roster. If a phone
  disconnects, reconnect and join again. If the host disconnects, create a new room.

The Slither simulation uses a fixed 60 Hz step, spatial collision buckets, capped
body/particle/orb counts, a cached arena background, and 10 Hz phone HUD updates.
It runs on the host; phones send controls through the local Socket.io relay.

Verify Slither gameplay and the eight-player network flow with:

```bash
node --test tests/slither*.mjs
```
