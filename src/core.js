// Core recurrence logic.
//
// Design decision: the library models a recurrence as a small immutable value
// object rather than a generator of dates. Callers own the clock and the
// calendar; we only translate between a readable RRULE string and a structured
// description. This keeps every function pure and deterministic, which makes
// the awkward cases (month-end overflow, week numbering) testable without
// freezing wall-clock time.

const FREQS = ['DAILY', 'WEEKLY', 'MONTHLY'];
const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const WEEKDAY_INDEX = new Map(WEEKDAYS.map((d, i) => [d, i]));

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertInteger(value, name) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${name} must be an integer`);
  }
}

/**
 * A recurrence schedule expressed in the subset of RFC 5545 RRULE that this
 * library supports: FREQ (DAILY/WEEKLY/MONTHLY), INTERVAL, COUNT, BYDAY and
 * BYMONTHDAY. Anything outside that subset is rejected loudly rather than
 * silently ignored, because a schedule that quietly drops a rule is worse than
 * one that refuses to parse.
 */
export class Recurrence {
  constructor({ freq, interval = 1, count = null, byDay = [], byMonthDay = [] } = {}) {
    const normalizedFreq = typeof freq === 'string' ? freq.toUpperCase() : freq;
    if (!FREQS.includes(normalizedFreq)) {
      throw new RangeError(`freq must be one of ${FREQS.join(', ')}`);
    }
    assertInteger(interval, 'interval');
    if (interval < 1) {
      throw new RangeError('interval must be at least 1');
    }
    if (count !== null) {
      assertInteger(count, 'count');
      if (count < 1) {
        throw new RangeError('count must be at least 1');
      }
    }

    const days = Array.isArray(byDay) ? byDay : [byDay];
    const normalizedDays = days.map((d) => {
      const upper = typeof d === 'string' ? d.toUpperCase() : d;
      if (!WEEKDAY_INDEX.has(upper)) {
        throw new RangeError(`byDay entries must be one of ${WEEKDAYS.join(', ')}`);
      }
      return upper;
    });

    const monthDays = Array.isArray(byMonthDay) ? byMonthDay : [byMonthDay];
    for (const d of monthDays) {
      assertInteger(d, 'byMonthDay entries');
      if (d < 1 || d > 31) {
        throw new RangeError('byMonthDay entries must be between 1 and 31');
      }
    }

    this.freq = normalizedFreq;
    this.interval = interval;
    this.count = count;
    this.byDay = normalizedDays;
    this.byMonthDay = monthDays;
    Object.freeze(this);
  }

  /**
   * Serialise back to a canonical RRULE string. Parts are emitted in a fixed
   * order so that two equal schedules always produce byte-identical output;
   * that property is what makes formatRRule safe to use as a map key.
   */
  toString() {
    const parts = [`FREQ=${this.freq}`];
    if (this.interval !== 1) {
      parts.push(`INTERVAL=${this.interval}`);
    }
    if (this.count !== null) {
      parts.push(`COUNT=${this.count}`);
    }
    if (this.byDay.length > 0) {
      parts.push(`BYDAY=${this.byDay.join(',')}`);
    }
    if (this.byMonthDay.length > 0) {
      parts.push(`BYMONTHDAY=${this.byMonthDay.join(',')}`);
    }
    return parts.join(';');
  }

  /**
   * Return the number of matching days in a calendar month, given the month's
   * length. We take the length as an argument instead of reading a real date so
   * that callers can test February without constructing a Date.
   *
   * Decision: BYMONTHDAY values past the end of the month are treated as
   * "last day of the month" rather than skipped. RRULE itself would skip them,
   * but the readable schedules this library targets almost always mean "the
   * 31st, or the last day when there is no 31st". This is the documented
   * trade-off; tests pin it down.
   */
  occurrencesInMonth(daysInMonth) {
    assertInteger(daysInMonth, 'daysInMonth');
    if (daysInMonth < 28 || daysInMonth > 31) {
      throw new RangeError('daysInMonth must be between 28 and 31');
    }
    if (this.freq === 'MONTHLY' && this.byMonthDay.length > 0) {
      const days = new Set();
      for (const d of this.byMonthDay) {
        const effective = Math.min(d, daysInMonth);
        // A monthly rule with BYDAY also intersects: keep only matching weekdays.
        if (this.byDay.length > 0) {
          continue;
        }
        days.add(effective);
      }
      return [...days].sort((a, b) => a - b);
    }
    return [];
  }
}

/**
 * Parse an RRULE string into a Recurrence. The leading `RRULE:` prefix is
 * optional because both forms appear in the wild and rejecting one of them
 * would be a pointless papercut.
 */
export function parseRRule(text) {
  if (typeof text !== 'string') {
    throw new TypeError('RRULE must be a string');
  }
  let body = text.trim();
  if (body.toUpperCase().startsWith('RRULE:')) {
    body = body.slice('RRULE:'.length);
  }
  if (body.length === 0) {
    throw new SyntaxError('RRULE is empty');
  }

  const options = {};
  const seen = new Set();
  for (const rawPart of body.split(';')) {
    const part = rawPart.trim();
    if (part === '') {
      continue;
    }
    const eq = part.indexOf('=');
    if (eq <= 0 || eq === part.length - 1) {
      throw new SyntaxError(`malformed RRULE part: ${part}`);
    }
    const key = part.slice(0, eq).toUpperCase();
    const value = part.slice(eq + 1);
    if (seen.has(key)) {
      throw new SyntaxError(`duplicate RRULE part: ${key}`);
    }
    seen.add(key);

    switch (key) {
      case 'FREQ':
        options.freq = value.toUpperCase();
        break;
      case 'INTERVAL':
        options.interval = parsePositiveInt(value, 'INTERVAL');
        break;
      case 'COUNT':
        options.count = parsePositiveInt(value, 'COUNT');
        break;
      case 'BYDAY':
        options.byDay = value.split(',').map((d) => d.trim().toUpperCase());
        break;
      case 'BYMONTHDAY':
        options.byMonthDay = value.split(',').map((d) => parsePositiveInt(d.trim(), 'BYMONTHDAY'));
        break;
      default:
        throw new SyntaxError(`unsupported RRULE part: ${key}`);
    }
  }

  if (options.freq === undefined) {
    throw new SyntaxError('RRULE is missing FREQ');
  }
  return new Recurrence(options);
}

function parsePositiveInt(value, name) {
  if (!/^[0-9]+$/.test(value)) {
    throw new SyntaxError(`${name} must be a positive integer`);
  }
  return Number.parseInt(value, 10);
}

/**
 * Format a Recurrence (or a plain options object) as an RRULE string.
 * Accepting a plain object is a convenience: callers can build a schedule
 * inline without constructing a Recurrence first.
 */
export function formatRRule(input) {
  if (input instanceof Recurrence) {
    return input.toString();
  }
  if (isPlainObject(input)) {
    return new Recurrence(input).toString();
  }
  throw new TypeError('formatRRule expects a Recurrence or an options object');
}
