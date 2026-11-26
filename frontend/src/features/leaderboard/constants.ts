import type { Period, Scope } from "@/shared/api/types";

export const DEFAULT_PERIOD: Period = "month";
export const DEFAULT_SCOPE: Scope = "global";

/**
 * Rows per page. The API caps `limit` at 100; paging through `offset` lets the
 * UI reach every contributor even when an organization exceeds that cap.
 */
export const PAGE_SIZE = 20;

/** Mirrors the backend's cap so the picker rejects oversized ranges locally. */
export const MAX_CUSTOM_DAYS = 366;

export const PERIOD_LABELS: Record<Period, string> = {
    month: "This month",
    all: "All time",
    custom: "Custom range",
};

export const SCOPE_LABELS: Record<Scope, string> = {
    global: "Global",
    dev: "Dev department",
};
