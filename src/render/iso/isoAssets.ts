/**
 * isoAssets.ts — isometric sprite manifest.
 *
 * Loads src/assets/sprites/firebase-idle-iso/delivery via a Vite glob (hashed,
 * base-path-correct) and resolves each to a Pixi texture, keyed by basename.
 *
 * Pivots (from delivery/manifest.json):
 *  - tiles 256×128 diamonds, pivot = center.
 *  - characters 256×256, feet 16px above bottom → anchor (0.5, 240/256).
 *  - walls/tower/gate/FOB: pivot bottom-center.
 *  - props 128×128: pivot bottom-center.
 */

import { Assets, type Texture } from 'pixi.js';

const modules = import.meta.glob(
  ['../../assets/sprites/firebase-idle-iso/delivery/*.png', '!**/_qc*.png', '!**/*_sheet.png'],
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>;

const urlByName: Record<string, string> = {};
for (const [path, url] of Object.entries(modules)) {
  const name = path.split('/').pop()!.replace(/\.png$/, '');
  urlByName[name] = url;
}

export type TextureMap = Record<string, Texture>;

/** Character feet sit 16px above the 256px canvas bottom. */
export const ISO_CHAR_ANCHOR_Y = (256 - 16) / 256;

export async function loadIsoTextures(): Promise<TextureMap> {
  const entries = Object.entries(urlByName);
  const pairs = await Promise.all(entries.map(async ([k, url]) => [k, await Assets.load(url)] as const));
  return Object.fromEntries(pairs) as TextureMap;
}
