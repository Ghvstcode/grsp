import { ExternalLink, GitPullRequest } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { useState } from "react";

interface TaskReviewPanelProps {
    prUrl: string | undefined;
    onSavePrUrl: (url: string) => void;
}

export function TaskReviewPanel({ prUrl, onSavePrUrl }: TaskReviewPanelProps) {
    const [draft, setDraft] = useState(prUrl ?? "");

    function handleSave() {
        const trimmed = draft.trim();
        if (trimmed) {
            onSavePrUrl(trimmed);
        }
    }

    return (
        <div>
            <h3 className="text-sm font-medium text-foreground mb-2">
                Pull Request
            </h3>

            {prUrl ? (
                <div className="flex items-center gap-2 rounded-lg border border-border p-3">
                    <GitPullRequest className="h-4 w-4 text-amber-500 shrink-0" />
                    <span className="flex-1 truncate text-sm text-foreground font-mono">
                        {prUrl}
                    </span>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void openUrl(prUrl)}
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                </div>
            ) : (
                <div className="flex gap-2">
                    <Input
                        placeholder="https://github.com/user/repo/pull/123"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        className="flex-1 font-mono text-sm"
                    />
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSave}
                        disabled={!draft.trim()}
                    >
                        Save
                    </Button>
                </div>
            )}

            {/* Diff placeholder */}
            <div className="mt-3 rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground/70">
                    Diff preview will appear here in a future update.
                </p>
            </div>
        </div>
    );
}
