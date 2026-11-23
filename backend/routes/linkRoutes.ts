import express from "express";
import rateLimit from "express-rate-limit";
import { callback, linkGithub, login, logout, me } from "../controllers/linkCtrl.js";

const router = express.Router();

// Linking calls MCID on the project's key, so it gets its own small budget.
const submitLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts, please try again later" },
});

router.get("/login", login);
router.get("/callback", callback);
router.get("/me", me);
router.post("/github", submitLimiter, linkGithub);
router.post("/logout", logout);

export default router;
