import type { ReactNode } from "react";
import { Link, Outlet } from "react-router-dom";
import { DEFAULT_ORG } from "@/shared/lib/org";

/** Shared page chrome: a wordmark that links home, and the routed outlet. */
export const AppLayout = (): ReactNode => (
    <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-10 border-b border-line bg-canvas/85 backdrop-blur">
            <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-4 sm:px-6">
                <Link
                    to={`/leaderboard/${DEFAULT_ORG}`}
                    className="text-[15px] font-semibold tracking-tight"
                >
                    DevLeaderboard
                </Link>
            </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
            <Outlet />
        </main>

    </div>
);
