import { useState } from "react";
import { useAuthStore } from "@core/store/auth-store";
import { useClearAuth } from "@core/api/useAuth";
import { useAppVersion } from "@core/api/useAppVersion";
import { useGithubSignIn } from "@core/api/useGithubSignIn";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { LogOut } from "lucide-react";
import { SectionHeader } from "../SectionHeader";

export function AccountSection() {
    const user = useAuthStore((s) => s.user);
    const { mutate: clearAuth, isPending } = useClearAuth();
    const { data: appVersion } = useAppVersion();
    const signIn = useGithubSignIn();
    const [showManualInput, setShowManualInput] = useState(false);
    const [manualUrl, setManualUrl] = useState("");

    return (
        <div>
            <SectionHeader
                title="Account"
                description="Your grsp account. Optional: reviews work without it."
            />

            <div className="mt-6">
                {user ? (
                    <>
                        {/* User info */}
                        <div
                            className="animate-fade-in-up border-b border-border pb-5"
                            style={{ animationDelay: "50ms" }}
                        >
                            <div className="flex items-center gap-3">
                                {user.avatarUrl ? (
                                    <img
                                        src={user.avatarUrl}
                                        alt={user.username}
                                        className="h-10 w-10 rounded-full"
                                    />
                                ) : (
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium">
                                        {user.username.charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <div>
                                    <p className="text-sm font-medium text-foreground">
                                        {user.username}
                                    </p>
                                    {user.email && (
                                        <p className="text-[13px] text-muted-foreground">
                                            {user.email}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Sign out */}
                        <div
                            className="animate-fade-in-up pt-5"
                            style={{ animationDelay: "100ms" }}
                        >
                            <p className="mb-3 text-[13px] text-muted-foreground">
                                Sign out of grsp. Your repositories and reviews
                                stay on this Mac.
                            </p>
                            <button
                                type="button"
                                onClick={() => clearAuth()}
                                disabled={isPending}
                                className="flex items-center gap-2 rounded-md border border-border px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                            >
                                <LogOut className="h-3 w-3" />
                                {isPending ? "Signing out..." : "Sign out"}
                            </button>
                        </div>
                    </>
                ) : (
                    <div
                        className="animate-fade-in-up"
                        style={{ animationDelay: "50ms" }}
                    >
                        <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
                            Sign in with GitHub to send feedback from inside the
                            app. This is separate from the GitHub CLI connection
                            under Git hosts, which is what grsp uses to read and
                            post on pull requests.
                        </p>

                        {signIn.status === "waiting" ? (
                            <div className="flex flex-col items-start gap-3">
                                <p className="text-[13px] text-muted-foreground">
                                    A browser window has opened for you to sign
                                    in with GitHub. Come back here once you're
                                    done — this page will update automatically.
                                </p>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => void signIn.signIn()}
                                    >
                                        Open browser again
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={signIn.cancel}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                                {showManualInput ? (
                                    <div className="flex w-full max-w-sm gap-2">
                                        <Input
                                            placeholder="Paste grsp://auth/callback?... URL"
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
                                                signIn.submitCallbackUrl(
                                                    manualUrl.trim(),
                                                )
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
                                        Deep link not working? Paste callback
                                        URL
                                    </button>
                                )}
                            </div>
                        ) : (
                            <Button
                                className="gap-2"
                                onClick={() => void signIn.signIn()}
                                disabled={
                                    signIn.isSaving ||
                                    signIn.status === "opening"
                                }
                            >
                                <svg
                                    className="h-4 w-4"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    aria-hidden="true"
                                >
                                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                </svg>
                                {signIn.isSaving
                                    ? "Signing in..."
                                    : signIn.status === "opening"
                                      ? "Opening..."
                                      : "Sign in with GitHub"}
                            </Button>
                        )}

                        {signIn.status === "error" && signIn.errorMessage && (
                            <p className="mt-3 text-sm text-destructive">
                                {signIn.errorMessage}
                            </p>
                        )}
                    </div>
                )}

                {/* App version */}
                {appVersion && (
                    <div
                        className="animate-fade-in-up border-t border-border mt-5 pt-5"
                        style={{ animationDelay: "150ms" }}
                    >
                        <p className="section-label mb-2">App version</p>
                        <p className="text-sm text-foreground">
                            grsp v{appVersion}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
