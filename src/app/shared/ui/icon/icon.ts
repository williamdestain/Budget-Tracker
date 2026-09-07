import { Component, input } from '@angular/core';
import type { IconName } from './icon-names';

// <app-icon name="close" /> — remplace un emoji par un tracé SVG cohérent.
// Le tracé est écrit en dur dans le template (@switch), jamais via
// [innerHTML], pour ne dépendre d'aucune règle de sanitization Angular.
@Component({
  selector: 'app-icon',
  imports: [],
  templateUrl: './icon.html',
  styleUrl: './icon.scss',
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input<number>(18);
  readonly strokeWidth = input<number>(1.75);
}
