import { Hono } from "hono";
import { idleGet } from "../lib/api.ts";
import { getTursoClient } from "../lib/turso.ts";
import { getClanName } from "../lib/env.ts";
import { fetchClanProfiles, getTodayUTC } from "./clanSnapshot.ts";
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

interface Log {
  memberUsername: string;
  message: string;
  timestamp: string;
}

const PAGE_SIZE = 100;

async function fetchTodayLogs(clanName: string): Promise<Log[]> {
  const today = getTodayUTC();
  const result: Log[] = [];
  let skip = 0;

  while (true) {
    const page = await idleGet<Log[]>(
      `/api/Clan/logs/clan/${encodeURIComponent(clanName)}?skip=${skip}&limit=${PAGE_SIZE}`
    );
    if (page.length === 0) break;

    for (const log of page) {
      const logDate = log.timestamp.slice(0, 10);
      if (logDate === today) result.push(log);
      else if (logDate < today) return result;
    }

    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  return result;
}

export async function calcularExpDiaria(): Promise<{ date: string; processed: number }> {
  const today    = getTodayUTC();
  const clanName = getClanName();
  const db       = getTursoClient();

  const logs = await fetchTodayLogs(clanName);

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

    await db.execute({
      sql: `INSERT OR REPLACE INTO rpg_daily_exp
              (username, date, quest_exp, boss_exp, event_exp, total_exp)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [username, today, entry.questExp, entry.bossExp, entry.eventExp, total],
    });

    const allExp = await db.execute({
      sql: `SELECT SUM(total_exp) as lifetime FROM rpg_daily_exp WHERE username = ?`,
      args: [username],
    });
    const newTotal = (allExp.rows[0] as unknown as { lifetime: number | null }).lifetime ?? 0;

    await db.execute({
      sql: `INSERT OR REPLACE INTO rpg_players (username, total_exp, level, title, last_updated)
            VALUES (?, ?, ?, ?, ?)`,
      args: [username, newTotal, calcLevel(newTotal), calcTitle(newTotal), today],
    });

    processed++;
  }

  return { date: today, processed };
}

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
