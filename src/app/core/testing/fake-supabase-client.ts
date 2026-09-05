// Faux client Supabase, en mémoire, pour tester BudgetStore sans base de
// données réelle (tests d'intégration "store + mappers", pas de dépendance
// réseau). Couvre juste les opérations utilisées par BudgetStore :
// select/order/eq/neq/in, insert/update/upsert/delete, .select().single().
//
// Ce n'est PAS un mock du comportement de Postgres (pas de vraies
// contraintes, pas de RLS, pas de cascade) — seulement de quoi vérifier
// que BudgetStore appelle le client correctement et retraite bien les
// résultats (mapping lignes <-> modèles, mise à jour des signals).

type Row = Record<string, any>;

function matchesFilters(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const val = row[f.column];
    switch (f.op) {
      case 'eq':
        return val === f.value;
      case 'neq':
        return val !== f.value;
      case 'in':
        return (f.value as any[]).includes(val);
      default:
        return true;
    }
  });
}

interface Filter {
  op: 'eq' | 'neq' | 'in';
  column: string;
  value: unknown;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `fake-id-${idCounter}`;
}

// Simule le trigger set_updated_at() (migration-019) : un timestamp
// différent à chaque insert/update, croissant, pour que le contrôle de
// concurrence optimiste de BudgetStore (comparaison d'`updated_at`) soit
// testable sans vraie base Postgres.
let updatedAtCounter = 0;
function nextUpdatedAt(): string {
  updatedAtCounter += 1;
  return `fake-updated-at-${updatedAtCounter}`;
}

class FakeQueryBuilder implements PromiseLike<{ data: any; error: any }> {
  private filters: Filter[] = [];
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;
  private wantSingle = false;
  private wantSelect = false;
  private orderColumn: string | null = null;
  private forcedError: { message: string } | null = null;

  constructor(
    private tables: Record<string, Row[]>,
    private table: string,
    private erroringTables: Set<string>,
    private consumeOnceError: (table: string) => boolean,
    // Colonnes formant la clé unique/primaire de cette table, si connue —
    // sert à simuler une violation de contrainte unique (code Postgres
    // "23505") sur un INSERT en conflit, comme le ferait une vraie clé
    // primaire composite (voir household_id/owner/ym/category sur
    // category_budgets, household_id/ym sur closed_months).
    private uniqueKeyColumns?: string[],
  ) {
    if (this.erroringTables.has(table) || this.consumeOnceError(table)) {
      this.forcedError = { message: `erreur simulée sur la table "${table}"` };
    }
  }

  select(_cols?: string): this {
    this.wantSelect = true;
    return this;
  }

  order(column: string): this {
    this.orderColumn = column;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ op: 'eq', column, value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ op: 'neq', column, value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push({ op: 'in', column, value: values });
    return this;
  }

  insert(rows: Row | Row[]): this {
    this.op = 'insert';
    this.payload = rows;
    return this;
  }

  update(patch: Row): this {
    this.op = 'update';
    this.payload = patch;
    return this;
  }

  upsert(row: Row, _opts?: unknown): this {
    this.op = 'upsert';
    this.payload = row;
    return this;
  }

  delete(): this {
    this.op = 'delete';
    return this;
  }

  single(): this {
    this.wantSingle = true;
    return this;
  }

  // Sur le vrai client Supabase, .single() lève une erreur s'il n'y a pas
  // exactement 1 ligne, alors que .maybeSingle() renvoie simplement `null`
  // sans erreur pour 0 ligne — distinction importante pour
  // resolveHousehold() (l'absence de foyer n'est PAS une erreur). Ce faux
  // client ne modélise pas la levée d'erreur de .single() sur 0 ligne (déjà
  // le cas avant cet ajout), donc les deux méthodes partagent la même
  // implémentation ici ; le nom est gardé distinct pour que le code appelant
  // reste correct une fois branché sur le vrai client.
  maybeSingle(): this {
    this.wantSingle = true;
    return this;
  }

