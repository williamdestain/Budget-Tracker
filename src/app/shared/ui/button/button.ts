import { Component, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'ghost';

// <app-button variant="ghost">Répartir un versement</app-button>
//
// Le (click) posé par l'appelant sur <app-button> fonctionne normalement :
// un clic sur le <button> natif à l'intérieur remonte (bubbling DOM) jusqu'à
// l'hôte <app-button>, où Angular l'écoute — pas besoin d'un @Output dédié.
@Component({
  selector: 'app-button',
  imports: [],
  templateUrl: './button.html',
  styleUrl: './button.scss',
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');
  readonly type = input<'button' | 'submit'>('button');
  readonly disabled = input<boolean>(false);
  readonly fullWidth = input<boolean>(false);
}
