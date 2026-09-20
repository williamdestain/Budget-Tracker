import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { MonthForecast } from './month-forecast';
import { BudgetStore } from '../../../core/services/budget-store.service';

function makeFakeStore(forecast: ReturnType<BudgetStore['monthForecast']>) {
  return { monthForecast: () => forecast } as unknown as BudgetStore;
}

function createFixture(forecast: ReturnType<BudgetStore['monthForecast']>) {
  TestBed.configureTestingModule({
    providers: [{ provide: BudgetStore, useValue: makeFakeStore(forecast) }],
  });
  const fixture = TestBed.createComponent(MonthForecast);
  fixture.detectChanges();
  return fixture;
}

describe('MonthForecast', () => {
  it("n'affiche rien quand monthForecast() est null (mois affiché différent du mois réel)", () => {
    const fixture = createFixture(null);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text.trim()).toBe('');
  });

  it('projection positive : icône "trending", texte "resterait"', () => {
    const fixture = createFixture({
      dayOfMonth: 10,
      daysInMonth: 30,
      spentSoFar: 300,
      projectedSpend: 900,
      projectedSoldeNet: 1100,
    });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('resterait');
    expect(el.querySelector('.forecast-card')?.classList.contains('over')).toBe(false);
  });

  it('projection négative (dépassement) : classe "over", texte "Risque de dépassement"', () => {
    const fixture = createFixture({
      dayOfMonth: 10,
      daysInMonth: 30,
      spentSoFar: 800,
      projectedSpend: 2400,
      projectedSoldeNet: -400,
    });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Risque de dépassement');
    expect(el.querySelector('.forecast-card')?.classList.contains('over')).toBe(true);
  });
});
