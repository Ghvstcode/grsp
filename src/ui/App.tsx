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
import { clearBadge } from "@core/services/notifications";
import { useEnvironmentIssueListener } from "@core/api/useEngine";
import { useUpdateChecker } from "@core/api/useUpdater";
import { UpdateDialog } from "@ui/components/UpdateDialog";
import { listen } from "@tauri-apps/api/event";
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
    useEnvironmentIssueListener();
    const { updateVersion, showUpdateDialog, handleInstall, handleDismiss } =
        useUpdateChecker();

    // Handle menu bar navigation events from Tauri
    useEffect(() => {
        const unlisten = listen<string>("menu-navigate", (event) => {
            navigate(event.payload);
        });
        return () => {
            void unlisten.then((fn) => fn());
        };
    }, [navigate]);

    // Clear dock badge when the window gets focus
    useEffect(() => {
        function handleFocus() {
            void clearBadge();
        }
        window.addEventListener("focus", handleFocus);
        return () => window.removeEventListener("focus", handleFocus);
    }, []);

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
                <ThemeProvider storageKey="sustn-theme">
                    <AppProvider>
                        <AppContent />
                    </AppProvider>
                </ThemeProvider>
            </Router>
            <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
    );
}

export default App;
