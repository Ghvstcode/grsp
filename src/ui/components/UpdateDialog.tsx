import { useState } from "react";
import { ArrowDownToLine, Loader2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@ui/components/ui/dialog";

interface UpdateDialogProps {
    open: boolean;
    version: string;
    onInstall: () => Promise<void>;
    onDismiss: () => void;
}

export function UpdateDialog({
    open,
    version,
    onInstall,
    onDismiss,
}: UpdateDialogProps) {
    const [installing, setInstalling] = useState(false);

    function handleInstall() {
        setInstalling(true);
        void onInstall();
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => !o && !installing && onDismiss()}
        >
            <DialogContent
                className="max-w-sm"
                onPointerDownOutside={(e) => installing && e.preventDefault()}
            >
                {installing ? (
                    <div className="flex flex-col items-center gap-3 py-4">
                        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                        <p className="text-sm font-medium text-foreground">
                            Installing update...
                        </p>
                        <p className="text-xs text-muted-foreground">
                            The app will restart automatically.
                        </p>
                    </div>
                ) : (
                    <>
                        <DialogHeader>
                            <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/5">
                                    <ArrowDownToLine className="h-4 w-4 text-foreground" />
                                </div>
                                <DialogTitle>Update available</DialogTitle>
                            </div>
                            <DialogDescription className="pt-1">
                                SUSTN v{version} is ready to install. The app
                                will restart to apply the update.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <button
                                onClick={onDismiss}
                                className="rounded-md border border-border px-3.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                            >
                                Later
                            </button>
                            <button
                                onClick={handleInstall}
                                className="flex items-center gap-1.5 rounded-md bg-foreground px-3.5 py-2 text-xs font-medium text-background transition-opacity hover:opacity-80"
                            >
                                <ArrowDownToLine className="h-3 w-3" />
                                Install & Restart
                            </button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
