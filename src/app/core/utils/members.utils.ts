import { OwnerOrGlobal } from '../models/budget.models';

// Propriétaire par défaut d'un formulaire de saisie.
//
// Vue d'un membre : ce membre. Vue « Global » : il n'y a pas de propriétaire
// évident, donc le membre connecté s'il est dans la liste, sinon le premier
// membre actif. Jamais un identifiant écrit en dur : les membres créés depuis
// la migration 024 ont un UUID, pas 'moi' / 'madame' — un identifiant inventé
// ferait échouer l'écriture (clé étrangère) ou laisserait le sélecteur vide.
//
// Le cas « vue d'un membre » renvoie `active` tel quel, sans le valider contre
// `memberIds` : c'est le comportement historique, et le store garantit déjà
// que activeOwner est un membre réel après loadAll().
export function defaultMemberId(
  active: OwnerOrGlobal,
  myMemberId: string | null,
  memberIds: string[],
): string {
  if (active !== 'global') return active;
  if (myMemberId && memberIds.includes(myMemberId)) return myMemberId;
  return memberIds[0] ?? '';
}
