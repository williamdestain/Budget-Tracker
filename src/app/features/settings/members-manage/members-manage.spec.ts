import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MembersManage } from './members-manage';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';
import { Member } from '../../../core/models/budget.models';

// Identifiants UUID, comme un foyer créé depuis la migration 024.
const ALEX = '3f9c1c1e-0000-4000-8000-000000000001';
const SAM = '3f9c1c1e-0000-4000-8000-000000000002';
const LEO = '3f9c1c1e-0000-4000-8000-000000000003';

const member = (o: Partial<Member> & { id: string; displayName: string }): Member => ({
  householdId: 'h1', color: '#4a6fa1', role: 'member', active: true, ...o,
});

interface Init {
  members?: Member[];
  me?: string | null;
  updateMember?: ReturnType<typeof vi.fn>;
  setMemberActive?: ReturnType<typeof vi.fn>;
  loadJoinCode?: ReturnType<typeof vi.fn>;
}

function makeStore(init: Init = {}) {
  const members = signal<Member[]>(
    init.members ?? [
      member({ id: ALEX, displayName: 'Alex', role: 'owner', color: '#4a6fa1' }),
      member({ id: SAM, displayName: 'Sam', color: '#a15385' }),
    ],
  );
  return {
    members,
    myMemberId: () => (init.me === undefined ? ALEX : init.me),
    updateMember: init.updateMember ?? vi.fn().mockResolvedValue(undefined),
    setMemberActive: init.setMemberActive ?? vi.fn().mockResolvedValue(undefined),
    loadJoinCode: init.loadJoinCode ?? vi.fn().mockResolvedValue('K7M2QX'),
  } as unknown as BudgetStore & Record<string, any>;
}

function create(store = makeStore()) {
  TestBed.resetTestingModule();
  const toastShow = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: BudgetStore, useValue: store },
      { provide: ToastService, useValue: { show: toastShow } },
    ],
  });
  const fixture = TestBed.createComponent(MembersManage);
  fixture.detectChanges();
  return { fixture, cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, store, toastShow };
}

const rows = (el: HTMLElement) => Array.from(el.querySelectorAll('.member-row')) as HTMLElement[];
const buttonTexts = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim());

