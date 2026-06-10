import { Hono } from "hono";
import { getTursoClient } from "../lib/turso.ts";
import { fetchClanProfiles, getTodayUTC, takeSnapshot } from "./clanSnapshot.ts";
import { formatBossReportEmbed, sendEmbed } from "../lib/discord.ts";

type PvmStats = Record<string, number>;

interface StoredSnapshot {
  username: string;
  pvm_stats: string;
}

export interface BossReportData {
  text:        string;
  killsByBoss: Map<string, { player: string; kills: number }[]>;
  topKillers:  { player: string; total: number }[];
}

export async function buildBossReport(): Promise<BossReportData> {
  const today = getTodayUTC();
  const now = new Date().toISOString().slice(11, 16); // HH:MM
  const db = getTursoClient();

  // cargar baseline de hoy (auto-crear si no existe)
  let baselineRows = await db.execute({
    sql: `SELECT username, pvm_stats FROM pvm_snapshots WHERE snapshot_date = ?`,
    args: [today],
  });

  if (baselineRows.rows.length === 0) {
    await takeSnapshot();
    baselineRows = await db.execute({
      sql: `SELECT username, pvm_stats FROM pvm_snapshots WHERE snapshot_date = ?`,
      args: [today],
    });
    if (baselineRows.rows.length === 0) {
      return { text: `No se pudo crear el baseline para hoy (${today}).`, killsByBoss: new Map(), topKillers: [] };
    }
  }

  const baseline = new Map<string, PvmStats>();
  for (const row of baselineRows.rows as unknown as StoredSnapshot[]) {
    baseline.set(row.username, JSON.parse(row.pvm_stats));
  }

  // datos en vivo desde la API
  const liveProfiles = await fetchClanProfiles();

  // calcular diff: kills desde el baseline hasta ahora
  const killsByBoss = new Map<string, { player: string; kills: number }[]>();
  const totalPerPlayer: { player: string; total: number }[] = [];

  for (const profile of liveProfiles) {
    const base = baseline.get(profile.username) ?? {};
    let playerTotal = 0;

    for (const [boss, count] of Object.entries(profile.pvmStats)) {
      const delta = count - (base[boss] ?? 0);
      if (delta > 0) {
        if (!killsByBoss.has(boss)) killsByBoss.set(boss, []);
        killsByBoss.get(boss)!.push({ player: profile.username, kills: delta });
        playerTotal += delta;
      }
    }

    if (playerTotal > 0) totalPerPlayer.push({ player: profile.username, total: playerTotal });
  }

  for (const entries of killsByBoss.values()) {
    entries.sort((a, b) => b.kills - a.kills);
  }
  totalPerPlayer.sort((a, b) => b.total - a.total);

  const lines: string[] = [
    `📊 Kills del día — ${today}`,
    `🕐 Actualizado a las ${now} UTC`,
    "",
  ];

  if (killsByBoss.size === 0) {
    lines.push("Nadie ha matado jefes desde el baseline de hoy.");
  } else {
    for (const boss of [...killsByBoss.keys()].sort()) {
      lines.push(`⚔️ ${boss}`);
      for (const { player, kills } of killsByBoss.get(boss)!) {
        lines.push(`  ${player}: ${kills}`);
      }
      lines.push("");
    }

    lines.push("🏆 Top killers de hoy");
    totalPerPlayer.forEach(({ player, total }, i) => {
      lines.push(`  ${i + 1}. ${player}: ${total} kills`);
    });
  }

  return { text: lines.join("\n"), killsByBoss, topKillers: totalPerPlayer };
}

const clanBossReport = new Hono();

clanBossReport.get("/", async (c) => {
  try {
    const { text, killsByBoss, topKillers } = await buildBossReport();
    const today = new Date().toISOString().slice(0, 10);
    const totalKills = topKillers.reduce((s, k) => s + k.total, 0);
    const signature = `${today}:${topKillers.length}:${totalKills}`;

    const db = getTursoClient();
    const cached = await db.execute({
      sql: `SELECT value FROM app_cache WHERE key = 'boss_report'`,
    });
    const lastSig = cached.rows.length > 0
      ? (cached.rows[0] as unknown as { value: string }).value
      : "";
    if (signature && signature === lastSig) {
      return c.json({ ok: true, cached: true });
    }

    await sendEmbed("bosses", formatBossReportEmbed(killsByBoss, topKillers));
    await db.execute({
      sql: `INSERT OR REPLACE INTO app_cache (key, value, updated_at) VALUES ('boss_report', ?, ?)`,
      args: [signature, new Date().toISOString()],
    });

    return c.json({ ok: true, cached: false, kills: totalKills });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default clanBossReport;
