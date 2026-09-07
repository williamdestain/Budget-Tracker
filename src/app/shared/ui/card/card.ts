import { Component, input } from '@angular/core';

export type CardSize = 'md' | 'lg';

// <app-card>...</app-card> ou <app-card size="lg" accent="var(--accent)">
// L'accent (bordure supérieure de 3px) sert pour les cartes "hero" — le
// bandeau de solde, par exemple — et pourra plus tard recevoir la couleur
// d'un membre (Member.color, voir MODELE.md section 6) plutôt qu'une
// couleur fixe.
@Component({
  selector: 'app-card',
  imports: [],
  templateUrl: './card.html',
  styleUrl: './card.scss',
})
export class Card {
  readonly size = input<CardSize>('md');
  readonly accent = input<string | null>(null);
}
