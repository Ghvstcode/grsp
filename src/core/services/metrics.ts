import { getAuth } from "@core/db/auth";
import { getMetadata, setMetadata } from "@core/db/metadata";
import { config } from "@core/config";
import { useFixtures } from "@core/services/client";

/**
 * Anonymous usage metrics.
 *
 * Events say what the app was used for (a review was opened, a pipeline
 * finished, a review was posted), never what was reviewed: no code, paths,
 * repository names, PR titles, questions or comments. Each batch carries a
 * random install id, plus the grsp account when the user is signed in.
 * Turned off in Settings → General.
 */

/** Every event the app sends, with the only data each may carry. */
export interface MetricEvents {
    session_start: undefined;
    session_end: { durationSeconds: number };
    onboarding_completed: undefined;
    repo_added: { via: "folder" | "clone" };
    review_session_created: { source: "url" | "pr" | "branches" };
    analysis_completed: { kind: string; status: "done" | "error" };
    ask_sent: undefined;
    review_posted: { event: string };
    settings_changed: { setting: string };
}

interface QueuedEvent {
    eventType: string;
    eventData?: Record<string, unknown>;
    clientTimestamp: string;
}

const INSTALL_ID_KEY = "install_id";
const ENABLED_KEY = "usage_metrics";

export async function isMetricsEnabled(): Promise<boolean> {
    return (await getMetadata(ENABLED_KEY)) !== "off";
}

export async function setMetricsEnabled(enabled: boolean): Promise<void> {
    await setMetadata(ENABLED_KEY, enabled ? "on" : "off");
    metrics.setEnabled(enabled);
}

async function getInstallId(): Promise<string> {
    const existing = await getMetadata(INSTALL_ID_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    await setMetadata(INSTALL_ID_KEY, created);
    return created;
}

class MetricsService {
    private queue: QueuedEvent[] = [];
    private flushTimer: ReturnType<typeof setInterval> | undefined;
    private enabled = true;
    private readonly FLUSH_INTERVAL = 30_000;
    private readonly BATCH_THRESHOLD = 20;
    private readonly MAX_QUEUE = 200;
    private readonly ENDPOINT = `${config.authServerUrl}/metrics/events`;

    start() {
        if (this.flushTimer) return;
        void isMetricsEnabled().then((enabled) => this.setEnabled(enabled));
        this.flushTimer = setInterval(
            () => void this.flush(),
            this.FLUSH_INTERVAL,
        );
    }

    stop() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = undefined;
        }
        void this.flush();
    }

    setEnabled(enabled: boolean) {
        this.enabled = enabled;
        if (!enabled) this.queue = [];
    }

    track<K extends keyof MetricEvents>(
        eventType: K,
        ...data: MetricEvents[K] extends undefined ? [] : [MetricEvents[K]]
    ) {
        // Fixture mode (and a plain browser) is development, not usage.
        if (useFixtures || !this.enabled) return;

        this.queue.push({
            eventType,
            eventData: data[0],
            clientTimestamp: new Date().toISOString(),
        });

        if (this.queue.length >= this.BATCH_THRESHOLD) {
            void this.flush();
        }
    }

    private async flush() {
        if (this.queue.length === 0 || !this.enabled) return;

        const events = this.queue.splice(0);

        try {
            const [installId, auth] = await Promise.all([
                getInstallId(),
                getAuth(),
            ]);
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };
            if (auth?.accessToken) {
                headers.Authorization = `Bearer ${auth.accessToken}`;
            }
            const response = await fetch(this.ENDPOINT, {
                method: "POST",
                headers,
                body: JSON.stringify({ installId, events }),
            });

            if (!response.ok) this.requeue(events);
        } catch {
            this.requeue(events);
        }
    }

    private requeue(events: QueuedEvent[]) {
        if (this.enabled && this.queue.length < this.MAX_QUEUE) {
            this.queue.unshift(...events);
        }
    }
}

export const metrics = new MetricsService();

/** `walkthrough:ep3` → `walkthrough`; entry point ids stay on the machine. */
export function metricKind(analysisKind: string): string {
    return analysisKind.split(":")[0];
}
