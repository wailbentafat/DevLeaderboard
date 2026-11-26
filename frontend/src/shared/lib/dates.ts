/** UTC date helpers shared by the custom-range picker and the API layer. */

const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (value: number): string => String(value).padStart(2, "0");

/** `YYYY-MM-DD` for the UTC day containing `date`. */
export const toDateKey = (date: Date): string =>
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

/** Strict parser: null for malformed or impossible dates (e.g. 2026-02-31). */
export const parseDateKey = (value: string | null | undefined): Date | null => {
    if (value === null || value === undefined) return null;

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match === null) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return date;
};

/** UTC midnight of the day containing `now`. */
export const todayUtc = (now: Date = new Date()): Date =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

export const todayKey = (now: Date = new Date()): string => toDateKey(now);

/** Inclusive number of calendar days between two parsed dates. */
export const daysBetween = (from: Date, to: Date): number =>
    Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;

export interface DateRange {
    from: string;
    to: string;
}

/** Last 30 days (inclusive) ending today — the picker's starting point. */
export const defaultCustomRange = (now: Date = new Date()): DateRange => ({
    from: toDateKey(new Date(now.getTime() - 29 * DAY_MS)),
    to: toDateKey(now),
});

export interface RangeValidation {
    range: DateRange | null;
    error: string | null;
}

/**
 * Validates a custom range against the same rules the API enforces, so the
 * user gets immediate feedback instead of a 400 round-trip.
 */
export const validateRange = (
    from: string,
    to: string,
    maxDays: number,
    now: Date = new Date(),
): RangeValidation => {
    const fromDate = parseDateKey(from);
    const toDate = parseDateKey(to);

    if (fromDate === null || toDate === null) {
        return { range: null, error: "Enter both dates in YYYY-MM-DD format." };
    }

    if (fromDate.getTime() > toDate.getTime()) {
        return { range: null, error: "The start date must be on or before the end date." };
    }

    if (toDate.getTime() > todayUtc(now).getTime()) {
        return { range: null, error: "The end date cannot be in the future." };
    }

    if (daysBetween(fromDate, toDate) > maxDays) {
        return { range: null, error: `Pick a range of at most ${maxDays} days.` };
    }

    return { range: { from, to }, error: null };
};
