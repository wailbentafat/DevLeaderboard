// GitHub logins: letters, digits and single hyphens, never at either end.
const LOGIN = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i;

export type UsernameResult = { ok: true; username: string } | { ok: false; message: string };

/**
 * The form asks for the username only. A pasted link, a path or a stray
 * "github.com" is refused with a hint instead of being cleaned up silently,
 * so nobody ends up linked to something they did not mean.
 */
export const parseGithubUsername = (input: string): UsernameResult => {
    const value = input.trim().replace(/^@/, "");

    if (value.length === 0) return { ok: false, message: "Enter your GitHub username." };

    if (/[/:.\s]/.test(value) || /github/i.test(value)) {
        return {
            ok: false,
            message:
                "Enter only your username, without https:// or github.com/ (for example: octocat).",
        };
    }

    if (!LOGIN.test(value) || value.includes("--")) {
        return {
            ok: false,
            message: "A GitHub username has only letters, numbers and single hyphens.",
        };
    }

    return { ok: true, username: value };
};
