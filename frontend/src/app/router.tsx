import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppLayout } from "@/app/layout/AppLayout";
import { NotFoundPage } from "@/app/pages/NotFoundPage";
import { LeaderboardPage } from "@/features/leaderboard/pages/LeaderboardPage";
import { DEFAULT_ORG } from "@/shared/lib/org";

export const router = createBrowserRouter([
    {
        path: "/",
        element: <AppLayout />,
        children: [
            // The site opens directly on the club's leaderboard.
            { index: true, element: <Navigate to={`/leaderboard/${DEFAULT_ORG}`} replace /> },
            { path: "leaderboard/:org", element: <LeaderboardPage /> },
            { path: "*", element: <NotFoundPage /> },
        ],
    },
]);
