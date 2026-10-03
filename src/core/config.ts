export const config = {
    dbUrl: "sqlite:sustn.db",
    authServerUrl:
        (import.meta.env.VITE_AUTH_SERVER_URL as string | undefined) ??
        "https://api.sustn.app",
} as const;
