#!/usr/bin/env bash
# Rejoue le schéma + les migrations sur une base JETABLE puis lance les tests SQL.
#
#   PGHOST=localhost PGUSER=postgres PGPASSWORD=... ./supabase/tests/run.sh
#
# Prérequis : un Postgres 15+ (superuser) et `psql`. Sans Postgres local :
#   docker run --rm -d --name pgtest -e POSTGRES_PASSWORD=pg -p 55432:5432 postgres:16
#   PGHOST=localhost PGPORT=55432 PGUSER=postgres PGPASSWORD=pg ./supabase/tests/run.sh
#
# Le chemin rejoué est celui d'une installation neuve : schema.sql (niveau 023)
# + 024 + 025 + 026, avec des données héritées (foyer complet + foyer à membre
# « fantôme ») insérées AVANT la 024, comme en production.
# La base de test est supprimée puis recréée à chaque lancement.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUP="$HERE/.."
DB="${TEST_DB:-budget_migration_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

echo "▶ base jetable : $DB"
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null

step() { printf '  • %s\n' "$1"; "${PSQL[@]}" -d "$DB" -f "$2" >/dev/null; }
step "simulation de l'environnement Supabase (rôles, auth.uid())" "$HERE/00-supabase-stub.sql"
step "schema.sql (niveau 023)"                                    "$SUP/schema.sql"
step "données héritées (foyer complet + foyer à membre fantôme)"  "$HERE/01-seed-legacy.sql"
step "migration 024"                                              "$SUP/migration-024-owner-to-member.sql"
step "migration 025"                                              "$SUP/migration-025-member-management.sql"
step "migration 026"                                              "$SUP/migration-026-household-rpc-member-id.sql"

echo "▶ tests"
psql -X -d "$DB" -f "$HERE/026-household-rpc.test.sql" | sed -n '/RÉSULTATS/,$p'
echo "✅ tous les tests SQL passent"
