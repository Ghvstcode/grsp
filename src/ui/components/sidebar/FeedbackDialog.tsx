import { useState, useRef, useCallback, useEffect } from "react";
import { Paperclip, CornerDownLeft } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@ui/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useSubmitFeedback } from "@core/api/useFeedback";

interface FeedbackDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
    const [message, setMessage] = useState("");
    const [images, setImages] = useState<File[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const submitFeedback = useSubmitFeedback();

    const autoResize = useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
    }, []);

    useEffect(() => {
        if (open) {
            const timer = setTimeout(() => textareaRef.current?.focus(), 150);
            return () => clearTimeout(timer);
        }
        setMessage("");
        setImages([]);
        submitFeedback.reset();
        if (textareaRef.current) textareaRef.current.style.height = "auto";
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    function handleClose() {
        onOpenChange(false);
    }

    function handleAttach() {
        fileInputRef.current?.click();
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const files = e.target.files;
        if (files) {
            setImages((prev) => [...prev, ...Array.from(files)]);
        }
        e.target.value = "";
    }

    function removeImage(index: number) {
        setImages((prev) => prev.filter((_, i) => i !== index));
    }

    function handleSubmit() {
        if (!message.trim() || submitFeedback.isPending) return;

        submitFeedback.mutate(
            { message: message.trim(), images },
            { onSuccess: () => handleClose() },
        );
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-[480px] p-0 gap-0 overflow-hidden"
                onKeyDown={handleKeyDown}
            >
                <VisuallyHidden>
                    <DialogTitle>Send feedback</DialogTitle>
                </VisuallyHidden>

                {/* Header */}
                <div
                    className="px-6 pt-6 animate-fade-in-up"
                    style={{ animationDelay: "50ms" }}
                >
                    <p className="text-lg font-medium text-foreground">
                        Feedback
                    </p>
                    <p className="text-sm text-muted-foreground/60 mt-0.5">
                        Share bugs, ideas, or anything on your mind.
                    </p>
                </div>

                {/* Message textarea */}
                <div
                    className="px-6 pt-4 pb-5 animate-fade-in-up"
                    style={{ animationDelay: "100ms" }}
                >
                    <textarea
                        ref={textareaRef}
                        value={message}
                        onChange={(e) => {
                            setMessage(e.target.value);
                            autoResize();
                        }}
                        placeholder="Tell us about your experience..."
                        rows={3}
                        className="w-full resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/30 outline-none transition-[height] duration-150"
                        style={{ maxHeight: 200 }}
                    />
                </div>

                {/* Image chips */}
                {images.length > 0 && (
                    <div
                        className="px-6 pb-4 animate-fade-in-up"
                        style={{ animationDelay: "150ms" }}
                    >
                        <div className="flex flex-wrap gap-1.5">
                            {images.map((img, i) => (
                                <span
                                    key={`${img.name}-${i}`}
                                    className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground"
                                >
                                    <Paperclip className="h-3 w-3" />
                                    <span className="max-w-[120px] truncate">
                                        {img.name}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => removeImage(i)}
                                        className="text-muted-foreground/60 hover:text-foreground transition-colors"
                                    >
                                        &times;
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Error */}
                {submitFeedback.isError && (
                    <div className="px-6 pb-4">
                        <p className="text-xs text-destructive">
                            {submitFeedback.error?.message ??
                                "Failed to send feedback. Please try again."}
                        </p>
                    </div>
                )}

                {/* Footer */}
                <div
                    className="flex items-center justify-between border-t border-border px-6 py-3.5 animate-fade-in-up"
                    style={{ animationDelay: "200ms" }}
                >
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleAttach}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-foreground transition-colors"
                        >
                            <Paperclip className="h-3.5 w-3.5" />
                            Attach
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleFileChange}
                            className="hidden"
                        />
                        <span className="text-[11px] text-muted-foreground/40 select-none">
                            <kbd className="rounded border border-border px-1 py-0.5 text-[10px] font-mono">
                                {navigator.platform?.includes("Mac")
                                    ? "Cmd"
                                    : "Ctrl"}
                                +Enter
                            </kbd>{" "}
                            to send
                        </span>
                    </div>

                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!message.trim() || submitFeedback.isPending}
                        className={`
                            group flex items-center gap-1.5 rounded-md px-3.5 py-2
                            text-xs font-medium transition-all duration-200
                            ${
                                message.trim() && !submitFeedback.isPending
                                    ? "bg-foreground text-background hover:-translate-y-px hover:shadow-sm active:translate-y-0 active:shadow-none"
                                    : "bg-muted text-muted-foreground/40 cursor-not-allowed"
                            }
                        `}
                    >
                        {submitFeedback.isPending ? (
                            <>
                                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                Sending...
                            </>
                        ) : (
                            <>
                                Send feedback
                                <CornerDownLeft className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                            </>
                        )}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
