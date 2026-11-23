import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, request } from "@/shared/api/client";

export interface LinkSession {
    member: { id: string; name: string; avatar: string | null };
    /** The GitHub username already linked to this member, if any. */
    github: string | null;
}

const SESSION_KEY = ["link-session"] as const;

/**
 * `null` means "not signed in" (a 401 is an answer, not a failure), so the
 * page can show the sign-in button instead of an error.
 */
export const useLinkSession = () =>
    useQuery<LinkSession | null>({
        queryKey: SESSION_KEY,
        queryFn: async () => {
            try {
                return await request<LinkSession>("/link/me");
            } catch (error) {
                if (error instanceof ApiError && error.status === 401) return null;
                throw error;
            }
        },
        retry: false,
        staleTime: 30_000,
    });

export const useLinkGithub = () => {
    const queryClient = useQueryClient();

    return useMutation<{ github: string }, ApiError, string>({
        mutationFn: (username) =>
            request<{ github: string }>("/link/github", { method: "POST", body: { username } }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_KEY }),
    });
};

export const useLinkLogout = () => {
    const queryClient = useQueryClient();

    return useMutation<void, ApiError, void>({
        mutationFn: () => request<void>("/link/logout", { method: "POST" }),
        onSuccess: () => queryClient.setQueryData(SESSION_KEY, null),
    });
};
