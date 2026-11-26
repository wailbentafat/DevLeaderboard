import type { Request, Response } from "express";
import { z } from "zod";
import { config } from "../config/config.js";
import { HttpError } from "../middleware/errorHandler.js";
import {
    findSnapshot,
    findSnapshotSummaries,
} from "../models/leaderboardSnapshot.js";
import { GitHubError } from "../services/github/errors.js";
import {
    MAX_CUSTOM_DAYS,
    PERIODS,
    endOfDayUtc,
    parseDateKey,
    type CustomRange,
    type Period,
} from "../services/leaderboard/periods.js";
import { requestRefresh } from "../services/leaderboard/backgroundRefresh.js";
import { getDevRoster } from "../services/roster/devRoster.js";
import { syncLeaderboard } from "../services/leaderboard/sync.js";
import type { SyncResult } from "../services/leaderboard/types.js";

/** GitHub logins: alphanumerics and single inner hyphens, max 39 chars. */
const ORG_LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

const DAY_MS = 24 * 60 * 60 * 1000;

const orgParams = z.object({
    org: z
        .string()
        .trim()
        .min(1, "org is required")
        .max(39, "org must be at most 39 characters")
        .regex(ORG_LOGIN_PATTERN, "org must be a valid GitHub organization login"),
});

const dateKey = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date in YYYY-MM-DD format");

const listQuery = z.object({
    period: z.enum(PERIODS).default("month"),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
    // `global` is everyone who contributed; `dev` is the Dev department only.
    scope: z.enum(["global", "dev"]).default("global"),
    from: dateKey.optional(),
    to: dateKey.optional(),
});

const refreshQuery = z.object({
    // Omitting it refreshes the scheduled periods (month + all).
    period: z.enum(PERIODS).optional(),
    from: dateKey.optional(),
    to: dateKey.optional(),
    force: z.enum(["0", "1"]).default("0"),
});

interface ParsedRange {
    rangeKey: string;
    customRange?: CustomRange;
}

/**
 * Validates a custom range and normalizes it to UTC day boundaries. Fixed
 * periods ignore any `from`/`to` that happen to be in the URL.
 */
const parseRange = (
    period: Period,
    from: string | undefined,
    to: string | undefined,
    now: Date = new Date(),
): ParsedRange => {
    if (period !== "custom") return { rangeKey: "" };

    if (from === undefined || to === undefined) {
        throw new HttpError(400, "period=custom requires both from and to (YYYY-MM-DD)");
    }

    const fromDate = parseDateKey(from);
    const toDate = parseDateKey(to);
    if (fromDate === null || toDate === null) {
        throw new HttpError(400, "from and to must be valid dates in YYYY-MM-DD format");
    }

    if (fromDate.getTime() > toDate.getTime()) {
        throw new HttpError(400, "from must be on or before to");
    }

    if (toDate.getTime() > now.getTime()) {
        throw new HttpError(400, "to must not be in the future");
    }

    const days = Math.floor((toDate.getTime() - fromDate.getTime()) / DAY_MS) + 1;
    if (days > MAX_CUSTOM_DAYS) {
        throw new HttpError(400, `custom range must be at most ${MAX_CUSTOM_DAYS} days`);
    }

    return {
        rangeKey: `${from}_${to}`,
        customRange: { from: fromDate, to: endOfDayUtc(toDate) },
    };
};

/** 403 is only "rate limited" when the quota is actually exhausted. */
const isRateLimited = (error: GitHubError): boolean =>
    error.status === 429 ||
    (error.status === 403 && (error.rateLimit?.remaining === 0 || /rate limit/i.test(error.message)));

/** Strips the client's prefix so only GitHub's own explanation is forwarded. */
const upstreamDetail = (error: GitHubError): string =>
    error.message
        .replace(/^GitHub GraphQL error:\s*/i, "")
        .replace(/^GitHub API error \d+:\s*/i, "")
        .trim();

const withDetail = (prefix: string, error: GitHubError): string => {
    const detail = upstreamDetail(error);
    return detail.length > 0 ? `${prefix}: ${detail}` : prefix;
};

/**
 * GitHub problems are upstream problems, so they surface as 4xx/502/503 and
 * never as a 500 from our side. The response is already committed as an error
 * by the time this returns, hence the `res` parameter for Retry-After.
 */
