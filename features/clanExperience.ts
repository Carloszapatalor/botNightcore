import { Hono } from "hono";
import { getTursoClient } from "../lib/turso.ts";
import { syncMemberXp } from "./syncXp.ts";
import { formatExperienceEmbed, sendEmbed } from "../lib/discord.ts";

function getYesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const clanExperience = new Hono();

clanExperience.get("/", async (c) => {
  try {
    await syncMemberXp();
    const db = getTursoClient();
    const yesterday = getYesterdayUTC();

    const rows = await db.execute({
      sql: `SELECT username, xp_gained FROM member_daily_xp WHERE date = ? ORDER BY xp_gained DESC`,
      args: [yesterday],
    });

    const members = rows.rows as unknown as { username: string; xp_gained: number }[];
    const totalXp = members.reduce((s, m) => s + m.xp_gained, 0);

    const contributors = members.map((m) => ({
      username: m.username,
      xp_gained: m.xp_gained,
      pct: totalXp > 0 ? (m.xp_gained / totalXp) * 100 : 0,
    }));

    const signature = `${yesterday}:${totalXp}`;

    const cached = await db.execute({
      sql: `SELECT value FROM app_cache WHERE key = 'experience'`,
    });
    const lastSig = cached.rows.length > 0
      ? (cached.rows[0] as unknown as { value: string }).value
      : "";
    if (signature && signature === lastSig) {
      return c.json({ ok: true, cached: true });
    }

    await sendEmbed("stats", formatExperienceEmbed(yesterday, totalXp, contributors));
    await db.execute({
      sql: `INSERT OR REPLACE INTO app_cache (key, value, updated_at) VALUES ('experience', ?, ?)`,
      args: [signature, new Date().toISOString()],
    });

    return c.json({
      date: yesterday,
      totalXp,
      contributors: contributors.slice(0, 10),
      cached: false,
    });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default clanExperience;
