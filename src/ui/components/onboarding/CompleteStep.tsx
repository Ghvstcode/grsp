import { Button } from "@ui/components/ui/button";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowRight, BookOpen, MessageCircle } from "lucide-react";

interface CompleteStepProps {
    onComplete: () => void;
    isPending: boolean;
}

export function CompleteStep({ onComplete, isPending }: CompleteStepProps) {
    return (
        <div className="flex flex-col items-center text-center">
            {/* Logo with pop-in animation */}
            <div className="animate-pop-in">
                <svg
                    width="48"
                    height="48"
                    viewBox="0 0 42 42"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
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

            <h2 className="text-2xl font-bold tracking-tight text-foreground mt-6 animate-fade-in-up delay-200">
                You're all set
            </h2>
            <p className="text-muted-foreground font-mono text-sm tracking-widest uppercase mt-2 animate-fade-in-up delay-300">
                Ready for launch.
            </p>

            {/* CTA */}
            <div className="animate-fade-in-up delay-500 mt-8">
                <Button
                    size="lg"
                    className="gap-2 px-8"
                    onClick={onComplete}
                    disabled={isPending}
                >
                    {isPending ? "Setting up..." : "Get started"}
                    {!isPending && <ArrowRight className="h-4 w-4" />}
                </Button>
            </div>

            {/* Resource links */}
            <div className="flex items-center gap-6 mt-8 animate-fade-in-up delay-700">
                <button
                    type="button"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => void openUrl("https://docs.sustn.app")}
                >
                    <BookOpen className="h-3 w-3" />
                    Docs
                </button>
                <div className="h-3 w-px bg-border" />
                <button
                    type="button"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => void openUrl("https://discord.gg/sustn")}
                >
                    <MessageCircle className="h-3 w-3" />
                    Community
                </button>
            </div>
        </div>
    );
}
