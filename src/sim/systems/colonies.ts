import type { PlayerState } from '../types';

export function sameColony(a: PlayerState, b: PlayerState): boolean {
  return a.colonyId === b.colonyId || (a.kind === 'player' && b.kind === 'player' && a.ownerId === b.ownerId);
}
