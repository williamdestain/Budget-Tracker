import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../core/services/budget-store.service';
import { AccountType } from '../../core/models/budget.models';
import { fmt } from '../../core/utils/currency.utils';
import { isoOfDate } from '../../core/utils/date.utils';
import { ToastService } from '../../core/services/toast.service';
import { Card } from '../../shared/ui/card/card';
import { Button } from '../../shared/ui/button/button';

@Component({
  selector: 'app-accounts',
  imports: [FormsModule, Card, Button],
  templateUrl: './accounts.html',
  styleUrl: './accounts.scss',
})
export class Accounts {
  readonly formOpen = signal(false);
  readonly saving = signal(false);
  name = '';
  institution = '';
  type: AccountType = 'bank';
  balance: number | null = null;
  balanceDate = isoOfDate(new Date());

  readonly activeAccounts = computed(() => this.store.accounts().filter((account) => !account.archived));
  readonly netWorth = computed(() => this.activeAccounts().reduce((sum, account) =>
    sum + (this.latestBalance(account.id) ?? 0), 0,
  ));

  constructor(
    public store: BudgetStore,
    private toast: ToastService,
  ) {}

  fmt(amount: number): string {
    return fmt(amount);
  }

  latestBalance(accountId: string): number | null {
    const snapshots = this.store.accountBalanceSnapshots()
      .filter((snapshot) => snapshot.accountId === accountId && snapshot.date <= this.balanceDate)
      .sort((a, b) => b.date.localeCompare(a.date));
    return snapshots[0]?.balance ?? null;
  }

  openForm(): void {
    this.formOpen.set(true);
    this.name = '';
    this.institution = '';
    this.type = 'bank';
    this.balance = null;
    this.balanceDate = isoOfDate(new Date());
  }

  async submit(): Promise<void> {
    if (!this.name.trim()) return;
    this.saving.set(true);
    try {
      const account = await this.store.addAccount({
        memberId: null,
        name: this.name.trim(),
        institution: this.institution.trim() || null,
        type: this.type,
        archived: false,
      });
      if (this.balance !== null) {
        await this.store.addAccountBalanceSnapshot(account.id, this.balance, this.balanceDate, null);
      }
      this.formOpen.set(false);
      this.toast.show('Compte ajouté.');
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      this.saving.set(false);
    }
  }

  async archive(accountId: string): Promise<void> {
    try {
      await this.store.archiveAccount(accountId);
      this.toast.show('Compte archivé.');
    } catch (err) {
      this.toast.show(err instanceof Error ? err.message : 'Une erreur est survenue.');
    }
  }
}
