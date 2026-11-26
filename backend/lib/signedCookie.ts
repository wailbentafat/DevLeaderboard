import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal signed cookies: `<base64url json>.<base64url hmac>`. The payload
 * carries its own expiry, so a stolen or stale cookie stops working on its own.
 */

const sign = (body: string, secret: string): string =>
    createHmac("sha256", secret).update(body).digest("base64url");

export const seal = (payload: Record<string, unknown>, ttlMs: number, secret: string): string => {
    const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString(
        "base64url",
    );
    return `${body}.${sign(body, secret)}`;
};

/** The payload, or null when the cookie is missing, forged or expired. */
export const unseal = <T extends Record<string, unknown>>(
    value: string | undefined,
    secret: string,
): T | null => {
    if (value === undefined) return null;

    const [body, signature] = value.split(".");
    if (body === undefined || signature === undefined) return null;

    const expected = Buffer.from(sign(body, secret));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

    try {
        const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & {
            exp?: unknown;
        };
        if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;
        return parsed;
    } catch {
        return null;
    }
};

/** Reads one cookie from a raw `Cookie` header (no cookie-parser dependency). */
export const readCookie = (header: string | undefined, name: string): string | undefined => {
    if (header === undefined) return undefined;
    for (const part of header.split(";")) {
        const index = part.indexOf("=");
        if (index === -1) continue;
        if (part.slice(0, index).trim() !== name) continue;
        try {
            return decodeURIComponent(part.slice(index + 1).trim());
        } catch {
            return undefined;
        }
    }
    return undefined;
};
