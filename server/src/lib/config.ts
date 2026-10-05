export type Bindings = {
    DB: D1Database;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    SERVER_URL: string;
    APP_DEEP_LINK_SCHEME: string;
    /** Workers rate limiting binding; absent in local dev. */
    METRICS_LIMITER?: RateLimiter;
};

/** The Workers Rate Limiting API binding. */
export interface RateLimiter {
    limit(options: { key: string }): Promise<{ success: boolean }>;
}
