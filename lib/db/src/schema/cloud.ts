import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const accountCloudTable = pgTable("account_cloud", {
  userId: text("user_id").primaryKey(),
  revision: integer("revision").notNull().default(0),
  entries: jsonb("entries").$type<Record<string, string>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertAccountCloudSchema = createInsertSchema(accountCloudTable);
export type AccountCloud = typeof accountCloudTable.$inferSelect;
