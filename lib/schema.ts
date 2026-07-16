import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";

// All money is integer cents to avoid float drift. Contract prices are 1-99 cents.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  balanceCents: integer("balance_cents").notNull().default(100_000), // $1,000
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Immutable order log. Positions/P&L are derived by aggregating this table.
export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  symbol: text("symbol").notNull(), // upstream market symbol
  marketName: text("market_name").notNull(), // snapshot at fill time
  side: text("side", { enum: ["YES", "NO"] }).notNull(),
  size: integer("size").notNull(), // number of contracts
  fillPriceCents: integer("fill_price_cents").notNull(), // per-contract fill price
  costCents: integer("cost_cents").notNull(), // size * fillPriceCents
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
