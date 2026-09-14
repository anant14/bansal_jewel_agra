'use strict';

// The business operates on India's calendar day, regardless of the
// server's own timezone (Render runs in UTC). "Today's rate" must mean
// today in IST, not today in UTC — otherwise a rate entered at 9am IST
// could be misfiled as "yesterday" for several hours after midnight UTC.

/** Today's date in IST, as "YYYY-MM-DD". */
function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** A Date at UTC midnight for the given "YYYY-MM-DD" — safe for a Postgres DATE column. */
function dateOnly(isoDateString) {
  return new Date(isoDateString + 'T00:00:00.000Z');
}

/** Today's date, ready to store/query a `@db.Date` column. */
function todayISTAsDate() {
  return dateOnly(todayIST());
}

/**
 * The actual UTC instant corresponding to 00:00:00 IST today — for
 * filtering TIMESTAMP columns (e.g. createdAt). NOT the same as
 * todayISTAsDate(), which is UTC midnight and is only safe to use
 * against DATE-only columns where the clock time is discarded anyway.
 */
function startOfTodayIST() {
  return new Date(todayIST() + 'T00:00:00+05:30');
}

module.exports = { todayIST, dateOnly, todayISTAsDate, startOfTodayIST };
