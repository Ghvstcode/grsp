import { useState, useEffect, useRef } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { useSaveAuth } from "@core/api/useAuth";
import { config } from "@core/config";

interface WelcomeStepProps {
    onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
    const saveAuth = useSaveAuth();
    const stateRef = useRef<string>("");
    const unlistenRef = useRef<(() => void) | undefined>(undefined);
    const [status, setStatus] = useState<
        "idle" | "opening" | "waiting" | "error"
    >("idle");
    const [errorMessage, setErrorMessage] = useState<string>("");
    const [showManualInput, setShowManualInput] = useState(false);
    const [manualUrl, setManualUrl] = useState("");

    useEffect(() => {
        const setupListener = async () => {
            try {
                unlistenRef.current = await onOpenUrl((urls) => {
                    for (const url of urls) {
                        handleDeepLink(url);
                    }
                });
            } catch (e) {
                // Deep link listener may fail in dev if scheme isn't registered yet.
                // Auth will still work once the scheme registers after a full build.
                console.warn("Deep link listener setup failed:", e);
            }
        };

        void setupListener();

        return () => {
            unlistenRef.current?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function handleDeepLink(url: string) {
        try {
            const parsed = new URL(url);

            // Expect: sustn://auth/callback?access_token=...&github_id=...&...
            if (parsed.hostname !== "auth" || parsed.pathname !== "/callback") {
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
                console.error("Missing required auth params from deep link");
                setStatus("error");
                setErrorMessage(
                    "Incomplete auth data received. Please try again.",
                );
                return;
            }

            saveAuth.mutate(
                {
                    githubId: Number(githubId),
                    username,
                    avatarUrl: avatarUrl ?? undefined,
                    email: email ?? undefined,
                    accessToken,
                },
                {
                    onSuccess: () => onNext(),
                    onError: (err: Error) => {
                        setStatus("error");
                        setErrorMessage(`Failed to save auth: ${err.message}`);
                    },
                },
            );
        } catch (e) {
            console.error("Failed to parse deep link URL:", e);
            setStatus("error");
            setErrorMessage("Failed to process auth callback.");
        }
    }

    async function handleSignIn() {
        try {
            setStatus("opening");
            setErrorMessage("");

            // Generate random state for CSRF protection
            const state = crypto.randomUUID();
            stateRef.current = state;

            const authUrl = `${config.authServerUrl}/auth/github?state=${state}`;
            await openUrl(authUrl);

            // Browser opened successfully — now waiting for deep link callback
            setStatus("waiting");
        } catch (error) {
            console.error("Failed to open auth URL:", error);
            setStatus("error");
            setErrorMessage(
                `Could not open browser: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    return (
        <div className="flex flex-col items-center text-center gap-6">
            {/* Logo */}
            <div className="animate-fade-in-up">
                <svg
                    width="48"
                    height="48"
                    viewBox="0 0 42 42"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="animate-slow-spin"
                >
                    <path
                        d="M24.3012 1.73511V19.0934M24.3012 36.4518V19.0934M36.5754 6.81925L12.027 31.3676M24.3012 19.0934L6.94287 19.0934M36.5754 31.3676L12.027 6.81925"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </div>

            {/* Brand */}
            <h1 className="text-4xl font-bold tracking-tight text-foreground animate-fade-in-up delay-100">
                sustn
            </h1>

            {/* Tagline */}
            <p className="text-muted-foreground font-mono text-sm tracking-widest uppercase animate-fade-in-up delay-200">
                Ship while you sleep.
            </p>

            {/* Action */}
            <div className="mt-6 animate-fade-in-up delay-500">
                {status === "waiting" ? (
                    <div className="flex flex-col items-center gap-4">
                        <p className="text-sm text-muted-foreground max-w-xs">
                            A browser window has opened for you to sign in with
                            GitHub. Come back here once you're done — this page
                            will update automatically.
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleSignIn()}
                        >
                            Open browser again
                        </Button>
                        {showManualInput ? (
                            <div className="flex flex-col items-center gap-2 w-full max-w-sm">
                                <Input
                                    placeholder="Paste sustn-dev://auth/callback?... URL"
                                    value={manualUrl}
                                    onChange={(e) =>
                                        setManualUrl(e.target.value)
                                    }
                                    className="text-xs"
                                />
                                <Button
                                    size="sm"
                                    disabled={!manualUrl.trim()}
                                    onClick={() =>
                                        handleDeepLink(manualUrl.trim())
                                    }
                                >
                                    Submit
                                </Button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
                                onClick={() => setShowManualInput(true)}
                            >
                                Deep link not working? Paste callback URL
                            </button>
                        )}
                    </div>
                ) : (
                    <Button
                        size="lg"
                        className="gap-2 px-8"
                        onClick={() => void handleSignIn()}
                        disabled={saveAuth.isPending || status === "opening"}
                    >
                        <svg
                            className="h-5 w-5"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                        >
                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                        </svg>
                        {saveAuth.isPending
                            ? "Signing in..."
                            : status === "opening"
                              ? "Opening..."
                              : "Sign in with GitHub"}
                    </Button>
                )}
            </div>

            {/* Errors */}
            {status === "error" && errorMessage && (
                <p className="text-sm text-destructive max-w-sm animate-fade-in-up">
                    {errorMessage}
                </p>
            )}

            {saveAuth.isError && (
                <p className="text-sm text-destructive animate-fade-in-up">
                    Failed to save authentication. Please try again.
                </p>
            )}
        </div>
    );
}
