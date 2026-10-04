import { Button } from "@ui/components/ui/button";
import { ArrowRight, BookOpen, MessageCircle } from "lucide-react";
import { LogoMark } from "@ui/components/LogoMark";
import { config } from "@core/config";
import { openExternal } from "@core/services/platform";

interface CompleteStepProps {
    onComplete: () => void;
    isPending: boolean;
    /** True when a review was opened during onboarding. */
    hasReview: boolean;
}

export function CompleteStep({
    onComplete,
    isPending,
    hasReview,
}: CompleteStepProps) {
    return (
        <div className="flex flex-col items-center text-center">
            {/* Logo with pop-in animation */}
            <div>
                <LogoMark size={56} animated />
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-foreground mt-6 animate-fade-in-up delay-200">
                You're all set
            </h2>
            <p className="text-muted-foreground font-mono text-sm tracking-widest uppercase mt-2 animate-fade-in-up delay-300">
                {hasReview ? "Your first review is ready." : "Ready to review."}
            </p>

            {/* CTA */}
            <div className="animate-fade-in-up delay-500 mt-8">
                <Button
                    size="lg"
                    className="gap-2 px-8"
                    onClick={onComplete}
                    disabled={isPending}
                >
                    {isPending
                        ? "Setting up..."
                        : hasReview
                          ? "Open the review"
                          : "Get started"}
                    {!isPending && <ArrowRight className="h-4 w-4" />}
                </Button>
            </div>

            {/* Resource links */}
            <div className="flex items-center gap-6 mt-8 animate-fade-in-up delay-700">
                <button
                    type="button"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => void openExternal(config.docsUrl)}
                >
                    <BookOpen className="h-3 w-3" />
                    Docs
                </button>
                <div className="h-3 w-px bg-border" />
                <button
                    type="button"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => void openExternal(config.issuesUrl)}
                >
                    <MessageCircle className="h-3 w-3" />
                    Report an issue
                </button>
            </div>
        </div>
    );
}
