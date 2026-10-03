import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Bindings } from "../lib/config.js";
import { exchangeCodeForToken, fetchGitHubUser } from "../lib/github.js";
import { createDb } from "../db/index.js";
import { users } from "../db/schema.js";

const auth = new Hono<{ Bindings: Bindings }>();

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const SCOPES = "repo read:user user:email";

auth.get("/auth/github", (c) => {
    const state = c.req.query("state") ?? "";

    const params = new URLSearchParams({
        client_id: c.env.GITHUB_CLIENT_ID,
        redirect_uri: `${c.env.SERVER_URL}/auth/callback`,
        scope: SCOPES,
        state,
    });

    return c.redirect(`${GITHUB_AUTHORIZE_URL}?${params.toString()}`);
});

auth.get("/auth/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state") ?? "";

    if (!code) {
        return c.text("Missing authorization code", 400);
    }

    try {
        const db = createDb(c.env.DB);

        // Exchange code for access token
        const accessToken = await exchangeCodeForToken(
            code,
            c.env.GITHUB_CLIENT_ID,
            c.env.GITHUB_CLIENT_SECRET,
        );

        // Fetch GitHub user profile
        const githubUser = await fetchGitHubUser(accessToken);

        // Upsert user in database
        const existing = await db
            .select()
            .from(users)
            .where(eq(users.githubId, githubUser.id))
            .limit(1);

        if (existing.length > 0) {
            await db
                .update(users)
                .set({
                    githubUsername: githubUser.login,
                    githubEmail: githubUser.email,
                    githubAvatarUrl: githubUser.avatar_url,
                    lastLoginAt: new Date().toISOString(),
                })
                .where(eq(users.githubId, githubUser.id));
        } else {
            await db.insert(users).values({
                githubId: githubUser.id,
                githubUsername: githubUser.login,
                githubEmail: githubUser.email,
                githubAvatarUrl: githubUser.avatar_url,
            });
        }

        // Redirect to desktop app via deep link
        const deepLinkScheme = c.env.APP_DEEP_LINK_SCHEME ?? "sustn";
        const deepLinkParams = new URLSearchParams({
            access_token: accessToken,
            github_id: String(githubUser.id),
            username: githubUser.login,
            avatar_url: githubUser.avatar_url,
            state,
        });

        if (githubUser.email) {
            deepLinkParams.set("email", githubUser.email);
        }

        const deepLink = `${deepLinkScheme}://auth/callback?${deepLinkParams.toString()}`;

        // Return a page that triggers the deep link (better UX than raw redirect)
        return c.html(`<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>SUSTN — Authenticated</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: #fafafa;
            color: #171717;
        }
        .container {
            text-align: center;
            max-width: 480px;
            padding: 2rem;
        }
        h1 {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
        }
        p {
            color: #737373;
            margin-bottom: 1.5rem;
        }
        .btn {
            display: inline-block;
            background: #171717;
            color: #fafafa;
            padding: 0.75rem 2rem;
            border-radius: 0.5rem;
            text-decoration: none;
            font-weight: 500;
            transition: opacity 0.15s;
        }
        .btn:hover {
            opacity: 0.9;
        }
        .fallback {
            display: none;
            margin-top: 1.5rem;
            text-align: left;
        }
        .fallback p {
            font-size: 0.8rem;
            margin-bottom: 0.5rem;
        }
        .fallback input {
            width: 100%;
            padding: 0.5rem;
            border: 1px solid #d4d4d4;
            border-radius: 0.375rem;
            font-size: 0.75rem;
            font-family: monospace;
            background: #f5f5f5;
            cursor: text;
        }
        .fallback input:focus {
            outline: 2px solid #171717;
            outline-offset: 1px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Welcome to SUSTN!</h1>
        <p>You've been authenticated successfully. Click below to return to the app.</p>
        <a href="${deepLink}" class="btn" id="open-btn">Open SUSTN</a>
        <div class="fallback" id="fallback">
            <p>If the app didn't open, copy this URL and paste it in the SUSTN app:</p>
            <input type="text" value="${deepLink}" readonly onclick="this.select()" />
        </div>
    </div>
    <script>
        // Auto-open the deep link after a short delay
        setTimeout(() => { window.location.href = "${deepLink}"; }, 500);
        // Show fallback after 3 seconds if user is still on this page
        setTimeout(() => {
            document.getElementById("fallback").style.display = "block";
        }, 3000);
    </script>
</body>
</html>`);
    } catch (error) {
        console.error("Auth callback error:", error);
        return c.text("Authentication failed. Please try again.", 500);
    }
});

export { auth };
