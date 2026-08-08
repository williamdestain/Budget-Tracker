import { Component } from '@angular/core';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { ProvisionCard } from '../provision-card/provision-card';

@Component({
  selector: 'app-upcoming-provisions',
  imports: [ProvisionCard],
  templateUrl: './upcoming-provisions.html',
  styleUrl: './upcoming-provisions.scss',
})
export class UpcomingProvisions {
  constructor(public store: BudgetStore) {}

  dueLabel(daysUntil: number, dueThisMonth: boolean): string {
    if (daysUntil < 0) return `⏰ En retard de ${Math.abs(daysUntil)} j`;
    if (daysUntil === 0) return "📅 Aujourd'hui";
    if (daysUntil === 1) return '📅 Demain';
    if (dueThisMonth || daysUntil <= 30) return `📅 Dans ${daysUntil} j`;
    return '📅 À venir';
  }
}
