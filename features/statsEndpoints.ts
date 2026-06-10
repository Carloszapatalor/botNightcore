import { Hono } from "hono";
import { syncMemberXp, syncClanRank } from "./syncXp.ts";
import { computeAllMetrics } from "./metricsCalc.ts";
import { checkAndUpdateGoals, checkAllGoalsToday } from "./goalsEngine.ts";
import { getRankProgressEmbed, getGoalsProgressEmbed } from "./progressEmbed.ts";
import { awardBadgesAll } from "./badgesEngine.ts";
import { checkAnnouncements } from "./announcements.ts";
import { getTursoClient } from "../lib/turso.ts";
import { sendEmbed } from "../lib/discord.ts";

const stats = new Hono();

// GET /stats/sync-now — sincroniza XP de miembros y rank del clan
stats.get("/sync-now", async (c) => {
  try {
    const xpResult = await syncMemberXp();
    const rankResult = await syncClanRank();
    return c.json({ ok: true, ...xpResult, rank: rankResult.rank });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// GET /stats/metrics-now — recalcula métricas, metas, badges y anuncios
stats.get("/metrics-now", async (c) => {
  try {
    const metrics = await computeAllMetrics();
    const rankData = await syncClanRank();
    const goals = await checkAllGoalsToday();
    const newBadges = await awardBadgesAll();
    const announcements = await checkAnnouncements(rankData, false);
    const badgeCount = Object.values(newBadges).flat().length;
    return c.json({
      ok: true,
      ...metrics,
      rank: rankData.rank,
      goals: goals.length,
      badges: badgeCount,
      announcements: announcements.length,
    });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// GET /stats/goals — metas de todos los miembros hoy
stats.get("/goals", async (c) => {
  try {
    await syncMemberXp();
    const goals = await checkAllGoalsToday();
    return c.json({ date: new Date().toISOString().slice(0, 10), members: goals });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// GET /stats/goals/:name — meta de un jugador hoy
stats.get("/goals/:name", async (c) => {
  try {
    const status = await checkAndUpdateGoals(c.req.param("name"));
    return c.json(status);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// GET /stats/rank-progress — embed visual de progreso del clan hacia top 100
stats.get("/rank-progress", async (c) => {
  try {
    const { embed, signature } = await getRankProgressEmbed();
    const db = getTursoClient();
    const cached = await db.execute({
      sql: `SELECT value FROM app_cache WHERE key = 'rank_progress'`,
    });
    const lastSig = cached.rows.length > 0
      ? (cached.rows[0] as unknown as { value: string }).value
      : "";
    if (signature && signature === lastSig) {
      return c.json({ ok: true, cached: true });
    }
    await sendEmbed("stats", embed);
    await db.execute({
      sql: `INSERT OR REPLACE INTO app_cache (key, value, updated_at) VALUES ('rank_progress', ?, ?)`,
      args: [signature, new Date().toISOString()],
    });
    return c.json({ ok: true, cached: false, embed });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// GET /stats/goals-progress — embed visual de metas del día (solo lectura)
stats.get("/goals-progress", async (c) => {
  try {
    const { embed, signature } = await getGoalsProgressEmbed();
    const db = getTursoClient();
    const cached = await db.execute({
      sql: `SELECT value FROM app_cache WHERE key = 'goals_progress'`,
    });
    const lastSig = cached.rows.length > 0
      ? (cached.rows[0] as unknown as { value: string }).value
      : "";
    if (signature && signature === lastSig) {
      return c.json({ ok: true, cached: true });
    }
    await sendEmbed("stats", embed);
    await db.execute({
      sql: `INSERT OR REPLACE INTO app_cache (key, value, updated_at) VALUES ('goals_progress', ?, ?)`,
      args: [signature, new Date().toISOString()],
    });
    return c.json({ ok: true, cached: false, embed });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default stats;
