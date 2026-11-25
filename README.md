# recurrence-utils

Build and read recurring daily, weekly, and monthly schedules as RRULE strings.

```js
import { parseRRule, formatRRule, Recurrence } from './src/index.js';

const rule = parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE');
rule.freq;        // 'WEEKLY'
rule.interval;    // 2
rule.byDay;       // ['MO', 'WE']

formatRRule(rule);                                  // 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE'
formatRRule({ freq: 'MONTHLY', byMonthDay: [1, 15] }); // 'FREQ=MONTHLY;BYMONTHDAY=1,15'
```

## Why this exists

RRULE strings are compact and standard, but most applications only need three
frequencies and a couple of filters. Pulling in a full calendar library for that
is a lot of surface area. This library supports `FREQ` (DAILY, WEEKLY, MONTHLY),
`INTERVAL`, `COUNT`, `BYDAY`, and `BYMONTHDAY`, and rejects anything else with a
`SyntaxError` rather than silently dropping it. A schedule that quietly loses a
rule is worse than one that refuses to parse.

The trade-off: this is a description of a schedule, not a date generator. It
does not know about time zones, start dates, or `UNTIL`, and it never reads the
clock. That keeps every function pure and testable, and leaves calendar math to
the caller.

## The awkward edge

`occurrencesInMonth(daysInMonth)` is where the library makes a deliberate
choice. RRULE would skip a `BYMONTHDAY` value that does not exist in a given
month, so `BYMONTHDAY=31` simply produces nothing in February. Here, values past
the end of the month are clamped to the last day instead: the 31st becomes the
28th, 29th, or 30th as appropriate. Readable schedules almost always mean "the
31st, or the last day when there is no 31st", so clamping matches intent. If you
need strict skipping, filter the result yourself. The method takes the month
length as an argument rather than a date, so February is testable without
constructing a `Date`.

## API

- `parseRRule(text)` — parse an RRULE string (with or without the `RRULE:`
  prefix) into a `Recurrence`. Throws `SyntaxError` on malformed input and
  `RangeError` on out-of-range values.
- `formatRRule(input)` — serialise a `Recurrence` or a plain options object to a
  canonical RRULE string. Parts are emitted in a fixed order, so equal schedules
  produce identical output.
- `new Recurrence(options)` — construct directly from `{ freq, interval, count,
  byDay, byMonthDay }`. Instances are frozen.
- `Recurrence#occurrencesInMonth(daysInMonth)` — matching day numbers for a
  monthly rule, clamped as described above.
