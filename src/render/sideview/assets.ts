/**
 * assets.ts — bespoke sprite manifest for the side-view renderer.
 *
 * Loads the delivered art set (src/assets/sprites/firebase-idle/delivery) via a
 * Vite glob so URLs are hashed and base-path-correct, then loads each as a Pixi
 * texture. Characters are 512×512 with feet 24px above the bottom (so the pivot
 * is anchored there); walls 384×640 and the FOB 512×640 are bottom-center.
 *
 * Art: bespoke commissioned set, facing right. See delivery/manifest.json.
 */

import { Assets, type Texture } from 'pixi.js';

// Eagerly collect every delivered PNG's URL, keyed by its basename (no extension).
const modules = import.meta.glob(
  [
    '../../assets/sprites/firebase-idle/delivery/*.png',
    '!**/_qc*.png',
    '!**/*_sheet.png',
  ],
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>;

const urlByName: Record<string, string> = {};
for (const [path, url] of Object.entries(modules)) {
  const name = path.split('/').pop()!.replace(/\.png$/, '');
  if (name.startsWith('_qc') || name.endsWith('_sheet')) continue; // skip QC + atlas sheets
  urlByName[name] = url;
}

export type TextureMap = Record<string, Texture>;

/** Pivot for 512×512 character frames: feet sit 24px above the bottom edge. */
export const CHAR_ANCHOR_Y = (512 - 24) / 512;

/** Load every delivered sprite once; resolves to a name→Texture map. */
export async function loadUnitTextures(): Promise<TextureMap> {
  const entries = Object.entries(urlByName);
  const pairs = await Promise.all(entries.map(async ([k, url]) => [k, await Assets.load(url)] as const));
  return Object.fromEntries(pairs) as TextureMap;
}
