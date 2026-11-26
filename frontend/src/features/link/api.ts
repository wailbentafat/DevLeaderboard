import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@/shared/api/client";

export interface LinkStatus {
    /** False when the server has no MCID sign-in configured: hide the whole panel. */
    enabled: boolean;
    member: { name: string } | null;
    /** The GitHub username already linked to the signed-in member, if any. */
    github: string | null;
}

const statusKey = ["link", "me"] as const;

export const useLinkStatus = () =>
    useQuery({
        queryKey: statusKey,
        queryFn: ({ signal }) => request<LinkStatus>("/link/me", { signal }),
        staleTime: 60_000,
        retry: false,
    });

/** Sends the username to MCID, then refreshes the status and every board. */
export const useLinkGithub = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (username: string) =>
            request<{ github: string }>("/link/github", { method: "POST", body: { username } }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: statusKey });
            await queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
        },
    });
};

export const useSignOut = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: () => request<void>("/auth/logout", { method: "POST" }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: statusKey }),
    });
};
