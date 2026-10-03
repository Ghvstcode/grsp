import { toast } from "sonner";
import { Check, AlertTriangle, ArrowDownToLine, Loader2 } from "lucide-react";

function pillToast(id: string, text: string, duration: number) {
    toast.custom(
        () => (
            <div className="flex items-center gap-1.5 rounded-full bg-foreground pl-2 pr-2.5 py-1 shadow-md animate-fade-in-up">
                <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background">
                    <Check
                        className="h-2 w-2 text-foreground"
                        strokeWidth={3}
                    />
                </div>
                <span className="text-[12px] font-medium text-background">
                    {text}
                </span>
            </div>
        ),
        { id, duration },
    );
}

export function savedToast() {
    pillToast("settings-saved", "Saved", 1500);
}

export function successToast(text: string) {
    pillToast(`success-${text}`, text, 2500);
}

export function errorToast(error: string) {
    toast.custom(
        () => (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-background p-3 shadow-lg max-w-sm">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <span className="text-[13px] text-foreground leading-snug">
                    {error}
                </span>
            </div>
        ),
        { id: `error-${error}`, duration: 5000 },
    );
}

export function updateAvailableToast(version: string, onInstall: () => void) {
    toast.custom(
        (id) => (
            <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-background p-3 shadow-lg max-w-sm">
                <div className="flex items-start gap-2">
                    <ArrowDownToLine className="h-4 w-4 text-foreground shrink-0 mt-0.5" />
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[13px] font-medium text-foreground leading-snug">
                            Update available
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                            grsp v{version} is ready to install.
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => toast.dismiss(id)}
                        className="rounded-md border border-border px-2.5 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted"
                    >
                        Later
                    </button>
                    <button
                        onClick={() => {
                            onInstall();
                            toast.dismiss(id);
                            updateInstallingToast();
                        }}
                        className="flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1 text-[12px] font-medium text-background transition-opacity hover:opacity-80"
                    >
                        <ArrowDownToLine className="h-3 w-3" />
                        Install & Restart
                    </button>
                </div>
            </div>
        ),
        { id: "update-available", duration: Infinity },
    );
}

function updateInstallingToast() {
    toast.custom(
        () => (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background p-3 shadow-lg max-w-sm">
                <Loader2 className="h-4 w-4 text-foreground animate-spin shrink-0" />
                <span className="text-[13px] font-medium text-foreground">
                    Installing update...
                </span>
            </div>
        ),
        { id: "update-installing", duration: Infinity },
    );
}
