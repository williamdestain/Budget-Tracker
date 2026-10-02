import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './settings-page';
import { ThemeService } from '../../../core/services/theme.service';
import { CategoriesManage } from '../../categories/categories-manage/categories-manage';
import { DataManagement } from '../../data-management/data-management/data-management';
import { RecurringExpensesManage } from '../../recurring-expenses/recurring-expenses-manage/recurring-expenses-manage';
import { MembersManage } from '../members-manage/members-manage';
import { RecurringIncomesManage } from '../recurring-incomes-manage/recurring-incomes-manage';

// Les composants enfants ont chacun leur propre spec : ici on ne vérifie que
// l'assemblage de la page (qui est où) et le choix du thème.
@Component({ selector: 'app-categories-manage', template: '' }) class StubCategories {}
@Component({ selector: 'app-data-management', template: '' }) class StubData {}
@Component({ selector: 'app-recurring-expenses-manage', template: '' }) class StubRecurringExpenses {}
@Component({ selector: 'app-members-manage', template: '' }) class StubMembers {}
@Component({ selector: 'app-recurring-incomes-manage', template: '' }) class StubRecurringIncomes {}

function create(theme: 'light' | 'dark' = 'light') {
  const set = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: ThemeService, useValue: { theme: signal(theme), set } }],
  });
  TestBed.overrideComponent(SettingsPage, {
    remove: { imports: [CategoriesManage, DataManagement, RecurringExpensesManage, MembersManage, RecurringIncomesManage] },
    add: { imports: [StubCategories, StubData, StubRecurringExpenses, StubMembers, StubRecurringIncomes] },
  });
  const fixture = TestBed.createComponent(SettingsPage);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, set };
}

const section = (el: HTMLElement, id: string) => el.querySelector(`section[aria-labelledby="${id}"]`) as HTMLElement;

describe('SettingsPage', () => {
  it('regroupe les réglages dans des sections nommées', () => {
    const { el } = create();
    const titles = Array.from(el.querySelectorAll('section > .section-title')).map((t) => t.textContent!.trim());
    expect(titles).toEqual(['Apparence', 'Foyer & membres', 'Catégories', 'Automatisations', 'Données']);
  });

  it('place chaque réglage dans sa section', () => {
    const { el } = create();
    expect(section(el, 'set-members').querySelector('app-members-manage')).not.toBeNull();
    expect(section(el, 'set-categories').querySelector('app-categories-manage')).not.toBeNull();
    expect(section(el, 'set-automations').querySelector('app-recurring-incomes-manage')).not.toBeNull();
    expect(section(el, 'set-automations').querySelector('app-recurring-expenses-manage')).not.toBeNull();
    expect(section(el, 'set-data').querySelector('app-data-management')).not.toBeNull();
  });

  it('prévient que les comptes ne sont pas encore restaurés par une restauration', () => {
    const { el } = create();
    expect(section(el, 'set-data').textContent).toContain('ne sont pas encore restaurés');
  });

  it("le thème actif est exposé aux lecteurs d'écran, et un clic le change", () => {
    const { fixture, el, set } = create('dark');
    const chips = Array.from(section(el, 'set-appearance').querySelectorAll('app-chip button')) as HTMLButtonElement[];
    expect(chips.map((b) => [b.textContent!.trim(), b.getAttribute('aria-pressed')])).toEqual([
      ['Clair', 'false'],
      ['Sombre', 'true'],
    ]);
    chips[0].click();
    fixture.detectChanges();
    expect(set).toHaveBeenCalledWith('light');
    chips[1].click();
    expect(set).toHaveBeenCalledWith('dark');
  });
});
