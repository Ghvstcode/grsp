import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    githubId: integer("github_id").notNull().unique(),
    githubUsername: text("github_username").notNull(),
    githubEmail: text("github_email"),
    githubAvatarUrl: text("github_avatar_url"),
    createdAt: text("created_at").notNull().default("(datetime('now'))"),
    lastLoginAt: text("last_login_at").notNull().default("(datetime('now'))"),
});

export const metricEvents = sqliteTable(
    "metric_events",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        userId: integer("user_id")
            .notNull()
            .references(() => users.id),
        eventType: text("event_type").notNull(),
        eventData: text("event_data"),
        clientTimestamp: text("client_timestamp").notNull(),
        createdAt: text("created_at").notNull().default("(datetime('now'))"),
    },
    (table) => [
        index("idx_metric_events_user_type").on(table.userId, table.eventType),
        index("idx_metric_events_created").on(table.createdAt),
    ],
);
