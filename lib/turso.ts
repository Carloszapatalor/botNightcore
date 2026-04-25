import { createClient } from "npm:@libsql/client/web";

export function getTursoClient() {
  const url = Deno.env.get("TURSO_URL");
  const authToken = Deno.env.get("TURSO_AUTH_TOKEN");
  if (!url || !authToken) throw new Error("TURSO_URL or TURSO_AUTH_TOKEN not configured");
  return createClient({ url, authToken });
}

export async function initDb() {
  const db = getTursoClient();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS pvm_snapshots (
      username      TEXT NOT NULL,
      snapshot_date TEXT NOT NULL,
      pvm_stats     TEXT NOT NULL,
      PRIMARY KEY (username, snapshot_date)
    )
  `);
  await db.execute(`DROP TABLE IF EXISTS daily_events`);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS daily_events (
      event_date  TEXT NOT NULL,
      category    TEXT NOT NULL,
      event_id    TEXT NOT NULL,
      label       TEXT NOT NULL,
      selected_at TEXT NOT NULL,
      PRIMARY KEY (event_date, category)
    )
  `);
}
