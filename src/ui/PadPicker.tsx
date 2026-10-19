/**
 * PadPicker — fit a gun by pointing at the pad it goes in.
 *
 * The pads are objects on the wall, so tapping one is the obvious way to
 * choose what it holds; the list in the panel is an abstraction over the same
 * four things, kept for the cases where a thumb is not precise enough.
 */

import type { GunView, UiSnapshot } from '../game/useGameLoop';
import type { TowerWeaponId } from '../sim';

/** How close to a pad a tap counts, in field pixels. Generous for thumbs. */
export const PAD_TAP_RADIUS = 26;

export function PadPicker({
  pad,
  guns,
  left,
  top,
  onPick,
  onDismiss,
}: {
  pad: UiSnapshot['pads'][number] | undefined;
  guns: GunView[];
  left: number;
  top: number;
  onPick: (gun: TowerWeaponId) => void;
  onDismiss: () => void;
}) {
  if (!pad) return null;
  return (
    <>
      {/* A tap anywhere else closes it, so there is no way to get stuck. */}
      <div className="picker__catch" onPointerDown={onDismiss} />
      <div
        className="picker"
        style={{ left, top }}
        role="group"
        aria-label={`Fit a gun to emplacement ${pad.id}`}
      >
        {guns.map((gun) => (
          <button
            key={gun.id}
            className={`picker__gun${pad.weapon === gun.id ? ' picker__gun--on' : ''}`}
            disabled={!gun.researched}
            title={gun.researched ? `${gun.name} — ${gun.blurb}` : `${gun.name} — not researched`}
            onClick={() => onPick(gun.id)}
            style={pad.weapon === gun.id ? { borderColor: gun.colors[1] } : undefined}
          >
            {gun.short}
          </button>
        ))}
      </div>
    </>
  );
}
