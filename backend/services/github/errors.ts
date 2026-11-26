import type { RateLimitInfo } from "./types.js";

export interface GitHubErrorOptions {
    rateLimit?: RateLimitInfo;
    /**
     * GraphQL error `type` (FORBIDDEN, NOT_FOUND, RATE_LIMITED, ...).
     * GraphQL always answers HTTP 200, so this is often the only signal that
     * distinguishes a permission problem from a server failure.
     */
    type?: string;
}

export class GitHubError extends Error {
    readonly status: number;
    readonly type?: string;
    readonly rateLimit?: RateLimitInfo;

    constructor(message: string, status: number, options: GitHubErrorOptions = {}) {
        super(message);
        this.name = "GitHubError";
        this.status = status;
        this.type = options.type;
        this.rateLimit = options.rateLimit;
    }
}
