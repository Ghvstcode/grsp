import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useCompleteOnboarding } from "@core/api/useOnboarding";
import { useGithubStatus } from "@core/api/useAgents";
import type { Repo } from "@core/types/grsp";
import { WelcomeStep } from "./WelcomeStep";
import { AgentStep } from "./AgentStep";
import { GithubStep } from "./GithubStep";
import { AddRepoStep } from "./AddRepoStep";
import { OpenPrStep } from "./OpenPrStep";
import { CompleteStep } from "./CompleteStep";

type OnboardingStep =
    | "welcome"
    | "agent"
    | "github"
    | "repo"
    | "pr"
    | "complete";

const STEPS: OnboardingStep[] = [
    "welcome",
    "agent",
    "github",
    "repo",
    "pr",
    "complete",
];

export function OnboardingFlow() {
    const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
    const [addedRepo, setAddedRepo] = useState<Repo | undefined>(undefined);
    const [openedReview, setOpenedReview] = useState(false);
    const navigate = useNavigate();
    const completeOnboarding = useCompleteOnboarding();
    const { data: github } = useGithubStatus();

    const handleComplete = useCallback(() => {
        completeOnboarding.mutate(undefined, {
            onSuccess: () => {
                navigate("/", { replace: true });
            },
        });
    }, [completeOnboarding, navigate]);

    /**
     * The open-a-PR step only makes sense when a folder with a GitHub
     * remote was just added and GitHub is connected; otherwise skip it.
     */
    function afterRepo(repo: Repo | undefined) {
        setAddedRepo(repo);
        setCurrentStep(
            repo?.remote && github?.authenticated ? "pr" : "complete",
        );
    }

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
            {currentStep === "welcome" && (
                <WelcomeStep onNext={() => setCurrentStep("agent")} />
            )}
            {currentStep === "agent" && (
                <AgentStep onNext={() => setCurrentStep("github")} />
            )}
            {currentStep === "github" && (
                <GithubStep onNext={() => setCurrentStep("repo")} />
            )}
            {currentStep === "repo" && (
                <AddRepoStep
                    onAdded={(repo) => afterRepo(repo)}
                    onSkip={() => afterRepo(undefined)}
                />
            )}
            {currentStep === "pr" && addedRepo && (
                <OpenPrStep
                    repo={addedRepo}
                    onNext={() => setCurrentStep("complete")}
                    onOpened={() => setOpenedReview(true)}
                />
            )}
            {currentStep === "complete" && (
                <CompleteStep
                    onComplete={handleComplete}
                    isPending={completeOnboarding.isPending}
                    hasReview={openedReview}
                />
            )}
        </div>
    );
}
