import { createHmac } from "node:crypto";
import type { LinkConfig } from "../../config/schema.js";
import { HttpError } from "../../middleware/errorHandler.js";

export interface Member extends Record<string, unknown> {
    id: string;
    name: string;
}

interface RawMember {
    id: string;
    username: string;
    globalName: string | null;
    displayName: string | null;
    preferredName: string | null;
}

const TIMEOUT_MS = 10_000;

const call = async (
    link: LinkConfig,
    path: string,
    init: { method?: "GET" | "POST"; body?: string; headers?: Record<string, string> } = {},
): Promise<Response> => {
    try {
        return await fetch(`${link.Url}${path}`, {
            method: init.method ?? "GET",
            body: init.body,
            headers: { "X-API-Key": link.ApiKey, ...init.headers },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch {
        throw new HttpError(502, "MCID is unreachable right now. Please try again in a moment.");
    }
};

export const callbackUrl = (link: LinkConfig): string => `${link.PublicUrl}/api/auth/callback`;

export const authorizeUrl = (link: LinkConfig, state: string): string => {
    const params = new URLSearchParams({
        client_id: link.ProjectId,
        redirect_uri: callbackUrl(link),
        server_id: link.ServerId,
        state,
    });
    return `${link.Url}/auth/sso/authorize?${params.toString()}`;
};

/** Trades the one-time code from the redirect for the member who signed in. */
export const exchangeCode = async (link: LinkConfig, code: string): Promise<Member> => {
    const response = await call(link, "/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            clientId: link.ProjectId,
            code,
            redirectUri: callbackUrl(link),
        }),
    });

    if (!response.ok) throw new HttpError(401, "Sign-in expired. Please sign in again.");

    const { member } = (await response.json()) as { member: RawMember };
    return {
        id: member.id,
        name: member.preferredName ?? member.displayName ?? member.globalName ?? member.username,
    };
};

/** Sends the username to the inbound webhook, signed when a secret is configured. */
export const submitGithubLink = async (
    link: LinkConfig,
    memberId: string,
    username: string,
): Promise<void> => {
    const body = JSON.stringify({ profile: { discordId: memberId, github: username } });
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (link.WebhookSecret.length > 0) {
        const t = Math.floor(Date.now() / 1000);
        const v1 = createHmac("sha256", link.WebhookSecret).update(`${t}.${body}`).digest("hex");
        headers["X-MCID-Signature"] = `t=${t},v1=${v1}`;
    }

    const response = await call(
        link,
        `/inbound-webhooks/${encodeURIComponent(link.WebhookId)}/submit`,
        { method: "POST", headers, body },
    );
    if (response.ok) return;

    switch (response.status) {
        case 409:
            throw new HttpError(409, "That GitHub account is already linked to another member.");
        case 400:
        case 422:
            throw new HttpError(400, "MCID did not accept that username. Check it and try again.");
        case 404:
            throw new HttpError(404, "Your MCID profile was not found. Sign in again.");
        case 429:
            throw new HttpError(429, "Too many attempts. Please wait a moment and try again.");
        default:
            throw new HttpError(502, "Linking is unavailable right now. Please try again later.");
    }
};

/** The GitHub username this member already linked, if any. Never throws. */
export const findLinkedGithub = async (
    link: LinkConfig,
    memberId: string,
): Promise<string | null> => {
    try {
        const response = await call(link, "/identities?provider=github");
        if (!response.ok) return null;

        const { identities } = (await response.json()) as {
            identities: Array<{ memberId: string; handle: string }>;
        };
        return identities.find((identity) => identity.memberId === memberId)?.handle ?? null;
    } catch {
        return null;
    }
};
