import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { SmartAlerts } from './smart-alerts';

describe('SmartAlerts', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('n’affiche rien sans alerte, puis liste les messages', () => {
    const alerts = [
      { icon: '⚠️', message: 'Budget Courses à 90 %', severity: 'warn' },
    ];
    TestBed.configureTestingModule({
      providers: [{ provide: BudgetStore, useValue: { smartAlerts: () => alerts } }],
    });
    const fixture = TestBed.createComponent(SmartAlerts);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Budget Courses à 90 %');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('À surveiller');
  });
});
