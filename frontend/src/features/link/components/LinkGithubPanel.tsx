import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { CheckCircle2, LogIn } from "lucide-react";
import { ApiError } from "@/shared/api/client";
import { Button } from "@/shared/ui/Button";
import { useToast } from "@/shared/ui/toastContext";
import { useLinkGithub, useLinkStatus, useSignOut } from "../api";

const ERROR_MESSAGES: Record<string, string> = {
    denied: "Sign-in was cancelled.",
    invalid_state: "That sign-in link expired. Please try again.",
    sign_in_failed: "MCID could not sign you in. Please try again.",
};

/** Sign-in leaves the site, so come back to this exact view minus our own markers. */
const returnPath = (pathname: string, search: string): string => {
    const params = new URLSearchParams(search);
    params.delete("link");
    params.delete("link_error");
    const query = params.toString();
    return query.length > 0 ? `${pathname}?${query}` : pathname;
};

/**
 * "Don't see yourself?" on the Dev tab: sign in with MCID, then link the GitHub
 * username that MCID stores for the Dev department. Hidden when the server has
 * no MCID sign-in configured.
 */
export const LinkGithubPanel = (): ReactNode => {
    const status = useLinkStatus();
    const linkGithub = useLinkGithub();
    const signOut = useSignOut();
    const toast = useToast();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [username, setUsername] = useState("");
    const [error, setError] = useState<string | null>(null);

    // The callback returns with ?link=1 (or ?link_error=…): show the result, then
    // drop the marker so a refresh does not repeat it.
    const callbackError = searchParams.get("link_error");
    useEffect(() => {
        if (!searchParams.has("link") && !searchParams.has("link_error")) return;
        const params = new URLSearchParams(searchParams);
        params.delete("link");
        params.delete("link_error");
        setSearchParams(params, { replace: true });
    }, [searchParams, setSearchParams]);

    if (status.data === undefined || !status.data.enabled) return null;
    const { member, github } = status.data;

    const signIn = (): void => {
        const back = returnPath(location.pathname, location.search);
        window.location.assign(`/api/auth/login?return=${encodeURIComponent(back)}`);
    };

    const submit = (event: FormEvent): void => {
        event.preventDefault();
        setError(null);
        linkGithub.mutate(username, {
            onSuccess: (result) => {
                setUsername("");
                toast(`Linked @${result.github}. You show up once you hold the Dev role.`, "success");
            },
            onError: (failure) => {
                if (failure instanceof ApiError && failure.status === 401) {
                    void status.refetch();
                }
                setError(
                    failure instanceof ApiError
                        ? failure.message
                        : "Something went wrong. Please try again.",
                );
            },
        });
    };

    const shownError =
        error ?? (callbackError !== null ? (ERROR_MESSAGES[callbackError] ?? null) : null);

    return (
        <section
            aria-label="Link your GitHub"
            className="rounded-xl border border-line bg-surface p-4 sm:p-5"
        >
            {member === null ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-sm font-semibold">Don&apos;t see yourself here?</h2>
                        <p className="mt-1 text-sm text-ink-muted">
                            Sign in with MCID and link your GitHub username to join the Dev list.
                        </p>
                    </div>
                    <Button onClick={signIn}>
                        <LogIn size={16} aria-hidden />
                        Sign in to link GitHub
                    </Button>
                </div>
            ) : github !== null ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-2">
                        <CheckCircle2 size={18} className="mt-0.5 text-success" aria-hidden />
                        <div>
                            <h2 className="text-sm font-semibold">
                                Linked as <span className="font-mono">@{github}</span>
                            </h2>
                            <p className="mt-1 text-sm text-ink-muted">
                                Signed in as {member.name}. You appear in the Dev list while you hold
                                the Dev role. It can take a few minutes to show.
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        loading={signOut.isPending}
                        onClick={() => signOut.mutate()}
                    >
                        Sign out
                    </Button>
                </div>
            ) : (
                <form onSubmit={submit} className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h2 className="text-sm font-semibold">Link your GitHub</h2>
                            <p className="mt-1 text-sm text-ink-muted">
                                Signed in as {member.name}. Enter your GitHub username (only the
                                username, for example: octocat).
                            </p>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            loading={signOut.isPending}
                            onClick={() => signOut.mutate()}
                        >
                            Sign out
                        </Button>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            aria-label="GitHub username"
                            placeholder="octocat"
                            autoComplete="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            maxLength={200}
                            disabled={linkGithub.isPending}
                            className="h-10 flex-1 rounded-lg border border-line bg-canvas px-3 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-500"
                        />
                        <Button
                            type="submit"
                            loading={linkGithub.isPending}
                            disabled={username.trim().length === 0}
                        >
                            Link GitHub
                        </Button>
                    </div>
                </form>
            )}
            {shownError !== null && (
                <p role="alert" className="mt-3 text-sm text-danger">
                    {shownError}
                </p>
            )}
        </section>
    );
};
