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

class FakeQueryBuilder implements PromiseLike<{ data: any; error: any }> {
  private filters: Filter[] = [];
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;
  private wantSingle = false;
  private orderColumn: string | null = null;
  private forcedError: { message: string } | null = null;

  constructor(
    private tables: Record<string, Row[]>,
    private table: string,
    private erroringTables: Set<string>,
    private consumeOnceError: (table: string) => boolean,
  ) {
    if (this.erroringTables.has(table) || this.consumeOnceError(table)) {
      this.forcedError = { message: `erreur simulée sur la table "${table}"` };
    }
  }

  select(_cols?: string): this {
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
      const inserted = toInsert.map((r) => ({ id: r['id'] ?? nextId(), ...r }));
      rows.push(...inserted);
      return { data: this.wantSingle ? inserted[0] : inserted, error: null };
    }

    if (this.op === 'update') {
      const toUpdate = rows.filter((r) => matchesFilters(r, this.filters));
      toUpdate.forEach((r) => Object.assign(r, this.payload));
      return { data: this.wantSingle ? (toUpdate[0] ?? null) : toUpdate, error: null };
    }

    if (this.op === 'upsert') {
      // Recherche d'une ligne existante par onConflict n'est pas modélisée
      // finement ici : on considère qu'un upsert insère toujours une
      // nouvelle ligne dans ce faux client (suffisant pour les tests
      // actuels, qui ne vérifient pas la déduplication d'upsert).
      const row = { id: (this.payload as Row)['id'] ?? nextId(), ...(this.payload as Row) };
      rows.push(row);
      return { data: row, error: null };
    }

    if (this.op === 'delete') {
      const remaining = rows.filter((r) => !matchesFilters(r, this.filters));
      const deletedCount = rows.length - remaining.length;
      this.tables[this.table] = remaining;
      return { data: { count: deletedCount }, error: null };
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

  from(table: string): FakeQueryBuilder {
    return new FakeQueryBuilder(this.tables, table, this.erroringTables, (t) => this.consumeOnceError(t));
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

  async rpc(fn: string, params?: Record<string, unknown>): Promise<{ data: any; error: any }> {
    if (fn === 'create_household') return this.fakeCreateHousehold(params);
    if (fn === 'join_household') return this.fakeJoinHousehold(params);
    if (fn !== 'reset_everything') {
      return { data: null, error: { message: `RPC non supportée par le faux client: ${fn}` } };
    }
    const resetTables = [
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
    ];
    const failing = resetTables.find((t) => this.erroringTables.has(t));
    if (failing) {
      // Rien n'est supprimé — c'est exactement le point : une transaction
      // Postgres qui échoue en cours de route ne laisse aucune trace.
      return { data: null, error: { message: `erreur simulée sur la table "${failing}"` } };
    }
    resetTables.forEach((t) => {
      this.tables[t] = [];
    });
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
