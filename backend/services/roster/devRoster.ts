import { createHash } from "node:crypto";
import type { McidConfig } from "../../config/schema.js";
import { logger } from "../../lib/logger.js";
import { HttpError } from "../../middleware/errorHandler.js";

/**
 * Who is in the Dev department, according to MCID: the GitHub usernames that
 * members holding a Dev role linked to their account.
 */
export interface DevRoster {
    /** Lowercase GitHub logins. */
    logins: ReadonlySet<string>;
    /** Changes whenever the set changes, so cached responses never go stale. */
    fingerprint: string;
    fetchedAt: number;
}

const TIMEOUT_MS = 10_000;
/** After a failed refresh, serve the old list and retry no sooner than this. */
const RETRY_AFTER_FAILURE_MS = 30_000;

let cached: DevRoster | null = null;
let lastFailureAt = 0;
let inFlight: Promise<DevRoster> | null = null;

const fetchRoster = async (mcid: McidConfig): Promise<DevRoster> => {
    const { Url, ApiKey, DevRoleIds } = mcid;
    const query = new URLSearchParams({ provider: "github", roleIds: DevRoleIds.join(",") });

    const response = await fetch(`${Url}/identities?${query.toString()}`, {
        headers: { "X-API-Key": ApiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`MCID answered ${response.status}`);

    const body = (await response.json()) as { identities?: Array<{ handle?: unknown }> };
    const logins = new Set<string>();
    for (const identity of body.identities ?? []) {
        if (typeof identity.handle === "string" && identity.handle.length > 0) {
            logins.add(identity.handle.toLowerCase());
        }
    }

    const fingerprint = createHash("sha1")
        .update([...logins].sort().join(","))
        .digest("hex")
        .slice(0, 12);
    return { logins, fingerprint, fetchedAt: Date.now() };
};

/** Makes the next read ask MCID again (a member just linked an account). */
export const invalidateDevRoster = (): void => {
    if (cached !== null) cached = { ...cached, fetchedAt: 0 };
    lastFailureAt = 0;
};

/**
 * The current Dev roster. Cached, so MCID is asked once per TTL however many
 * people open the page. If MCID is down the last good list keeps being served;
 * with no list at all it fails closed (503) and never falls back to everyone.
 */
export const getDevRoster = async (mcid: McidConfig): Promise<DevRoster> => {
    const ttl = mcid.CacheTtlMs;
    const now = Date.now();

    if (cached !== null && now - cached.fetchedAt < ttl) return cached;
    if (cached === null && now - lastFailureAt < RETRY_AFTER_FAILURE_MS && lastFailureAt > 0) {
        throw new HttpError(503, "The Dev department list is unavailable right now.");
    }

    inFlight ??= fetchRoster(mcid)
        .then((roster) => {
            cached = roster;
            lastFailureAt = 0;
            return roster;
        })
        .finally(() => {
            inFlight = null;
        });

    try {
        return await inFlight;
    } catch (error) {
        lastFailureAt = Date.now();
        logger.error("could not refresh the dev roster from MCID", { err: error });

        if (cached !== null) {
            // Keep the stale list, and wait a little before asking again.
            cached = { ...cached, fetchedAt: Date.now() - ttl + RETRY_AFTER_FAILURE_MS };
            return cached;
        }
        throw new HttpError(503, "The Dev department list is unavailable right now.");
    }
};
