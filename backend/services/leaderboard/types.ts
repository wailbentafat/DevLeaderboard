import type { Period, TimeWindow } from "./periods.js";

/** Weight applied to each metric when computing `score`. */
export interface ScoreWeights {
    Commit: number;
    PullRequest: number;
    Review: number;
    Issue: number;
}

/** One contributor as reported by GitHub, before filtering or ranking. */
export interface RawContributor {
    /** GitHub node ID — immutable across renames, unlike `login`. */
    key: string;
    login: string;
    avatarUrl: string;
    commits: number;
    pullRequests: number;
    reviews: number;
    issues: number;
}

export interface LeaderboardEntry extends RawContributor {
    score: number;
    rank: number;
}

export interface CollectResult {
    contributors: RawContributor[];
    warnings: string[];
    /** The full requested window (before yearly chunking). */
    window: TimeWindow;
    /** Organization creation date, stored with every snapshot. */
    orgCreatedAt: Date;
}

export interface SnapshotContributor {
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

export interface SyncResult {
    orgLogin: string;
    period: Period;
    /** `""` for fixed periods, `YYYY-MM-DD_YYYY-MM-DD` for custom. */
    rangeKey: string;
    generatedAt: Date;
    windowFrom: Date;
    windowTo: Date;
    entryCount: number;
    warnings: string[];
    /** True when the cached snapshot was still fresh and GitHub was not called. */
    skipped: boolean;
}
