import { Hono } from "hono";
import { getTursoClient } from "../lib/turso.ts";

const clanWhitelist = new Hono();

// GET /clan/whitelist — lista todos los exentos
clanWhitelist.get("/", async (c) => {
  const db = getTursoClient();
  try {
    const rows = await db.execute(
      `SELECT username, reason, added_at FROM inactivity_whitelist ORDER BY added_at DESC`
    );
    const list = (rows.rows as unknown as { username: string; reason: string | null; added_at: string }[])
      .map((r) => ({ username: r.username, reason: r.reason ?? null, addedAt: r.added_at }));
    return c.json({ count: list.length, whitelist: list });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// POST /clan/whitelist/:name — añadir jugador (body opcional: { reason })
clanWhitelist.post("/:name", async (c) => {
  const username = c.req.param("name");
  const db = getTursoClient();
  try {
    const body = await c.req.json().catch(() => ({})) as { reason?: string };
    const addedAt = new Date().toISOString().slice(0, 10);
    await db.execute({
      sql: `INSERT OR REPLACE INTO inactivity_whitelist (username, reason, added_at) VALUES (?, ?, ?)`,
      args: [username, body.reason ?? null, addedAt],
    });
    return c.json({ ok: true, username, reason: body.reason ?? null });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// DELETE /clan/whitelist/:name — quitar jugador
clanWhitelist.delete("/:name", async (c) => {
  const username = c.req.param("name");
  const db = getTursoClient();
  try {
    const result = await db.execute({
      sql: `DELETE FROM inactivity_whitelist WHERE username = ?`,
      args: [username],
    });
    const removed = (result.rowsAffected ?? 0) > 0;
    return c.json({ ok: removed, username, message: removed ? "Eliminado de la whitelist" : "No estaba en la whitelist" });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// PUT /clan/whitelist/:name — actualizar reason
clanWhitelist.put("/:name", async (c) => {
  const username = c.req.param("name");
  const db = getTursoClient();
  try {
    const body = await c.req.json().catch(() => ({})) as { reason?: string };
    const addedAt = new Date().toISOString().slice(0, 10);
    await db.execute({
      sql: `INSERT OR REPLACE INTO inactivity_whitelist (username, reason, added_at) VALUES (?, ?, ?)`,
      args: [username, body.reason ?? null, addedAt],
    });
    return c.json({ ok: true, username, reason: body.reason ?? null });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default clanWhitelist;
