import { ArrowRight } from "lucide-react";
import { Button } from "@ui/components/ui/button";
import { LogoMark } from "@ui/components/LogoMark";

interface WelcomeStepProps {
    onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
    return (
        <div className="flex flex-col items-center text-center gap-6">
            {/* Logo */}
            <div className="animate-fade-in-up">
                <LogoMark size={48} className="animate-slow-spin" />
            </div>

            {/* Brand */}
            <h1 className="text-4xl font-bold tracking-tight text-foreground animate-fade-in-up delay-100">
                grsp
            </h1>

            {/* Tagline */}
            <p className="text-muted-foreground font-mono text-sm tracking-widest uppercase animate-fade-in-up delay-200">
                Understand the change.
            </p>

            <p className="max-w-sm text-sm text-muted-foreground animate-fade-in-up delay-300">
                Point grsp at a pull request and see what it actually does, step
                by step, before you review it.
            </p>

            {/* Action */}
            <div className="mt-4 animate-fade-in-up delay-500">
                <Button size="lg" className="gap-2 px-8" onClick={onNext}>
                    Get started
                    <ArrowRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
