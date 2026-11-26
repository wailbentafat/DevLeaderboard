import express from "express";
import helmet from "helmet";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { requestLog } from "./middleware/requestLog.js";
import leaderboardRoutes from "./routes/leaderboardRoutes.js";
import { authRouter, linkRouter } from "./routes/linkRoutes.js";

const app = express();

app.use(helmet());
app.use(express.json());
// Structured access log; LOG_LEVEL=warn silences it in tests.
app.use(requestLog);

app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});

app.use("/leaderboard", leaderboardRoutes);
app.use("/auth", authRouter);
app.use("/link", linkRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
