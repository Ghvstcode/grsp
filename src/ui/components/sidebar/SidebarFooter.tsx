import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@core/store/auth-store";
import { MessageSquare, SlidersHorizontal } from "lucide-react";
import { FeedbackDialog } from "./FeedbackDialog";

export function SidebarFooter() {
    const navigate = useNavigate();
    const user = useAuthStore((s) => s.user);
    const [feedbackOpen, setFeedbackOpen] = useState(false);

    return (
        <div className="border-t border-sidebar-border px-3 py-2.5">
            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => navigate("/settings")}
                    className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                    <SlidersHorizontal
                        className="h-4 w-4 shrink-0"
                        strokeWidth={1.7}
                    />
                    Settings
                </button>
                {user && (
                    <>
                        <button
                            type="button"
                            onClick={() => setFeedbackOpen(true)}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
                            title="Send feedback"
                            aria-label="Send feedback"
                        >
                            <MessageSquare className="h-3.5 w-3.5" />
                        </button>
                        {user.avatarUrl ? (
                            <img
                                src={user.avatarUrl}
                                alt={user.username}
                                title={user.username}
                                className="h-5 w-5 shrink-0 rounded-full"
                            />
                        ) : (
                            <div
                                title={user.username}
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[9px] font-medium text-sidebar-accent-foreground"
                            >
                                {user.username.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </>
                )}
            </div>

            <FeedbackDialog
                open={feedbackOpen}
                onOpenChange={setFeedbackOpen}
            />
        </div>
    );
}
