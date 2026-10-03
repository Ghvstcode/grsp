import { getAuth } from "@core/db/auth";
import { config } from "@core/config";

interface MetricEvent {
    eventType: string;
    eventData?: Record<string, unknown>;
    clientTimestamp: string;
}

class MetricsService {
    private queue: MetricEvent[] = [];
    private flushTimer: ReturnType<typeof setInterval> | undefined;
    private readonly FLUSH_INTERVAL = 30_000;
    private readonly BATCH_THRESHOLD = 20;
    private readonly MAX_QUEUE = 200;
    private readonly ENDPOINT = `${config.authServerUrl}/metrics/events`;

    start() {
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

    track(eventType: string, eventData?: Record<string, unknown>) {
        this.queue.push({
            eventType,
            eventData,
            clientTimestamp: new Date().toISOString(),
        });

        if (this.queue.length >= this.BATCH_THRESHOLD) {
            void this.flush();
        }
    }

    private async flush() {
        if (this.queue.length === 0) return;

        const events = this.queue.splice(0);
        const auth = await getAuth();
        if (!auth?.accessToken) return;

        try {
            const response = await fetch(this.ENDPOINT, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${auth.accessToken}`,
                },
                body: JSON.stringify({ events }),
            });

            if (!response.ok && this.queue.length < this.MAX_QUEUE) {
                this.queue.unshift(...events);
            }
        } catch {
            if (this.queue.length < this.MAX_QUEUE) {
                this.queue.unshift(...events);
            }
        }
    }
}

export const metrics = new MetricsService();
