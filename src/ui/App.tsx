import { useEffect } from "react";
import {
    BrowserRouter as Router,
    Route,
    Routes,
    Navigate,
    useNavigate,
} from "react-router-dom";
import "./App.css";
import { ThemeProvider } from "@ui/providers/ThemeProvider";
import { AppProvider } from "@ui/providers/AppProvider";
import { AppShell } from "@ui/components/layout/AppShell";
import { SettingsPage } from "@ui/components/settings/SettingsPage";
import { OnboardingLayout } from "@ui/components/layout/OnboardingLayout";
import { OnboardingFlow } from "@ui/components/onboarding/OnboardingFlow";
import { Toaster } from "sonner";
import { useTheme } from "@ui/hooks/useTheme";
import { useOnboardingStatus } from "@core/api/useOnboarding";
import { useUpdateChecker } from "@core/api/useUpdater";
import { onMenuNavigate } from "@core/services/platform";
import { UpdateDialog } from "@ui/components/UpdateDialog";
import {
    QueryClient,
    QueryClientProvider,
    MutationCache,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

const mutationCache = new MutationCache({
    onError: (error) => {
        console.error("Mutation error:", error);
    },
});

const queryClient = new QueryClient({
    mutationCache,
    defaultOptions: {
        queries: {
            retry: false,
            networkMode: "always",
            refetchOnWindowFocus: false,
            staleTime: Infinity,
        },
        mutations: {
            networkMode: "always",
        },
    },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
    const { data: isComplete, isLoading } = useOnboardingStatus();

    if (isLoading) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-background">
                <p className="text-muted-foreground">Loading...</p>
            </div>
        );
    }

    if (!isComplete) {
        return <Navigate to="/onboarding" replace />;
    }

    return <>{children}</>;
}

function AppContent() {
    const { mode } = useTheme();
    const navigate = useNavigate();
    const { updateVersion, showUpdateDialog, handleInstall, handleDismiss } =
        useUpdateChecker();

    // Handle menu bar navigation events from Tauri
    useEffect(() => onMenuNavigate((path) => navigate(path)), [navigate]);

    const resolvedTheme =
        mode === "system"
            ? window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light"
            : mode;

    return (
        <div className="select-none bg-background">
            <Routes>
                <Route
                    path="/onboarding"
                    element={
                        <OnboardingLayout>
                            <OnboardingFlow />
                        </OnboardingLayout>
                    }
                />
                <Route
                    path="/settings"
                    element={
                        <AuthGuard>
                            <SettingsPage />
                        </AuthGuard>
                    }
                />
                <Route
                    path="/"
                    element={
                        <AuthGuard>
                            <AppShell />
                        </AuthGuard>
                    }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <UpdateDialog
                open={showUpdateDialog}
                version={updateVersion}
                onInstall={handleInstall}
                onDismiss={handleDismiss}
            />
            <Toaster
                theme={resolvedTheme}
                position="bottom-right"
                closeButton
            />
        </div>
    );
}

function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <Router>
                <ThemeProvider storageKey="grsp-theme">
                    <AppProvider>
                        <AppContent />
                    </AppProvider>
                </ThemeProvider>
            </Router>
            {import.meta.env.DEV && (
                <ReactQueryDevtools initialIsOpen={false} />
            )}
        </QueryClientProvider>
    );
}

export default App;
