import { describe, it, expect } from 'vitest';
import { Trigger, Vintage, TriggerState } from '../types';

describe('Domain Rules & Invariants', () => {
  it('validates fixed-point decimal scaling to integer (SCALE = 1000)', () => {
    const parseDecimalToScaled = (valStr: string): number => {
      const clean = valStr.trim();
      if (!/^-?\d+(\.\d{1,3})?$/.test(clean)) {
        throw new Error('Invalid decimal format');
      }
      const parts = clean.split('.');
      const whole = parseInt(parts[0], 10);
      let frac = 0;
      if (parts.length > 1) {
        frac = parseInt(parts[1].padEnd(3, '0').substring(0, 3), 10);
      }
      const isNeg = clean.startsWith('-');
      return isNeg ? whole * 1000 - frac : whole * 1000 + frac;
    };

    expect(parseDecimalToScaled('314.069')).toBe(314069);
    expect(parseDecimalToScaled('310.000')).toBe(310000);
    expect(parseDecimalToScaled('310.5')).toBe(310500);
    expect(parseDecimalToScaled('0.123')).toBe(123);
    expect(parseDecimalToScaled('-5.500')).toBe(-5500);

    // Rejections
    expect(() => parseDecimalToScaled('314.0695')).toThrow('Invalid decimal format');
    expect(() => parseDecimalToScaled('314e2')).toThrow('Invalid decimal format');
    expect(() => parseDecimalToScaled('abc')).toThrow('Invalid decimal format');
  });

  it('correctly evaluates trigger condition against scaled integer threshold', () => {
    const evaluateCondition = (
      operator: 'GE' | 'LE',
      observedScaled: number,
      thresholdScaled: number
    ): boolean => {
      if (operator === 'GE') return observedScaled >= thresholdScaled;
      if (operator === 'LE') return observedScaled <= thresholdScaled;
      return false;
    };

    // GE
    expect(evaluateCondition('GE', 314069, 314069)).toBe(true);
    expect(evaluateCondition('GE', 315000, 314069)).toBe(true);
    expect(evaluateCondition('GE', 313000, 314069)).toBe(false);

    // LE
    expect(evaluateCondition('LE', 310000, 310000)).toBe(true);
    expect(evaluateCondition('LE', 309000, 310000)).toBe(true);
    expect(evaluateCondition('LE', 311000, 310000)).toBe(false);
  });

  it('computes effective state with 30-day TTL stale transition', () => {
    const computeEffectiveState = (
      state: TriggerState,
      latestObservedAt: string | null,
      nowIso: string
    ): string => {
      if (state === 'DRAFT' || state === 'FROZEN' || state === 'CLOSED' || state === 'HOLD') {
        return state;
      }
      if (!latestObservedAt) return state;

      const obsTime = new Date(latestObservedAt).getTime();
      const currTime = new Date(nowIso).getTime();
      const elapsedMs = currTime - obsTime;
      const thirtyDaysMs = 30 * 24 * 3600 * 1000;

      if (elapsedMs > thirtyDaysMs) {
        return 'STALE';
      }
      return state;
    };

    const t0 = '2024-05-15T00:00:00Z';
    const freshTime = '2024-05-25T00:00:00Z'; // 10 days later
    const staleTime = '2024-06-20T00:00:00Z'; // 36 days later

    expect(computeEffectiveState('CONFIRMED_ACTIVE', t0, freshTime)).toBe('CONFIRMED_ACTIVE');
    expect(computeEffectiveState('CONFIRMED_ACTIVE', t0, staleTime)).toBe('STALE');
    expect(computeEffectiveState('CONFIRMED_INACTIVE', t0, staleTime)).toBe('STALE');
    expect(computeEffectiveState('HOLD', t0, staleTime)).toBe('HOLD'); // HOLD stays HOLD
    expect(computeEffectiveState('CLOSED', t0, staleTime)).toBe('CLOSED');
  });

  it('determines downstream consequence boolean from effective state', () => {
    const isDownstreamActive = (effectiveState: string): boolean => {
      return (
        effectiveState === 'CONFIRMED_ACTIVE' ||
        effectiveState === 'RECONFIRMED' ||
        effectiveState === 'ACTIVATED_BY_REVISION'
      );
    };

    expect(isDownstreamActive('CONFIRMED_ACTIVE')).toBe(true);
    expect(isDownstreamActive('RECONFIRMED')).toBe(true);
    expect(isDownstreamActive('ACTIVATED_BY_REVISION')).toBe(true);

    expect(isDownstreamActive('CONFIRMED_INACTIVE')).toBe(false);
    expect(isDownstreamActive('RECONFIRMED_INACTIVE')).toBe(false);
    expect(isDownstreamActive('REVERSED_BY_REVISION')).toBe(false);
    expect(isDownstreamActive('STALE')).toBe(false);
    expect(isDownstreamActive('HOLD')).toBe(false);
    expect(isDownstreamActive('CLOSED')).toBe(false);
    expect(isDownstreamActive('DRAFT')).toBe(false);
    expect(isDownstreamActive('FROZEN')).toBe(false);
  });
});
