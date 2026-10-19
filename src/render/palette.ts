/**
 * palette.ts — the game's fixed colour set.
 *
 * Deliberately small and flat, the way an 8-bit console palette is: every
 * sprite, tile and effect picks from here (or from the four-colour ramp a unit
 * kind declares in the roster), which is what keeps a hand-drawn field and a
 * procedurally drawn explosion looking like the same game.
 */

export const PALETTE = {
  // Ground, from the enemy's open country down to your dug-in ground.
  grassDark: '#1f3324',
  grass: '#2a4430',
  grassLight: '#35533a',
  dirt: '#4a3f2c',
  dirtDark: '#352c1e',
  rock: '#4e5056',
  rockLight: '#6a6c73',
  bone: '#b9bca8',

  // Your wall and emplacements.
  wallStone: '#6d6a60',
  wallStoneLight: '#8c887c',
  wallStoneDark: '#45433c',
  wallCrack: '#2e2c27',
  sandbag: '#7d7250',
  gateMetal: '#5a6068',
  gateMetalLight: '#848b94',
  towerBody: '#555c52',
  towerBarrel: '#2f3330',

  /** The edge of the ground the towers can cover. */
  coverLine: '#7f9a74',
  coverGround: '#2f4a34',

  // Readouts drawn on the field.
  wallGaugeGood: '#49a86a',
  wallGaugeFrame: '#1b1d1a',
  hpGood: '#5fe08a',
  hpMid: '#e8c54a',
  hpLow: '#e5533c',
  enemyHp: '#d4604e',

  // Shots and fire support.
  tracer: '#ffe9a3',
  tracerCore: '#ffffff',
  rocket: '#d9d4c4',
  arrow: '#cfa860',
  bolt: '#9a7bff',
  boulder: '#7a6a52',
  drain: '#6fe0c0',
  flash: '#fff3c0',
  explosionCore: '#fff6d0',
  explosionMid: '#ffb13d',
  explosionEdge: '#d2452a',
  smoke: '#5b5750',
  burn: '#ff7a2a',
  burnDark: '#c43d12',
  blood: '#8e2f2f',
  dust: '#6b6354',
  credit: '#ffd95e',
  reticle: '#ff5a4a',
  shadow: 'rgba(8, 10, 12, 0.35)',
} as const;

export type PaletteKey = keyof typeof PALETTE;
