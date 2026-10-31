import { describe, expect, it } from 'vitest';

import { formatINR, fromPaise, isValidMoney, toPaise } from '@backend/lib/money';

describe('isValidMoney', () => {
  it.each(['0', '0.5', '1560', '1560.5', '1560.00', '9999999999.99'])('accepts %s', (value) => {
    expect(isValidMoney(value)).toBe(true);
  });

  it.each(['', ' 1', '1 ', '-1', '1.', '.5', '1.234', '1,000', '1e3', 'abc', '12345678901', 'NaN'])(
    'rejects %j',
    (value) => {
      expect(isValidMoney(value)).toBe(false);
    },
  );

  it.each([[1560], [null], [undefined], [{}]])('rejects the non-string %j', (value) => {
    expect(isValidMoney(value)).toBe(false);
  });
});

describe('toPaise', () => {
  it('converts decimal strings exactly', () => {
    expect(toPaise('1560.00')).toBe(156000);
    expect(toPaise('1560.5')).toBe(156050);
    expect(toPaise('1560')).toBe(156000);
    expect(toPaise('0.07')).toBe(7);
    expect(toPaise('-12.50')).toBe(-1250);
    expect(toPaise('9999999999.99')).toBe(999999999999);
  });

  it('avoids the float rounding that value * 100 would hit', () => {
    expect(1.1 * 100).not.toBe(110);
    expect(toPaise('1.10')).toBe(110);
    expect(toPaise('19.99')).toBe(1999);
    expect(toPaise('1001.10')).toBe(100110);
  });

  it('never yields negative zero', () => {
    expect(Object.is(toPaise('-0.00'), 0)).toBe(true);
  });

  it('throws on invalid input', () => {
    expect(() => toPaise('abc')).toThrow(TypeError);
    expect(() => toPaise('1.234')).toThrow(TypeError);
    expect(() => toPaise(10)).toThrow(TypeError);
    expect(() => toPaise('99999999999999999')).toThrow(RangeError);
  });
});

describe('fromPaise', () => {
  it('formats paise as a two-decimal string', () => {
    expect(fromPaise(156000)).toBe('1560.00');
    expect(fromPaise(156050)).toBe('1560.50');
    expect(fromPaise(7)).toBe('0.07');
    expect(fromPaise(0)).toBe('0.00');
    expect(fromPaise(-1250)).toBe('-12.50');
  });

  it('round-trips with toPaise', () => {
    for (const value of ['0.00', '0.01', '1560.00', '9999999999.99']) {
      expect(fromPaise(toPaise(value))).toBe(value);
    }
  });

  it('throws on non-integers', () => {
    expect(() => fromPaise(1.5)).toThrow(TypeError);
    expect(() => fromPaise('100')).toThrow(TypeError);
  });
});

describe('formatINR', () => {
  it('matches the worked examples', () => {
    expect(formatINR('1560.00')).toBe('₹1,560.00');
    expect(formatINR('1000.00')).toBe('₹1,000.00');
    expect(formatINR('560.00')).toBe('₹560.00');
    expect(formatINR('16567.20')).toBe('₹16,567.20');
  });

  it('computes the variant final price without floats', () => {
    expect(formatINR(fromPaise(toPaise('1000.00') + toPaise('560.00')))).toBe('₹1,560.00');
  });

  it('uses lakh and crore grouping', () => {
    expect(formatINR('100000')).toBe('₹1,00,000.00');
    expect(formatINR('1234567.89')).toBe('₹12,34,567.89');
    expect(formatINR('100000000')).toBe('₹10,00,00,000.00');
    expect(formatINR('999')).toBe('₹999.00');
    expect(formatINR('0')).toBe('₹0.00');
  });

  it('agrees with Intl en-IN grouping', () => {
    const intl = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
    for (const value of ['0.05', '999.99', '1000', '99999.5', '100000', '12345678.9']) {
      expect(formatINR(value)).toBe(intl.format(value));
    }
  });

  it('puts the sign before the rupee symbol', () => {
    expect(formatINR('-1560.00')).toBe('-₹1,560.00');
  });

  it('renders empty values as an empty string', () => {
    expect(formatINR(null)).toBe('');
    expect(formatINR(undefined)).toBe('');
    expect(formatINR('')).toBe('');
  });
});
