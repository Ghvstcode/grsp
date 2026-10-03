"use client";

import { useState, useRef, useEffect } from "react";

const REPO = "https://github.com/Ghvstcode/sustn";
const DOWNLOAD_BASE = `${REPO}/releases/latest/download`;

function AppleIcon() {
    return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
        </svg>
    );
}

function ChipIcon() {
    return (
        <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
        >
            <rect x="6" y="6" width="12" height="12" rx="2" />
            <rect x="9" y="9" width="6" height="6" rx="1" />
            <path
                d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3"
                strokeLinecap="round"
            />
        </svg>
    );
}

function MoonIcon() {
    return (
        <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
        >
            <path
                d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export function DownloadDropdown({
    children,
    className = "",
    align = "center",
}: {
    children: React.ReactNode;
    className?: string;
    align?: "left" | "center" | "right";
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        function onMouseDown(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") setOpen(false);
        }
        document.addEventListener("mousedown", onMouseDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onMouseDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    const alignClass =
        align === "right"
            ? "right-0"
            : align === "left"
              ? "left-0"
              : "left-1/2 -translate-x-1/2";

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={className}
            >
                {children}
            </button>

            {open && (
                <div className={`absolute top-full mt-2 ${alignClass} z-[100]`}>
                    <div className="w-64 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden animate-dropdown">
                        <div className="p-1.5">
                            <a
                                href={`${DOWNLOAD_BASE}/SUSTN_aarch64.dmg`}
                                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 group"
                                onClick={() => setOpen(false)}
                            >
                                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-gray-200">
                                    <AppleIcon />
                                </div>
                                <div>
                                    <div className="text-sm font-semibold text-black">
                                        Apple Silicon
                                    </div>
                                    <div className="text-[11px] text-gray-400 mono">
                                        M1&ndash;M4 &middot; .dmg
                                    </div>
                                </div>
                            </a>
                            <a
                                href={`${DOWNLOAD_BASE}/SUSTN_x64.dmg`}
                                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 group"
                                onClick={() => setOpen(false)}
                            >
                                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 group-hover:bg-gray-200">
                                    <ChipIcon />
                                </div>
                                <div>
                                    <div className="text-sm font-semibold text-black">
                                        Intel
                                    </div>
                                    <div className="text-[11px] text-gray-400 mono">
                                        x86_64 &middot; .dmg
                                    </div>
                                </div>
                            </a>
                        </div>
                        <div className="border-t border-gray-100 p-1.5">
                            <a
                                href={`${REPO}/releases/tag/nightly`}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 text-[12px] text-gray-400 hover:text-gray-600 mono"
                                onClick={() => setOpen(false)}
                            >
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
                                    <MoonIcon />
                                </div>
                                Nightly builds
                                <svg
                                    className="w-3 h-3 ml-auto"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    strokeWidth="2"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M9 5l7 7-7 7"
                                    />
                                </svg>
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
