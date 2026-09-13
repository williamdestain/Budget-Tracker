import { Component, input, output } from '@angular/core';

export interface SwitchMember {
  id: string;
  name: string;
  color: string;
}

// <app-member-switch [members]="members" [activeId]="active()" (select)="active.set($event)" />
//
// Rendu dynamique à partir de la liste des membres du foyer — aucune
// hypothèse sur le nombre, le nom ou la couleur des membres.
@Component({
  selector: 'app-member-switch',
  imports: [],
  templateUrl: './member-switch.html',
  styleUrl: './member-switch.scss',
})
export class MemberSwitch {
  readonly members = input.required<SwitchMember[]>();
  readonly activeId = input.required<string>();
  readonly select = output<string>();
}
