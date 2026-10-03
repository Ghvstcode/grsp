import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@core/store/auth-store";
import { useClearAuth } from "@core/api/useAuth";
import { usePreflightChecks } from "@core/api/usePreflightChecks";
import { useAppVersion } from "@core/api/useAppVersion";
import { CheckCircle2, XCircle, LogOut } from "lucide-react";

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
    return (
        <div className="flex items-center gap-2">
            {ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            ) : (
                <XCircle className="h-3.5 w-3.5 text-destructive" />
            )}
            <span className="text-sm text-foreground">{label}</span>
        </div>
    );
}

export function AccountSection() {
    const navigate = useNavigate();
    const user = useAuthStore((s) => s.user);
    const { mutate: clearAuth, isPending } = useClearAuth();
    const { data: preflight } = usePreflightChecks();
    const { data: appVersion } = useAppVersion();

    function handleSignOut() {
        clearAuth(undefined, {
            onSuccess: () => navigate("/onboarding"),
        });
    }

    return (
        <div>
            <div
                className="animate-fade-in-up"
                style={{ animationDelay: "0ms" }}
            >
                <h1 className="text-lg font-semibold text-foreground">
                    Account
                </h1>
                <p className="mt-1 text-[13px] text-muted-foreground">
                    Your profile and connected services.
                </p>
            </div>

            <div className="mt-6">
                {/* User info */}
                <div
                    className="animate-fade-in-up border-b border-border pb-5"
                    style={{ animationDelay: "50ms" }}
                >
                    <div className="flex items-center gap-3">
                        {user?.avatarUrl ? (
                            <img
                                src={user.avatarUrl}
                                alt={user.username}
                                className="h-10 w-10 rounded-full"
                            />
                        ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium">
                                {user?.username?.charAt(0).toUpperCase() ?? "?"}
                            </div>
                        )}
                        <div>
                            <p className="text-sm font-medium text-foreground">
                                {user?.username ?? "User"}
                            </p>
                            {user?.email && (
                                <p className="text-[13px] text-muted-foreground">
                                    {user.email}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* GitHub connection */}
                <div
                    className="animate-fade-in-up border-b border-border py-5"
                    style={{ animationDelay: "100ms" }}
                >
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                        GitHub CLI integration
                    </p>
                    <StatusBadge
                        ok={!!preflight?.gh.installed}
                        label={
                            preflight?.gh.installed
                                ? `GitHub CLI is installed${user?.username ? ` — signed in as ${user.username}` : ""}`
                                : "GitHub CLI is not installed"
                        }
                    />
                </div>

                {/* Claude Code CLI */}
                <div
                    className="animate-fade-in-up border-b border-border py-5"
                    style={{ animationDelay: "150ms" }}
                >
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                        Claude Code CLI
                    </p>
                    <div className="space-y-2">
                        <StatusBadge
                            ok={!!preflight?.claude.installed}
                            label={
                                preflight?.claude.installed
                                    ? `Claude Code is installed${preflight.claude.version ? ` (${preflight.claude.version})` : ""}`
                                    : "Claude Code is not installed"
                            }
                        />
                        <StatusBadge
                            ok={!!preflight?.claudeAuth.authenticated}
                            label={
                                preflight?.claudeAuth.authenticated
                                    ? "Authenticated and ready"
                                    : "Not authenticated — run `claude login`"
                            }
                        />
                    </div>
                </div>

                {/* Sign out */}
                <div
                    className="animate-fade-in-up pt-5"
                    style={{ animationDelay: "200ms" }}
                >
                    <p className="mb-3 text-[13px] text-muted-foreground">
                        Sign out of SUSTN. Your local data will be preserved.
                    </p>
                    <button
                        type="button"
                        onClick={handleSignOut}
                        disabled={isPending}
                        className="flex items-center gap-2 rounded-md border border-border px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    >
                        <LogOut className="h-3 w-3" />
                        {isPending ? "Signing out..." : "Sign out"}
                    </button>
                </div>

                {/* App version */}
                {appVersion && (
                    <div
                        className="animate-fade-in-up border-t border-border mt-5 pt-5"
                        style={{ animationDelay: "250ms" }}
                    >
                        <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
                            App version
                        </p>
                        <p className="text-sm text-foreground">
                            SUSTN v{appVersion}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
