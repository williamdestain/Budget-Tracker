import { Component, input } from '@angular/core';

// Un seul "chip" cliquable. Pour un groupe de filtres ou un contrôle
// segmenté, on met plusieurs <app-chip> côte à côte dans un conteneur
// class="chip-row" (utilitaire global, voir styles.scss) — pas besoin d'un
// composant de groupe séparé pour un pattern aussi simple.
@Component({
  selector: 'app-chip',
  imports: [],
  templateUrl: './chip.html',
  styleUrl: './chip.scss',
})
export class Chip {
  readonly active = input<boolean>(false);
  readonly disabled = input<boolean>(false);
}
