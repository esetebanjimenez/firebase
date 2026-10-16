/**
 * assets.ts — CC0 sprite manifest for the side-view prototype.
 *
 * PNGs are imported through Vite so the URLs are hashed and base-path-correct
 * (works in dev and under the GitHub Pages subpath). Textures are loaded once
 * via Pixi's Assets loader and handed to the renderer.
 *
 * Art: Kenney "Platformer Characters" (CC0-1.0). See assets/units/CREDITS.md.
 * This is placeholder art to evaluate the side-view direction — swap for
 * bespoke modern-military sprites later via this same loader, no renderer change.
 */

import { Assets, type Texture } from 'pixi.js';

import soldierStand from '../assets/units/soldier_stand.png';
import soldierFire from '../assets/units/soldier_fire.png';
import soldierHold from '../assets/units/soldier_hold.png';
import zombieWalk1 from '../assets/units/zombie_walk1.png';
import zombieWalk2 from '../assets/units/zombie_walk2.png';
import zombieHurt from '../assets/units/zombie_hurt.png';
import raiderWalk1 from '../assets/units/raider_walk1.png';
import raiderWalk2 from '../assets/units/raider_walk2.png';

export const SPRITE_URLS = {
  soldierStand,
  soldierFire,
  soldierHold,
  zombieWalk1,
  zombieWalk2,
  zombieHurt,
  raiderWalk1,
  raiderWalk2,
} as const;

export type SpriteKey = keyof typeof SPRITE_URLS;
export type TextureMap = Record<SpriteKey, Texture>;

/** Load every sprite once; resolves to a key→Texture map. */
export async function loadUnitTextures(): Promise<TextureMap> {
  const entries = Object.entries(SPRITE_URLS) as [SpriteKey, string][];
  const pairs = await Promise.all(
    entries.map(async ([key, url]) => [key, await Assets.load(url)] as const),
  );
  return Object.fromEntries(pairs) as TextureMap;
}
