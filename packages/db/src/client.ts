import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/booking_agent";

const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });

export type DbClient = typeof db;
