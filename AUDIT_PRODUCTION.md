# Audit production-readiness — Traqueur de Budget

**Date de l'audit** : 15 août 2026
**Portée** : code source (Angular 21 + Supabase/Postgres), schéma SQL, hébergement (GitHub Pages), dépendances.
**Objectif déclaré** : passer d'une app privée pour un foyer (« Moi » + « Madame », compte partagé) à une app **publique**, potentiellement multi-utilisateurs.

Je suis allé lire le code réel (`schema.sql`, `auth.service.ts`, `auth.guard.ts`, tous les formulaires, `package.json`, `npm audit`) plutôt que de partir d'une checklist générique. Chaque constat ci-dessous est basé sur ce que j'ai trouvé, avec le fichier/la ligne concernée.

---

## 1. Résumé exécutif

**Verdict : l'app n'est pas prête pour un lancement public multi-utilisateurs, pour une seule raison qui prime sur toutes les autres : il n'existe aucune isolation des données entre comptes.** Tout le reste (dépendances, validation, headers, tests) est secondaire tant que ce point n'est pas réglé — les corriger sans régler le P0 donnerait un faux sentiment de sécurité.

En revanche, pour l'usage actuel (un seul foyer, comptes créés à la main par toi dans Supabase, personne d'autre ne s'inscrit), l'app est raisonnablement saine : pas d'injection, pas de XSS trouvé, RLS activée (même si trop permissive), clé anon correctement traitée comme publique, HTTPS partout.

| Catégorie | Statut actuel | Bloquant pour le public ? |
|---|---|---|
| Isolation des données entre comptes | ❌ Absente | **Oui — bloquant absolu** |
| Authentification | 🟡 Fonctionnelle mais minimale (pas d'inscription, pas de MFA, pas de reset password dans l'app) | Oui si tu veux du self-service |
| Validation des données (DB) | 🟡 Partielle (contraintes `owner` seulement) | Non, mais recommandé |
| Dépendances | 🟡 4 vulnérabilités connues, modérées/élevées, toutes dans l'outillage de build | Non (pas dans le bundle livré) |
| Chiffrement transit | ✅ HTTPS partout (GitHub Pages + Supabase) | — |
| Chiffrement au repos | ✅ Géré nativement par Supabase/Postgres | — |
| XSS / injection | ✅ Rien trouvé | — |
| Headers de sécurité (CSP, HSTS...) | ❌ Aucun | Recommandé |
| Tests automatisés | ❌ Aucun test réel | Recommandé fortement avant tout refactor de sécurité |
| Sauvegardes | 🟡 Export manuel côté app seulement | Recommandé |

---

## 2. Constats critiques (P0 — bloquants pour un lancement public)

### 2.1 Aucune isolation des données entre comptes (le vrai problème)

**Preuve — `supabase/schema.sql`, commentaire d'en-tête (lignes 1-6) :**
```sql
-- Compte partagé : Moi et Madame se connectent avec le même identifiant,
-- donc les règles RLS ci-dessous exigent simplement "utilisateur connecté",
-- sans distinction de propriétaire au niveau des permissions (le champ
-- "owner" sert juste à filtrer/afficher, comme dans l'ancienne app).
```

**Preuve — les politiques RLS elles-mêmes (répétées sur 10 tables) :**
```sql
create policy "authenticated_all_expenses" on expenses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
```

Concrètement : **n'importe quel utilisateur authentifié (n'importe quel compte Supabase Auth valide sur ton projet) peut lire, modifier et supprimer les données de TOUS les autres utilisateurs.** La colonne `owner` (`'moi' | 'madame'`) ne sert qu'à l'affichage côté app — ce n'est pas une frontière de sécurité, Postgres ne la traite pas comme telle.

