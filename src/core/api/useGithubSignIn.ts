import { useCallback, useEffect, useRef, useState } from "react";
import { useSaveAuth } from "@core/api/useAuth";
import { config } from "@core/config";
import { onDeepLink, openExternal } from "@core/services/platform";

type SignInStatus = "idle" | "opening" | "waiting" | "error";

/**
 * GitHub sign-in through the grsp server: opens the browser, then waits for
 * the `grsp://auth/callback?...` deep link and stores the account.
 */
export function useGithubSignIn(onSignedIn?: () => void) {
    const saveAuth = useSaveAuth();
    const stateRef = useRef<string>("");
    const onSignedInRef = useRef(onSignedIn);
    onSignedInRef.current = onSignedIn;
    const [status, setStatus] = useState<SignInStatus>("idle");
    const [errorMessage, setErrorMessage] = useState<string>("");

    const { mutate: saveAuthMutate } = saveAuth;

    const handleDeepLink = useCallback(
        (url: string) => {
            try {
                const parsed = new URL(url);

                // Expect: grsp://auth/callback?access_token=...&github_id=...&...
                if (
                    parsed.hostname !== "auth" ||
                    parsed.pathname !== "/callback"
                ) {
                    return;
                }

                const params = parsed.searchParams;
                const state = params.get("state");

                // Validate state matches what we sent
                if (state && stateRef.current && state !== stateRef.current) {
                    console.warn("OAuth state mismatch");
                    setStatus("error");
                    setErrorMessage("OAuth state mismatch. Please try again.");
                    return;
                }

                const accessToken = params.get("access_token");
                const githubId = params.get("github_id");
                const username = params.get("username");
                const avatarUrl = params.get("avatar_url");
                const email = params.get("email");

                if (!accessToken || !githubId || !username) {
                    console.error(
                        "Missing required auth params from deep link",
                    );
                    setStatus("error");
                    setErrorMessage(
                        "Incomplete auth data received. Please try again.",
                    );
                    return;
                }

                saveAuthMutate(
                    {
                        githubId: Number(githubId),
                        username,
                        avatarUrl: avatarUrl ?? undefined,
                        email: email ?? undefined,
                        accessToken,
                    },
                    {
                        onSuccess: () => {
                            setStatus("idle");
                            onSignedInRef.current?.();
                        },
                        onError: (err: Error) => {
                            setStatus("error");
                            setErrorMessage(
                                `Failed to save auth: ${err.message}`,
                            );
                        },
                    },
                );
            } catch (e) {
                console.error("Failed to parse deep link URL:", e);
                setStatus("error");
                setErrorMessage("Failed to process auth callback.");
            }
        },
        [saveAuthMutate],
    );

    useEffect(() => onDeepLink(handleDeepLink), [handleDeepLink]);

    const signIn = useCallback(async () => {
        try {
            setStatus("opening");
            setErrorMessage("");

            // Generate random state for CSRF protection
            const state = crypto.randomUUID();
            stateRef.current = state;

            await openExternal(
                `${config.authServerUrl}/auth/github?state=${state}`,
            );

            // Browser opened successfully — now waiting for deep link callback
            setStatus("waiting");
        } catch (error) {
            console.error("Failed to open auth URL:", error);
            setStatus("error");
            setErrorMessage(
                `Could not open browser: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }, []);

    return {
        status,
        errorMessage,
        isSaving: saveAuth.isPending,
        signIn,
        /** For when the deep link doesn't fire: paste the callback URL. */
        submitCallbackUrl: handleDeepLink,
        cancel: () => setStatus("idle"),
    };
}
