import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { IncomeBar } from './income-bar';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { fmt } from '../../../core/utils/currency.utils';

interface FakeEntry {
  key: string;
  label: string;
  amount: number;
  isVersement?: boolean;
  isRollover?: boolean;
}

function makeFakeStore(ym: string, entries: FakeEntry[], total: number) {
  return {
    current: () => ym,
    activeOwner: () => 'moi' as const,
    incomeBar: () => ({ entries, total }),
    removeRollover: vi.fn(),
  } as unknown as BudgetStore;
}

function createFixture(entries: FakeEntry[] = [], total = 0, ym = '2026-09') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: BudgetStore, useValue: makeFakeStore(ym, entries, total) }],
  });
  const fixture = TestBed.createComponent(IncomeBar);
  fixture.detectChanges();
  return fixture;
}

describe('IncomeBar', () => {
  it('affiche le mois courant, le nombre d\'entrées (pluriel) et le total formaté', () => {
    const fixture = createFixture(
      [
        { key: 'a', label: 'Salaire', amount: 3000 },
        { key: 'b', label: 'Prime', amount: 200 },
      ],
      3200,
    );
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Septembre 2026');
    expect(text).toContain('2');
    expect(text).toContain('entrées');
    expect(text).toContain(fmt(3200));
  });

  it('utilise le singulier "entrée" pour une seule entrée', () => {
    const fixture = createFixture([{ key: 'a', label: 'Salaire', amount: 3000 }], 3000);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('entrée');
    expect(text).not.toContain('entrées');
  });

  it('affiche un message vide quand il n\'y a aucun revenu', () => {
    const fixture = createFixture([], 0);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Aucun revenu ce mois.');
  });

  it('bascule l\'état ouvert/fermé au clic sur la ligne', () => {
    const fixture = createFixture();
    expect(fixture.componentInstance.open()).toBe(false);
    (fixture.nativeElement as HTMLElement).querySelector('.income-bar-row')!.dispatchEvent(
      new Event('click', { bubbles: true }),
    );
    fixture.detectChanges();
    expect(fixture.componentInstance.open()).toBe(true);
  });

  it('marque une entrée de report négative avec la classe is-negative', () => {
    const fixture = createFixture(
      [{ key: 'r', label: 'Report', amount: -50, isRollover: true }],
      -50,
    );
    const entry = (fixture.nativeElement as HTMLElement).querySelector('.income-bar-entry')!;
    expect(entry.classList.contains('is-rollover')).toBe(true);
    expect(entry.classList.contains('is-negative')).toBe(true);
  });

  it('appelle store.removeRollover() avec le owner/mois actifs quand on retire un report', () => {
    const fixture = createFixture(
      [{ key: 'r', label: 'Report', amount: 50, isRollover: true }],
      50,
    );
    fixture.componentInstance.removeRollover();
    expect(fixture.componentInstance.store.removeRollover).toHaveBeenCalledWith('moi', '2026-09');
  });
});
