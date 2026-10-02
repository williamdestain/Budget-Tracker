import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ToastService } from '../../../core/services/toast.service';
import { Member } from '../../../core/models/budget.models';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { Modal } from '../../../shared/ui/modal/modal';

// « Foyer & membres » (écran Paramètres, MODELE.md §6 et 9.5.4).
//
// Ce que cet écran fait : renommer un membre, changer sa couleur, le
// désactiver / le réactiver, et afficher le code que quelqu'un d'autre saisit
// pour rejoindre le foyer.
//
// Ce qu'il ne fait volontairement PAS :
//  - supprimer un membre : il a des données liées, on le désactive seulement ;
//  - changer un rôle : `role` n'a aucun effet observable aujourd'hui
//    (MODELE.md §6.1) et rien ne garantit qu'il reste un propriétaire — un
//    bouton qui peut dégrader l'unique propriétaire sans rien changer d'autre
//    n'apporte que du risque ;
//  - inviter par courriel : aucun mécanisme d'envoi n'existe (MODELE.md 9.5.4).
//    On partage le code d'invitation, comme à la création du foyer.
@Component({
  selector: 'app-members-manage',
  imports: [FormsModule, Button, Icon, Modal],
  templateUrl: './members-manage.html',
  styleUrl: './members-manage.scss',
})
export class MembersManage {
  readonly saving = signal(false);

  // --- Modale de modification ---
  readonly editingId = signal<string | null>(null);
  readonly confirmDeactivate = signal(false);
  name = '';
  color = '#4a6fa1';

  // --- Code d'invitation (jamais chargé tant qu'on ne le demande pas) ---
  readonly joinCode = signal<string | null>(null);
  readonly loadingCode = signal(false);

  // Membres actifs d'abord, puis désactivés ; par prénom dans chaque groupe.
  readonly members = computed(() =>
    [...this.store.members()].sort(
      (a, b) =>
        Number(b.active) - Number(a.active) || a.displayName.localeCompare(b.displayName, 'fr'),
    ),
  );

  readonly editing = computed<Member | null>(() => {
    const id = this.editingId();
    return this.store.members().find((m) => m.id === id) ?? null;
  });

  constructor(
    public store: BudgetStore,
    private toast: ToastService,
  ) {}

  roleLabel(role: Member['role']): string {
    return role === 'owner' ? 'Propriétaire du foyer' : 'Membre';
  }

  isMe(member: Member): boolean {
    return member.id === this.store.myMemberId();
  }

  // --- Modification ---

  openEdit(member: Member): void {
    this.editingId.set(member.id);
    this.confirmDeactivate.set(false);
    this.name = member.displayName;
    this.color = member.color;
  }

  closeEdit(): void {
    this.editingId.set(null);
    this.confirmDeactivate.set(false);
  }

  get canSave(): boolean {
    return !!this.name.trim();
  }

  async save(): Promise<void> {
    const member = this.editing();
    if (!member || !this.canSave || this.saving()) return;
    this.saving.set(true);
    try {
      await this.store.updateMember(member.id, { displayName: this.name, color: this.color });
      this.toast.show('Membre modifié.');
      this.closeEdit();
    } catch (err) {
      this.toast.show(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  // Désactiver demande une confirmation (il disparaît des sélecteurs et des
  // formulaires) ; réactiver est sans risque et immédiat.
  async toggleActive(): Promise<void> {
    const member = this.editing();
    if (!member || this.saving()) return;
    if (member.active && !this.confirmDeactivate()) {
      this.confirmDeactivate.set(true);
      return;
    }
    this.saving.set(true);
    try {
      await this.store.setMemberActive(member.id, !member.active);
      this.toast.show(member.active ? 'Membre désactivé.' : 'Membre réactivé.');
      this.closeEdit();
    } catch (err) {
      this.confirmDeactivate.set(false);
      this.toast.show(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  // --- Code d'invitation ---

  async revealCode(): Promise<void> {
    if (this.loadingCode()) return;
    this.loadingCode.set(true);
    try {
      this.joinCode.set(await this.store.loadJoinCode());
    } catch (err) {
      this.toast.show(errorMessage(err));
    } finally {
      this.loadingCode.set(false);
    }
  }

  hideCode(): void {
    this.joinCode.set(null);
  }

  async copyCode(): Promise<void> {
    const code = this.joinCode();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.toast.show('Code copié.');
    } catch {
      // Presse-papiers indisponible (contexte non sécurisé, permission
      // refusée) : le code reste affiché, on le sélectionne à la main.
      this.toast.show('Copie impossible — sélectionnez le code pour le copier.');
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Une erreur est survenue.';
}
