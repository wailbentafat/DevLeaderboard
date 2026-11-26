/**
 * DTOs mirroring the backend's JSON responses.
 *
 * These are hand-written on purpose: the API is small and stable, and
 * generated clients add a build step without catching more than these do.
 * Every field here has been verified against a live backend response.
 */

/** `global` is everyone who contributed; `dev` is the Dev department only. */
export const SCOPES = ["global", "dev"] as const;
export type Scope = (typeof SCOPES)[number];

export type Period = "month" | "all" | "custom";

export const PERIODS: readonly Period[] = ["month", "all", "custom"] as const;

/** One ranked contributor as stored in a snapshot. */
export interface LeaderboardEntry {
    key: string;
    login: string;
    avatarUrl: string;
    commits: number;
    pullRequests: number;
    reviews: number;
    issues: number;
    score: number;
    rank: number;
}

/** 200 response of GET /leaderboard/:org — served from Mongo, never GitHub. */
export interface LeaderboardSnapshot {
    org: string;
    period: Period;
    /** `""` for fixed periods; `YYYY-MM-DD_YYYY-MM-DD` for a custom range. */
    rangeKey: string;
    generatedAt: string;
    windowFrom: string;
    windowTo: string;
    total: number;
    count: number;
    entries: LeaderboardEntry[];
}

/** 202 response — the schedule has not produced a snapshot yet. */
export interface NoSnapshotYet {
    org: string;
    period: Period;
    rangeKey: string;
    message: string;
}

export type LeaderboardResult = LeaderboardSnapshot | NoSnapshotYet;

/** Narrow helper: a 202 payload has no entries, a 200 payload does. */
export const hasSnapshot = (result: LeaderboardResult): result is LeaderboardSnapshot =>
    "entries" in result;

export interface ScoreWeights {
    Commit: number;
    PullRequest: number;
    Review: number;
    Issue: number;
}

export interface SnapshotSummary {
    period: Period;
    rangeKey: string;
    orgCreatedAt: string;
    windowFrom: string;
    windowTo: string;
    generatedAt: string;
}

/** GET /leaderboard/:org/meta */
export interface LeaderboardMeta {
    org: string;
    orgCreatedAt: string | null;
    scoreWeights: ScoreWeights;
    snapshots: SnapshotSummary[];
}

/** One period's outcome from a refresh run. */
export interface SyncResult {
    orgLogin: string;
    period: Period;
    rangeKey: string;
    generatedAt: string;
    windowFrom: string;
    windowTo: string;
    warnings: string[];
    /** True when a fresh cached snapshot was served without calling GitHub. */
    skipped: boolean;
}

/** POST /leaderboard/:org/refresh */
export interface RefreshResponse {
    org: string;
    results: SyncResult[];
}

/** Field-level validation issue attached to a 400. */
export interface ValidationIssue {
    path: string;
    message: string;
}

/** The only error shape the backend emits: { error, details? }. */
export interface ErrorBody {
    error: string;
    details?: ValidationIssue[];
}
