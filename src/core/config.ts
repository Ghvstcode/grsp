export const config = {
    dbUrl: "sqlite:grsp.db",
    authServerUrl:
        (import.meta.env.VITE_AUTH_SERVER_URL as string | undefined) ??
        "https://api.grsp.app",
    siteUrl: "https://grsp.app",
    docsUrl: "https://grsp.app/docs",
    issuesUrl: "https://github.com/ghvstcode/grsp/issues",
} as const;