const toHttpError = (error: GitHubError, res: Response): HttpError => {
    if (error.status === 404) return new HttpError(404, "Organization not found on GitHub");

    if (isRateLimited(error)) {
        const reset = error.rateLimit?.resetAt;
        if (reset instanceof Date) {
            const seconds = Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000));
            res.setHeader("Retry-After", String(seconds));
        }
        return new HttpError(503, "GitHub rate limit reached, try again later");
    }

    if (error.status === 401) {
        return new HttpError(502, "GitHub rejected the server token (invalid or expired)");
    }

    if (error.status === 403 || error.type === "FORBIDDEN" || error.type === "INSUFFICIENT_SCOPES") {
        return new HttpError(502, withDetail("GitHub denied access", error));
    }

    return new HttpError(502, withDetail("GitHub request failed", error));
};

export const getLeaderboard = async (req: Request, res: Response): Promise<void> => {
    const { org } = orgParams.parse(req.params);
    const { period, limit, offset, from, to, scope } = listQuery.parse(req.query);
    const { rangeKey, customRange } = parseRange(period, from, to);

    const snapshot = await findSnapshot(org, period, rangeKey);

    // Readers always get what is stored; refreshing happens in the background.
    requestRefresh(org, period, customRange);

    if (snapshot === null) {
        // Not a failure: the schedule simply has not produced this yet.
        res.status(202).json({
            org: org.toLowerCase(),
            period,
            rangeKey,
            message: "No snapshot yet, it is being built",
        });
        return;
    }

    // Global is everyone who contributed. Dev keeps only the Dev department, and
    // that is decided here, on the server: the filtered entries, totals and ranks
    // are all computed before anything is sent.
    let contributors = snapshot.contributors;
    let audience = "all";
    if (scope === "dev") {
        if (config.Mcid === undefined) {
            throw new HttpError(503, "The Dev department filter is not set up on this server.");
        }
        const roster = await getDevRoster(config.Mcid);
        audience = roster.fingerprint;
        contributors = contributors
            .filter((contributor) => roster.logins.has(contributor.login.toLowerCase()))
            .map((contributor, index) => ({ ...contributor, rank: index + 1 }));
    }

    const entries = contributors.slice(offset, offset + limit);
    // Varies with the data, the audience, the projection and the range, so a
    // stale list is never cached.
    const etag = `W/"${snapshot.generatedAt.getTime()}-${scope}-${audience}-${contributors.length}-${limit}-${offset}-${rangeKey}"`;

    res.set("ETag", etag);
    if (req.fresh) {
        res.status(304).end();
        return;
    }

    res.status(200).json({
        org: snapshot.orgLogin,
        period: snapshot.period,
        rangeKey: snapshot.rangeKey,
        generatedAt: snapshot.generatedAt,
        windowFrom: snapshot.windowFrom,
        windowTo: snapshot.windowTo,
        scope,
        total: contributors.length,
        count: entries.length,
        entries,
    });
};

export const getLeaderboardMeta = async (req: Request, res: Response): Promise<void> => {
    const { org } = orgParams.parse(req.params);

    const snapshots = await findSnapshotSummaries(org);
    const orgCreatedAt = snapshots[0]?.orgCreatedAt ?? null;

    res.status(200).json({
        org: org.toLowerCase(),
        orgCreatedAt,
        scoreWeights: config.Score,
        snapshots,
    });
};

export const refreshLeaderboard = async (req: Request, res: Response): Promise<void> => {
    const { org } = orgParams.parse(req.params);
    const { period, from, to, force } = refreshQuery.parse(req.query);

    const targets: readonly Period[] = period === undefined ? ["month", "all"] : [period];
    const results: SyncResult[] = [];

    try {
        // Sequential on purpose: each run already batches its own GitHub calls.
        for (const target of targets) {
            const { customRange } = parseRange(target, from, to);
            results.push(await syncLeaderboard(org, target, { force: force === "1", customRange }));
        }
    } catch (error) {
        if (error instanceof GitHubError) throw toHttpError(error, res);
        throw error;
    }

    // Counts would describe the whole organization, which is not public.
    res.status(200).json({
        org: org.toLowerCase(),
        results: results.map(({ entryCount: _entryCount, ...result }) => result),
    });
};
