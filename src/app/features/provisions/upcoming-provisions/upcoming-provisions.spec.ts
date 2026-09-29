import { describe, expect, it } from 'vitest';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { UpcomingProvisions } from './upcoming-provisions';

describe('UpcomingProvisions', () => {
  const component = new UpcomingProvisions({} as BudgetStore);

  it('décrit une échéance en retard avec le nombre de jours absolu', () => {
    expect(component.dueLabel(-4, false)).toBe('En retard de 4 j');
  });

  it('distingue aujourd’hui, demain et les échéances proches', () => {
    expect(component.dueLabel(0, true)).toBe("Aujourd'hui");
    expect(component.dueLabel(1, true)).toBe('Demain');
    expect(component.dueLabel(12, false)).toBe('Dans 12 j');
  });

  it('signale une échéance plus lointaine comme à venir', () => {
    expect(component.dueLabel(45, false)).toBe('À venir');
  });
});