Aujourd'hui, ce n'est pas exploité parce qu'**il n'y a qu'un seul compte** (partagé entre toi et Madame) et que rien dans l'app ne permet à quelqu'un de s'inscrire (pas de formulaire d'inscription — voir 3.1). Le risque est donc **latent, pas actif**. Mais dès que tu ouvres l'inscription au public, ou que tu crées un deuxième compte pour un autre foyer, **ce foyer verra et pourra modifier les données financières de tous les autres**.

**C'est un chantier de fond, pas un correctif d'une ligne.** Il touche : le schéma (ajouter une colonne de propriétaire réel), les 10 tables + leurs policies, et la logique de l'app (qui suppose actuellement 2 profils fixes `'moi'`/`'madame'`, pas N foyers dynamiques).

#### Plan de correction recommandé

**Étape 1 — Ajouter une vraie notion de propriétaire au niveau base de données.**
Ajouter une colonne `user_id uuid references auth.users(id) default auth.uid()` sur chaque table de données (expenses, incomes, provisions, provision_adjustments, savings_goals, savings_goal_contributions, recurring_expenses, budgets, category_budgets, rollovers).

```sql
alter table expenses add column user_id uuid not null default auth.uid() references auth.users(id) on delete cascade;
-- répéter pour chaque table de données
```

**Étape 2 — Remplacer les policies permissives par des policies scoped à l'utilisateur.**
```sql
drop policy "authenticated_all_expenses" on expenses;
create policy "owner_only_expenses" on expenses
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
-- répéter pour chaque table
```

**Étape 3 — Décider du modèle « foyer » (household).**
Ton app a un concept de **foyer à 2 personnes** (Moi/Madame) qui partagent les mêmes données. `auth.uid()` isole par *utilisateur individuel*, pas par foyer. Deux options :

- **Option A (rapide, correcte pour un lancement) : un compte = un foyer.** Chaque foyer public a UN SEUL compte Supabase Auth (comme aujourd'hui), partagé entre les 2 conjoints qui se connectent avec les mêmes identifiants. `user_id` isole alors correctement un foyer d'un autre. C'est la correction minimale qui règle le P0 sans réécrire l'architecture des profils Moi/Madame.
- **Option B (plus propre, plus de travail) : table `households` + 2 comptes liés.** Chaque conjoint a son propre compte Supabase Auth, lié à un `household_id` commun via une table `household_members`. Les policies RLS vérifient l'appartenance au foyer plutôt que l'égalité stricte `auth.uid() = user_id`. Nécessaire seulement si tu veux que chaque conjoint ait son propre mot de passe/email.

**Je recommande l'option A pour un premier lancement public** : elle règle le problème de sécurité réel (isolation entre foyers) sans toucher à l'UX Moi/Madame actuelle, et l'option B reste possible plus tard sans tout recasser.

**Étape 4 — Migrer les données existantes.**
Avant d'activer les nouvelles policies, remplir `user_id` sur les lignes existantes avec l'UUID de ton compte actuel (`select id from auth.users`), sinon tes propres données deviennent invisibles.

**Étape 5 — Adapter le flux d'inscription.**
Il n'existe aujourd'hui aucune UI d'inscription (voir 3.1) — c'est en fait une protection de facto tant que tu ne l'ajoutes pas. Si tu veux du self-service public, il faut : un formulaire d'inscription, la vérification d'email (Supabase Auth le gère nativement, à activer dans Authentication > Settings), et un flux de récupération de mot de passe.

---

## 3. Constats importants (P1)

### 3.1 Pas d'inscription ni de réinitialisation de mot de passe dans l'app

**Preuve — `src/app/features/auth/login/login.ts` :** le composant ne contient qu'un `signIn(email, password)`. Aucun lien « mot de passe oublié », aucun formulaire d'inscription.

Ce n'est pas un bug — c'est cohérent avec le modèle actuel (comptes créés à la main par toi dans le dashboard Supabase). Mais pour un lancement public, il faut :
- Un flux d'inscription (`supabase.auth.signUp`), avec vérification d'email obligatoire (à activer dans Supabase : *Authentication → Settings → Email confirmations*).
- Un flux « mot de passe oublié » (`supabase.auth.resetPasswordForEmail`).
- Une politique de mot de passe minimale (Supabase permet de configurer une longueur minimale et de vérifier contre les fuites connues — *Authentication → Settings → Password strength / Leaked password protection* — à activer, c'est gratuit et natif).

### 3.2 Aucune contrainte de validation au niveau base de données

**Preuve — `supabase/schema.sql`, table `expenses` (lignes 26-35)** : `amount numeric(12,2) not null` — aucune contrainte `check (amount >= 0)`. Idem sur `incomes`, `provisions`, `savings_goals`, etc. La colonne `category text not null` accepte n'importe quelle chaîne, sans limite de longueur ni liste blanche.

Aujourd'hui, l'app elle-même valide côté client (ex. `expense-form.ts` : `if (!this.amount || this.amount <= 0) return;`). C'est nécessaire mais pas suffisant : n'importe qui avec la clé anon (publique par nature) peut appeler l'API Supabase directement en contournant l'app, et insérer des montants négatifs, des catégories de 50 000 caractères, etc.

**Correctifs recommandés (peu de risque, fort gain) :**
```sql
alter table expenses add constraint amount_positive check (amount >= 0);
alter table expenses add constraint category_length check (char_length(category) <= 60);
-- idem pour incomes, provisions.amount, savings_goals.target_amount, etc.
```

### 3.3 Dépendances avec vulnérabilités connues

`npm audit` (exécuté sur ton `package-lock.json`) rapporte **4 vulnérabilités : 2 modérées, 2 élevées**, toutes dans la chaîne d'outillage `@angular/build` (via `undici`, `hono`, `nanoid`). **Aucune n'est dans le code livré au navigateur** (`@angular/build` est un devDependency, utilisé seulement à la compilation) — donc pas de risque direct pour les visiteurs du site, mais ça vaut la peine de nettoyer :
```bash
npm audit fix
```
À refaire périodiquement (mensuel suffit pour une app de cette taille) — aucune automatisation existante pour l'instant (voir 4.3).

### 3.4 Aucun header de sécurité HTTP (CSP, HSTS, X-Frame-Options...)

**Preuve — `src/index.html`** : aucune balise `<meta http-equiv="Content-Security-Policy">`, et GitHub Pages (ton hébergeur actuel) ne permet pas de définir des headers HTTP personnalisés — c'est une limite de la plateforme, pas de ton code.

Une CSP réduirait la surface si jamais une dépendance tierce introduisait une faille XSS un jour (défense en profondeur — aujourd'hui je n'ai trouvé aucun XSS actif). **Si tu veux une vraie CSP, il faut changer d'hébergeur** (Cloudflare Pages, Netlify, Vercel permettent tous des headers custom via un fichier de config, et ont un plan gratuit équivalent à GitHub Pages).

### 3.5 Messages d'erreur bruts remontés à l'utilisateur

**Preuve — `data-management.ts` ligne 98 :**
```ts
catch (err: any) {
  console.error(err);
  const detail = err?.message ? ` (${err.message})` : '';
  this.toast.show(`⚠️ Échec de la restauration${detail}`);
}
```
Utile pour le débogage aujourd'hui (juste vous deux), mais un message d'erreur Postgres/Supabase brut peut révéler des détails du schéma (noms de colonnes, contraintes) à un attaquant. Pour un public plus large : afficher un message générique à l'utilisateur, garder le détail dans `console.error` (déjà fait) ou un outil de monitoring (voir 4.2).

### 3.6 Import de fichier sans limite de taille ni validation de schéma

**Preuve — `data-management.ts`, `onFileSelected()` :** le JSON importé n'est vérifié que sur `JSON.parse` (syntaxe) et un `Array.isArray` sommaire pour l'affichage du récapitulatif — pas de validation de schéma (types, bornes), pas de limite de taille de fichier. Un fichier malformé ou énorme pourrait provoquer des erreurs peu claires ou ralentir le navigateur. Risque faible (fonctionnalité protégée par connexion), mais facile à durcir (voir plan d'action).

### 3.7 Aucun test automatisé

**Preuve :** seul `src/app/app.spec.ts` existe (le boilerplate par défaut d'Angular CLI, non modifié). Aucun test sur la logique métier (calcul de budget, provisions, RLS, etc.), qui est pourtant la partie la plus critique et la plus modifiée à chaque itération.

C'est risqué **spécifiquement avant un refactor de sécurité** (section 2) : sans tests, impossible de vérifier facilement qu'on n'a pas cassé le calcul du budget en ajoutant `user_id` partout.

---

## 4. Constats mineurs (P2 — améliorations, pas des urgences)

### 4.1 Stockage du token de session dans `localStorage`

Comportement par défaut de `@supabase/supabase-js` (`src/app/core/services/supabase.service.ts`). C'est standard pour une SPA sans backend, mais ça signifie qu'un XSS (même dans une dépendance tierce future) pourrait exfiltrer le token de session. Mitigation actuelle : je n'ai trouvé aucun usage d'`innerHTML`, `bypassSecurityTrust`, ni `eval` dans le code — la surface XSS est déjà minimale. À surveiller si tu ajoutes des dépendances tierces (widgets, trackers analytics, etc.).

### 4.2 Pas de monitoring / alerting

Aucun outil de suivi d'erreurs en production (type Sentry) — les erreurs ne sont visibles que dans la console du navigateur de l'utilisateur, donc invisibles pour toi une fois en prod. Recommandé avant un vrai lancement public : Sentry a un plan gratuit largement suffisant pour ce volume.

### 4.3 Pas d'automatisation de la maintenance (`npm audit`, mises à jour de dépendances)

Le repo a déjà un workflow GitHub Actions pour le déploiement (`.github/workflows/deploy.yml`) — bonne base. Rien pour la sécurité en continu : pas de `Dependabot` activé, pas de job CI qui lance `npm audit` sur chaque PR.

### 4.4 Pas de sauvegardes automatiques côté serveur

L'app a une fonctionnalité d'export manuel (JSON téléchargé par l'utilisateur) — bien, mais ça ne protège que si l'utilisateur pense à le faire. Le plan gratuit Supabase ne propose pas de *point-in-time recovery* — une suppression accidentelle en masse (ou un bug de migration) n'est récupérable que si quelqu'un a exporté récemment.

### 4.5 Pas de mentions légales / politique de confidentialité

Pertinent uniquement **si** tu passes réellement au public (obligations légales variables selon le pays de tes utilisateurs — RGPD en UE/Québec via la Loi 25, notamment, puisque ce sont des données financières personnelles).

---

## 5. Sur le chiffrement (« encodage des informations »), pour clarifier les termes

Tu as mentionné vouloir « rajouter de l'encodage » — voici où on en est réellement, avec les termes précis :

- **Chiffrement en transit** (les données pendant qu'elles voyagent sur le réseau) : ✅ déjà fait. HTTPS partout — GitHub Pages force HTTPS, Supabase force HTTPS/TLS sur son API. Rien à faire.
- **Chiffrement au repos** (les données stockées sur le disque du serveur) : ✅ déjà fait nativement par Supabase (Postgres géré, disques chiffrés côté infrastructure AWS). Rien à faire, rien à configurer.
- **Chiffrement applicatif au niveau des champs** (ex. chiffrer le montant d'une dépense avant de l'écrire en base, avec une clé que même toi/Supabase ne peux pas lire) : ❌ absent, et **je ne le recommande pas** pour ce type de données. C'est utile pour des secrets extrêmes (mots de passe de coffre-fort, numéros de carte bancaire complets, données de santé très sensibles) — pas pour des montants de dépenses catégorisées. Le coût (complexité, recherche/tri devient très difficile sur des champs chiffrés, gestion de clés) dépasse largement le bénéfice ici. **Le vrai sujet de confidentialité de cette app, c'est le point 2.1 (isolation entre comptes) — pas le chiffrement des champs.**
- **Hachage des mots de passe** : ✅ déjà géré nativement par Supabase Auth (bcrypt), tu n'as jamais accès aux mots de passe en clair, rien à faire de ton côté.

Donc : pas de chantier de chiffrement à mener. Le chantier qui compte vraiment est l'isolation des données (section 2).

---

## 6. Plan d'action priorisé

| # | Action | Priorité | Effort estimé |
|---|---|---|---|
| 1 | Ajouter `user_id` + policies RLS scoped par utilisateur (section 2.1) | 🔴 P0 — bloquant | 1-2 jours (schéma + migration + tests manuels de chaque écran) |
| 2 | Décider et documenter le modèle de compte (1 compte = 1 foyer, option A) | 🔴 P0 | 1h de réflexion, pas de code |
| 3 | Ajouter contraintes `check` sur les montants et longueurs de texte (section 3.2) | 🟠 P1 | 1-2h |
| 4 | Construire le flux inscription + mot de passe oublié + confirmation email (section 3.1) | 🟠 P1 — seulement si self-service public | 1-2 jours |
| 5 | Activer *leaked password protection* + longueur mini dans Supabase Auth Settings | 🟠 P1 | 5 min |
| 6 | `npm audit fix` + activer Dependabot | 🟡 P2 | 30 min |
| 7 | Ajouter des tests sur la logique métier critique (provisions, budget, RLS) avant de toucher au point 1 | 🟡 P2 mais **à faire avant le point 1** | 2-3 jours |
| 8 | Ajouter Sentry (ou équivalent) pour le monitoring d'erreurs | 🟢 P3 | 2-3h |
| 9 | Limiter la taille/valider le schéma du JSON importé | 🟢 P3 | 1-2h |
| 10 | Évaluer un changement d'hébergeur si tu veux une vraie CSP (Cloudflare Pages / Netlify) | 🟢 P3 | 1 jour (migration du déploiement) |
| 11 | Mentions légales / politique de confidentialité si public | 🟢 P3 (mais légalement important) | Dépend de ta juridiction |

**Ordre recommandé** : 7 → 1 → 2 → 3 → 5 → 6, puis 4 seulement si tu veux vraiment de l'inscription libre (sinon tu peux rester sur « je crée les comptes moi-même dans Supabase », ce qui est une protection supplémentaire tout à fait valable pour un lancement à échelle contrôlée).

---

## 7. Ce qui est déjà bien fait (pour être honnête, pas juste alarmiste)

- RLS activée sur toutes les tables (juste trop permissive — c'est un réglage à corriger, pas une fondation à reconstruire).
- Clé anon Supabase traitée correctement comme publique (avec commentaire explicite dans le code expliquant pourquoi ce n'est pas un secret).
- Aucun XSS, injection SQL (le client Supabase paramètre déjà les requêtes) ou usage dangereux (`eval`, `innerHTML`) trouvé.
- HTTPS de bout en bout.
- Migrations SQL versionnées et documentées (`supabase/migration-00X-*.sql`) — bonne pratique pour l'évolution du schéma.
- CI/CD déjà en place (GitHub Actions) pour le déploiement.
- Export de données existant (bonne base pour une stratégie de sauvegarde, à automatiser).
