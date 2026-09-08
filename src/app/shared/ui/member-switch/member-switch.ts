import { Component, input, output } from '@angular/core';

export interface SwitchMember {
  id: string;
  name: string;
  color: string;
}

// <app-member-switch [members]="members" [activeId]="active()" (select)="active.set($event)" />
//
// Rendu dynamique à partir d'une liste — pas de "Moi"/"Madame" codés en
// dur dans ce composant. Pour l'instant, l'écran appelant peut lui passer
// un tableau statique à deux entrées qui reproduit le comportement actuel
// (voir MODELE.md section 6) ; le composant ne change pas le jour où ce
// tableau vient réellement de la table `members`.
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
