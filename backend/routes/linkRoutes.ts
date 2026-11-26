import express from "express";
import rateLimit from "express-rate-limit";
import { callback, linkGithub, login, logout, me } from "../controllers/linkCtrl.js";

// Sign-in redirects and submissions reach MCID, so keep a per-IP budget.
const limiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
});

/** Mounted at /auth: the MCID sign-in round trip. */
export const authRouter = express.Router();
authRouter.get("/login", limiter, login);
authRouter.get("/callback", limiter, callback);
authRouter.post("/logout", logout);

/** Mounted at /link: the signed-in member's GitHub link. */
export const linkRouter = express.Router();
linkRouter.get("/me", me);
linkRouter.post("/github", limiter, linkGithub);
