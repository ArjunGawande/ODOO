import { afterEach, describe, expect, it } from 'vitest';

import { formatDate, isValidDateString, todayInBusinessTz } from '@backend/lib/dates';

const originalTimezone = process.env.APP_TIMEZONE;

afterEach(() => {
  process.env.APP_TIMEZONE = originalTimezone;
});

describe('todayInBusinessTz', () => {
  it('rolls over at midnight in Asia/Kolkata, not UTC', () => {
    process.env.APP_TIMEZONE = 'Asia/Kolkata';
    expect(todayInBusinessTz(new Date('2026-10-31T18:29:59Z'))).toBe('2026-10-31');
    expect(todayInBusinessTz(new Date('2026-10-31T18:30:00Z'))).toBe('2026-11-01');
  });

  it('honours APP_TIMEZONE', () => {
    process.env.APP_TIMEZONE = 'America/New_York';
    expect(todayInBusinessTz(new Date('2026-11-01T03:00:00Z'))).toBe('2026-10-31');
  });

  it('defaults to Asia/Kolkata when unset', () => {
    delete process.env.APP_TIMEZONE;
    expect(todayInBusinessTz(new Date('2026-12-31T20:00:00Z'))).toBe('2027-01-01');
  });

  it('defaults to the current moment', () => {
    expect(todayInBusinessTz()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('isValidDateString', () => {
  it.each(['2026-11-01', '2028-02-29', '2027-12-31'])('accepts %s', (value) => {
    expect(isValidDateString(value)).toBe(true);
  });

  it.each(['2026-02-30', '2027-02-29', '2026-13-01', '2026-00-10', '2026-1-1', '01/11/2026', '', null])(
    'rejects %j',
    (value) => {
      expect(isValidDateString(value)).toBe(false);
    },
  );
});

describe('formatDate', () => {
  it('formats date strings without shifting the day', () => {
    expect(formatDate('2026-11-01')).toBe('1 Nov 2026');
    expect(formatDate('2027-12-31')).toBe('31 Dec 2027');
    expect(formatDate('2026-01-01')).toBe('1 Jan 2026');
  });

  it('shows a timestamp as its day in the business timezone', () => {
    expect(formatDate(new Date('2026-10-31T19:00:00Z'))).toBe('1 Nov 2026');
  });

  it('renders empty values as an empty string', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });

  it('throws on invalid dates', () => {
    expect(() => formatDate('2026-02-30')).toThrow(TypeError);
    expect(() => formatDate('soon')).toThrow(TypeError);
  });
});
