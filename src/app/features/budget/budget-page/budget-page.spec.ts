import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { fmt } from '../../../core/utils/currency.utils';
import { BudgetPage } from './budget-page';
import { CategoryBudgets } from '../category-budgets/category-budgets';
import { LoadErrorBanner } from '../../dashboard/load-error-banner/load-error-banner';
import { MonthlyReminders } from '../../provisions/monthly-reminders/monthly-reminders';
import { ProvisionForm } from '../../provisions/provision-form/provision-form';
import { ProvisionList } from '../../provisions/provision-list/provision-list';
import { UpcomingProvisions } from '../../provisions/upcoming-provisions/upcoming-provisions';
import { VersementSplitter } from '../../provisions/versement-splitter/versement-splitter';

@Component({ selector: 'app-category-budgets', template: '' })
class CategoryBudgetsStub {}

@Component({ selector: 'app-load-error-banner', template: '' })
class LoadErrorBannerStub {}

@Component({ selector: 'app-monthly-reminders', template: '' })
class MonthlyRemindersStub {}

@Component({ selector: 'app-provision-form', template: '' })
class ProvisionFormStub {}

@Component({ selector: 'app-provision-list', template: '' })
class ProvisionListStub {}

@Component({ selector: 'app-upcoming-provisions', template: '' })
class UpcomingProvisionsStub {}

@Component({ selector: 'app-versement-splitter', template: '' })
class VersementSplitterStub {}

const CHILD_COMPONENTS = [
  CategoryBudgets,
  LoadErrorBanner,
  MonthlyReminders,
  ProvisionForm,
  ProvisionList,
  UpcomingProvisions,
  VersementSplitter,
];

const CHILD_STUBS = [
  CategoryBudgetsStub,
  LoadErrorBannerStub,
  MonthlyRemindersStub,
  ProvisionFormStub,
  ProvisionListStub,
  UpcomingProvisionsStub,
  VersementSplitterStub,
];

function createFixture(loading: boolean, summary = { budget: 5000, spent: 5450, soldeNet: -450 }) {
  const store = {
    loading: signal(loading),
    current: () => '2026-09',
    budgetSummary: vi.fn(() => summary),
    countedExpensesList: () => [{ amount: 99999 }],
    expenses: () => [{ amount: 88888 }],
    loadAll: vi.fn(),
  } as unknown as BudgetStore;

  TestBed.configureTestingModule({
    imports: [BudgetPage],
    providers: [{ provide: BudgetStore, useValue: store }],
  });
  TestBed.overrideComponent(BudgetPage, {
    remove: { imports: CHILD_COMPONENTS },
    add: { imports: CHILD_STUBS },
  });

  const fixture = TestBed.createComponent(BudgetPage);
  fixture.detectChanges();
  return { fixture, store };
}

describe('BudgetPage', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('charge le store et affiche un état de chargement avant les données', () => {
    const { fixture, store } = createFixture(true);
    const element = fixture.nativeElement as HTMLElement;

    expect(store.loadAll).toHaveBeenCalledOnce();
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Chargement du budget');
    expect(element.querySelector('.summary-grid')).toBeNull();
  });

  it('affiche les mêmes budget, dépenses et solde net que budgetSummary()', () => {
    const summary = { budget: 5000, spent: 5450, soldeNet: -450 };
    const { fixture, store } = createFixture(false, summary);
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.summary-grid')?.textContent).toContain(fmt(summary.budget));
    expect(element.querySelector('.summary-grid')?.textContent).toContain(fmt(summary.spent));
    expect(element.querySelector('.summary-grid')?.textContent).toContain(fmt(summary.soldeNet));
    expect(element.querySelector('.summary-card:last-child strong')?.classList.contains('negative')).toBe(true);
    expect(store.budgetSummary).toHaveBeenCalled();
  });

  it('ne recalcule pas les dépenses à partir des dépenses brutes ou comptabilisées', () => {
    const { fixture } = createFixture(false, { budget: 5000, spent: 5450, soldeNet: -450 });
    const summaryText = (fixture.nativeElement as HTMLElement).querySelector('.summary-grid')?.textContent ?? '';

    expect(summaryText).toContain(fmt(5450));
    expect(summaryText).not.toContain(fmt(99999));
    expect(summaryText).not.toContain(fmt(88888));
  });

  it('regroupe budgets et provisions sans inclure les objectifs d’épargne', () => {
    const { fixture } = createFixture(false);
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('app-provision-list')).not.toBeNull();
    expect(element.querySelector('app-upcoming-provisions')).not.toBeNull();
    expect(element.querySelector('app-versement-splitter')).not.toBeNull();
    expect(element.querySelector('app-category-budgets')).not.toBeNull();
    expect(element.querySelector('app-savings-goal-list')).toBeNull();
    expect(element.textContent).not.toContain('Objectifs d’épargne');
  });
});
