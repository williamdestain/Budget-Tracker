import { Component, ElementRef, HostListener, afterNextRender, input, output, viewChild } from '@angular/core';
import { Icon } from '../icon/icon';

// <app-modal title="Ajouter une transaction" (closed)="show.set(false)">
//   ...contenu projeté (formulaire, liste...)...
// </app-modal>
//
// Contrairement à ToastComponent (une instance unique à la racine, pilotée
// par un service, pour un message texte simple), Modal n'a pas de service
// dédié : le contenu projeté est trop varié (formulaire d'ajout, feuille
// "Plus", détail d'un compte...) pour transiter par un service proprement.
// Chaque écran qui a besoin d'une modale l'inclut dans son propre template
// derrière un @if piloté par un signal local — c'est Modal qui gère
// uniquement la coquille (fond, positionnement bureau/mobile, fermeture),
// pas le contenu.
//
// Bureau : fenêtre centrée. Sous 768px (vraie media query, pas une
// simulation) : feuille qui remonte du bas, comme sur mobile natif.
@Component({
  selector: 'app-modal',
  imports: [Icon],
  templateUrl: './modal.html',
  styleUrl: './modal.scss',
})
export class Modal {
  readonly title = input.required<string>();
  readonly closed = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  constructor() {
    // Focus le panneau à l'ouverture : utile pour les lecteurs d'écran et
    // pour que la touche Échap fonctionne dès l'apparition de la modale.
    // Ne couvre pas un vrai "focus trap" (cycler Tab à l'intérieur de la
    // modale) — amélioration possible plus tard si besoin, pas incluse ici.
    afterNextRender(() => this.panel()?.nativeElement.focus());
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }
}
