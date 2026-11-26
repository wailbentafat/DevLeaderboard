import { randomBytes } from "node:crypto";
import type { CookieOptions, Request, RequestHandler, Response } from "express";
import { config } from "../config/config.js";
import type { LinkConfig } from "../config/schema.js";
import { parseGithubUsername } from "../lib/githubUsername.js";
import { readCookie, seal, unseal } from "../lib/signedCookie.js";
import { HttpError } from "../middleware/errorHandler.js";
import {
    authorizeUrl,
    exchangeCode,
    findLinkedGithub,
    submitGithubLink,
    type Member,
} from "../services/link/mcidLink.js";
import { invalidateDevRoster } from "../services/roster/devRoster.js";

const STATE_COOKIE = "lb_state";
const SESSION_COOKIE = "lb_session";
const STATE_TTL_MS = 10 * 60_000;
const SESSION_TTL_MS = 60 * 60_000;

const requireLink = (): LinkConfig => {
    if (config.Link === undefined) {
        throw new HttpError(503, "Linking your GitHub is not set up on this server.");
    }
    return config.Link;
};

const cookieOptions = (link: LinkConfig, maxAgeMs: number): CookieOptions => ({
    httpOnly: true,
    sameSite: "lax",
    secure: link.PublicUrl.startsWith("https://"),
    path: "/",
    maxAge: maxAgeMs,
});

/** Only a same-site path may be returned to; anything else falls back to the site root. */
export const safeReturnPath = (value: unknown): string => {
    if (typeof value !== "string") return "/";
    if (value.length === 0 || value.length > 500) return "/";
    if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
    if (/[\u0000-\u001f]/.test(value)) return "/";
    return value;
};

const backTo = (link: LinkConfig, returnTo: string, extra: Record<string, string>): string => {
    const url = new URL(returnTo, link.PublicUrl);
    for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
    return url.toString();
};

const readSession = (req: Request, link: LinkConfig): Member | null =>
    unseal<Member>(readCookie(req.headers.cookie, SESSION_COOKIE), link.SessionSecret);

export const login: RequestHandler = (req, res) => {
    const link = requireLink();
    const state = randomBytes(24).toString("base64url");
    const returnTo = safeReturnPath(req.query.return);

    res.cookie(
        STATE_COOKIE,
        seal({ state, returnTo }, STATE_TTL_MS, link.SessionSecret),
        cookieOptions(link, STATE_TTL_MS),
    );
    res.redirect(302, authorizeUrl(link, state));
};

export const callback: RequestHandler = async (req, res) => {
    const link = requireLink();
    const stored = unseal<{ state: string; returnTo: string }>(
        readCookie(req.headers.cookie, STATE_COOKIE),
        link.SessionSecret,
    );
    // The state is single-use whatever the outcome.
    res.clearCookie(STATE_COOKIE, { path: "/" });

    const returnTo = safeReturnPath(stored?.returnTo);
    const fail = (reason: string): void => {
        res.redirect(302, backTo(link, returnTo, { link_error: reason }));
    };

    if (typeof req.query.error === "string") return fail("denied");

    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;
    // A missing or different state means the callback was not started here.
    if (stored === null || code === null || state === null || stored.state !== state) {
        return fail("invalid_state");
    }

    try {
        const member = await exchangeCode(link, code);
        res.cookie(
            SESSION_COOKIE,
            seal({ ...member }, SESSION_TTL_MS, link.SessionSecret),
            cookieOptions(link, SESSION_TTL_MS),
        );
        res.redirect(302, backTo(link, returnTo, { link: "1" }));
    } catch {
        fail("sign_in_failed");
    }
};

export const logout: RequestHandler = (_req, res: Response) => {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(204).end();
};

/** Who is signed in and which GitHub account they already linked. */
export const me: RequestHandler = async (req, res) => {
    const link = config.Link;
    if (link === undefined) {
        res.json({ enabled: false, member: null, github: null });
        return;
    }

    const member = readSession(req, link);
    if (member === null) {
        res.json({ enabled: true, member: null, github: null });
        return;
    }

    const github = await findLinkedGithub(link, member.id);
    res.json({ enabled: true, member: { name: member.name }, github });
};

export const linkGithub: RequestHandler = async (req, res) => {
    const link = requireLink();

    const member = readSession(req, link);
    if (member === null) throw new HttpError(401, "Sign in first.");

    // A cross-site form cannot send JSON, so this also blocks forged posts.
    if (!req.is("application/json")) throw new HttpError(415, "Expected JSON.");

    const body = req.body as { username?: unknown } | undefined;
    const raw = typeof body?.username === "string" ? body.username.slice(0, 200) : "";
    const parsed = parseGithubUsername(raw);
    if (!parsed.ok) throw new HttpError(400, parsed.message);

    await submitGithubLink(link, member.id, parsed.username);
    invalidateDevRoster();
    res.json({ github: parsed.username.toLowerCase() });
};
