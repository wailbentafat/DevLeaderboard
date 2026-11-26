import { logger } from "../../lib/logger.js";
import type { CustomRange, Period } from "./periods.js";
import { rangeKeyFor } from "./periods.js";
import { syncLeaderboard } from "./sync.js";

/** After a failed run, leave the target alone for this long (protects quota). */
const FAILURE_COOLDOWN_MS = 5 * 60_000;
/** Upper bound on simultaneous GitHub collections started from reads. */
const MAX_CONCURRENT = 2;

const lastFailure = new Map<string, number>();
const running = new Set<string>();

/**
 * Keeps snapshots current without ever blocking a read.
 *
 * Called on every leaderboard read. `syncLeaderboard` already skips work while
 * the stored snapshot is fresh, so this is cheap when nothing is due. When a
 * snapshot is missing or stale, one background run is started; readers keep
 * getting the stored data (or a 202) until it lands. Runs are deduplicated,
 * capped, and paused after a failure so a broken token or an exhausted quota
 * cannot be hammered by page loads.
 */
export const requestRefresh = (
    orgLogin: string,
    period: Period,
    customRange?: CustomRange,
): void => {
    const key = `${orgLogin.toLowerCase()}:${period}:${rangeKeyFor(period, customRange)}`;

    if (running.has(key) || running.size >= MAX_CONCURRENT) return;

    const failedAt = lastFailure.get(key);
    if (failedAt !== undefined && Date.now() - failedAt < FAILURE_COOLDOWN_MS) return;

    running.add(key);
    void syncLeaderboard(orgLogin, period, { customRange })
        .then(() => {
            lastFailure.delete(key);
        })
        .catch((error: unknown) => {
            lastFailure.set(key, Date.now());
            logger.error("background refresh failed", { key, err: error });
        })
        .finally(() => {
            running.delete(key);
        });
};
