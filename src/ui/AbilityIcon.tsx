/**
 * AbilityIcon — the picture on a fire-support button.
 *
 * Baked from the same pixel helpers as the unit sprites, so a shell on a
 * button is drawn out of the same palette as the one that lands on the field.
 */

import { useMemo } from 'react';
import { abilityIcon } from '../render/sprites';
import type { AbilityId } from '../sim';

interface Props {
  id: AbilityId;
  /** Whole-number scale factor, so every pixel stays square. */
  scale?: number;
  className?: string;
}

export function AbilityIcon({ id, scale = 2, className }: Props) {
  const art = useMemo(() => abilityIcon(id), [id]);
  return (
    <img
      className={className ?? 'abilityicon'}
      src={art.url}
      alt=""
      width={art.width * scale}
      height={art.height * scale}
      aria-hidden="true"
    />
  );
}
