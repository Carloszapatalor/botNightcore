import { Hono } from "hono";
import { getTursoClient } from "../lib/turso.ts";
import { getClanName } from "../lib/env.ts";
import { fetchClanProfiles, getTodayUTC } from "./clanSnapshot.ts";
import { fetchTodayLogs } from "./clanQuests.ts";
import {
  BOSS_EXP,
  EXP_EVENTO,
  EXP_INCURSION,
  EXP_QUEST_COMBAT,
  EXP_QUEST_SKILLING,
  calcLevel,
  calcTitle,
} from "./rpgConfig.ts";

interface DailyExpEntry {
  questExp:  number;
  bossExp:   number;
  eventExp:  number;
}

export async function calcularExpDiaria(): Promise<{ date: string; processed: number }> {
  const today    = getTodayUTC();
  const clanName = getClanName();
  const db       = getTursoClient();

  // ── 1. Logs del día ───────────────────────────────────────────
  const logs = await fetchTodayLogs(clanName);

  // ── 2. Quests ─────────────────────────────────────────────────
  const questExp: Record<string, number> = {};
  for (const log of logs) {
    const player =
      log.message.match(/^(.+?) completed a daily combat quest/)?.[1] ??
      log.message.match(/^(.+?) completed a skilling quest/)?.[1];
    if (!player) continue;
    const exp = log.message.includes("combat quest")
      ? EXP_QUEST_COMBAT
      : EXP_QUEST_SKILLING;
    questExp[player] = (questExp[player] ?? 0) + exp;
  }

  // ── 3. Boss kills (baseline vs live) ─────────────────────────
  const baselineRows = await db.execute({
    sql: `SELECT username, pvm_stats FROM pvm_snapshots WHERE snapshot_date = ?`,
    args: [today],
  });
  const baseline = new Map<string, Record<string, number>>();
  for (const row of baselineRows.rows as unknown as { username: string; pvm_stats: string }[]) {
    baseline.set(row.username, JSON.parse(row.pvm_stats));
  }

  const liveProfiles = await fetchClanProfiles();
  const bossExp: Record<string, number> = {};

  for (const profile of liveProfiles) {
    const base = baseline.get(profile.username) ?? {};
    let exp = 0;
    for (const [boss, count] of Object.entries(profile.pvmStats)) {
      const delta = count - (base[boss] ?? 0);
      if (delta > 0) exp += delta * (BOSS_EXP[boss] ?? 0);
    }
    if (exp > 0) bossExp[profile.username] = exp;
  }

  // ── 4. Evento/incursión del día ───────────────────────────────
  const eventRow = await db.execute({
    sql: `SELECT event_id, category FROM daily_events WHERE event_date = ?`,
    args: [today],
  });
  const eventExp: Record<string, number> = {};

  if (eventRow.rows.length > 0) {
    const { event_id, category } = eventRow.rows[0] as unknown as { event_id: string; category: string };
    const bonus = category === "incursion" ? EXP_INCURSION : EXP_EVENTO;

    for (const log of logs) {
      const match = log.message.match(/^(.+?) has started a (.+?) event/);
      if (match && match[2] === event_id) {
        eventExp[match[1]] = (eventExp[match[1]] ?? 0) + bonus;
      }
    }
  }

  // ── 5. Consolidar y guardar ───────────────────────────────────
  const allPlayers = new Set([
    ...Object.keys(questExp),
    ...Object.keys(bossExp),
    ...Object.keys(eventExp),
    ...liveProfiles.map((p) => p.username),
  ]);

  let processed = 0;

  for (const username of allPlayers) {
    const entry: DailyExpEntry = {
      questExp:  questExp[username]  ?? 0,
      bossExp:   bossExp[username]   ?? 0,
      eventExp:  eventExp[username]  ?? 0,
    };
    const total = entry.questExp + entry.bossExp + entry.eventExp;

    // guardar desglose diario
    await db.execute({
      sql: `INSERT OR REPLACE INTO rpg_daily_exp
              (username, date, quest_exp, boss_exp, event_exp, total_exp)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [username, today, entry.questExp, entry.bossExp, entry.eventExp, total],
    });

    // obtener total acumulado anterior
    const prev = await db.execute({
      sql: `SELECT total_exp FROM rpg_players WHERE username = ?`,
      args: [username],
    });
    const prevTotal = prev.rows.length > 0
      ? (prev.rows[0] as unknown as { total_exp: number }).total_exp
      : 0;

    const newTotal = prevTotal + total;

    await db.execute({
      sql: `INSERT OR REPLACE INTO rpg_players (username, total_exp, level, title, last_updated)
            VALUES (?, ?, ?, ?, ?)`,
      args: [username, newTotal, calcLevel(newTotal), calcTitle(newTotal), today],
    });

    processed++;
  }

  return { date: today, processed };
}

// Endpoint de disparo manual para pruebas
const rpgCalc = new Hono();

rpgCalc.get("/calcular", async (c) => {
  try {
    const result = await calcularExpDiaria();
    return c.json(result);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default rpgCalc;
