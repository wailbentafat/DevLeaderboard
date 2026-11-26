import mongoose from "mongoose";
import app from "./app.js";
import { config } from "./config/config.js";
import { connectDB } from "./infra/db/config/connectionDB.js";
import { refreshOrgsNow, startRefreshCron, stopRefreshCron } from "./jobs/refreshCron.js";
import { logger } from "./lib/logger.js";
import { migrateLeaderboardSnapshots } from "./models/leaderboardSnapshot.js";

await connectDB();

const removed = await migrateLeaderboardSnapshots();
if (removed > 0) {
    logger.info("removed obsolete leaderboard snapshots", { count: removed });
}

const server = app.listen(config.Port, () => {
    logger.info("server started", { port: config.Port });
});

// Only the long-lived process owns the scheduler: tests import `app` directly.
startRefreshCron();

// Populate the default org right away so the site has data before the first
// visitor. Fire-and-forget: a slow GitHub must never delay startup.
void refreshOrgsNow(config.Leaderboard.Orgs).catch((error: unknown) => {
    logger.error("initial refresh failed", { err: error });
});

const shutdown = (signal: NodeJS.Signals): void => {
    logger.info("shutdown requested", { signal });
    stopRefreshCron();

    server.close(() => {
        void mongoose
            .disconnect()
            .catch(() => undefined)
            .finally(() => process.exit(0));
    });
    // Force exit if open connections keep the server alive.
    setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
