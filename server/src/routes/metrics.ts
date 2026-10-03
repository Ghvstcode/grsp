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

metrics.post("/metrics/events", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return c.json({ error: "Unauthorized" }, 401);
    }

    const db = createDb(c.env.DB);
    const token = authHeader.slice(7);

    // Resolve user from token
    let userId: number | null = null;
    try {
        const ghUser = await fetchGitHubUser(token);
        const rows = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.githubId, ghUser.id))
            .limit(1);
        userId = rows.length > 0 ? rows[0].id : null;
    } catch {
        userId = null;
    }

    if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json<{ events: MetricEvent[] }>();
    if (!Array.isArray(body.events) || body.events.length === 0) {
        return c.json({ error: "No events provided" }, 400);
    }

    // Cap batch size
    const events = body.events.slice(0, 100);

    await db.insert(metricEvents).values(
        events.map((e) => ({
            userId,
            eventType: e.eventType,
            eventData: e.eventData ? JSON.stringify(e.eventData) : null,
            clientTimestamp: new Date(e.clientTimestamp).toISOString(),
        })),
    );

    return c.json({ accepted: events.length });
});

export { metrics };
