import { Component, signal } from '@angular/core';
import { Icon } from '../../shared/ui/icon/icon';
import { ALL_ICON_NAMES } from '../../shared/ui/icon/icon-names';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Chip } from '../../shared/ui/chip/chip';
import { ProgressBar } from '../../shared/ui/progress-bar/progress-bar';
import { ProgressRing } from '../../shared/ui/progress-ring/progress-ring';

// Bac à sable de la Phase 0 (plan-industrialisation.md) : permet de valider
// chaque composant partagé isolément avant de l'utiliser dans un vrai
// écran. Route non protégée, à retirer avant la mise en production finale
// (voir app.routes.ts).
@Component({
  selector: 'app-design-system',
  imports: [Icon, Button, Card, Chip, ProgressBar, ProgressRing],
  templateUrl: './design-system.html',
  styleUrl: './design-system.scss',
})
export class DesignSystem {
  readonly iconNames = ALL_ICON_NAMES;

  readonly activeChip = signal<'all' | 'expense' | 'income'>('all');

  setActiveChip(value: 'all' | 'expense' | 'income'): void {
    this.activeChip.set(value);
  }

  readonly tokenSwatches = [
    { name: '--accent', label: 'Accent / marque' },
    { name: '--green', label: 'Positif' },
    { name: '--red', label: 'Négatif / alerte' },
    { name: '--amber', label: 'Avertissement' },
    { name: '--pink', label: 'Profil Madame' },
    { name: '--owner-moi', label: 'Profil Moi' },
    { name: '--ink', label: 'Texte' },
    { name: '--ink-soft', label: 'Texte secondaire' },
    { name: '--line', label: 'Filet / bordure' },
    { name: '--surface-soft', label: 'Surface secondaire' },
  ];
}
