import { Component, signal } from '@angular/core';
import { Icon } from '../../shared/ui/icon/icon';
import { ALL_ICON_NAMES } from '../../shared/ui/icon/icon-names';
import { Button } from '../../shared/ui/button/button';
import { Card } from '../../shared/ui/card/card';
import { Chip } from '../../shared/ui/chip/chip';
import { ProgressBar } from '../../shared/ui/progress-bar/progress-bar';
import { ProgressRing } from '../../shared/ui/progress-ring/progress-ring';
import { Modal } from '../../shared/ui/modal/modal';
import { DonutChart, type DonutSegment } from '../../shared/ui/donut-chart/donut-chart';
import { BarLineChart, type ChartSeries } from '../../shared/ui/bar-line-chart/bar-line-chart';
import { MemberSwitch, type SwitchMember } from '../../shared/ui/member-switch/member-switch';

// Bac à sable de la Phase 0 (plan-industrialisation.md) : permet de valider
// chaque composant partagé isolément avant de l'utiliser dans un vrai
// écran. Route non protégée, à retirer avant la mise en production finale
// (voir app.routes.ts).
@Component({
  selector: 'app-design-system',
  imports: [
    Icon,
    Button,
    Card,
    Chip,
    ProgressBar,
    ProgressRing,
    Modal,
    DonutChart,
    BarLineChart,
    MemberSwitch,
  ],
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

  // --- Modal ---
  readonly showModal = signal(false);

  // --- MemberSwitch ---
  // Tableau statique temporaire — reproduit "Moi"/"Madame" en attendant la
  // vraie table `members` (MODELE.md section 6). Mêmes couleurs que les
  // badges de la liste de dépenses (--owner-moi / --pink).
  readonly demoMembers: SwitchMember[] = [
    { id: 'moi', name: 'Moi', color: '#4a6fa1' },
    { id: 'madame', name: 'Madame', color: '#a15385' },
  ];
  readonly activeMember = signal('moi');

  // --- DonutChart ---
  readonly demoSegments: DonutSegment[] = [
    { label: 'Épicerie', color: '#4c7a66', percent: 40 },
    { label: 'Restaurants', color: '#c07a3e', percent: 22 },
    { label: 'Transport', color: '#4a6fa1', percent: 17 },
    { label: 'Loisirs', color: '#a15385', percent: 12 },
    { label: 'Abonnements', color: '#b0576b', percent: 9 },
  ];

  // --- BarLineChart ---
  readonly demoMonths = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août'];
  readonly demoYearlySeries: ChartSeries[] = [
    {
      name: 'Revenus',
      color: 'var(--accent)',
      kind: 'bar',
      values: [9200, 9200, 9450, 9200, 9600, 9200, 9200, 9210],
    },
    {
      name: 'Dépenses',
      color: 'var(--ink-soft)',
      kind: 'bar',
      values: [8100, 7850, 8400, 7950, 8700, 8050, 8320, 8500],
    },
    {
      name: 'Solde net',
      color: 'var(--gold)',
      kind: 'line',
      values: [1100, 1350, 1050, 1250, 900, 1150, 880, 710],
    },
  ];
  readonly demoInvestSeries: ChartSeries[] = [
    {
      name: 'Valeur du portefeuille',
      color: 'var(--accent)',
      kind: 'line',
      values: [20500, 20800, 21100, 20900, 21400, 21800, 22100, 22600],
    },
  ];
}
