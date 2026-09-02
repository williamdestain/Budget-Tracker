import { Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { Provision } from '../../../core/models/budget.models';
import { fmt } from '../../../core/utils/currency.utils';
import { fmtDate, isoOfDate } from '../../../core/utils/date.utils';
import * as PU from '../../../core/utils/provision.utils';
import { ToastService } from '../../../core/services/toast.service';

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
  // Case "C'est le dernier paiement" — quand cochée, tout solde restant
  // dans la cagnotte après ce paiement est automatiquement reversé au
  // budget (comme "Terminer cette provision"), au lieu de rester une
  // action séparée à penser plus tard. Pensé pour les provisions "une
  // seule fois" (ex. un voyage) : payer la dernière fois libère
  // directement ce qui n'a pas été dépensé.
  payIsFinal = false;

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

  // Édition du nombre de jours/mois du cycle (everyN) — jusqu'ici cette
  // valeur n'était modifiable nulle part après la création de la
  // provision. Contrairement à la date d'ancrage, everyN n'est JAMAIS
  // touché par le recalage automatique (voir syncProvisionsFromExpense) :
  // seule cette édition manuelle peut le changer.
  readonly everyNEditOpen = signal(false);
  editEveryN: number | null = null;

  // Édition du rappel de contribution mensuelle personnelle (voir
  // Provision.monthlyReminder) — le montant que l'utilisateur s'engage à
  // ajouter lui-même chaque mois, affiché dans "Mes contributions du mois".
  readonly reminderEditOpen = signal(false);
  editReminder: number | null = null;

  constructor(
    public store: BudgetStore,
    private toast: ToastService,
  ) {}

  readonly stats = computed(() => {
    const p = this.provision();
    const expenses = this.store.expenses();
    const ym = this.store.current();

    const pot = PU.provisionPot(p, ym, expenses);
    const nextLabel = PU.formatProvisionUpcomingHit(p, ym);
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
    const rollingLabel = PU.provisionRollingLabel(p, expenses);
    const unitLabel = PU.provisionUnit(p) === 'days' ? 'j' : 'mois';

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
      unitLabel,
      rollingLabel,
      adjustmentsUpTo,
      adjustmentTotal,
      adjustmentMonthTotal,
    };
  });

  colorDot(): string {
    return this.store.colorFor(this.provision().category);
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
    if (opening) {
      this.payAmount = this.stats().targetForNext;
    } else {
      this.payIsFinal = false;
    }
  }

  toggleAdjust(): void {
    this.adjustOpen.update((v) => !v);
    this.payOpen.set(false);
  }

  async submitPay(): Promise<void> {
    if (!this.payAmount || this.payAmount <= 0 || !this.payDate) return;
    const wasFinal = this.payIsFinal;
    const provisionId = this.provision().id;
    const provisionName = this.provision().name;
    this.saving.set(true);
    try {
      await this.store.payProvision(provisionId, this.payAmount, this.payDate, this.payCc);
    } finally {
      this.saving.set(false);
    }
    // Le paiement a réussi — on réinitialise le formulaire avant de
    // tenter la fermeture automatique, pour ne pas le laisser ouvert sur
    // un montant déjà payé si l'étape suivante échoue.
    this.payOpen.set(false);
    this.payAmount = null;
    this.payCc = false;
    this.payIsFinal = false;

    if (wasFinal) {
      // "C'est le dernier paiement" : reverse le solde restant (s'il y en
      // a) dans le budget, puis supprime la provision — même mécanisme
      // que le bouton 🏁, déclenché automatiquement ici pour ne pas avoir
      // à y repenser séparément après avoir payé une provision "une
      // seule fois" (ex. un voyage).
      this.saving.set(true);
      try {
        const returned = await this.store.closeProvision(provisionId);
        this.toast.show(
          returned > 0
            ? `✅ "${provisionName}" terminée après ce paiement — ${this.fmt(returned)} ajoutés à ton budget.`
            : `✅ "${provisionName}" terminée après ce paiement.`,
        );
      } catch (err) {
        // Le paiement lui-même est acquis — seule la fermeture
        // automatique a échoué. On le dit clairement plutôt que de
        // laisser croire que le paiement a échoué.
        this.toast.show(
          `⚠️ Paiement enregistré, mais la fermeture automatique a échoué : ${(err as Error).message ?? err}. ` +
            `Utilise le bouton 🏁 pour réessayer.`,
        );
      } finally {
        this.saving.set(false);
      }
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

  // Distinct de remove() : pour une provision qu'on sait ne plus jamais
  // reconduire (ex. dépense ponctuelle réglée une fois pour toutes), ce
  // bouton reverse d'abord tout solde restant dans le budget avant de
  // supprimer la provision — remove() seule ne le fait pas (voir
  // closeProvision() dans le store), l'argent y disparaîtrait
  // silencieusement.
  async close(): Promise<void> {
    const p = this.provision();
    const pot = PU.provisionPot(p, this.store.current(), this.store.expenses());
    const msg =
      pot > 0.004
        ? `Terminer "${p.name}" ? Le solde restant (${this.fmt(pot)}) sera ajouté à ton budget de ce mois-ci ` +
          `comme un revenu ponctuel, puis la provision sera supprimée.`
        : `Terminer "${p.name}" ? La cagnotte est à ${this.fmt(Math.max(pot, 0))} — rien à reverser, la provision ` +
          `sera simplement supprimée.`;
    if (!confirm(msg)) return;

    this.saving.set(true);
    try {
      const returned = await this.store.closeProvision(p.id);
      this.toast.show(
        returned > 0
          ? `✅ "${p.name}" terminée — ${this.fmt(returned)} ajoutés à ton budget.`
          : `✅ "${p.name}" terminée.`,
      );
    } finally {
      this.saving.set(false);
    }
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

  // Bascule le recalage automatique d'une provision existante — jusqu'ici
  // ce réglage était figé à `true` à la création et jamais modifiable
  // ensuite, même si l'utilisateur ne voulait pas qu'un paiement réel
  // redémarre silencieusement un nouveau cycle.
  async toggleAutoRecalibrate(): Promise<void> {
    const p = this.provision();
    this.saving.set(true);
    try {
      await this.store.updateProvision(p.id, { autoRecalibrate: !p.autoRecalibrate });
    } finally {
      this.saving.set(false);
    }
  }

  startEditEveryN(): void {
    this.editEveryN = this.provision().everyN;
    this.everyNEditOpen.set(true);
  }

  cancelEditEveryN(): void {
    this.everyNEditOpen.set(false);
  }

  async saveEditEveryN(): Promise<void> {
    if (!this.editEveryN || this.editEveryN <= 0) return;
    this.saving.set(true);
    try {
      await this.store.updateProvision(this.provision().id, { everyN: this.editEveryN });
      this.everyNEditOpen.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  startEditReminder(): void {
    this.editReminder = this.provision().monthlyReminder;
    this.reminderEditOpen.set(true);
  }

  cancelEditReminder(): void {
    this.reminderEditOpen.set(false);
  }

  async saveEditReminder(): Promise<void> {
    this.saving.set(true);
    try {
      // 0 ou vide = pas de rappel (retire la ligne de "Mes contributions
      // du mois" plutôt que de la garder à 0 $, qui n'aurait pas de sens).
      const value = this.editReminder && this.editReminder > 0 ? this.editReminder : null;
      await this.store.updateProvision(this.provision().id, { monthlyReminder: value });
      this.reminderEditOpen.set(false);
    } finally {
      this.saving.set(false);
    }
  }
}
