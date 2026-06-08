import { getTursoClient } from "../lib/turso.ts";
import { idleGet } from "../lib/api.ts";
import { getClanName } from "../lib/env.ts";
import type { DiscordEmbed } from "../lib/discord.ts";

const META_XP = 5_000_000;

function makeBar(value: number, total: number, width = 20): string {
  const pct = Math.min(Math.max(value / total, 0), 1);
  const filled = Math.round(pct * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

interface RecruitmentData {
  memberlist: { memberName: string }[];
}

interface LeaderboardProfile {
  totalLevelResult?: {
    totalLevel?: number;
    score?: number;
    rank?: number;
  };
}

export async function getRankProgressEmbed(): Promise<DiscordEmbed> {
  const db = getTursoClient();
  const clanName = getClanName();

  // Obtener rank y XP total desde la API
  let profileRank: number | null = null;
  let totalXp: number = 0;
  try {
    const data = await idleGet<LeaderboardProfile>(
      `/api/Leaderboard/profile/clans:default/${encodeURIComponent(clanName)}`
    );
    profileRank = data.totalLevelResult?.rank ?? null;
    totalXp = data.totalLevelResult?.score ?? 0;
  } catch {
    // si falla la API, seguir con datos locales
  }

  // XP 24h desde clan_rank_history
  const xpRows = await db.execute(
    `SELECT total_xp_24h, recorded_at FROM clan_rank_history WHERE total_xp_24h > 0 ORDER BY recorded_at DESC LIMIT 2`
  );
  const latest = xpRows.rows[0] as unknown as { total_xp_24h: number; recorded_at: string } | undefined;
  const prev = xpRows.rows[1] as unknown as { total_xp_24h: number } | undefined;

  const xp24h = latest?.total_xp_24h ?? 0;
  const xpPrev = prev?.total_xp_24h ?? 0;
  const xpTrend = xp24h > xpPrev * 1.05 ? "↑" : xp24h < xpPrev * 0.95 ? "↓" : "→";

  // Promedio XP diaria últimos 7 días
  const weekAgo = new Date();
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);

  const weekRows = await db.execute({
    sql: `SELECT COALESCE(SUM(xp_gained), 0) as total FROM member_daily_xp WHERE date >= ?`,
    args: [weekAgoStr],
  });
  const totalXpWeek = (weekRows.rows[0] as unknown as { total: number }).total;
  const avgDailyXp = Math.round(totalXpWeek / 7);

  // Metas
  const goalRow = await db.execute(`SELECT target_rank, start_rank, start_date FROM clan_rank_goal WHERE id = 1`);
  const goal = goalRow.rows[0] as unknown as {
    target_rank: number;
    start_rank: number | null;
    start_date: string | null;
  } | undefined;

  const targetRank = goal?.target_rank ?? 100;
  const startRank = goal?.start_rank ?? null;
  const currentRank = profileRank ?? startRank;
  const xpDisplay = xp24h > 0 ? xp24h : xpPrev;

  // Estimación de días para alcanzar el objetivo
  let etaStr = "";
  if (currentRank !== null && currentRank > targetRank) {
    const faltantes = currentRank - targetRank;
    // Buscar rank histórico más antiguo disponible para calcular ritmo
    const histRows = await db.execute(
      `SELECT rank_position FROM clan_rank_history WHERE rank_position IS NOT NULL ORDER BY recorded_at ASC LIMIT 1`
    );
    if (histRows.rows.length > 0) {
      const oldRank = (histRows.rows[0] as unknown as { rank_position: number }).rank_position;
      const histCount = await db.execute(
        `SELECT COUNT(*) as cnt FROM clan_rank_history WHERE rank_position IS NOT NULL`
      );
      const totalHours = ((histCount.rows[0] as unknown as { cnt: number }).cnt) * 1; // ~1h entre registros
      if (totalHours > 0 && oldRank > currentRank) {
        const posGanadas = oldRank - currentRank;
        const diasParaUnaPos = totalHours / 24 / posGanadas;
        const etaDias = Math.round(faltantes * diasParaUnaPos);
        if (etaDias > 0 && etaDias < 365) {
          etaStr = `⏱️ **${etaDias} días** estimados al ritmo actual`;
        }
      }
    }
  }

  const fields: { name: string; value: string; inline: boolean }[] = [];

  if (startRank !== null && currentRank !== null && startRank > targetRank) {
    const totalCamino = startRank - targetRank;
    const recorrido = Math.max(startRank - currentRank, 0);
    const faltantes = Math.max(currentRank - targetRank, 0);
    const barStr = makeBar(recorrido, totalCamino);
    const pct = Math.round((recorrido / totalCamino) * 100);

    fields.push(
      { name: "📊 Progreso hacia el objetivo", value: `\`${barStr}\` **${pct}%**`, inline: false },
      { name: "🏆 Rank actual", value: `#${currentRank}`, inline: true },
      { name: "🎯 Objetivo", value: `Top #${targetRank}`, inline: true },
      { name: "📍 Faltan", value: `${faltantes} posiciones`, inline: true },
    );
  } else if (startRank !== null) {
    fields.push(
      { name: "🏆 Rank de inicio", value: `#${startRank} (${goal?.start_date ?? ""})`, inline: true },
      { name: "🎯 Objetivo", value: `Top #${targetRank}`, inline: true },
      { name: "📍 Rank actual", value: profileRank !== null ? `#${profileRank}` : "⏳ Detectando...", inline: false },
    );
  } else {
    fields.push(
      { name: "🎯 Objetivo", value: `Top #${targetRank}`, inline: true },
      { name: "⚙️ Rank inicial", value: profileRank !== null
        ? `#${profileRank} — se auto-configurará en el próximo sync`
        : "⏳ Detectando rank de la API...", inline: false },
    );
  }

  // XP stats
  const xpLine = xpDisplay > 0 ? `${fmtNum(xpDisplay)} ${xpTrend}` : "Sin datos";
  fields.push(
    { name: "📈 XP 24h", value: xpLine, inline: true },
  );
  if (avgDailyXp > 0) {
    fields.push({ name: "📊 Promedio diario (7d)", value: fmtNum(avgDailyXp), inline: true });
  }
  if (totalXp > 0) {
    fields.push({ name: "💎 XP total del clan", value: fmtNum(totalXp), inline: true });
  }
  if (etaStr) {
    fields.push({ name: "🎯 Proyección Top 100", value: etaStr, inline: false });
  }

  const description = currentRank !== null && currentRank <= targetRank
    ? "🎉 ¡**OBJETIVO ALCANZADO!** El clan está en el top 100."
    : xpDisplay > 0
      ? `Rank **#${currentRank}** — El clan ganó **${fmtNum(xpDisplay)} XP** en las últimas 24h`
      : "Corre `GET /stats/sync-now` para cargar datos del clan.";

  return {
    title: `🏰 PROGRESO DEL CLAN — Hacia el Top #${targetRank}`,
    description,
    color: 0x00DD88,
    fields,
    footer: { text: "🏰 Clan Nightcore • Sistema de progreso" },
    timestamp: new Date().toISOString(),
  };
}

export async function getGoalsProgressEmbed(date?: string): Promise<DiscordEmbed> {
  const db = getTursoClient();
  const day = date ?? new Date().toISOString().slice(0, 10);

  // Obtener lista completa de miembros desde la API
  const clanName = getClanName();
  let todosLosMiembros: string[] = [];
  try {
    const recruitment = await idleGet<RecruitmentData>(
      `/api/Clan/recruitment/${encodeURIComponent(clanName)}`
    );
    todosLosMiembros = recruitment.memberlist.map((m) => m.memberName);
  } catch {
    return {
      title: `🎯 META DEL CLAN — ${day}`,
      description: "Error al obtener miembros del clan.",
      color: 0x00DD88,
      footer: { text: "🏰 Clan Nightcore" },
      timestamp: new Date().toISOString(),
    };
  }

  const totalMiembros = todosLosMiembros.length;
  const metaClan = totalMiembros * META_XP;

  // XP de hoy desde la DB
  const rows = await db.execute({
    sql: `SELECT username, xp_gained FROM member_daily_xp WHERE date = ?`,
    args: [day],
  });

  const xpMap = new Map<string, number>();
  for (const row of rows.rows as unknown as { username: string; xp_gained: number }[]) {
    xpMap.set(row.username, row.xp_gained);
  }

  // Fusionar: cada miembro del clan tiene XP (0 si no está en DB)
  const miembrosCompletos = todosLosMiembros.map((username) => ({
    username,
    xp_gained: xpMap.get(username) ?? 0,
  })).sort((a, b) => b.xp_gained - a.xp_gained);

  const totalXp = miembrosCompletos.reduce((s, m) => s + m.xp_gained, 0);

  const fields: { name: string; value: string; inline: boolean }[] = [];

  // Barra global del clan
  const barGlobal = makeBar(totalXp, metaClan);
  const pctGlobal = metaClan > 0 ? Math.round((totalXp / metaClan) * 100) : 0;

  const completados = miembrosCompletos.filter((m) => m.xp_gained >= META_XP);
  const enProgreso = miembrosCompletos.filter((m) => m.xp_gained > 0 && m.xp_gained < META_XP);
  const sinActividad = miembrosCompletos.filter((m) => m.xp_gained === 0);

  // Header con barra global
  fields.push({
    name: "📊 Progreso del clan",
    value: `\`${barGlobal}\` **${pctGlobal}%**\n**${fmtNum(totalXp)}** / ${fmtNum(metaClan)} XP (**${totalMiembros} miembros × 5M**)`,
    inline: false,
  });

  // ✅ COMPLETARON LA META (5M+)
  if (completados.length > 0) {
    const lines = completados.map((m) =>
      `**${m.username}** — ${fmtNum(m.xp_gained)} ✅`
    );
    fields.push({ name: `✅ COMPLETARON LA META — ${completados.length}`, value: lines.join("\n"), inline: false });
  }

  // 🔄 EN PROGRESO
  if (enProgreso.length > 0) {
    const lines = enProgreso.map((m) => {
      const pct = Math.round((m.xp_gained / META_XP) * 100);
      const bar = makeBar(m.xp_gained, META_XP, 12);
      const falta = META_XP - m.xp_gained;
      return `**${m.username}** — ${fmtNum(m.xp_gained)} \`${bar}\` ${pct}% — faltan **${fmtNum(falta)}**`;
    });
    fields.push({ name: `🔄 EN PROGRESO — ${enProgreso.length}`, value: lines.join("\n"), inline: false });
  }

  // 💪 SIN ACTIVIDAD HOY
  if (sinActividad.length > 0) {
    fields.push({
      name: `💪 SIN ACTIVIDAD HOY — ${sinActividad.length}`,
      value: sinActividad.map((m) => `**${m.username}** — 0 XP`).join("\n"),
      inline: false,
    });
  }

  return {
    title: `🎯 META DEL CLAN — ${day}`,
    description: `Objetivo: cada miembro aporta **${fmtNum(META_XP)} XP**\n${totalMiembros} miembros → **${fmtNum(metaClan)} XP** totales`,
    color: 0x00DD88,
    fields,
    footer: { text: "🏰 Clan Nightcore • ¡Cada XP cuenta!" },
    timestamp: new Date().toISOString(),
  };
}
