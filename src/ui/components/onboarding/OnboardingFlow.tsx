import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useCompleteOnboarding } from "@core/api/useOnboarding";
import { WelcomeStep } from "./WelcomeStep";
import { PreflightStep } from "./PreflightStep";
import { AddProjectStep } from "./AddProjectStep";
import { CompleteStep } from "./CompleteStep";

type OnboardingStep = "welcome" | "preflight" | "project" | "complete";

const STEPS: OnboardingStep[] = ["welcome", "preflight", "project", "complete"];

export function OnboardingFlow() {
    const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
    const navigate = useNavigate();
    const completeOnboarding = useCompleteOnboarding();

    const goToNext = useCallback(() => {
        const currentIndex = STEPS.indexOf(currentStep);
        if (currentIndex < STEPS.length - 1) {
            setCurrentStep(STEPS[currentIndex + 1]);
        }
    }, [currentStep]);

    const handleComplete = useCallback(() => {
        completeOnboarding.mutate(undefined, {
            onSuccess: () => {
                navigate("/", { replace: true });
            },
        });
    }, [completeOnboarding, navigate]);

    const stepIndicator = (
        <div className="flex justify-center gap-2 mb-8">
            {STEPS.map((step) => (
                <div
                    key={step}
                    className={`h-1.5 w-8 rounded-full transition-colors ${
                        STEPS.indexOf(step) <= STEPS.indexOf(currentStep)
                            ? "bg-primary"
                            : "bg-muted"
                    }`}
                />
            ))}
        </div>
    );

    return (
        <div>
            {currentStep !== "welcome" && stepIndicator}
            {currentStep === "welcome" && <WelcomeStep onNext={goToNext} />}
            {currentStep === "preflight" && <PreflightStep onNext={goToNext} />}
            {currentStep === "project" && <AddProjectStep onNext={goToNext} />}
            {currentStep === "complete" && (
                <CompleteStep
                    onComplete={handleComplete}
                    isPending={completeOnboarding.isPending}
                />
            )}
        </div>
    );
}
