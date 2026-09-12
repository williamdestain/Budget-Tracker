import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

// Rend n'importe quelle route dont le contenu réel n'existe pas encore
// (voir plan-industrialisation.md, Phase 2). Un seul composant pour les
// 8 destinations en attente plutôt que 8 fichiers presque identiques — le
// titre et la note viennent de `data` sur la route (voir app.routes.ts).
@Component({
  selector: 'app-route-placeholder',
  imports: [],
  templateUrl: './route-placeholder.html',
  styleUrl: './route-placeholder.scss',
})
export class RoutePlaceholder {
  private readonly route = inject(ActivatedRoute);

  readonly title = (this.route.snapshot.data['navTitle'] as string) ?? '';
  readonly note =
    (this.route.snapshot.data['placeholderNote'] as string) ??
    'Cet écran sera construit en Phase 2 — voir plan-industrialisation.md.';
}
