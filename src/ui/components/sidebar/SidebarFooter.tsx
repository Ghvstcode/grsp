import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@core/store/auth-store";
import { Settings, MessageSquare } from "lucide-react";
import { FeedbackDialog } from "./FeedbackDialog";

export function SidebarFooter() {
    const navigate = useNavigate();
    const user = useAuthStore((s) => s.user);
    const [feedbackOpen, setFeedbackOpen] = useState(false);

    return (
        <div className="border-t border-sidebar-border px-3 py-2.5">
            <div className="flex items-center gap-2">
                {user?.avatarUrl ? (
                    <img
                        src={user.avatarUrl}
                        alt={user.username}
                        className="h-5 w-5 rounded-full"
                    />
                ) : (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-sidebar-accent text-[9px] font-medium text-sidebar-accent-foreground">
                        {user?.username?.charAt(0).toUpperCase() ?? "?"}
                    </div>
                )}
                <span className="flex-1 truncate text-[11px] text-sidebar-foreground">
                    {user?.username ?? "User"}
                </span>
                <button
                    type="button"
                    onClick={() => setFeedbackOpen(true)}
                    className="rounded p-0.5 text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                    title="Send feedback"
                >
                    <MessageSquare className="h-3 w-3" />
                </button>
                <button
                    type="button"
                    onClick={() => navigate("/settings")}
                    className="rounded p-0.5 text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                    title="Settings"
                >
                    <Settings className="h-3 w-3" />
                </button>
            </div>

            <FeedbackDialog
                open={feedbackOpen}
                onOpenChange={setFeedbackOpen}
            />
        </div>
    );
}
