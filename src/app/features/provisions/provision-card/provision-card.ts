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

  readonly percentOpen = signal(false);
  editPercent: number | null = null;

  // Édition de la date d'ancrage du cycle (startYM pour les provisions
  // mensuelles, startDate pour celles en jours) — déplace le "Début"/
  // "Dernier prélèvement" ET recalcule donc la prochaine échéance en
  // fonction de cette nouvelle ancre. Utile pour repartir un cycle à zéro
  // sans recréer la provision (ex. la première échéance réelle n'est pas
  // celle configurée au départ).
  readonly startEditOpen = signal(false);
  editStartYM = '';
  editStartDate = '';

  constructor(public store: BudgetStore) {}

  readonly stats = computed(() => {
    const p = this.provision();
    const expenses = this.store.expenses();
    const ym = this.store.current();

    const pot = PU.provisionPot(p, ym, expenses);
    const nextLabel = PU.formatProvisionNextHit(p, ym);
    const isHit = PU.isHitMonth(p, ym);
    const startLabel = PU.formatProvisionStart(p);
    const startFieldLabel =
      PU.provisionUnit(p) === 'days' ? 'Dernier prélèvement' : 'Début';
    const nextFieldLabel =
      PU.provisionUnit(p) === 'days'
        ? 'Prochaine échéance'
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
      statusText = `⚠️ Déficit de ${fmt(Math.abs(pot))} (payé avant d'avoir assez économisé)`;
    } else if (isHit && spent < targetForNext) {
      statusClass = 'warn';
      barClass = 'partial';
      statusText = `Échéance ce mois — ${fmt(targetForNext - spent)} restant à payer`;
    } else if (isHit && spent >= targetForNext) {
      statusClass = 'ok';
      barClass = 'full';
      statusText = `✓ Échéance couverte ce mois`;
    } else if (pot >= targetForNext) {
      statusClass = 'ok';
      barClass = 'full';
      statusText = `Prêt ✓ (objectif atteint)`;
    } else {
      statusClass = 'warn';
      barClass = 'partial';
      statusText = `En accumulation — manque ${fmt(targetForNext - pot)} pour atteindre l'objectif`;
    }

    const fillPct =
      targetForNext > 0
        ? Math.min((Math.max(pot, 0) / targetForNext) * 100, 100)
        : pot >= 0
          ? 100
          : 0;
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

  startEditPercent(): void {
    this.editPercent = this.provision().allocationPercent || null;
    this.percentOpen.set(true);
  }

  cancelEditPercent(): void {
    this.percentOpen.set(false);
  }

  async saveEditPercent(): Promise<void> {
    this.saving.set(true);
    try {
      await this.store.updateProvision(this.provision().id, {
        allocationPercent: this.editPercent || 0,
      });
      this.percentOpen.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  startEditStartDate(): void {
    const p = this.provision();
    this.editStartYM = p.startYM || this.store.current();
    this.editStartDate = p.startDate || isoOfDate(new Date());
    this.startEditOpen.set(true);
  }

  cancelEditStartDate(): void {
    this.startEditOpen.set(false);
  }

  async saveEditStartDate(): Promise<void> {
    const p = this.provision();
    this.saving.set(true);
    try {
      if (PU.provisionUnit(p) === 'days') {
        if (!this.editStartDate) return;
        await this.store.updateProvision(p.id, { startDate: this.editStartDate });
      } else {
        if (!this.editStartYM) return;
        await this.store.updateProvision(p.id, { startYM: this.editStartYM });
      }
      this.startEditOpen.set(false);
    } finally {
      this.saving.set(false);
    }
  }
}
