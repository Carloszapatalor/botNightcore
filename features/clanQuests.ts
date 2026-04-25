import { Hono } from "hono";
import { idleGet } from "../lib/api.ts";
import { getClanName } from "../lib/env.ts";

const PAGE_SIZE = 100;

interface Log {
  memberUsername: string;
  message: string;
  timestamp: string;
}

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function fetchTodayLogs(clanName: string): Promise<Log[]> {
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

function formatQuestReport(
  combat: Record<string, number>,
  skilling: Record<string, number>
): string {
  const sortDesc = (map: Record<string, number>) =>
    Object.entries(map).sort((a, b) => b[1] - a[1]);

  const lines: string[] = ["Misiones de combate"];
  const combatEntries = sortDesc(combat);
  if (combatEntries.length === 0) lines.push("Nadie ha completado misiones de combate hoy.");
  else combatEntries.forEach(([p, n]) => lines.push(`${p} ${n}`));

  lines.push("", "Misiones de habilidad (skilling)");
  const skillingEntries = sortDesc(skilling);
  if (skillingEntries.length === 0) lines.push("Nadie ha completado misiones de habilidad hoy.");
  else skillingEntries.forEach(([p, n]) => lines.push(`${p} ${n}`));

  return lines.join("\n");
}

const clanQuests = new Hono();

clanQuests.get("/", async (c) => {
  try {
    const clanName = getClanName();
    const todayLogs = await fetchTodayLogs(clanName);

    const combat: Record<string, number> = {};
    const skilling: Record<string, number> = {};

    for (const log of todayLogs) {
      const combatMatch = log.message.match(/^(.+?) completed a daily combat quest/);
      const skillingMatch = log.message.match(/^(.+?) completed a skilling quest/);
      if (combatMatch) combat[combatMatch[1]] = (combat[combatMatch[1]] ?? 0) + 1;
      else if (skillingMatch) skilling[skillingMatch[1]] = (skilling[skillingMatch[1]] ?? 0) + 1;
    }

    return c.text(formatQuestReport(combat, skilling));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default clanQuests;
