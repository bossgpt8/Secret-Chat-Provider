import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const memoryFactsTable = pgTable("memory_facts", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  fact: text("fact").notNull(),
  category: text("category").notNull().default("general"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMemoryFactSchema = createInsertSchema(memoryFactsTable);
export type InsertMemoryFact = z.infer<typeof insertMemoryFactSchema>;
export type MemoryFact = typeof memoryFactsTable.$inferSelect;
