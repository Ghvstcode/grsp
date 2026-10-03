export function EmptyState() {
    return (
        <div className="flex h-full flex-col items-center justify-center text-center">
            {/* Spinning logo */}
            <div className="animate-fade-in-up">
                <svg
                    width="40"
                    height="40"
                    viewBox="0 0 42 42"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="animate-slow-spin text-muted-foreground/30"
                >
                    <path
                        d="M24.3012 1.73511V19.0934M24.3012 36.4518V19.0934M36.5754 6.81925L12.027 31.3676M24.3012 19.0934L6.94287 19.0934M36.5754 31.3676L12.027 6.81925"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </div>
            <p className="mt-5 text-sm text-muted-foreground animate-fade-in-up delay-100">
                Select a project from the sidebar to get started.
            </p>
            <p className="mt-1 text-xs text-muted-foreground/50 animate-fade-in-up delay-200">
                Or paste a PR link in the sidebar to import one.
            </p>
        </div>
    );
}
