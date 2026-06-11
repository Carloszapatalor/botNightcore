import { Hono } from "hono";
import clanExperience from "./features/clanExperience.ts";
import clanBossReport from "./features/clanBossReport.ts";
import clanSnapshot from "./features/clanSnapshot.ts";
import eventosClan from "./features/eventosClan.ts";
import clanReporte from "./features/clanReporte.ts";
import clanCupTracker from "./features/clanCupTracker.ts";
import rpgCalc from "./features/rpgCalc.ts";
import { initDb } from "./lib/turso.ts";
import statsEndpoints from "./features/statsEndpoints.ts";
import { syncMemberXp, syncClanRank } from "./features/syncXp.ts";
import { computeAllMetrics, pruneOldHistory } from "./features/metricsCalc.ts";
import { checkAnnouncements } from "./features/announcements.ts";
import { calcularExpDiaria } from "./features/rpgCalc.ts";
import { takeSnapshot } from "./features/clanSnapshot.ts";
import { checkAllGoalsToday } from "./features/goalsEngine.ts";
import { awardBadgesAll } from "./features/badgesEngine.ts";

const ENDPOINTS = [
  { method: "GET",  path: "/health",               description: "Verifica estado de Turso e Idle API" },
  { method: "GET",  path: "/clan/experience",       description: "TOP XP del día anterior (embed Discord)" },
  { method: "GET",  path: "/clan/boss-report",      description: "Kills de jefes del día. Top killers" },
  { method: "GET",  path: "/clan/reporte",           description: "Inactivos +48h offline y sin EXP últimas 30h" },
  { method: "GET",  path: "/clan/eventos/lista",     description: "Incursiones, jefes y eventos disponibles" },
  { method: "GET",  path: "/clan/eventos/hoy",       description: "Evento del día sorteado" },
  { method: "GET",  path: "/clan/eventos/sortear",   description: "Fuerza un nuevo sorteo para hoy" },
  { method: "GET",  path: "/clan/snapshot",          description: "Guarda baseline PVM para boss-report" },
  { method: "POST", path: "/clan/snapshot",          description: "Guarda baseline PVM (POST)" },
  { method: "GET",  path: "/rpg/calcular",           description: "Calcula EXP diaria RPG" },
  { method: "GET",  path: "/stats/sync-now",         description: "Sincroniza XP de miembros (cada 15 min)" },
  { method: "GET",  path: "/stats/metrics-now",      description: "Recalcula métricas de miembros" },
  { method: "GET",  path: "/stats/goals",            description: "Metas diarias de XP de todos los miembros" },
  { method: "GET",  path: "/stats/goals/:name",      description: "Meta diaria de XP de un jugador" },
  { method: "GET",  path: "/stats/rank-progress",     description: "Progreso del clan hacia top 100 (embed Discord)" },
  { method: "GET",  path: "/stats/goals-progress", description: "Progreso de metas del día con niveles (embed Discord)" },
  { method: "GET",  path: "/clan/cup-weekly",       description: "Objetivos semanales de la copa (embed Discord)" },
  { method: "GET",  path: "/clan/cup-status",       description: "Estado actual de la copa: puntos y posiciones (embed Discord)" },
];

const app = new Hono();

app.get("/health", async (c) => {
  const checks: Record<string, string> = {};

  try {
    const { getTursoClient } = await import("./lib/turso.ts");
    const db = getTursoClient();
    await db.execute(`SELECT 1`);
    checks.turso = "ok";
  } catch {
    checks.turso = "error";
  }

  try {
    const { idleGet } = await import("./lib/api.ts");
    await idleGet<{ clanName: string }>(`/api/Clan/Nightcore`);
    checks.idleApi = "ok";
  } catch {
    checks.idleApi = "error";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");
  return c.json({ status: allOk ? "ok" : "error", checks });
});

app.get("/", (c) => {
  const rows = ENDPOINTS.map(
    (e) => `<tr><td>${e.method}</td><td><code>${e.path}</code></td><td>${e.description}</td></tr>`
  ).join("");

  return c.html(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>botNightcore API</title>
  <style>
    body { font-family: sans-serif; max-width: 900px; margin: 40px auto; padding: 0 16px; }
    h1 { font-size: 1.4rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { text-align: left; padding: 8px 12px; background: #f0f0f0; border-bottom: 2px solid #ccc; }
    td { padding: 8px 12px; border-bottom: 1px solid #e0e0e0; vertical-align: top; }
    td:first-child { font-weight: bold; font-size: 0.8em; color: #555; white-space: nowrap; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    tr:hover td { background: #fafafa; }
  </style>
</head>
<body>
  <h1>botNightcore — Idle Clans API</h1>
  <table>
    <thead><tr><th>Método</th><th>Ruta</th><th>Descripción</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`);
});

app.route("/clan/experience",  clanExperience);
app.route("/clan/boss-report", clanBossReport);
app.route("/clan/snapshot",    clanSnapshot);
app.route("/clan/reporte",    clanReporte);
app.route("/clan",            clanCupTracker);
app.route("/clan/eventos",     eventosClan);
app.route("/rpg",              rpgCalc);
app.route("/stats",            statsEndpoints);

// Inicializar DB al arrancar
await initDb().catch((e) => console.warn("Turso not configured:", e.message));

Deno.serve(app.fetch);

// ── Cron jobs ──────────────────────────────────────────────────────────────

// Cada 15 min: sync XP de miembros + rank del clan desde la API
Deno.cron("sync-xp", "*/15 * * * *", async () => {
  try {
    const result = await syncMemberXp();
    const rankResult = await syncClanRank();
    console.log(`[cron] sync-xp: ${result.synced} jugadores sincronizados, rank=${rankResult.rank ?? "N/A"} (${result.date})`);
  } catch (e) {
    console.error("[cron] sync-xp error:", (e as Error).message);
  }
});

// Cada hora: rank del clan + recalcular métricas + anuncios Discord
Deno.cron("hourly-metrics", "0 * * * *", async () => {
  try {
    const rankData = await syncClanRank();
    const metrics = await computeAllMetrics();
    await checkAllGoalsToday();
    const newBadges = await awardBadgesAll();
    await checkAnnouncements(rankData, false);
    const badgeCount = Object.values(newBadges).flat().length;
    console.log(`[cron] hourly-metrics: rank=${rankData.rank ?? "N/A"}, jugadores=${metrics.processed}, badges=${badgeCount}`);
  } catch (e) {
    console.error("[cron] hourly-metrics error:", (e as Error).message);
  }
});

// Diario a las 00:05 UTC: snapshot PVM + cálculo RPG + limpieza 90 días
Deno.cron("daily-snapshot", "5 0 * * *", async () => {
  try {
    const snap = await takeSnapshot();
    const rpg = await calcularExpDiaria();
    await pruneOldHistory(90);
    console.log(`[cron] daily-snapshot: snapshot=${snap.saved}, rpg=${rpg.processed}`);
  } catch (e) {
    console.error("[cron] daily-snapshot error:", (e as Error).message);
  }
});
