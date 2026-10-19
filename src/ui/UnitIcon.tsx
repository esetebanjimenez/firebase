/**
 * UnitIcon — a unit's own battlefield sprite, used as a button icon.
 *
 * The picture on the button is literally the soldier that walks out of the
 * gate: the renderer bakes it from the same sprite and weapon mark. Scaling is
 * by a whole number so every pixel stays square.
 */

import { useMemo } from 'react';
import { unitIcon } from '../render/sprites';
import { rankOfLevel, type PlayerUnitId } from '../sim';

interface Props {
  kind: PlayerUnitId;
  /** The kind's current level; the icon wears the matching kit and colour. */
  level: number;
  /** Whole-number scale factor applied to the sprite. */
  scale?: number;
  className?: string;
}

export function UnitIcon({ kind, level, scale = 3, className }: Props) {
  const art = useMemo(() => unitIcon(kind, rankOfLevel(level)), [kind, level]);
  return (
    <img
      className={className ?? 'uniticon'}
      src={art.url}
      alt=""
      width={art.width * scale}
      height={art.height * scale}
      aria-hidden="true"
    />
  );
}
