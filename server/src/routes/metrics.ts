import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Bindings } from "../lib/config.js";
import { createDb } from "../db/index.js";
import { users, metricEvents } from "../db/schema.js";
import { fetchGitHubUser } from "../lib/github.js";

const metrics = new Hono<{ Bindings: Bindings }>();

interface MetricEvent {
    eventType: string;
    eventData?: Record<string, unknown>;
    clientTimestamp: string;
}

const INSTALL_ID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_TYPE = /^[a-z][a-z0-9_]{0,47}$/;
const MAX_EVENT_DATA_CHARS = 2000;
// 100 events of at most ~2KB each, with headroom.
const MAX_BODY_BYTES = 256 * 1024;

function isValidEvent(e: unknown): e is MetricEvent {
    if (typeof e !== "object" || e === null) return false;
    const event = e as Partial<MetricEvent>;
    return (
        typeof event.eventType === "string" &&
        EVENT_TYPE.test(event.eventType) &&
        typeof event.clientTimestamp === "string" &&
        !Number.isNaN(new Date(event.clientTimestamp).getTime())
    );
}

/**
 * Usage events from the desktop app. Every batch carries an anonymous install
 * id; a signed-in app also sends its GitHub token so events can be tied to
 * the account. Either one is enough.
 */
metrics.post("/metrics/events", async (c) => {
    // The endpoint takes anonymous posts, so cap each address.
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const limited = await c.env.METRICS_LIMITER?.limit({ key: ip });
    if (limited && !limited.success) {
        return c.json({ error: "Too many requests" }, 429);
    }

    const length = Number(c.req.header("Content-Length") ?? 0);
    if (length > MAX_BODY_BYTES) {
        return c.json({ error: "Payload too large" }, 413);
    }

    const body = await c.req
        .json<{ installId?: unknown; events?: unknown }>()
        .catch(() => undefined);
    if (!body || !Array.isArray(body.events) || body.events.length === 0) {
        return c.json({ error: "No events provided" }, 400);
    }

    const installId =
        typeof body.installId === "string" && INSTALL_ID.test(body.installId)
            ? body.installId.toLowerCase()
            : null;

    const db = createDb(c.env.DB);

    let userId: number | null = null;
    const authHeader = c.req.header("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
        try {
            const ghUser = await fetchGitHubUser(authHeader.slice(7));
            const rows = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.githubId, ghUser.id))
                .limit(1);
            userId = rows.length > 0 ? rows[0].id : null;
        } catch {
            userId = null;
        }
    }

    if (!userId && !installId) {
        return c.json({ error: "Unauthorized" }, 401);
    }

    // Cap batch size and drop malformed events.
    const events = body.events.slice(0, 100).filter(isValidEvent);
    if (events.length === 0) {
        return c.json({ error: "No valid events provided" }, 400);
    }

    await db.insert(metricEvents).values(
        events.map((e) => {
            const data = e.eventData ? JSON.stringify(e.eventData) : null;
            return {
                userId,
                installId,
                eventType: e.eventType,
                eventData:
                    data && data.length <= MAX_EVENT_DATA_CHARS ? data : null,
                clientTimestamp: new Date(e.clientTimestamp).toISOString(),
            };
        }),
    );

    return c.json({ accepted: events.length });
});

export { metrics };
