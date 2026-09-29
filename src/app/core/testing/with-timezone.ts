// Utilitaire de TEST uniquement : exécute `fn` avec un fuseau horaire forcé,
// puis restaure le fuseau d'origine (même si `fn` lève une exception).
//
// Pourquoi : les bugs liés à l'heure d'été n'apparaissent que dans les
// fuseaux qui en ont un (Québec, Europe, Australie…). Une machine CI en UTC
// ne les verrait jamais — c'est exactement ainsi que `provisionDaysUntilNext`
// a donné 181 en CI (UTC) mais 180 au Québec. Forcer le fuseau dans le test
// rend ces bugs reproductibles partout, sans dépendre de la machine.
//
// Node relit `process.env.TZ` à chaud pour les `Date` : changer la variable
// suffit, pas besoin de relancer le runner. `process` n'est volontairement
// pas typé dans ce projet (pas de @types/node) : on passe par `globalThis`.
//
// Synchrone seulement : un `await` dans `fn` pourrait laisser un autre test
// tourner sous le mauvais fuseau.
type ProcessLike = { env: Record<string, string | undefined> };

export const DST_TIMEZONES = [
  'UTC', // pas de changement d'heure : la référence
  'America/Toronto', // avance en mars, recule en novembre (Québec)
  'America/Los_Angeles',
  'Europe/Paris', // avance fin mars, recule fin octobre
  'Australia/Sydney', // hémisphère Sud : avance en OCTOBRE, recule en avril
] as const;

export function withTimezone<T>(timezone: string, fn: () => T): T {
  const proc = (globalThis as unknown as { process?: ProcessLike }).process;
  if (!proc) {
    throw new Error('withTimezone() nécessite un runner Node (process.env.TZ introuvable).');
  }
  const previous = proc.env['TZ'];
  proc.env['TZ'] = timezone;
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete proc.env['TZ'];
    } else {
      proc.env['TZ'] = previous;
    }
  }
}
