import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tripState = sqliteTable("trip_state", {
  id: integer("id").primaryKey(),
  state: text("state").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

