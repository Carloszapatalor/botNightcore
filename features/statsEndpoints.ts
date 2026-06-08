import { Hono } from "hono";
import { syncMemberXp, syncClanRank } from "./syncXp.ts";
import { computeAllMetrics } from "./metricsCalc.ts";
import { checkAndUpdateGoals, checkAllGoalsToday } from "./goalsEngine.ts";
import { getRankProgressEmbed, getGoalsProgressEmbed } from "./progressEmbed.ts";
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

// GET /stats/metrics-now — recalcula métricas manualmente
stats.get("/metrics-now", async (c) => {
  try {
    const result = await computeAllMetrics();
    return c.json({ ok: true, ...result });
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
    const embed = await getRankProgressEmbed();
    await sendEmbed("stats", embed);
    return c.json(embed);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// GET /stats/goals-progress — embed visual de metas del día (solo lectura)
stats.get("/goals-progress", async (c) => {
  try {
    const embed = await getGoalsProgressEmbed();
    await sendEmbed("stats", embed);
    return c.json(embed);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default stats;
