import { Plus } from "lucide-react";
import { Button } from "@ui/components/ui/button";
import { LogoMark } from "@ui/components/LogoMark";
import { useAppStore } from "@core/store/app-store";
import { useSessions } from "@core/api/useSessions";

export function EmptyState() {
    const setNewReviewOpen = useAppStore((s) => s.setNewReviewOpen);
    const { data: sessions } = useSessions();
    const hasSessions = (sessions?.length ?? 0) > 0;

    return (
        <div className="flex h-full flex-col items-center justify-center text-center">
            {/* Spinning logo */}
            <div className="animate-fade-in-up">
                <LogoMark
                    size={40}
                    className="animate-slow-spin text-muted-foreground/30"
                />
            </div>
            <p className="mt-5 text-sm text-muted-foreground animate-fade-in-up delay-100">
                {hasSessions
                    ? "Select a review from the sidebar to pick up where you left off."
                    : "Point grsp at a pull request to see what it actually does."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60 animate-fade-in-up delay-200">
                Paste a PR link, pick an open PR, or compare two branches.
            </p>
            <div className="mt-6 animate-fade-in-up delay-300">
                <Button
                    className="gap-2"
                    onClick={() => setNewReviewOpen(true)}
                >
                    <Plus className="h-4 w-4" />
                    New review
                </Button>
            </div>
        </div>
    );
}
