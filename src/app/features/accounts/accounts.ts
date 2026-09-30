import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BudgetStore } from '../../core/services/budget-store.service';
import { Account, AccountBalanceSnapshot, AccountType } from '../../core/models/budget.models';
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_ORDER,
  accountBalance,
  creditScopeConflict,
  netWorthBreakdown,
  snapshotsUpTo,
  visibleAccounts,
} from '../../core/utils/accounts.utils';
import { fmt } from '../../core/utils/currency.utils';
import { fmtDate, isoOfDate } from '../../core/utils/date.utils';
import { ToastService } from '../../core/services/toast.service';
import { Card } from '../../shared/ui/card/card';
import { Button } from '../../shared/ui/button/button';
import { Icon } from '../../shared/ui/icon/icon';
import { IconName } from '../../shared/ui/icon/icon-names';
import { Modal } from '../../shared/ui/modal/modal';

export interface AccountRow {
  account: Account;
  balance: number | null;
  /** Date du dernier solde saisi (null pour une carte : solde calculé). */
  updatedOn: string | null;
  /** Variation depuis le solde précédent — PAS un rendement (MODELE §5.5). */
  delta: number | null;
  deltaSince: string | null;
  ownerLabel: string;
}

const TYPE_ICONS: Record<AccountType, IconName> = {
  bank: 'wallet',
  credit: 'card',
  investment: 'trending',
  other: 'money',
};

// Écran /comptes — Phase 2, vague B (plan-industrialisation.md).
//
// Deux modèles mentaux coexistent volontairement (MODELE.md §5.1) :
//  - bank / investment / other : solde = dernier instantané saisi à la main
//    (AccountBalanceSnapshot) — rien ne relie une transaction à un compte.
//  - credit : simple façade sur creditCardBalance(), aucun snapshot.
// La valeur nette vient de accounts.utils.ts (définition unique, §5.4).
@Component({
  selector: 'app-accounts',
  imports: [FormsModule, RouterLink, Card, Button, Icon, Modal],
  templateUrl: './accounts.html',
  styleUrl: './accounts.scss',
})
export class Accounts {
  // Fixé à la construction : « aujourd'hui » sert de borne aux soldes
  // affichés (un solde daté du futur est ignoré, MODELE §5.2). Ne dépend
  // surtout pas d'un champ de formulaire.
  readonly today = isoOfDate(new Date());

  // --- Modale d'ajout ---
  readonly addOpen = signal(false);
  readonly saving = signal(false);
  name = '';
  institution = '';
  type: AccountType = 'bank';
  ownerId = ''; // '' = compte partagé (memberId null)
  balance: number | null = null;
  balanceDate = this.today;

  // --- Modale de détail ---
  readonly selectedId = signal<string | null>(null);
  readonly confirmArchive = signal(false);
  newBalance: number | null = null;
  newBalanceDate = this.today;
  newNote = '';

  readonly typeLabels = ACCOUNT_TYPE_LABELS;

  readonly visible = computed(() =>
    visibleAccounts(this.store.accounts(), this.store.activeOwner()).filter((a) => !a.archived),
  );

  readonly summary = computed(() =>
    netWorthBreakdown(this.visible(), this.store.accountBalanceSnapshots(), this.today, (memberId) =>
      this.store.creditCardBalance(memberId === null ? 'global' : memberId),
    ),
  );

  readonly groups = computed(() =>
    ACCOUNT_TYPE_ORDER.map((type) => ({
      type,
      label: ACCOUNT_TYPE_LABELS[type],
      rows: this.visible()
        .filter((a) => a.type === type)
        .map((a) => this.toRow(a)),
    })).filter((g) => g.rows.length > 0),
  );

  readonly selected = computed<AccountRow | null>(() => {
    const id = this.selectedId();
    const account = id ? this.visible().find((a) => a.id === id) : undefined;
    return account ? this.toRow(account) : null;
  });

  // Historique affiché dans le détail : 12 derniers relevés, du plus récent.
  readonly history = computed<AccountBalanceSnapshot[]>(() => {
    const id = this.selectedId();
    return id ? snapshotsUpTo(this.store.accountBalanceSnapshots(), id, this.today).slice(0, 12) : [];
  });

