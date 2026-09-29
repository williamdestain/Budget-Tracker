import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, afterEach } from 'vitest';
import { BudgetStore } from '../../../core/services/budget-store.service';
import { Provision } from '../../../core/models/budget.models';
import { Icon } from '../../../shared/ui/icon/icon';
import { ProvisionCard } from '../provision-card/provision-card';
import { ProvisionList } from './provision-list';

@Component({
  selector: 'app-provision-card',
  template: '<div class="stub-provision-card">{{ provision().name }}</div>',
})
class ProvisionCardStub {
  readonly provision = input.required<Provision>();
}

function createFixture(visible: Provision[], other: Provision[]) {
  TestBed.configureTestingModule({
    imports: [ProvisionList],
    providers: [
      {
        provide: BudgetStore,
        useValue: {
          visibleProvisions: () => visible,
          otherProvisions: () => other,
        },
      },
    ],
  });
  TestBed.overrideComponent(ProvisionList, {
    remove: { imports: [ProvisionCard, Icon] },
    add: { imports: [ProvisionCardStub, Icon] },
  });
  const fixture = TestBed.createComponent(ProvisionList);
  fixture.detectChanges();
  return fixture;
}

function makeProvision(name: string): Provision {
  return {
    id: name,
    name,
    amount: 100,
    everyN: 1,
    intervalUnit: 'months',
    startYM: '2026-01',
    startDate: '',
    category: name,
    memberId: 'moi',
    autoRecalibrate: true,
    allocationPercent: 0,
    rollingCount: 0,
    monthlyReminder: null,
    adjustments: [],
  };
}

describe('ProvisionList', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('affiche un état vide quand aucune provision n’est visible', () => {
    const fixture = createFixture([], []);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      "Aucune provision pour l'instant",
    );
  });

  it('explique que les provisions visibles sont déjà dans la liste des échéances', () => {
    const fixture = createFixture([makeProvision('Assurance')], []);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Toutes tes provisions sont déjà affichées',
    );
  });

  it('affiche chaque provision restante une seule fois', () => {
    const fixture = createFixture(
      [makeProvision('Assurance'), makeProvision('Taxes')],
      [makeProvision('Taxes')],
    );
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelectorAll('.stub-provision-card')).toHaveLength(1);
    expect(element.textContent).toContain('Taxes');
  });
});
