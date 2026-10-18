// Arsenal definitions shared by the host engine, HUD and phone controller.

export type WeaponId =
  | "bazooka" | "homing" | "grenade" | "cluster" | "banana" | "holy" | "dynamite" | "mine"
  | "sheep" | "shotgun" | "bat" | "airstrike" | "teleport" | "jetpack" | "skip";

/** charge = hold fire for power · instant = fires on press · target = pick a spot first */
export type FireMode = "charge" | "instant" | "target";

export interface WeaponDef {
  id: WeaponId; name: string; icon: string; mode: FireMode;
  ammo: number;        // starting stock, -1 = unlimited
  delay: number;       // rounds before it unlocks
  fuse?: boolean;      // player-set 1–5s fuse
  aims: boolean;       // uses the aim angle
  retreat: number;     // seconds to run after using it
  endsTurn: boolean;
  hint: string;
}

export const WEAPONS: WeaponDef[] = [
  { id: "bazooka", name: "Bazooka", icon: "🚀", mode: "charge", ammo: -1, delay: 0, aims: true, retreat: 3, endsTurn: true, hint: "Hold FIRE for power. Wind pushes it." },
  { id: "homing", name: "Homing Missile", icon: "🎯", mode: "target", ammo: 1, delay: 1, aims: true, retreat: 3, endsTurn: true, hint: "Mark a target, then launch. It hunts." },
  { id: "grenade", name: "Grenade", icon: "💣", mode: "charge", ammo: -1, delay: 0, fuse: true, aims: true, retreat: 3, endsTurn: true, hint: "Bounces. Set the fuse 1–5s." },
  { id: "cluster", name: "Cluster Bomb", icon: "🎆", mode: "charge", ammo: 3, delay: 0, fuse: true, aims: true, retreat: 3, endsTurn: true, hint: "Bursts into five bomblets." },
  { id: "banana", name: "Banana Bomb", icon: "🍌", mode: "charge", ammo: 1, delay: 2, fuse: true, aims: true, retreat: 4, endsTurn: true, hint: "Bouncy. Splits into explosive bananas." },
  { id: "holy", name: "Holy Hand Grenade", icon: "✨", mode: "charge", ammo: 1, delay: 3, aims: true, retreat: 5, endsTurn: true, hint: "Count to three. Huge blast." },
  { id: "dynamite", name: "Dynamite", icon: "🧨", mode: "instant", ammo: 1, delay: 0, aims: false, retreat: 5, endsTurn: true, hint: "Drop it and run. Five seconds." },
  { id: "mine", name: "Mine", icon: "⚙️", mode: "instant", ammo: 2, delay: 0, aims: false, retreat: 5, endsTurn: true, hint: "Arms after a second. Proximity trigger." },
  { id: "sheep", name: "Super Sheep", icon: "🐑", mode: "instant", ammo: 1, delay: 1, aims: false, retreat: 4, endsTurn: true, hint: "It runs. Press FIRE again to detonate." },
  { id: "shotgun", name: "Shotgun", icon: "🔫", mode: "instant", ammo: -1, delay: 0, aims: true, retreat: 3, endsTurn: true, hint: "Two blasts per turn, straight line." },
  { id: "bat", name: "Baseball Bat", icon: "🏏", mode: "instant", ammo: 1, delay: 0, aims: true, retreat: 3, endsTurn: true, hint: "Home run! Swing at a worm next to you." },
  { id: "airstrike", name: "Air Strike", icon: "✈️", mode: "target", ammo: 1, delay: 2, aims: false, retreat: 3, endsTurn: true, hint: "Pick a spot. Five missiles from the sky." },
  { id: "teleport", name: "Teleport", icon: "🌀", mode: "target", ammo: 2, delay: 0, aims: false, retreat: 0, endsTurn: true, hint: "Move the cursor, FIRE to blink there." },
  { id: "jetpack", name: "Jet Pack", icon: "🎒", mode: "instant", ammo: 1, delay: 0, aims: false, retreat: 0, endsTurn: false, hint: "UP to thrust, ←→ to steer. FIRE to stop." },
  { id: "skip", name: "Skip Go", icon: "⏭️", mode: "instant", ammo: -1, delay: 0, aims: false, retreat: 0, endsTurn: true, hint: "Pass the turn." },
];

export const WEAPON = Object.fromEntries(WEAPONS.map(w => [w.id, w])) as Record<WeaponId, WeaponDef>;
export const isWeapon = (id: unknown): id is WeaponId => typeof id === "string" && id in WEAPON;

export function startingAmmo(): Record<WeaponId, number> {
  return Object.fromEntries(WEAPONS.map(w => [w.id, w.ammo])) as Record<WeaponId, number>;
}

/** Weapons that can come out of a crate. */
export const CRATE_POOL: WeaponId[] = ["homing", "cluster", "banana", "holy", "dynamite", "mine", "sheep", "bat", "airstrike", "teleport", "jetpack"];
