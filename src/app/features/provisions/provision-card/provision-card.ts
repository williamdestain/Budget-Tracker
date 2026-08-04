import { Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { Provision } from '../../../core/models/budget.models';
import { fmt } from '../../../core/utils/currency.utils';
import { fmtDate, isoOfDate } from '../../../core/utils/date.utils';
import { COLOR_MAP } from '../../../core/utils/categories';
import * as PU from '../../../core/utils/provision.utils';

@Component({
  selector: 'app-provision-card',
  imports: [FormsModule],
  templateUrl: './provision-card.html',
  styleUrl: './provision-card.scss',
})
export class ProvisionCard {
  provision = input.required<Provision>();

  readonly payOpen = signal(false);
  readonly adjustOpen = signal(false);
  readonly saving = signal(false);

  payAmount: number | null = null;
  payDate = isoOfDate(new Date());
  payCc = false;

  adjustAmount: number | null = null;
  adjustDate = isoOfDate(new Date());
  adjustNote = '';

  constructor(public store: BudgetStore) {}

  readonly stats = computed(() => {
    const p = this.provision();
    const expenses = this.store.expenses();
    const ym = this.store.current();

    const monthly = PU.provisionReserveForMonth(p, ym, expenses);
    const pot = PU.provisionPot(p, ym, expenses);
    const nextLabel = PU.formatProvisionNextHit(p, ym);
    const isHit = PU.isHitMonth(p, ym);
    const startLabel = PU.formatProvisionStart(p);
    const startFieldLabel =
      PU.provisionUnit(p) === 'days' ? 'Dernier prélèvement' : 'Début';
    const nextFieldLabel =
      PU.provisionUnit(p) === 'days'
        ? 'Prochain prélèvement'
        : 'Prochaine échéance';
    const dueAlert = PU.provisionDueAlert(p, ym, expenses);
    const targetForNext = PU.effectiveProvisionAmount(p, expenses);
    const spent = PU.provisionSpent(p, ym, expenses);

    let statusClass: 'ok' | 'warn' | 'deficit' = 'ok';
    let barClass: 'full' | 'partial' | 'deficit' = 'full';
    let statusText = '';

    if (pot < 0) {
      statusClass = 'deficit';
      barClass = 'deficit';
      statusText = `⚠️ Déficit de ${fmt(Math.abs(pot))} (sous-provisionnée)`;
    } else if (isHit && spent < targetForNext) {
      statusClass = 'warn';
      barClass = 'partial';
      statusText = `Prélèvement ce mois — ${fmt(targetForNext - spent)} restant à payer`;
    } else if (isHit && spent >= targetForNext) {
      statusClass = 'ok';
      barClass = 'full';
      statusText = `✓ Prélèvement couvert ce mois`;
    } else if (pot >= targetForNext) {
      statusClass = 'ok';
      barClass = 'full';
      statusText = `Prêt ✓ (prochain prélèvement couvert)`;
    } else {
      statusClass = 'warn';
      barClass = 'partial';
      statusText = `En accumulation — manque ${fmt(targetForNext - pot)} pour le prochain`;
    }

    const fillPct = Math.min((Math.max(pot, 0) / targetForNext) * 100, 100);
    const reserveLabel =
      PU.provisionUnit(p) === 'days' ? `${fmt(monthly)} ce mois` : `${fmt(monthly)}/mois`;
    const metaLine = PU.provisionMetaLine(p, expenses);
    const rollingLabel = PU.provisionRollingLabel(p, expenses);

    const adjustmentsUpTo = PU.provisionAdjustmentsUpTo(p, ym).sort(
      (a, b) =>
        b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)),
    );
    const adjustmentTotal = PU.provisionAdjustmentTotal(p, ym);
    const adjustmentMonthTotal = PU.provisionAdjustmentsForMonth(p, ym).reduce(
      (s, a) => s + a.amount,
      0,
    );

    return {
      monthly,
      pot,
      nextLabel,
      isHit,
      startLabel,
      startFieldLabel,
      nextFieldLabel,
      dueAlert,
      targetForNext,
      spent,
      statusClass,
      barClass,
      statusText,
      fillPct,
      reserveLabel,
      metaLine,
      rollingLabel,
      adjustmentsUpTo,
      adjustmentTotal,
      adjustmentMonthTotal,
    };
  });

  colorDot(): string {
    return COLOR_MAP[this.provision().category] || '#94a3b8';
  }

  barWidth(): number {
    return Math.max(this.stats().fillPct, 2);
  }

  fmt(n: number): string {
    return fmt(n);
  }

  fmtDate(iso: string): string {
    return fmtDate(iso);
  }

  togglePay(): void {
    const opening = !this.payOpen();
    this.payOpen.set(opening);
    this.adjustOpen.set(false);
    if (opening) this.payAmount = this.stats().targetForNext;
  }

  toggleAdjust(): void {
    this.adjustOpen.update((v) => !v);
    this.payOpen.set(false);
  }

  async submitPay(): Promise<void> {
    if (!this.payAmount || this.payAmount <= 0 || !this.payDate) return;
    this.saving.set(true);
    try {
      await this.store.payProvision(
        this.provision().id,
        this.payAmount,
        this.payDate,
        this.payCc,
      );
      this.payOpen.set(false);
      this.payAmount = null;
      this.payCc = false;
    } finally {
      this.saving.set(false);
    }
  }

  async submitAdjust(): Promise<void> {
    if (!this.adjustAmount || this.adjustAmount <= 0 || !this.adjustDate) return;
    this.saving.set(true);
    try {
      await this.store.addProvisionAdjustment(
        this.provision().id,
        this.adjustAmount,
        this.adjustDate,
        this.adjustNote,
      );
      this.adjustOpen.set(false);
      this.adjustAmount = null;
      this.adjustNote = '';
    } finally {
      this.saving.set(false);
    }
  }

  removeAdjustment(adjustmentId: string): void {
    this.store.removeProvisionAdjustment(this.provision().id, adjustmentId);
  }

  remove(): void {
    this.store.removeProvision(this.provision().id);
  }
}
