import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@ui/components/ui/button";

// ── Types ───────────────────────────────────────────────────

interface ErrorBoundaryProps {
    children: ReactNode;
    /** Fallback UI level — controls how much chrome is shown */
    level?: "root" | "route" | "widget";
    /** Override the heading shown in the fallback */
    heading?: string;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | undefined;
}

// ── Component ───────────────────────────────────────────────

export class ErrorBoundary extends Component<
    ErrorBoundaryProps,
    ErrorBoundaryState
> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: undefined };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error(
            "[ErrorBoundary] Uncaught error:",
            error,
            info.componentStack,
        );
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: undefined });
    };

    private handleReload = () => {
        window.location.reload();
    };

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        const level = this.props.level ?? "widget";

        if (level === "root") {
            return (
                <div className="flex h-screen w-screen items-center justify-center bg-background p-8">
                    <div className="flex max-w-md flex-col items-center gap-4 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                            <AlertTriangle className="h-6 w-6 text-destructive" />
                        </div>
                        <h1 className="text-lg font-semibold text-foreground">
                            {this.props.heading ?? "Something went wrong"}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            An unexpected error crashed the application. Click
                            below to reload.
                        </p>
                        {this.state.error && (
                            <pre className="w-full overflow-auto rounded-md border border-border bg-muted/30 p-3 text-left text-xs text-muted-foreground">
                                {this.state.error.message}
                            </pre>
                        )}
                        <Button onClick={this.handleReload} className="gap-2">
                            <RefreshCw className="h-4 w-4" />
                            Reload App
                        </Button>
                    </div>
                </div>
            );
        }

        if (level === "route") {
            return (
                <div className="flex h-full w-full items-center justify-center p-8">
                    <div className="flex max-w-sm flex-col items-center gap-3 text-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                            <AlertTriangle className="h-5 w-5 text-destructive" />
                        </div>
                        <h2 className="text-sm font-semibold text-foreground">
                            {this.props.heading ?? "This view crashed"}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                            An error occurred while rendering this section.
                        </p>
                        {this.state.error && (
                            <pre className="w-full overflow-auto rounded-md border border-border bg-muted/30 p-2 text-left text-[11px] text-muted-foreground">
                                {this.state.error.message}
                            </pre>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={this.handleReset}
                            className="gap-1.5"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Try Again
                        </Button>
                    </div>
                </div>
            );
        }

        // Widget level — compact inline fallback
        return (
            <div className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">
                        {this.props.heading ?? "Failed to render"}
                    </p>
                    {this.state.error && (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {this.state.error.message}
                        </p>
                    )}
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={this.handleReset}
                    className="h-7 gap-1 text-xs shrink-0"
                >
                    <RefreshCw className="h-3 w-3" />
                    Retry
                </Button>
            </div>
        );
    }
}