  private run(): { data: any; error: any } {
    if (this.forcedError) {
      return { data: null, error: this.forcedError };
    }
    if (!this.tables[this.table]) this.tables[this.table] = [];
    const rows = this.tables[this.table];

    if (this.op === 'select') {
      let result = rows.filter((r) => matchesFilters(r, this.filters));
      if (this.orderColumn) {
        result = [...result].sort((a, b) =>
          String(a[this.orderColumn!]).localeCompare(String(b[this.orderColumn!])),
        );
      }
      return { data: this.wantSingle ? (result[0] ?? null) : result, error: null };
    }

    if (this.op === 'insert') {
      const toInsert = Array.isArray(this.payload) ? this.payload : [this.payload!];
      if (this.uniqueKeyColumns) {
        const conflict = toInsert.find((candidate) =>
          rows.some((existing) =>
            this.uniqueKeyColumns!.every((col) => existing[col] === candidate[col]),
          ),
        );
        if (conflict) {
          return {
            data: null,
            error: {
              code: '23505',
              message: `duplicate key value violates unique constraint on "${this.table}"`,
            },
          };
        }
      }
      const inserted = toInsert.map((r) => ({
        id: r['id'] ?? nextId(),
        updated_at: nextUpdatedAt(),
        ...r,
      }));
      rows.push(...inserted);
      return { data: this.wantSingle ? inserted[0] : inserted, error: null };
    }

    if (this.op === 'update') {
      const toUpdate = rows.filter((r) => matchesFilters(r, this.filters));
      // Comme le vrai trigger set_updated_at() (migration-019) : TOUJOURS
      // un nouveau timestamp sur update, même si `updated_at` n'est pas
      // dans le patch envoyé par le client.
      toUpdate.forEach((r) => Object.assign(r, this.payload, { updated_at: nextUpdatedAt() }));
      return { data: this.wantSingle ? (toUpdate[0] ?? null) : toUpdate, error: null };
    }

    if (this.op === 'upsert') {
      // Recherche d'une ligne existante par onConflict n'est pas modélisée
      // finement ici : on considère qu'un upsert insère toujours une
      // nouvelle ligne dans ce faux client (suffisant pour les tests
      // actuels, qui ne vérifient pas la déduplication d'upsert).
      const row = {
        id: (this.payload as Row)['id'] ?? nextId(),
        updated_at: nextUpdatedAt(),
        ...(this.payload as Row),
      };
      rows.push(row);
      return { data: row, error: null };
    }

    if (this.op === 'delete') {
      const toDelete = rows.filter((r) => matchesFilters(r, this.filters));
      const remaining = rows.filter((r) => !matchesFilters(r, this.filters));
      this.tables[this.table] = remaining;
      // Comme le vrai client Supabase : `.delete()` seul renvoie un
      // compte, `.delete().select(...)` renvoie les lignes supprimées —
      // utilisé par reopenMonth()/removeCategoryBudget() pour détecter
      // un conflit de concurrence (0 ligne supprimée = déjà modifiée
      // ailleurs).
      if (this.wantSelect) {
        return { data: this.wantSingle ? (toDelete[0] ?? null) : toDelete, error: null };
      }
      return { data: { count: toDelete.length }, error: null };
    }

    return { data: null, error: { message: `opération non supportée par le faux client: ${this.op}` } };
  }

  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export class FakeSupabaseClient {
  readonly tables: Record<string, Row[]> = {};
  private erroringTables = new Set<string>();

  // Pré-remplit une table (équivalent d'un `insert` déjà en base avant le test).
  seed(table: string, rows: Row[]): void {
    this.tables[table] = rows.map((r) => ({ id: r['id'] ?? nextId(), ...r }));
  }

  // Fait échouer toute requête sur cette table (pour tester la gestion
  // d'erreur — voir AUDIT_PRODUCTION_V2.md §3.5 sur loadAll()).
  simulateErrorOn(table: string): void {
    this.erroringTables.add(table);
  }

  // Comme simulateErrorOn, mais une seule fois : la requête suivante sur
  // cette table échoue, puis les suivantes repassent normales. Utile pour
  // simuler une panne réseau transitoire (ex. tester qu'importData() peut
  // échouer sur un insert PUIS réussir son rollback de compensation, sans
  // que le rollback lui-même échoue pour la même raison).
  simulateErrorOnce(table: string): void {
    this.onceErroringTables.add(table);
  }

  private onceErroringTables = new Set<string>();

  private consumeOnceError(table: string): boolean {
    if (this.onceErroringTables.has(table)) {
      this.onceErroringTables.delete(table);
      return true;
    }
    return false;
  }

  // Colonnes de clé primaire/unique simulées pour quelques tables — sert
  // uniquement à FakeQueryBuilder pour détecter un conflit d'INSERT
  // (voir uniqueKeyColumns plus haut). Pas besoin de lister TOUTES les
  // tables : seulement celles dont un test exerce réellement le chemin
  // "INSERT strict, conflit = erreur" (contrôle de concurrence #8).
  private uniqueKeyColumns: Record<string, string[]> = {
    category_budgets: ['household_id', 'owner', 'ym', 'category'],
    closed_months: ['household_id', 'ym'],
  };

  from(table: string): FakeQueryBuilder {
    return new FakeQueryBuilder(
      this.tables,
      table,
      this.erroringTables,
      (t) => this.consumeOnceError(t),
      this.uniqueKeyColumns[table],
    );
  }

  // Simule l'appel RPC à la fonction Postgres reset_everything() (voir
  // supabase/migration-008-atomic-reset.sql). Contrairement aux appels
  // .from(table).delete() individuels, ceci est tout-ou-rien : si une
  // seule des tables concernées est en erreur simulée, AUCUNE table n'est
  // vidée (comme une vraie transaction Postgres qui rollback entièrement),
  // et l'erreur de cette table est renvoyée telle quelle.
  // Identifiant "auth.uid()" simulé pour ce faux client — settable par les
  // tests (setCurrentUser) pour simuler des comptes distincts lors des
  // tests de create_household()/join_household().
  currentUserId = 'test-user-1';
  setCurrentUser(id: string): void {
    this.currentUserId = id;
  }

  // Identifiant "household_id" simulé pour ce faux client, résolu côté
  // fake "serveur" pour les RPC qui utilisent auth_household_id() dans la
  // vraie base (split_versement_into_provisions, import_household_data) —
  // celles-ci ne reçoivent PAS le household_id en paramètre (exactement
  // comme la vraie RPC), donc le faux client doit le connaître d'une autre
  // façon. À synchroniser dans les tests avec `store.householdId.set(...)`
  // (voir beforeEach du spec).
  currentHouseholdId = 'test-household-1';
  setCurrentHousehold(id: string): void {
    this.currentHouseholdId = id;
  }

  // Liste des tables vidées par reset_everything() côté SQL (voir
  // migration-020) — partagée par le fake rpc('reset_everything') ET par
  // fakeImportHouseholdData(), exactement comme la vraie
  // import_household_data() appelle `perform reset_everything();` en
  // interne (migration-022).
  private readonly resetTables = [
    'expenses',
    'incomes',
    'provisions',
    'provision_adjustments',
    'savings_goals',
    'savings_goal_contributions',
    'recurring_expenses',
    'recurring_incomes',
    'budgets',
    'category_budgets',
    'rollovers',
    'credit_card_payments',
    'closed_months',
  ];

  // Retourne la table en erreur simulée si le "reset" doit échouer, sinon
  // vide effectivement toutes les tables et retourne null. Factorisé pour
  // être appelé aussi bien par rpc('reset_everything') que par
  // fakeImportHouseholdData().
  private tryResetEverything(): string | null {
    const failing = this.resetTables.find((t) => this.erroringTables.has(t));
    if (failing) return failing;
    this.resetTables.forEach((t) => {
      this.tables[t] = [];
    });
    return null;
  }

  async rpc(fn: string, params?: Record<string, unknown>): Promise<{ data: any; error: any }> {
    if (fn === 'create_household') return this.fakeCreateHousehold(params);
    if (fn === 'join_household') return this.fakeJoinHousehold(params);
    if (fn === 'split_versement_into_provisions') return this.fakeSplitVersementIntoProvisions(params);
    if (fn === 'import_household_data') return this.fakeImportHouseholdData(params);
    if (fn !== 'reset_everything') {
      return { data: null, error: { message: `RPC non supportée par le faux client: ${fn}` } };
    }
    const failing = this.tryResetEverything();
    if (failing) {
      // Rien n'est supprimé — c'est exactement le point : une transaction
      // Postgres qui échoue en cours de route ne laisse aucune trace.
      return { data: null, error: { message: `erreur simulée sur la table "${failing}"` } };
    }
    return { data: null, error: null };
  }

  // Simule split_versement_into_provisions() (voir migration-021) : crée
  // (ou réutilise) la dépense "Versement" puis insère les ajustements de
  // provision correspondants. Pas de vraie transaction ici — mais les
  // tests de ce faux client vérifient le COMPORTEMENT observable (tout ou
  // rien du point de vue de l'appelant), pas l'implémentation SQL.
  private fakeSplitVersementIntoProvisions(params?: Record<string, unknown>) {
    const sender = params?.['p_sender'] as string;
    const totalAmount = params?.['p_total_amount'] as number;
    const date = params?.['p_date'] as string;
    const existingExpenseId = (params?.['p_existing_expense_id'] as string | null) ?? null;
    const allocations = (params?.['p_allocations'] as any[]) ?? [];

    if (!['moi', 'madame'].includes(sender)) {
      return { data: null, error: { message: `Owner invalide : ${sender}` } };
    }
    if (!(totalAmount > 0)) {
      return { data: null, error: { message: `Montant de versement invalide : ${totalAmount}` } };
    }

    // Instantané pour simuler une vraie transaction : tout échec plus bas
    // (création du versement ou d'un ajustement) restaure ces deux tables
    // exactement comme avant l'appel — ni versement orphelin, ni
    // ajustement partiel.
    const snapshot = {
      expenses: [...(this.tables['expenses'] ?? [])],
      provision_adjustments: [...(this.tables['provision_adjustments'] ?? [])],
    };
    const rollbackAndFail = (table: string) => {
      this.tables['expenses'] = snapshot.expenses;
      this.tables['provision_adjustments'] = snapshot.provision_adjustments;
      return { data: null, error: { message: `erreur simulée sur la table "${table}"` } };
    };

    let expenseId: string;
    if (existingExpenseId) {
      const existing = (this.tables['expenses'] ?? []).find((e) => e['id'] === existingExpenseId);
      if (!existing) {
        return { data: null, error: { message: 'Versement introuvable.' } };
      }
      expenseId = existingExpenseId;
    } else {
      if (this.erroringTables.has('expenses') || this.consumeOnceError('expenses')) {
        return rollbackAndFail('expenses');
      }
      expenseId = nextId();
      this.tables['expenses'] = [
        ...(this.tables['expenses'] ?? []),
        {
          id: expenseId,
          household_id: this.currentHouseholdId,
          amount: totalAmount,
          category: 'Versement',
          date,
          owner: sender,
          cc: false,
        },
      ];
    }

    const adjustmentIds: string[] = [];
    for (const alloc of allocations) {
      const amount = Number(alloc?.amount);
      if (amount > 0) {
        if (this.erroringTables.has('provision_adjustments') || this.consumeOnceError('provision_adjustments')) {
          return rollbackAndFail('provision_adjustments');
        }
        const adjustmentId = nextId();
        this.tables['provision_adjustments'] = [
          ...(this.tables['provision_adjustments'] ?? []),
          {
            id: adjustmentId,
            household_id: this.currentHouseholdId,
            provision_id: alloc.provision_id,
            amount,
            date,
            note: alloc.note ?? '',
            versement_expense_id: expenseId,
          },
        ];
        adjustmentIds.push(adjustmentId);
      }
    }

    return { data: { expense_id: expenseId, adjustment_ids: adjustmentIds }, error: null };
  }

  // Simule import_household_data() (voir migration-022) : vide tout
  // (comme reset_everything()) puis insère les tableaux fournis. Pour
  // simuler une VRAIE transaction (tout ou rien, pas un rollback
  // applicatif a posteriori), on prend un instantané de toutes les tables
  // concernées avant de toucher quoi que ce soit : si un échec survient à
  // n'importe quelle étape (reset ou un insert), on restaure exactement
  // cet instantané avant de renvoyer l'erreur — comme un vrai ROLLBACK
  // Postgres qui annule tout ce qui a été fait depuis le début de la
  // transaction, y compris le vidage initial.
  private fakeImportHouseholdData(params?: Record<string, unknown>) {
    const snapshot: Record<string, Row[]> = {};
    this.resetTables.forEach((t) => {
      snapshot[t] = this.tables[t] ? [...this.tables[t]] : [];
    });
    const rollbackAndFail = (table: string) => {
      this.resetTables.forEach((t) => {
        this.tables[t] = snapshot[t];
      });
      return { data: null, error: { message: `erreur simulée sur la table "${table}"` } };
    };

    const resetFailing = this.resetTables.find((t) => this.erroringTables.has(t));
    if (resetFailing) return rollbackAndFail(resetFailing);
    this.resetTables.forEach((t) => {
      this.tables[t] = [];
    });

    const tableParamMap: Record<string, string> = {
      p_provisions: 'provisions',
      p_provision_adjustments: 'provision_adjustments',
      p_savings_goals: 'savings_goals',
      p_savings_goal_contributions: 'savings_goal_contributions',
      p_recurring_expenses: 'recurring_expenses',
      p_recurring_incomes: 'recurring_incomes',
      p_categories: 'categories',
      p_credit_card_payments: 'credit_card_payments',
      p_expenses: 'expenses',
      p_incomes: 'incomes',
      p_budgets: 'budgets',
      p_rollovers: 'rollovers',
      p_category_budgets: 'category_budgets',
    };
    for (const [param, table] of Object.entries(tableParamMap)) {
      const rows = (params?.[param] as Row[] | undefined) ?? [];
      if (!rows.length) continue;
      if (this.erroringTables.has(table) || this.consumeOnceError(table)) {
        return rollbackAndFail(table);
      }
      this.tables[table] = [...(this.tables[table] ?? []), ...rows];
    }
    return { data: null, error: null };
  }

  // Reproduit les règles métier de create_household()/join_household()
  // (voir migration-017-households.sql) : un compte = un seul foyer, un
  // foyer = un "moi" + une "madame" maximum. Ne simule PAS la génération
  // des catégories par défaut (hors périmètre des tests unitaires du
  // store, qui seedent leurs propres catégories si besoin).
  private fakeCreateHousehold(params?: Record<string, unknown>) {
    const ownerLabel = params?.['p_owner_label'] as string;
    const name = (params?.['p_name'] as string) ?? 'Mon foyer';
    if (!['moi', 'madame'].includes(ownerLabel)) {
      return { data: null, error: { message: `Profil invalide : ${ownerLabel}` } };
    }
    const members = this.tables['household_members'] ?? [];
    if (members.some((m) => m['user_id'] === this.currentUserId)) {
      return { data: null, error: { message: 'Ce compte appartient déjà à un foyer.' } };
    }
    const householdId = nextId();
    const joinCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    if (!this.tables['households']) this.tables['households'] = [];
    if (!this.tables['household_members']) this.tables['household_members'] = [];
    this.tables['households'].push({ id: householdId, name, join_code: joinCode });
    this.tables['household_members'].push({
      id: nextId(),
      household_id: householdId,
      user_id: this.currentUserId,
      owner_label: ownerLabel,
    });
    return { data: [{ household_id: householdId, join_code: joinCode }], error: null };
  }

  private fakeJoinHousehold(params?: Record<string, unknown>) {
    const code = ((params?.['p_code'] as string) ?? '').toUpperCase().trim();
    const ownerLabel = params?.['p_owner_label'] as string;
    if (!['moi', 'madame'].includes(ownerLabel)) {
      return { data: null, error: { message: `Profil invalide : ${ownerLabel}` } };
    }
    const members = this.tables['household_members'] ?? [];
    if (members.some((m) => m['user_id'] === this.currentUserId)) {
      return { data: null, error: { message: 'Ce compte appartient déjà à un foyer.' } };
    }
    const household = (this.tables['households'] ?? []).find((h) => h['join_code'] === code);
    if (!household) {
      return { data: null, error: { message: 'Code invalide.' } };
    }
    if (members.some((m) => m['household_id'] === household['id'] && m['owner_label'] === ownerLabel)) {
      return { data: null, error: { message: `Le profil "${ownerLabel}" existe déjà dans ce foyer.` } };
    }
    this.tables['household_members'].push({
      id: nextId(),
      household_id: household['id'],
      user_id: this.currentUserId,
      owner_label: ownerLabel,
    });
    return { data: household['id'], error: null };
  }

  // Sous-ensemble minimal de l'API auth, pas utilisé par BudgetStore
  // directement mais présent sur un vrai SupabaseClient — ajouté seulement
  // si un test en a besoin un jour.
  readonly auth = {
    getSession: async () => ({
      data: { session: { user: { id: this.currentUserId } } },
      error: null,
    }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  };
}
