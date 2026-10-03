interface OnboardingLayoutProps {
    children: React.ReactNode;
}

export function OnboardingLayout({ children }: OnboardingLayoutProps) {
    return (
        <div className="flex h-screen w-screen items-center justify-center bg-background">
            <div className="w-full max-w-lg px-6">{children}</div>
        </div>
    );
}
