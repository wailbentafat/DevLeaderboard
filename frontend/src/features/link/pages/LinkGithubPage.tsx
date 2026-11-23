import { useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError } from "@/shared/api/client";
import { Button } from "@/shared/ui/Button";
import { ErrorState, Skeleton } from "@/shared/ui/States";
import { useLinkGithub, useLinkLogout, useLinkSession } from "../api";

/** What the sign-in redirect reports when it comes back with ?error=. */
const SIGN_IN_ERRORS: Record<string, string> = {
    access_denied: "You are not allowed to sign in here.",
    insufficient_roles: "Your Discord roles do not allow you to use this page.",
    invalid_state: "That sign-in did not start here. Please try again.",
};

const Card = ({ children }: { children: ReactNode }): ReactNode => (
    <div className="mx-auto w-full max-w-md rounded-xl border border-line bg-surface p-6">
        {children}
    </div>
);

export const LinkGithubPage = (): ReactNode => {
    const [searchParams] = useSearchParams();
    const session = useLinkSession();
    const link = useLinkGithub();
    const logout = useLinkLogout();
    const [username, setUsername] = useState("");

    const signInError = searchParams.get("error");

    const handleSubmit = (event: FormEvent): void => {
        event.preventDefault();
        link.mutate(username);
    };

    if (session.isPending) {
        return (
            <Card>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="mt-4 h-10 w-full" />
            </Card>
        );
    }

    if (session.isError) {
        return (
            <ErrorState
                title="Linking is not available"
                description={
                    session.error instanceof ApiError
                        ? session.error.message
                        : "Something went wrong. Please try again."
                }
                action={<Button onClick={() => void session.refetch()}>Try again</Button>}
            />
        );
    }

    if (session.data === null) {
        return (
            <Card>
                <h1 className="text-xl font-semibold tracking-tight">Link your GitHub</h1>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    Sign in with your Micro Club account so we know which Discord member you are,
                    then tell us your GitHub username. That is how your contributions reach the
                    Dev leaderboard.
                </p>
                {signInError !== null && (
                    <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-ink">
                        {SIGN_IN_ERRORS[signInError] ?? "Sign-in failed. Please try again."}
                    </p>
                )}
                <a
                    href="/api/link/login"
                    className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg bg-accent-600 px-4 text-sm font-medium text-white transition-colors hover:bg-accent-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
                >
                    Sign in with Micro Club
                </a>
            </Card>
        );
    }

    const { member, github } = session.data;
    const justLinked = link.isSuccess ? link.data.github : null;
    const current = justLinked ?? github;

    return (
        <Card>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">Link your GitHub</h1>
                    <p className="mt-1 text-sm text-ink-muted">Signed in as {member.name}</p>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    loading={logout.isPending}
                    onClick={() => logout.mutate()}
                >
                    Sign out
                </Button>
            </div>

            {current !== null && (
                <p
                    role="status"
                    className="mt-5 rounded-lg bg-accent-950 px-3 py-2 text-sm text-ink"
                >
                    {justLinked !== null ? "Linked: " : "Currently linked: "}
                    <span className="font-medium">{current}</span>
                </p>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-3" noValidate>
                <label htmlFor="github-username" className="block text-sm font-medium">
                    {current === null ? "GitHub username" : "Change your GitHub username"}
                </label>
                <div className="flex h-10 items-center overflow-hidden rounded-lg border border-line bg-canvas focus-within:outline-2 focus-within:outline-accent-500">
                    <span className="select-none pl-3 text-sm text-ink-faint">github.com/</span>
                    <input
                        id="github-username"
                        name="username"
                        value={username}
                        onChange={(event) => {
                            setUsername(event.target.value);
                            if (link.isError || link.isSuccess) link.reset();
                        }}
                        placeholder="octocat"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        maxLength={100}
                        aria-describedby="github-username-help"
                        aria-invalid={link.isError}
                        className="h-full min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-ink-faint"
                    />
                </div>
                <p id="github-username-help" className="text-xs text-ink-faint">
                    Only your username, not a link. No https:// and no github.com/.
                </p>

                {link.isError && (
                    <p role="alert" className="text-sm text-danger">
                        {link.error.message}
                    </p>
                )}

                <Button
                    type="submit"
                    loading={link.isPending}
                    disabled={username.trim().length === 0}
                    className="w-full"
                >
                    {current === null ? "Link my GitHub" : "Update"}
                </Button>
            </form>
        </Card>
    );
};
