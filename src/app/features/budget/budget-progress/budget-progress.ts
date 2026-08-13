import { Component, computed } from '@angular/core';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { OWNERS } from '../../../core/utils/categories';
import { fmt } from '../../../core/utils/currency.utils';
import { monthLabel } from '../../../core/utils/date.utils';

@Component({
  selector: 'app-budget-progress',
  imports: [],
  templateUrl: './budget-progress.html',
  styleUrl: './budget-progress.scss',
})
export class BudgetProgress {
  constructor(public store: BudgetStore) {}

  get title(): string {
    return 'Budget — ' + monthLabel(this.store.current()) + ' — ' + OWNERS[this.store.activeOwner()];
  }

  fmt(n: number): string {
    return fmt(n);
  }

  readonly ofText = computed(() => {
    const s = this.store.budgetSummary();
    let text = 'sur ' + fmt(s.budget);
    if (s.versementsIn > 0) {
      text += ` (incl. ${fmt(s.versementsIn)} de versements reçus)`;
    }
    return text;
  });

  // Pourcentage utilisé (0-100), la couleur/le statut de la barre, et le
  // texte de la pastille — même logique que l'ancienne app.
  readonly bar = computed(() => {
    const s = this.store.budgetSummary();
    if (s.budget <= 0) {
      return {
        widthPct: s.spent > 0 ? 100 : 0,
        cls: s.spent > 0 ? 'over' : '',
        statusCls: 'warn',
        statusText: 'Budget non défini',
      };
    }
    const pct = (s.spent / s.budget) * 100;
    if (pct >= 100) {
      return {
        widthPct: Math.min(pct, 100),
        cls: 'over',
        statusCls: 'over',
        statusText: `⚠️ Dépassement de ${fmt(s.spent - s.budget)}`,
      };
    }
    if (pct >= 80) {
      return {
        widthPct: pct,
        cls: 'warn',
        statusCls: 'warn',
        statusText: `Attention : ${pct.toFixed(0)}% du budget utilisé`,
      };
    }
    return {
      widthPct: pct,
      cls: '',
      statusCls: 'ok',
      statusText: `Il reste ${fmt(s.budget - s.spent)}`,
    };
  });

  get soldeNetColor(): string {
    return this.store.budgetSummary().soldeNet >= 0 ? 'var(--green)' : 'var(--red)';
  }
}
