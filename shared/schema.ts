import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const collabProToolsSync = pgTable(
  "collab_protools_sync",
  {
    externalTrackId: varchar("external_track_id", { length: 160 }).notNull(),
    projectId: varchar("project_id", { length: 160 })
      .notNull()
      .default("__default__"),
    source: varchar("source", { length: 120 })
      .notNull()
      .default("protools-companion"),
    bpm: integer("bpm"),
    markers: jsonb("markers").notNull().default(sql`'[]'::jsonb`),
    takeScores: jsonb("take_scores").notNull().default(sql`'[]'::jsonb`),
    pronunciationFeedback: jsonb("pronunciation_feedback")
      .notNull()
      .default(sql`'[]'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    receivedAt: timestamp("received_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.externalTrackId, table.projectId] }),
    index("idx_collab_protools_sync_project_id").on(table.projectId),
    index("idx_collab_protools_sync_source").on(table.source),
    index("idx_collab_protools_sync_updated_at").on(table.updatedAt),
  ]
);

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type CollabProToolsSyncRow = typeof collabProToolsSync.$inferSelect;
