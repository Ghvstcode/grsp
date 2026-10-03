import { Button } from "@ui/components/ui/button";
import { Badge } from "@ui/components/ui/badge";
import { useGithubStatus } from "@core/api/useAgents";
import { openExternal } from "@core/services/platform";
import { errorMessage } from "@core/utils/sessions";
import { SectionHeader } from "../SectionHeader";

export function GitHostsSection() {
    const { data, isLoading, isFetching, error, refetch } = useGithubStatus();
    const checking = isLoading || isFetching;

    let githubStatus: React.ReactNode;
    if (checking) {
        githubStatus = "Checking the GitHub CLI…";
    } else if (error) {
        githubStatus = (
            <span className="select-text">
                Couldn't check: {errorMessage(error)}
            </span>
        );
    } else if (data?.authenticated) {
        githubStatus = data.login ? `Connected as @${data.login}` : "Connected";
    } else if (data?.ghInstalled) {
        githubStatus = (
            <>
                Not signed in. Run{" "}
                <code className="select-text font-mono text-[12.5px] text-foreground">
                    gh auth login
                </code>{" "}
                in a terminal, then Re-check.
            </>
        );
    } else {
        githubStatus = (
            <>
                GitHub CLI not found. Install it with{" "}
                <code className="select-text font-mono text-[12.5px] text-foreground">
                    brew install gh
                </code>
                , sign in, then Re-check.{" "}
                <button
                    type="button"
                    className="font-medium text-foreground underline underline-offset-[3px]"
                    onClick={() => void openExternal("https://cli.github.com")}
                >
                    Install guide
                </button>
            </>
        );
    }

    return (
        <div>
            <SectionHeader
                title="Git hosts"
                description="Where grsp lists pull requests, reads discussion and posts reviews."
            />

            <div className="mt-6">
                <div
                    className="animate-fade-in-up flex items-center gap-4 border-b border-border py-5"
                    style={{ animationDelay: "50ms" }}
                >
                    <span className="w-[120px] shrink-0 text-sm font-medium">
                        GitHub
                    </span>
                    <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-muted-foreground">
                        {githubStatus}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void refetch()}
                        disabled={checking}
                    >
                        Re-check
                    </Button>
                </div>

                {["GitLab", "Bitbucket"].map((host, i) => (
                    <div
                        key={host}
                        className="animate-fade-in-up flex items-center gap-4 border-b border-border py-5"
                        style={{ animationDelay: `${100 + i * 50}ms` }}
                    >
                        <span className="w-[120px] shrink-0 text-sm font-medium">
                            {host}
                        </span>
                        <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">
                            Not available yet
                        </span>
                        <Badge variant="outline" className="font-normal">
                            Coming soon
                        </Badge>
                    </div>
                ))}

                <p
                    className="animate-fade-in-up pt-5 text-[13px] leading-relaxed text-muted-foreground"
                    style={{ animationDelay: "200ms" }}
                >
                    grsp uses the GitHub CLI you're signed in to and never
                    stores a token. Comparing two branches works with any host,
                    without discussion or posting.
                </p>
            </div>
        </div>
    );
}
