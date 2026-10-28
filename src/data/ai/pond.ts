import type { AiDefinition } from '../schemas';
export const aiProfiles: Readonly<Record<string, AiDefinition>> = {
  forager: { id: 'forager', vision: 440, fleeDistance: 210, decisionSeconds: 0.2, wanderSeconds: 2.5, cruise: 0.6, hunt: false, forage: true },
  opportunist: { id: 'opportunist', vision: 380, fleeDistance: 240, decisionSeconds: 0.2, wanderSeconds: 3, cruise: 0.55, hunt: true, forage: true },
  hunter: { id: 'hunter', vision: 520, fleeDistance: 220, decisionSeconds: 0.16, wanderSeconds: 2, cruise: 0.65, hunt: true, forage: false },
  drifter: { id: 'drifter', vision: 300, fleeDistance: 220, decisionSeconds: 0.25, wanderSeconds: 3.5, cruise: 0.5, hunt: false, forage: false },
  grazer: { id: 'grazer', vision: 400, fleeDistance: 160, decisionSeconds: 0.25, wanderSeconds: 4, cruise: 0.6, hunt: true, forage: false },
};
