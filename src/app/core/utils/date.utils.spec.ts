import { describe, it, expect } from 'vitest';
import {
  monthLabel,
  monthShortLabel,
  fmtDate,
  ymOf,
  isoOfDate,
  parseISODate,
  nextYM,
  prevYM,
  monthsBetween,
  addMonths,
  daysBetween,
} from './date.utils';
import { DST_TIMEZONES, withTimezone } from '../testing/with-timezone';

describe('date.utils', () => {
  describe('monthLabel', () => {
    it('formate un mois en toutes lettres avec l’année', () => {
      expect(monthLabel('2026-07')).toBe('Juillet 2026');
      expect(monthLabel('2026-01')).toBe('Janvier 2026');
      expect(monthLabel('2026-12')).toBe('Décembre 2026');
    });
  });

  describe('monthShortLabel', () => {
    it('renvoie une abréviation courte et sans collision entre juin et juillet', () => {
      expect(monthShortLabel('2026-06')).toBe('Juin');
      expect(monthShortLabel('2026-07')).toBe('Juil');
      expect(monthShortLabel('2026-06')).not.toBe(monthShortLabel('2026-07'));
    });
  });

  describe('fmtDate', () => {
    it('formate une date ISO en "JJ Mmm AAAA"', () => {
      expect(fmtDate('2026-07-09')).toBe('09 Jui 2026');
      expect(fmtDate('2026-12-25')).toBe('25 Déc 2026');
    });

    it('garde le zéro de tête sur les jours à un chiffre', () => {
      expect(fmtDate('2026-01-05')).toBe('05 Jan 2026');
    });
  });

  describe('ymOf / isoOfDate', () => {
    it('extrait "YYYY-MM" d’un objet Date', () => {
      expect(ymOf(new Date(2026, 6, 15))).toBe('2026-07');
      expect(ymOf(new Date(2026, 0, 1))).toBe('2026-01');
    });

    it('formate une date complète en ISO "YYYY-MM-DD"', () => {
      expect(isoOfDate(new Date(2026, 6, 9))).toBe('2026-07-09');
    });
  });

  describe('parseISODate', () => {
    it('reconstruit un Date local à partir d’une chaîne ISO (round-trip avec isoOfDate)', () => {
      const d = parseISODate('2026-07-09');
      expect(isoOfDate(d)).toBe('2026-07-09');
    });
  });

  describe('nextYM / prevYM', () => {
    it('avance au mois suivant', () => {
      expect(nextYM('2026-07')).toBe('2026-08');
    });

    it('passe à l’année suivante en décembre', () => {
      expect(nextYM('2026-12')).toBe('2027-01');
    });

    it('recule au mois précédent', () => {
      expect(prevYM('2026-07')).toBe('2026-06');
    });

    it('passe à l’année précédente en janvier', () => {
      expect(prevYM('2026-01')).toBe('2025-12');
    });
  });

  describe('monthsBetween', () => {
    it('renvoie 1 pour le même mois (inclusif)', () => {
      expect(monthsBetween('2026-07', '2026-07')).toBe(1);
    });

    it('compte les mois entre deux dates, y compris à cheval sur une année', () => {
      expect(monthsBetween('2026-01', '2026-07')).toBe(7);
      expect(monthsBetween('2025-11', '2026-02')).toBe(4);
    });

    it('gère un ordre inversé (résultat négatif ou nul)', () => {
      expect(monthsBetween('2026-07', '2026-01')).toBe(-5);
    });
  });

  describe('addMonths', () => {
    it('ajoute des mois en gérant le débordement d’année', () => {
      expect(addMonths('2026-11', 2)).toBe('2027-01');
    });

    it('soustrait des mois avec un nombre négatif', () => {
      expect(addMonths('2026-01', -1)).toBe('2025-12');
    });

    it('n’a pas d’effet avec 0', () => {
      expect(addMonths('2026-07', 0)).toBe('2026-07');
    });
  });

  describe('daysBetween', () => {
    it('compte les jours entre deux dates ISO', () => {
      expect(daysBetween('2026-07-01', '2026-07-10')).toBe(9);
    });

    it('renvoie 0 pour la même date', () => {
      expect(daysBetween('2026-07-01', '2026-07-01')).toBe(0);
    });

    it('renvoie une valeur négative si la fin précède le début', () => {
      expect(daysBetween('2026-07-10', '2026-07-01')).toBe(-9);
    });

    it('traverse correctement un changement de mois', () => {
      expect(daysBetween('2026-07-25', '2026-08-05')).toBe(11);
    });

    it('compte une année non bissextile (365) et bissextile (366)', () => {
      expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
      expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366);
    });

    it('renvoie toujours un entier exact (jamais 180,96…)', () => {
      expect(Number.isInteger(daysBetween('2026-01-01', '2026-07-01'))).toBe(true);
    });

    // Garde-fou du test lui-même : sans ça, si le changement de fuseau ne
    // prenait pas effet, tous les tests ci-dessous passeraient pour rien.
    it('withTimezone() change réellement le fuseau (Toronto a un décalage différent en janvier et en juillet)', () => {
      const [janOffset, julOffset] = withTimezone('America/Toronto', () => [
        new Date(2026, 0, 1).getTimezoneOffset(),
        new Date(2026, 6, 1).getTimezoneOffset(),
      ]);
      expect(janOffset).not.toBe(julOffset);
    });

    // Chaque intervalle traverse un changement d'heure dans au moins un de
    // ces fuseaux. Le résultat doit être identique partout.
    describe.each([
      { from: '2026-01-01', to: '2026-07-01', days: 181, why: 'janv. → juil. (traverse le DST Nord ET Sud)' },
      { from: '2026-03-07', to: '2026-03-09', days: 2, why: 'la nuit du 8 mars : 23 h à Toronto' },
      { from: '2026-10-31', to: '2026-11-02', days: 2, why: 'la nuit du 1er nov. : 25 h à Toronto' },
      { from: '2026-03-28', to: '2026-03-30', days: 2, why: 'la nuit du 29 mars : 23 h à Paris' },
      { from: '2026-10-03', to: '2026-10-05', days: 2, why: 'la nuit du 4 oct. : 23 h à Sydney' },
      { from: '2026-06-01', to: '2027-01-01', days: 214, why: 'juin → janv. (DST Sud dans le sens inverse)' },
    ])('$from → $to = $days jours ($why)', ({ from, to, days }) => {
      it.each(DST_TIMEZONES)('donne le même résultat en %s', (tz) => {
        expect(withTimezone(tz, () => daysBetween(from, to))).toBe(days);
      });
    });
  });
});
