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
  });
});
