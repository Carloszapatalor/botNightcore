import { Hono } from "hono";
import { getTursoClient } from "../lib/turso.ts";
import { getTodayUTC } from "./clanSnapshot.ts";
import { formatRankingEmbed, isInTimeWindow, sendEmbed } from "../lib/discord.ts";

function getWeekStartUTC(): string {
  const d = new Date();
  const day = d.getUTCDay(); // 0=dom, 1=lun
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}

const rpgProfile = new Hono();

// Ranking permanente
rpgProfile.get("/ranking", async (c) => {
  const db = getTursoClient();
  try {
    const rows = await db.execute(
      `SELECT username, total_exp, level, title FROM rpg_players ORDER BY total_exp DESC LIMIT 5`
    );
    const ranking = (rows.rows as unknown as { username: string; total_exp: number; level: number; title: string }[])
      .map((r, i) => ({ pos: i + 1, player: r.username, level: r.level, title: r.title, totalExp: r.total_exp }));
    return c.json({ ranking });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// Ranking semanal
rpgProfile.get("/ranking/semanal", async (c) => {
  const db = getTursoClient();
  const weekStart = getWeekStartUTC();
  try {
    const rows = await db.execute({
      sql: `SELECT d.username, SUM(d.total_exp) as week_exp, COALESCE(p.title, '🌱 Buscador') as title
            FROM rpg_daily_exp d
            LEFT JOIN rpg_players p ON p.username = d.username
            WHERE d.date >= ?
            GROUP BY d.username
            ORDER BY week_exp DESC
            LIMIT 5`,
      args: [weekStart],
    });
    const ranking = (rows.rows as unknown as { username: string; week_exp: number; title: string }[])
      .map((r, i) => ({ pos: i + 1, player: r.username, title: r.title, weekExp: r.week_exp }));

    const force = c.req.query("force") === "true";
    if (force || isInTimeWindow(23, 57, 23, 59)) {
      await sendEmbed("ranking", formatRankingEmbed(ranking, weekStart));
    }

    return c.json({ weekStart, ranking });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// Perfil individual
rpgProfile.get("/perfil/:name", async (c) => {
  const name = c.req.param("name");
  const db = getTursoClient();
  const today = getTodayUTC();
  const weekStart = getWeekStartUTC();
  try {
    const [playerRow, todayRow, weekRow] = await Promise.all([
      db.execute({ sql: `SELECT * FROM rpg_players WHERE username = ?`, args: [name] }),
      db.execute({ sql: `SELECT quest_exp, boss_exp, event_exp, total_exp FROM rpg_daily_exp WHERE username = ? AND date = ?`, args: [name, today] }),
      db.execute({ sql: `SELECT SUM(total_exp) as week_exp FROM rpg_daily_exp WHERE username = ? AND date >= ?`, args: [name, weekStart] }),
    ]);

    if (playerRow.rows.length === 0) {
      return c.json({ error: `${name} no tiene datos RPG aún. Ejecuta /rpg/calcular primero.` }, 404);
    }

    const p = playerRow.rows[0] as unknown as { username: string; total_exp: number; level: number; title: string; last_updated: string };
    const t = todayRow.rows[0] as unknown as { quest_exp: number; boss_exp: number; event_exp: number; total_exp: number } | undefined;
    const w = weekRow.rows[0] as unknown as { week_exp: number } | undefined;

    return c.json({
      player:       p.username,
      title:        p.title,
      level:        p.level,
      totalExp:     p.total_exp,
      weekExp:      w?.week_exp ?? 0,
      lastUpdated:  p.last_updated,
      today: t
        ? { questExp: t.quest_exp, bossExp: t.boss_exp, eventExp: t.event_exp, total: t.total_exp }
        : null,
    });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// Todos los perfiles del clan
rpgProfile.get("/perfiles", async (c) => {
  const db = getTursoClient();
  try {
    const rows = await db.execute(
      `SELECT username, total_exp, level, title, last_updated FROM rpg_players ORDER BY total_exp DESC`
    );
    const perfiles = (rows.rows as unknown as { username: string; total_exp: number; level: number; title: string; last_updated: string }[])
      .map((r) => ({ player: r.username, title: r.title, level: r.level, totalExp: r.total_exp, lastUpdated: r.last_updated }));
    return c.json({ total: perfiles.length, perfiles });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default rpgProfile;
