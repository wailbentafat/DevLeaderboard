import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import { config } from "../config/config.js";
import type { LinkConfig } from "../config/schema.js";
import { seal, readCookie, unseal } from "../lib/session.js";
import { HttpError } from "../middleware/errorHandler.js";
import {
    authorizeUrl,
    exchangeCode,
    findLinkedGithub,
    submitGithubLink,
} from "../services/mcid/client.js";
import { parseGithubUsername } from "../services/mcid/githubUsername.js";

const STATE_COOKIE = "lb_link_state";
const SESSION_COOKIE = "lb_link_session";
const STATE_TTL_MS = 10 * 60_000;
const SESSION_TTL_MS = 60 * 60_000;

interface SessionPayload extends Record<string, unknown> {
    id: string;
    name: string;
    avatar: string | null;
}

/** The feature is off until MCID is configured; routes answer 503 instead of crashing. */
const requireLink = (): LinkConfig => {
    if (config.Link === undefined) {
        throw new HttpError(503, "Linking is not set up on this server yet.");
    }
    return config.Link;
};

const cookieOptions = (link: LinkConfig, maxAge: number) => ({
    httpOnly: true,
    sameSite: "lax" as const,
    secure: link.PublicUrl.startsWith("https://"),
    path: "/",
    maxAge,
});

const readSession = (req: Request, link: LinkConfig): SessionPayload | null =>
    unseal<SessionPayload>(readCookie(req, SESSION_COOKIE), link.SessionSecret);

export const login = (_req: Request, res: Response): void => {
    const link = requireLink();
    const state = randomBytes(24).toString("base64url");

    res.cookie(STATE_COOKIE, seal({ state }, STATE_TTL_MS, link.SessionSecret), cookieOptions(link, STATE_TTL_MS));
    res.redirect(302, authorizeUrl(link, state));
};

const callbackQuery = z.object({
    code: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    error: z.string().optional(),
});

export const callback = async (req: Request, res: Response): Promise<void> => {
    const link = requireLink();
    const { code, state, error } = callbackQuery.parse(req.query);

    const stored = unseal<{ state: string }>(readCookie(req, STATE_COOKIE), link.SessionSecret);
    res.clearCookie(STATE_COOKIE, { path: "/" });

    if (error !== undefined) {
        res.redirect(302, `/link?error=${encodeURIComponent(error)}`);
        return;
    }
    // A missing or different state means the callback was not started here.
    if (stored === null || state === undefined || stored.state !== state || code === undefined) {
        res.redirect(302, "/link?error=invalid_state");
        return;
    }

    const member = await exchangeCode(link, code);
    res.cookie(
        SESSION_COOKIE,
        seal({ ...member }, SESSION_TTL_MS, link.SessionSecret),
        cookieOptions(link, SESSION_TTL_MS),
    );
    res.redirect(302, "/link");
};

export const me = async (req: Request, res: Response): Promise<void> => {
    const link = requireLink();
    const session = readSession(req, link);
    if (session === null) throw new HttpError(401, "Not signed in");

    res.status(200).json({
        member: { id: session.id, name: session.name, avatar: session.avatar },
        github: await findLinkedGithub(link, session.id),
    });
};

const submitBody = z.object({ username: z.string().max(200) });

export const linkGithub = async (req: Request, res: Response): Promise<void> => {
    const link = requireLink();
    const session = readSession(req, link);
    if (session === null) throw new HttpError(401, "Sign in first");

    const { username: raw } = submitBody.parse(req.body);
    const parsed = parseGithubUsername(raw);
    if (!parsed.ok) throw new HttpError(400, parsed.message);

    await submitGithubLink(link, session.id, parsed.username);
    res.status(200).json({ github: parsed.username.toLowerCase() });
};

export const logout = (_req: Request, res: Response): void => {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(204).end();
};