  constructor(
    public store: BudgetStore,
    private toast: ToastService,
  ) {}

  fmt(amount: number): string {
    return fmt(amount);
  }

  fmtDate(iso: string): string {
    return fmtDate(iso);
  }

  iconFor(type: AccountType): IconName {
    return TYPE_ICONS[type];
  }

  private toRow(account: Account): AccountRow {
    const snaps = snapshotsUpTo(this.store.accountBalanceSnapshots(), account.id, this.today);
    const isCredit = account.type === 'credit';
    const balance = accountBalance(account, this.store.accountBalanceSnapshots(), this.today, (memberId) =>
      this.store.creditCardBalance(memberId === null ? 'global' : memberId),
    );
    const prev = snaps[1];
    return {
      account,
      balance,
      updatedOn: isCredit ? null : (snaps[0]?.date ?? null),
      delta: !isCredit && snaps[0] && prev ? Math.round((snaps[0].balance - prev.balance) * 100) / 100 : null,
      deltaSince: !isCredit && prev ? prev.date : null,
      ownerLabel: account.memberId === null ? 'Partagé' : this.store.memberName(account.memberId),
    };
  }

  // --- Ajout ---

  openAdd(): void {
    const owner = this.store.activeOwner();
    this.name = '';
    this.institution = '';
    this.type = 'bank';
    this.ownerId = owner === 'global' ? '' : owner;
    this.balance = null;
    this.balanceDate = this.today;
    this.addOpen.set(true);
  }

  closeAdd(): void {
    this.addOpen.set(false);
  }

  async submitAdd(): Promise<void> {
    if (!this.name.trim() || this.saving()) return;
    const memberId = this.ownerId === '' ? null : this.ownerId;
    const wantsBalance = this.type !== 'credit' && this.balance !== null;

    if (this.type === 'credit' && creditScopeConflict(this.store.accounts(), memberId)) {
      this.toast.show(
        'Une carte de crédit couvre déjà ce périmètre : une seconde compterait la même dette deux fois.',
      );
      return;
    }
    if (wantsBalance && this.balanceDate > this.today) {
      this.toast.show('La date du solde ne peut pas être dans le futur.');
      return;
    }

    this.saving.set(true);
    try {
      const account = await this.store.addAccount({
        memberId,
        name: this.name.trim(),
        institution: this.institution.trim() || null,
        type: this.type,
        archived: false,
      });
      if (wantsBalance) {
        await this.store.addAccountBalanceSnapshot(account.id, this.balance!, this.balanceDate, null);
      }
      this.addOpen.set(false);
      this.toast.show('Compte ajouté.');
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      this.saving.set(false);
    }
  }

  // --- Détail / mise à jour du solde / archivage ---

  openDetail(accountId: string): void {
    this.selectedId.set(accountId);
    this.confirmArchive.set(false);
    this.newBalance = null;
    this.newBalanceDate = this.today;
    this.newNote = '';
  }

  closeDetail(): void {
    this.selectedId.set(null);
    this.confirmArchive.set(false);
  }

  async submitBalance(): Promise<void> {
    const row = this.selected();
    if (!row || row.account.type === 'credit' || this.newBalance === null || this.saving()) return;
    if (!this.newBalanceDate || this.newBalanceDate > this.today) {
      this.toast.show('La date du solde ne peut pas être dans le futur.');
      return;
    }
    this.saving.set(true);
    try {
      await this.store.addAccountBalanceSnapshot(
        row.account.id,
        this.newBalance,
        this.newBalanceDate,
        this.newNote.trim() || null,
      );
      this.newBalance = null;
      this.newNote = '';
      this.toast.show('Solde mis à jour.');
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      this.saving.set(false);
    }
  }

  // L'archivage n'a pas d'annulation dans le store (pas de désarchivage) :
  // d'où la confirmation en deux temps.
  async archive(): Promise<void> {
    const id = this.selectedId();
    if (!id) return;
    if (!this.confirmArchive()) {
      this.confirmArchive.set(true);
      return;
    }
    try {
      await this.store.archiveAccount(id);
      this.closeDetail();
      this.toast.show('Compte archivé.');
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : 'Une erreur est survenue.');
    }
  }
}
