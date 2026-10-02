import { Component } from '@angular/core';
import { ThemeService } from '../../../core/services/theme.service';
import { CategoriesManage } from '../../categories/categories-manage/categories-manage';
import { DataManagement } from '../../data-management/data-management/data-management';
import { RecurringExpensesManage } from '../../recurring-expenses/recurring-expenses-manage/recurring-expenses-manage';
import { Card } from '../../../shared/ui/card/card';
import { Chip } from '../../../shared/ui/chip/chip';
import { MembersManage } from '../members-manage/members-manage';
import { RecurringIncomesManage } from '../recurring-incomes-manage/recurring-incomes-manage';

// Écran /parametres — Phase 2, vague B (plan-industrialisation.md).
//
// Regroupe les réglages qui vivaient en vrac sur le tableau de bord
// (catégories, sauvegarde/restauration/réinitialisation, dépenses récurrentes)
// et ajoute ce qui n'existait nulle part : le foyer et ses membres, la liste
// des revenus récurrents avec leur arrêt, et le choix du thème.
//
// CategoriesManage, DataManagement et RecurringExpensesManage sont repris tels
// quels (logique gelée, leurs specs inchangées) : ils gardent leur ancienne
// présentation (boutons + fenêtre propre) jusqu'à un passage de restylage.
@Component({
  selector: 'app-settings-page',
  imports: [
    Card,
    Chip,
    CategoriesManage,
    DataManagement,
    MembersManage,
    RecurringExpensesManage,
    RecurringIncomesManage,
  ],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  constructor(public theme: ThemeService) {}
}
