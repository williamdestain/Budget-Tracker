import { describe, expect, it } from 'vitest';
import { defaultMemberId } from './members.utils';

// Identifiants UUID volontairement : c'est ce que produit un foyer créé
// depuis la migration 024. Les anciens tests n'utilisaient que 'moi' /
// 'madame', ce qui masquait tout repli codé en dur sur ces valeurs.
const ALEX = '3f9c1c1e-0000-4000-8000-000000000001';
const SAM = '3f9c1c1e-0000-4000-8000-000000000002';

describe('defaultMemberId', () => {
  it("vue d'un membre : ce membre", () => {
    expect(defaultMemberId(SAM, ALEX, [ALEX, SAM])).toBe(SAM);
  });

  it('vue Global : le membre connecté, pas le premier de la liste', () => {
    expect(defaultMemberId('global', SAM, [ALEX, SAM])).toBe(SAM);
  });

  it("vue Global : le premier membre si le membre connecté n'est pas dans la liste (désactivé)", () => {
    expect(defaultMemberId('global', 'inconnu', [ALEX, SAM])).toBe(ALEX);
  });

  it("vue Global : le premier membre si on ignore qui est connecté", () => {
    expect(defaultMemberId('global', null, [ALEX, SAM])).toBe(ALEX);
  });

  it("vue Global sans aucun membre : chaîne vide, jamais 'moi'", () => {
    const r = defaultMemberId('global', null, []);
    expect(r).toBe('');
    expect(r).not.toBe('moi');
  });

  it("ne renvoie jamais 'moi' ou 'madame' quand les membres sont des UUID", () => {
    for (const active of ['global', ALEX, SAM] as const) {
      expect(['moi', 'madame']).not.toContain(defaultMemberId(active, null, [ALEX, SAM]));
    }
  });

  it('foyer historique (ids moi/madame) : comportement inchangé', () => {
    expect(defaultMemberId('madame', 'moi', ['moi', 'madame'])).toBe('madame');
    expect(defaultMemberId('global', 'moi', ['moi', 'madame'])).toBe('moi');
  });
});
