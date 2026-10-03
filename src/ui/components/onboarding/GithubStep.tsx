import { UpdateIcon } from "@radix-ui/react-icons";
import { Button } from "@ui/components/ui/button";
import { useGithubStatus } from "@core/api/useAgents";
import { openExternal } from "@core/services/platform";
import { errorMessage } from "@core/utils/sessions";
import { CheckItem, Cmd } from "./CheckItem";

interface GithubStepProps {
    onNext: () => void;
}

export function GithubStep({ onNext }: GithubStepProps) {
    const { data, isLoading, isFetching, error, refetch } = useGithubStatus();
    const checking = isLoading || isFetching;
    const connected = !!data?.authenticated;

    return (
        <div className="animate-fade-in-up">
            <h2 className="text-2xl font-bold tracking-tight text-foreground text-center mb-1">
                Connect GitHub
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-6">
                grsp uses the GitHub CLI you're already signed in to. It never
                stores a token.
            </p>

            <div className="divide-y divide-border rounded-lg border border-border bg-card px-4 animate-fade-in-up delay-200">
                <CheckItem
                    label="GitHub CLI installed"
                    status={
                        checking
                            ? "loading"
                            : data?.ghInstalled
                              ? "pass"
                              : "fail"
                    }
                    help={
                        <>
                            Install it with <Cmd>brew install gh</Cmd>, then
                            press Re-check.{" "}
                            <button
                                type="button"
                                className="text-primary underline"
                                onClick={() =>
                                    void openExternal("https://cli.github.com")
                                }
                            >
                                Install guide
                            </button>
                        </>
                    }
                />
                <CheckItem
                    label="Signed in to GitHub"
                    status={checking ? "loading" : connected ? "pass" : "fail"}
                    detail={
                        connected && data?.login
                            ? `Connected as @${data.login}`
                            : undefined
                    }
                    help={
                        error ? (
                            <span className="select-text">
                                Couldn't check: {errorMessage(error)}
                            </span>
                        ) : (
                            <>
                                Run <Cmd>gh auth login</Cmd> in a terminal, then
                                press Re-check.
                            </>
                        )
                    }
                />
            </div>

            {!connected && !checking && (
                <p className="mt-4 text-center text-xs text-muted-foreground animate-fade-in-up">
                    You can skip this. Without GitHub, grsp is limited to
                    comparing two branches: no pull request list, no discussion
                    and no posting reviews.
                </p>
            )}

            <div className="flex justify-between mt-6 animate-fade-in-up delay-300">
                <Button
                    variant="outline"
                    onClick={() => void refetch()}
                    disabled={checking}
                >
                    {checking ? (
                        <>
                            <UpdateIcon className="mr-2 h-4 w-4 animate-spin" />
                            Checking...
                        </>
                    ) : (
                        "Re-check"
                    )}
                </Button>
                {connected ? (
                    <Button onClick={onNext}>Continue</Button>
                ) : (
                    <Button
                        variant="ghost"
                        onClick={onNext}
                        disabled={checking}
                        className="text-muted-foreground"
                    >
                        Skip for now
                    </Button>
                )}
            </div>
        </div>
    );
}
