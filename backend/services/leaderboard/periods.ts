export const PERIODS = ["month", "all", "custom"] as const;

export type Period = (typeof PERIODS)[number];

export interface TimeWindow {
    from: Date;
    to: Date;
}

/** A user-selected range, normalized to UTC day boundaries by the controller. */
export interface CustomRange {
    from: Date;
    to: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * GitHub rejects a `contributionsCollection` range longer than one year, so
 * every window is split into chunks of at most 364 days (leap-year safe).
 */
const MAX_CHUNK_DAYS = 364;

/** Longest custom range the API accepts, inclusive of both endpoints. */
export const MAX_CUSTOM_DAYS = 366;

const pad = (value: number): string => String(value).padStart(2, "0");

/** `2026-11-21` in UTC — also the storage key for a custom range. */
export const formatDateKey = (date: Date): string =>
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

/** Strict `YYYY-MM-DD` parser; returns null for impossible dates (2026-02-31). */
export const parseDateKey = (value: string): Date | null => {
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

/** First instant of the month containing `date`, in UTC. */
export const startOfMonthUtc = (date: Date): Date =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));

/** Last instant of the UTC day containing `date`. */
export const endOfDayUtc = (date: Date): Date =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));

interface WindowOptions {
    /** Required for `all`: the organization's creation date. */
    orgCreatedAt?: Date;
    /** Required for `custom`. */
    customRange?: CustomRange;
}

/**
 * Deterministic UTC window for a period.
 *
 * - `month`: the 1st of the current month at 00:00 UTC → now.
 * - `all`: organization creation → now.
 * - `custom`: the selected range, clamped to `now`.
 */
export const resolveWindow = (
    period: Period,
    now: Date,
    options: WindowOptions = {},
): TimeWindow => {
    switch (period) {
        case "month":
            return { from: startOfMonthUtc(now), to: now };

        case "all": {
            if (options.orgCreatedAt === undefined) {
                throw new Error("The all-time window requires the organization creation date");
            }
            return { from: options.orgCreatedAt, to: now };
        }

        case "custom": {
            const range = options.customRange;
            if (range === undefined) {
                throw new Error("The custom window requires a from/to range");
            }
            const to = range.to.getTime() > now.getTime() ? now : range.to;
            return { from: range.from, to };
        }
    }
};

/** Splits a window into GitHub-sized chunks, oldest first. */
export const splitWindow = (window: TimeWindow): TimeWindow[] => {
    const chunks: TimeWindow[] = [];
    let cursor = window.from.getTime();
    const end = window.to.getTime();

    if (cursor >= end) return [{ from: window.from, to: window.to }];

    while (cursor < end) {
        const next = Math.min(cursor + MAX_CHUNK_DAYS * DAY_MS, end);
        chunks.push({ from: new Date(cursor), to: new Date(next) });
        cursor = next;
    }

    return chunks;
};

/**
 * Stable snapshot key. Fixed periods use `""`; a custom range is identified by
 * its two UTC dates so the same range always maps to the same cached document.
 */
export const rangeKeyFor = (period: Period, customRange?: CustomRange): string =>
    period === "custom" && customRange !== undefined
        ? `${formatDateKey(customRange.from)}_${formatDateKey(customRange.to)}`
        : "";
