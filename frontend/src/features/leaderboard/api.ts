import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request, type ApiError } from "@/shared/api/client";
import {
    hasSnapshot,
    type LeaderboardMeta,
    type LeaderboardResult,
    type Period,
    type Scope,
    type RefreshResponse,
} from "@/shared/api/types";
import { formatRetryDelay } from "@/shared/lib/format";
import { useToast } from "@/shared/ui/toastContext";
import { PERIOD_LABELS } from "./constants";

export interface LeaderboardParams {
    org: string;
    period: Period;
    scope: Scope;
    limit: number;
    /** Ranked contributors to skip, for server-side pagination. */
    offset: number;
    /** Only meaningful for `period: "custom"`. */
    from?: string;
    to?: string;
}

/** What to refresh; omitting the period refreshes the backend's scheduled set. */
export interface RefreshTarget {
    period?: Period;
    from?: string;
    to?: string;
}

/** 429/5xx must not silently replace a good cached snapshot with an error. */
const shouldRetry = (failureCount: number, error: unknown): boolean => {
    const status =
        error instanceof Error && "status" in error ? (error as { status: number }).status : 0;
    // Network failures (0) and 5xx are worth one retry; 4xx are deterministic.
    if (status === 0 || status >= 500) return failureCount < 1;
    return false;
};

/** A custom range is its own cache entry; fixed periods share one per org. */
const rangeKeyOf = (params: LeaderboardParams): string =>
    params.period === "custom" && params.from !== undefined && params.to !== undefined
        ? `${params.from}_${params.to}`
        : "";

const leaderboardKey = (params: LeaderboardParams): readonly unknown[] => [
    "leaderboard",
    params.org.toLowerCase(),
    params.period,
    params.scope,
    rangeKeyOf(params),
    params.limit,
    params.offset,
];

const buildQuery = (params: LeaderboardParams): string => {
    const query = new URLSearchParams({
        period: params.period,
        limit: String(params.limit),
        offset: String(params.offset),
    });

    if (params.scope !== "global") query.set("scope", params.scope);

    if (params.period === "custom" && params.from !== undefined && params.to !== undefined) {
        query.set("from", params.from);
        query.set("to", params.to);
    }

    return query.toString();
};

/**
 * Snapshot for one org+period — served from Mongo, never from GitHub.
 *
 * A 202 means the server has no snapshot yet, so the query polls until the
 * first refresh (triggered by the page) writes one.
 */
export const useLeaderboard = (params: LeaderboardParams) =>
    useQuery<LeaderboardResult>({
        queryKey: leaderboardKey(params),
        queryFn: () =>
            request<LeaderboardResult>(
                `/leaderboard/${encodeURIComponent(params.org)}?${buildQuery(params)}`,
                { etag: true },
            ),
        retry: shouldRetry,
        staleTime: 15_000,
        refetchInterval: (query) => {
            const data = query.state.data;
            return data !== undefined && !hasSnapshot(data) ? 4_000 : false;
        },
    });

/** Weights, GitHub quota and snapshot freshness for the meta panel. */
export const useLeaderboardMeta = (org: string) =>
    useQuery<LeaderboardMeta>({
        queryKey: ["leaderboard-meta", org.toLowerCase()],
        queryFn: () => request<LeaderboardMeta>(`/leaderboard/${encodeURIComponent(org)}/meta`),
        staleTime: 30_000,
        retry: shouldRetry,
    });

/**
 * Triggers a GitHub re-sync. Always sends `force=1`: an explicit refresh must
 * recompute instead of returning the cached snapshot. Costs quota and is
 * rate-limited server-side, so every outcome is surfaced as a toast.
 */
export const useRefresh = (org: string) => {
    const queryClient = useQueryClient();
    const pushToast = useToast();

    return useMutation<RefreshResponse, ApiError, RefreshTarget | undefined>({
        mutationFn: async (target) => {
            const query = new URLSearchParams({ force: "1" });

            if (target?.period !== undefined) {
                query.set("period", target.period);
                if (target.period === "custom") {
                    if (target.from !== undefined) query.set("from", target.from);
                    if (target.to !== undefined) query.set("to", target.to);
                }
            }

            return request<RefreshResponse>(
                `/leaderboard/${encodeURIComponent(org)}/refresh?${query.toString()}`,
                { method: "POST" },
            );
        },
        onSuccess: (response) => {
            // Snapshots changed: refetch the visible period and the meta panel.
            void queryClient.invalidateQueries({
                queryKey: ["leaderboard", org.toLowerCase()],
            });
            void queryClient.invalidateQueries({
                queryKey: ["leaderboard-meta", org.toLowerCase()],
            });

            const labels = response.results
                .map((result) => PERIOD_LABELS[result.period])
                .join(", ");
            pushToast(`Updated ${labels.toLowerCase()} for ${response.org}.`, "success");
        },
        onError: (error) => {
            if (error.status === 429) {
                pushToast(
                    error.retryAfterSeconds === null
                        ? "Too many refreshes. Please wait a moment and try again."
                        : `Too many refreshes. Try again in ${formatRetryDelay(error.retryAfterSeconds)}.`,
                    "error",
                );
                return;
            }

            pushToast(error.message, "error");
        },
    });
};
