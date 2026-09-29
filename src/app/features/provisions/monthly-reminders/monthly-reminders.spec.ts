import { describe, expect, it, vi } from 'vitest';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { MonthlyReminders } from './monthly-reminders';

describe('MonthlyReminders', () => {
  it('confirme la contribution demandée et libère son état de chargement', async () => {
    const confirmMonthlyReminder = vi.fn().mockResolvedValue(undefined);
    const component = new MonthlyReminders({
      confirmMonthlyReminder,
    } as unknown as BudgetStore);

    await component.confirm('provision-1', 125);

    expect(confirmMonthlyReminder).toHaveBeenCalledWith('provision-1', 125);
    expect(component.confirming().has('provision-1')).toBe(false);
  });

  it('libère son état de chargement même si la confirmation échoue', async () => {
    const error = new Error('Impossible de confirmer');
    const confirmMonthlyReminder = vi.fn().mockRejectedValue(error);
    const component = new MonthlyReminders({
      confirmMonthlyReminder,
    } as unknown as BudgetStore);

    await expect(component.confirm('provision-1', 125)).rejects.toBe(error);

    expect(component.confirming().has('provision-1')).toBe(false);
  });

  it('délègue la couleur de catégorie au store', () => {
    const colorFor = vi.fn(() => '#123456');
    const component = new MonthlyReminders({ colorFor } as unknown as BudgetStore);

    expect(component.colorFor('Électricité')).toBe('#123456');
    expect(colorFor).toHaveBeenCalledWith('Électricité');
  });
});
