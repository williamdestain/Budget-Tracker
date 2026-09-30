import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ProvisionForm } from './provision-form';
import { BudgetStore } from '../../../core/services/budget-store.service';

// Première spec de ce composant : elle ne couvre que le choix du propriétaire
// (le reste du formulaire n'avait pas de test). Identifiants UUID, comme un
// foyer créé depuis la migration 024.
const ALEX = '3f9c1c1e-0000-4000-8000-000000000001';
const SAM = '3f9c1c1e-0000-4000-8000-000000000002';

function makeFakeStore(opts: { active: string; members?: string[]; myMemberId?: string | null }) {
  return {
    activeOwner: () => opts.active,
    myMemberId: () => opts.myMemberId ?? null,
    memberOptions: () => (opts.members ?? [ALEX, SAM]).map((id) => ({ id, name: id, color: '#000' })),
    activeCategoryNames: signal(['Assurance']),
    addProvision: vi.fn().mockResolvedValue(undefined),
  } as unknown as BudgetStore;
}

async function submitWith(store: BudgetStore): Promise<void> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: BudgetStore, useValue: store }] });
  const fixture = TestBed.createComponent(ProvisionForm);
  fixture.detectChanges();
  const c = fixture.componentInstance;
  c.name = 'Assurance auto';
  c.category = 'Assurance';
  c.amount = 600;
  c.everyN = 6;
  await c.submit();
}

describe('ProvisionForm — propriétaire', () => {
  it("vue d'un membre : la provision lui appartient", async () => {
    const store = makeFakeStore({ active: SAM });
    await submitWith(store);
    expect(store.addProvision).toHaveBeenCalledWith(expect.objectContaining({ memberId: SAM }));
  });

  it("vue Global : le membre connecté, jamais l'identifiant inventé 'moi'", async () => {
    const store = makeFakeStore({ active: 'global', myMemberId: SAM });
    await submitWith(store);
    expect(store.addProvision).toHaveBeenCalledWith(expect.objectContaining({ memberId: SAM }));
  });

  it('vue Global sans membre connecté connu : le premier membre', async () => {
    const store = makeFakeStore({ active: 'global' });
    await submitWith(store);
    expect(store.addProvision).toHaveBeenCalledWith(expect.objectContaining({ memberId: ALEX }));
  });

  it("sans aucun membre actif : n'écrit rien", async () => {
    const store = makeFakeStore({ active: 'global', members: [] });
    await submitWith(store);
    expect(store.addProvision).not.toHaveBeenCalled();
  });
});
