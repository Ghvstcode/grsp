interface GitHubTokenResponse {
    access_token: string;
    token_type: string;
    scope: string;
}

export interface GitHubUser {
    id: number;
    login: string;
    avatar_url: string;
    email: string | null;
}

interface GitHubEmail {
    email: string;
    primary: boolean;
    verified: boolean;
}

export async function exchangeCodeForToken(
    code: string,
    clientId: string,
    clientSecret: string,
): Promise<string> {
    const response = await fetch(
        "https://github.com/login/oauth/access_token",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                code,
            }),
        },
    );

    if (!response.ok) {
        throw new Error(`GitHub token exchange failed: ${response.status}`);
    }

    const data = (await response.json()) as GitHubTokenResponse;

    if (!data.access_token) {
        throw new Error("GitHub token exchange returned no access_token");
    }

    return data.access_token;
}

export async function fetchGitHubUser(
    accessToken: string,
): Promise<GitHubUser> {
    const response = await fetch("https://api.github.com/user", {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "sustn-server",
        },
    });

    if (!response.ok) {
        throw new Error(`GitHub user fetch failed: ${response.status}`);
    }

    const user = (await response.json()) as GitHubUser;

    // If no public email, fetch from emails endpoint
    if (!user.email) {
        const emailResponse = await fetch(
            "https://api.github.com/user/emails",
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: "application/vnd.github+json",
                    "User-Agent": "sustn-server",
                },
            },
        );

        if (emailResponse.ok) {
            const emails = (await emailResponse.json()) as GitHubEmail[];
            const primary = emails.find((e) => e.primary && e.verified);
            if (primary) {
                user.email = primary.email;
            }
        }
    }

    return user;
}