describe('MembersManage', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('liste', () => {
    it('affiche les membres actifs d\'abord, puis les désactivés, avec « Vous » et le rôle', () => {
      const store = makeStore({
        members: [
          member({ id: LEO, displayName: 'Anna', active: false }),
          member({ id: SAM, displayName: 'Sam' }),
          member({ id: ALEX, displayName: 'Alex', role: 'owner' }),
        ],
      });
      const { el } = create(store);
      const text = rows(el).map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
      expect(text[0]).toContain('Alex');
      expect(text[0]).toContain('Vous');
      expect(text[0]).toContain('Propriétaire du foyer');
      expect(text[1]).toContain('Sam');
      expect(text[1]).not.toContain('Vous');
      expect(text[2]).toContain('Anna');
      expect(text[2]).toContain('Désactivé');
      expect(rows(el)[2].classList.contains('member-row--off')).toBe(true);
    });

    it('chaque ligne est un bouton nommé (accessible au clavier)', () => {
      const { el } = create();
      expect(rows(el)[0].tagName).toBe('BUTTON');
      expect(rows(el)[0].getAttribute('aria-label')).toBe('Modifier Alex');
    });
  });

  describe('modification', () => {
    it('cliquer un membre ouvre la fenêtre avec ses valeurs', () => {
      const { fixture, cmp, el } = create();
      rows(el)[1].click();
      fixture.detectChanges();
      expect(el.querySelector('app-modal [aria-label="Modifier Sam"]')).not.toBeNull();
      expect(cmp.name).toBe('Sam');
      expect(cmp.color).toBe('#a15385');
    });

    it('enregistre prénom et couleur, confirme et ferme', async () => {
      const { cmp, store, toastShow } = create();
      cmp.openEdit(store.members()[1]);
      cmp.name = '  Samuel ';
      cmp.color = '#112233';
      await cmp.save();
      expect(store.updateMember).toHaveBeenCalledWith(SAM, { displayName: '  Samuel ', color: '#112233' });
      expect(toastShow).toHaveBeenCalledWith('Membre modifié.');
      expect(cmp.editing()).toBeNull();
    });

    it('un prénom vide désactive « Enregistrer » et ne déclenche aucun appel', async () => {
      const { fixture, cmp, el, store } = create();
      cmp.openEdit(store.members()[1]);
      cmp.name = '   ';
      fixture.detectChanges();
      await cmp.save();
      expect(store.updateMember).not.toHaveBeenCalled();
      expect((el.querySelector('form button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    });

    it("affiche l'erreur du store (ex. prénom déjà pris), garde la fenêtre ouverte et la saisie", async () => {
      const store = makeStore({ updateMember: vi.fn().mockRejectedValue(new Error('Le prénom « Alex » est déjà utilisé dans ce foyer.')) });
      const { cmp, toastShow } = create(store);
      cmp.openEdit(store.members()[1]);
      cmp.name = 'Alex';
      await cmp.save();
      expect(toastShow).toHaveBeenCalledWith('Le prénom « Alex » est déjà utilisé dans ce foyer.');
      expect(cmp.editing()).not.toBeNull();
      expect(cmp.name).toBe('Alex');
      expect(cmp.saving()).toBe(false);
    });

    it('un vrai clic sur « Enregistrer » envoie le formulaire', async () => {
      const { fixture, cmp, el, store } = create();
      rows(el)[1].click();
      fixture.detectChanges();
      await fixture.whenStable(); // ngModel s'enregistre de façon asynchrone
      const name = el.querySelector('#member-name') as HTMLInputElement;
      name.value = 'Samuel';
      name.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (el.querySelector('form button[type="submit"]') as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(store.updateMember).toHaveBeenCalledWith(SAM, expect.objectContaining({ displayName: 'Samuel' }));
      expect(cmp.editing()).toBeNull();
    });
  });

  describe('désactivation', () => {
    it('demande une confirmation avant de désactiver, puis désactive et ferme', async () => {
      const { cmp, store, toastShow } = create();
      cmp.openEdit(store.members()[1]);
      await cmp.toggleActive();
      expect(store.setMemberActive).not.toHaveBeenCalled();
      expect(cmp.confirmDeactivate()).toBe(true);
      await cmp.toggleActive();
      expect(store.setMemberActive).toHaveBeenCalledWith(SAM, false);
      expect(toastShow).toHaveBeenCalledWith('Membre désactivé.');
      expect(cmp.editing()).toBeNull();
    });

    it("explique ce qu'implique la désactivation au moment de confirmer", async () => {
      const { fixture, cmp, el, store } = create();
      cmp.openEdit(store.members()[1]);
      await cmp.toggleActive();
      fixture.detectChanges();
      expect(el.textContent).toContain('disparaîtra des sélecteurs');
      expect(buttonTexts(el)).toContain('Confirmer la désactivation');
    });

    it("son propre profil ne peut pas être désactivé : aucun bouton, une explication", () => {
      const { fixture, cmp, el, store } = create();
      cmp.openEdit(store.members()[0]); // Alex = moi
      fixture.detectChanges();
      expect(buttonTexts(el).join('|')).not.toMatch(/Désactiver/);
      expect(el.textContent).toContain('ne peut pas être désactivé');
    });

    it('un membre désactivé se réactive en un clic, sans confirmation', async () => {
      const store = makeStore({
        members: [member({ id: ALEX, displayName: 'Alex' }), member({ id: SAM, displayName: 'Sam', active: false })],
      });
      const { fixture, cmp, el, toastShow } = create(store);
      cmp.openEdit(store.members()[1]);
      fixture.detectChanges();
      expect(buttonTexts(el)).toContain('Réactiver ce membre');
      await cmp.toggleActive();
      expect(store.setMemberActive).toHaveBeenCalledWith(SAM, true);
      expect(toastShow).toHaveBeenCalledWith('Membre réactivé.');
    });

    it("si la base refuse (dernier membre actif), affiche l'erreur et annule la confirmation", async () => {
      const store = makeStore({
        setMemberActive: vi.fn().mockRejectedValue(new Error('Impossible de désactiver le dernier membre actif du foyer.')),
      });
      const { cmp, toastShow } = create(store);
      cmp.openEdit(store.members()[1]);
      await cmp.toggleActive();
      await cmp.toggleActive();
      expect(toastShow).toHaveBeenCalledWith('Impossible de désactiver le dernier membre actif du foyer.');
      expect(cmp.confirmDeactivate()).toBe(false);
      expect(cmp.editing()).not.toBeNull();
    });

    it('fermer puis rouvrir annule une confirmation en attente', async () => {
      const { cmp, store } = create();
      cmp.openEdit(store.members()[1]);
      await cmp.toggleActive();
      cmp.closeEdit();
      cmp.openEdit(store.members()[1]);
      expect(cmp.confirmDeactivate()).toBe(false);
    });
  });

  describe("code d'invitation", () => {
    it("n'est pas chargé tant qu'on ne le demande pas, et prévient du risque", () => {
      const { el, store } = create();
      expect(store.loadJoinCode).not.toHaveBeenCalled();
      expect(el.querySelector('.invite-code')).toBeNull();
      expect(el.textContent).toContain('peut voir toutes vos données');
    });

    it('« Afficher » charge puis montre le code ; « Masquer » le retire', async () => {
      const { fixture, cmp, el, store } = create();
      await cmp.revealCode();
      fixture.detectChanges();
      expect(store.loadJoinCode).toHaveBeenCalledTimes(1);
      expect(el.querySelector('.invite-code')!.textContent).toContain('K7M2QX');
      cmp.hideCode();
      fixture.detectChanges();
      expect(el.querySelector('.invite-code')).toBeNull();
    });

    it("si le chargement échoue, affiche l'erreur et ne montre rien", async () => {
      const store = makeStore({ loadJoinCode: vi.fn().mockRejectedValue(new Error('Réseau')) });
      const { fixture, cmp, el, toastShow } = create(store);
      await cmp.revealCode();
      fixture.detectChanges();
      expect(toastShow).toHaveBeenCalledWith('Réseau');
      expect(el.querySelector('.invite-code')).toBeNull();
      expect(cmp.loadingCode()).toBe(false);
    });

    it('copie le code dans le presse-papiers et confirme', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { clipboard: { writeText } });
      const { cmp, toastShow } = create();
      await cmp.revealCode();
      await cmp.copyCode();
      expect(writeText).toHaveBeenCalledWith('K7M2QX');
      expect(toastShow).toHaveBeenCalledWith('Code copié.');
      vi.unstubAllGlobals();
    });

    it("si le presse-papiers est indisponible, le dit sans planter (le code reste affiché)", async () => {
      vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('refusé')) } });
      const { cmp, toastShow } = create();
      await cmp.revealCode();
      await cmp.copyCode();
      expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('Copie impossible'));
      expect(cmp.joinCode()).toBe('K7M2QX');
      vi.unstubAllGlobals();
    });

    it("copier sans code affiché ne fait rien", async () => {
      const writeText = vi.fn();
      vi.stubGlobal('navigator', { clipboard: { writeText } });
      const { cmp } = create();
      await cmp.copyCode();
      expect(writeText).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });
});
