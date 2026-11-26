/**
 * Premier-League-style rank bands: the top four are the green zone and the
 * bottom three are the red zone. Zones are computed against the full
 * leaderboard (`total`), not the current page, so colors stay stable while
 * paginating. Tiny boards skip the red zone so the two bands never overlap.
 */
export type RankZone = "top" | "bottom" | "neutral";

export const TOP_ZONE_SIZE = 4;
export const BOTTOM_ZONE_SIZE = 3;

export const rankZone = (rank: number, total: number): RankZone => {
    if (rank <= TOP_ZONE_SIZE) return "top";
    if (total > TOP_ZONE_SIZE + BOTTOM_ZONE_SIZE && rank > total - BOTTOM_ZONE_SIZE) {
        return "bottom";
    }
    return "neutral";
};
