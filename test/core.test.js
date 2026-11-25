import test from 'node:test';
import assert from 'node:assert/strict';

import { Recurrence, parseRRule, formatRRule } from '../src/index.js';

test('parses a minimal daily rule', () => {
  const rule = parseRRule('FREQ=DAILY');
  assert.equal(rule.freq, 'DAILY');
  assert.equal(rule.interval, 1);
  assert.equal(rule.count, null);
  assert.deepEqual(rule.byDay, []);
  assert.deepEqual(rule.byMonthDay, []);
});

test('accepts the optional RRULE: prefix and mixed case keys', () => {
  const rule = parseRRule('rrule:freq=weekly;interval=2;byday=mo,we');
  assert.equal(rule.freq, 'WEEKLY');
  assert.equal(rule.interval, 2);
  assert.deepEqual(rule.byDay, ['MO', 'WE']);
});

test('round-trips through formatRRule', () => {
  const text = 'FREQ=MONTHLY;INTERVAL=3;COUNT=4;BYMONTHDAY=1,15';
  assert.equal(formatRRule(parseRRule(text)), text);
});

test('omits INTERVAL when it is the default of 1', () => {
  assert.equal(formatRRule({ freq: 'DAILY' }), 'FREQ=DAILY');
  assert.equal(formatRRule({ freq: 'DAILY', interval: 1 }), 'FREQ=DAILY');
});

test('rejects an unknown FREQ', () => {
  assert.throws(() => parseRRule('FREQ=YEARLY'), RangeError);
});

test('rejects a duplicate part', () => {
  assert.throws(() => parseRRule('FREQ=DAILY;FREQ=WEEKLY'), SyntaxError);
});

test('rejects an unsupported part', () => {
  assert.throws(() => parseRRule('FREQ=DAILY;UNTIL=20240101'), SyntaxError);
});

test('rejects a non-numeric INTERVAL', () => {
  assert.throws(() => parseRRule('FREQ=DAILY;INTERVAL=two'), SyntaxError);
});

test('rejects an empty BYDAY entry', () => {
  assert.throws(() => parseRRule('FREQ=WEEKLY;BYDAY=MO,'), RangeError);
});

test('rejects a BYMONTHDAY outside 1..31', () => {
  assert.throws(() => parseRRule('FREQ=MONTHLY;BYMONTHDAY=0'), RangeError);
  assert.throws(() => parseRRule('FREQ=MONTHLY;BYMONTHDAY=32'), RangeError);
});

test('rejects an empty rule', () => {
  assert.throws(() => parseRRule('   '), SyntaxError);
});

test('rejects a missing FREQ', () => {
  assert.throws(() => parseRRule('INTERVAL=2'), SyntaxError);
});

test('occurrencesInMonth clamps the 31st to the month length', () => {
  const rule = parseRRule('FREQ=MONTHLY;BYMONTHDAY=15,31');
  assert.deepEqual(rule.occurrencesInMonth(31), [15, 31]);
  assert.deepEqual(rule.occurrencesInMonth(30), [15, 30]);
  assert.deepEqual(rule.occurrencesInMonth(28), [15, 28]);
});

test('occurrencesInMonth deduplicates when clamping collides', () => {
  const rule = parseRRule('FREQ=MONTHLY;BYMONTHDAY=30,31');
  assert.deepEqual(rule.occurrencesInMonth(30), [30]);
});

test('occurrencesInMonth returns nothing for non-monthly rules', () => {
  assert.deepEqual(parseRRule('FREQ=DAILY').occurrencesInMonth(31), []);
  assert.deepEqual(parseRRule('FREQ=WEEKLY;BYDAY=MO').occurrencesInMonth(31), []);
});

test('occurrencesInMonth rejects an impossible month length', () => {
  const rule = parseRRule('FREQ=MONTHLY;BYMONTHDAY=1');
  assert.throws(() => rule.occurrencesInMonth(27), RangeError);
  assert.throws(() => rule.occurrencesInMonth(32), RangeError);
});

test('constructor validates interval and count', () => {
  assert.throws(() => new Recurrence({ freq: 'DAILY', interval: 0 }), RangeError);
  assert.throws(() => new Recurrence({ freq: 'DAILY', count: 0 }), RangeError);
  assert.throws(() => new Recurrence({ freq: 'DAILY', interval: 1.5 }), TypeError);
});

test('formatRRule rejects values it cannot represent', () => {
  assert.throws(() => formatRRule(42), TypeError);
  assert.throws(() => formatRRule(null), TypeError);
});

test('frozen instances cannot be mutated', () => {
  const rule = parseRRule('FREQ=DAILY');
  assert.ok(Object.isFrozen(rule));
});
