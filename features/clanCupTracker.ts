import { Hono } from "hono";
import { idleGet } from "../lib/api.ts";
import { getClanName } from "../lib/env.ts";
import { getTursoClient } from "../lib/turso.ts";
import { sendEmbed } from "../lib/discord.ts";
import type { DiscordEmbed } from "../lib/discord.ts";

interface StandingsEntry {
  objective: string;
  score?: number;
  rank: number;
  bestTime?: { time: number; achievedAt: string };
}

interface TopClanStanding {
  clanName: string;
  score: number;
  rank: number;
}

interface TopClanCategory {
  objective: string;
  standings: TopClanStanding[];
}

interface TopClansResponse {
  topScoreClans: TopClanCategory[];
  topTimeClans: TopClanCategory[];
}

interface LeaderboardEntry {
  clanName: string;
  points: number;
}

const REWARDS: Record<number, number> = {
  1: 5000, 2: 3500, 3: 3000, 4: 2500, 5: 2000,
  6: 1500, 7: 1000, 8: 750, 9: 500, 10: 250,
};

function getReward(rank: number): number {
  return REWARDS[rank] ?? 0;
}

const CATEGORY_ICONS: Record<string, string> = {
  Mining: "⛏️",
  Woodcutting: "🌲",
  Fishing: "🎣",
  Farming: "🌾",
  Exterminating: "⚔️",
  Crafting: "🔨",
  Cooking: "🍳",
  Enchanting: "🧪",
  Smithing: "🔧",
  Foraging: "🌿",
  Agility: "🏃",
  Brewing: "🧪",
  Carpentry: "🪵",
  Plundering: "💰",
  DevilKills: "👹",
  GriffinKills: "🦅",
  MesinesKills: "🐉",
  SkeletonWarriorKills: "💀",
  MalignantSpiderKills: "🕷️",
  GuardiansOfTheCitadelCompletions: "🛡️",
};

const CATEGORY_NAMES_ES: Record<string, string> = {
  Mining: "MINERÍA",
  Woodcutting: "TALA",
  Fishing: "PESCA",
  Farming: "AGRICULTURA",
  Exterminating: "EXTERMINIO",
  Crafting: "ARTESANÍA",
  Cooking: "COCINA",
  Enchanting: "ENCANTAMIENTO",
  Smithing: "HERRERÍA",
  Foraging: "RECOLECCIÓN",
  Agility: "AGILIDAD",
  Brewing: "ALQUIMIA",
  Carpentry: "CARPINTERÍA",
  Plundering: "SAQUEO",
  DevilKills: "DEMONIO",
  GriffinKills: "GRIFO",
  MesinesKills: "MESINES",
  SkeletonWarriorKills: "GUERRERO ESQUELETO",
  MalignantSpiderKills: "ARAÑA MALIGNA",
  GuardiansOfTheCitadelCompletions: "GUARDIANES",
};

const BOSS_BASE: Record<string, { icon: string; name: string }> = {
  SkeletonWarrior:          { icon: "💀", name: "Guerrero Esqueleto" },
  MalignantSpider:          { icon: "🕷️", name: "Araña Maligna" },
  OtherworldlyGolem:        { icon: "🪨", name: "Gólem" },
  Devil:                    { icon: "😈", name: "Demonio" },
  Griffin:                  { icon: "🦅", name: "Grifo" },
  Hades:                    { icon: "👿", name: "Hades" },
  Zeus:                     { icon: "⚡", name: "Zeus" },
  Medusa:                   { icon: "🐍", name: "Medusa" },
  Chimera:                  { icon: "🔥", name: "Quimera" },
  Sobek:                    { icon: "🐊", name: "Sobek" },
  Kronos:                   { icon: "⏳", name: "Kronos" },
  Mesines:                  { icon: "🐉", name: "Mesines" },
  ReckoningOfTheGods:       { icon: "⚔️", name: "Ocaso de los Dioses" },
  GuardiansOfTheCitadel:    { icon: "🏰", name: "Guardianes" },
  BloodmoonMassacre:        { icon: "🌙", name: "Masacre de Sangre" },
};

const CAT_SUFFIXES: [string, string][] = [
  ["Kills", "Kills"],
  ["FastestKill", "Velocidad"],
  ["Completions", "Completadas"],
  ["CompletionSpeed", "Velocidad"],
  ["HighestWave", "Mejor Ola"],
  ["Speed", "Velocidad"],
];

function parseCupCategory(obj: string): { icon: string; nameES: string } {
  if (CATEGORY_ICONS[obj] && CATEGORY_NAMES_ES[obj]) {
    return { icon: CATEGORY_ICONS[obj], nameES: CATEGORY_NAMES_ES[obj] };
  }
  for (const [suffix, suffixES] of CAT_SUFFIXES) {
    if (obj.endsWith(suffix)) {
      const base = obj.slice(0, -suffix.length);
      const boss = BOSS_BASE[base];
      if (boss) return { icon: boss.icon, nameES: `${boss.name} (${suffixES})` };
    }
  }
  return { icon: "⚔️", nameES: obj.replace(/([A-Z])/g, " $1").trim().toUpperCase() };
}

function getIcon(objective: string): string {
  return parseCupCategory(objective).icon;
}

function getNameES(objective: string): string {
  return parseCupCategory(objective).nameES;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) {
    if (n % 1000 === 0) return `${n / 1000}k`;
    return n.toLocaleString("es-ES");
  }
  return String(n);
}

function makeBar(value: number, total: number, width = 15): string {
  const pct = Math.min(Math.max(value / total, 0), 1);
  const filled = Math.round(pct * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

async function fetchStandings(): Promise<StandingsEntry[]> {
  const clanName = getClanName();
  return await idleGet<StandingsEntry[]>(
    `/api/ClanCup/standings/${encodeURIComponent(clanName)}?gameMode=Default`
  );
}

async function fetchTopClans(): Promise<TopClansResponse> {
  return await idleGet<TopClansResponse>(
    `/api/ClanCup/top-clans/current?gameMode=Default`
  );
}

async function getCupWeeklyEmbed(): Promise<{ embed: DiscordEmbed; signature: string }> {
  const [standings, topClans] = await Promise.all([
    fetchStandings(),
    fetchTopClans(),
  ]);

  // Construir mapa: objective → standings del top (score real)
  const topMap = new Map<string, TopClanStanding[]>();
  for (const tc of topClans.topScoreClans) {
    if (tc.standings.length > 0) topMap.set(tc.objective, tc.standings);
  }

  // Para categorías no cubiertas por top-clans (skills), hacer fetch individual
  const missing = standings.filter(s => !topMap.has(s.objective)).map(s => s.objective);
  await Promise.all(missing.map(async (obj) => {
    try {
      const lb = await idleGet<LeaderboardEntry[]>(
        `/api/ClanCup/leaderboard/Default/${encodeURIComponent(obj)}`
      );
      if (lb.length >= 10) {
        topMap.set(obj, lb.map((e, i) => ({ clanName: e.clanName, score: e.points, rank: i + 1 })));
      }
    } catch { /* skip */ }
  }));

  interface Candidate {
    objective: string;
    ourScore: number;
    ourRank: number | null;
    targetScore: number;
    targetRank: number;
    gap: number;
  }

  const candidates: Candidate[] = [];

  for (const s of standings) {
    const ourScore = s.score ?? 0;
    const ourRank = s.rank;

    const list = topMap.get(s.objective);
    if (!list || list.length === 0) continue;

    const bottom = list[list.length - 1];
    let targetScore: number;
    let targetRank: number;

    if (ourRank > bottom.rank) {
      targetScore = bottom.score;
      targetRank = bottom.rank;
    } else if (ourRank > 1) {
      const next = list.find(t => t.rank === ourRank - 1);
      if (!next) continue;
      targetScore = next.score;
      targetRank = next.rank;
    } else {
      continue;
    }

    const gap = Math.max(0, targetScore - ourScore);
    if (gap > 0) {
      candidates.push({ objective: s.objective, ourScore, ourRank, targetScore, targetRank, gap });
    }
  }

  candidates.sort((a, b) => a.gap - b.gap);
  const top5 = candidates.slice(0, 5);

  const fields: { name: string; value: string; inline: boolean }[] = [];

  for (const g of top5) {
    const icon = getIcon(g.objective);
    const nameES = getNameES(g.objective);
    const rankStr = `Puesto #${g.ourRank}`;

    const progress = g.targetScore > 0 ? Math.min(g.ourScore / g.targetScore, 1) : 0;
    const pct = Math.round(progress * 100);
    const bar = makeBar(progress, 1);

    const lines = [
      `\`${bar}\` **${pct}%**`,
      `Score: **${fmtNum(g.ourScore)}**`,
      `Objetivo: **${fmtNum(g.targetScore)}** (Top #${g.targetRank})`,
      `Restante: **${fmtNum(g.gap)}**`,
    ];

    fields.push({
      name: `${icon} ${nameES} — ${rankStr}`,
      value: lines.join("\n"),
      inline: false,
    });
  }

  if (top5.length > 0) {
    const totalGap = top5.reduce((s, g) => s + g.gap, 0);
    fields.push({
      name: "💡 Restante total",
      value: `**${fmtNum(totalGap)}** de score para alcanzar los 5 objetivos`,
      inline: false,
    });
  } else {
    fields.push({
      name: "🎉 Todo en objetivo",
      value: "No hay categorías para mejorar.",
      inline: false,
    });
  }

  const goalSummary = top5.length > 0
    ? top5.map((g, i) => `${i + 1}. ${getIcon(g.objective)} ${getNameES(g.objective)} → Top #${g.targetRank} (${fmtNum(g.gap)})`).join("\n")
    : "Sin objetivos pendientes.";

  const embedData: DiscordEmbed = {
    title: `🏆 COPA SEMANAL — ${getClanName()}`,
    description: `**${top5.length} objetivos** más cercanos al top 10:\n${goalSummary}`,
    color: 0xFFD700,
    fields,
    footer: { text: "🏰 Clan Nightcore • Copa semanal" },
    timestamp: new Date().toISOString(),
  };

  const signature = top5.map(g => `${g.objective}:${g.targetRank}:${Math.round(g.ourScore / 1000)}`).sort().join("|");

  return { embed: embedData, signature };
}

const cupRouter = new Hono();

cupRouter.get("/cup-weekly", async (c) => {
  try {
    const { embed, signature } = await getCupWeeklyEmbed();

    const db = getTursoClient();
    const cached = await db.execute({
      sql: `SELECT value FROM app_cache WHERE key = 'cup_weekly'`,
    });
    const lastSig = cached.rows.length > 0
      ? (cached.rows[0] as unknown as { value: string }).value
      : "";

    if (signature && signature === lastSig) {
      return c.json({ ok: true, cached: true });
    }

    await sendEmbed("clancup", embed);
    await db.execute({
      sql: `INSERT OR REPLACE INTO app_cache (key, value, updated_at) VALUES ('cup_weekly', ?, ?)`,
      args: [signature, new Date().toISOString()],
    });
    return c.json({ ok: true, cached: false, embed });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

cupRouter.get("/cup-status", async (c) => {
  try {
    const embed = await getCupStatusEmbed();
    const sent = await sendEmbed("clancup", embed);
    if (!sent) {
      return c.json({ ok: false, error: "No se pudo enviar a Discord. Verifica DISCORD_WEBHOOK_STATS." }, 500);
    }
    return c.json({ ok: true, embed, sent });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

async function getCupStatusEmbed(): Promise<DiscordEmbed> {
  const standings = await fetchStandings();

  const topCategories = standings
    .filter((s) => s.rank <= 10)
    .map((s) => ({
      objective: s.objective,
      rank: s.rank,
      reward: getReward(s.rank),
    }))
    .sort((a, b) => a.rank - b.rank);

  const totalRewards = topCategories.reduce((s, c) => s + c.reward, 0);

  const fields: { name: string; value: string; inline: boolean }[] = [];

  if (topCategories.length > 0) {
    const lines = topCategories.map((cat) => {
      return `**${getIcon(cat.objective)} ${getNameES(cat.objective)} — #${cat.rank}** • Puntos: ${fmtNum(cat.reward)}`;
    }).join("\n");
    fields.push({ name: `📊 CATEGORÍAS EN TOP 10 — ${topCategories.length}`, value: lines, inline: false });
  } else {
    fields.push({
      name: "😴 Sin top 10",
      value: "Ninguna categoría en el top 10 aún. ¡A darle duro!",
      inline: false,
    });
  }

  const desc = totalRewards > 0
    ? `**RECIBIRÁ: ${fmtNum(totalRewards)} pts**\n¡Vamos por más! Sigamos escalando posiciones.`
    : "**RECIBIRÁ: 0 pts**\nEl clan necesita tu apoyo — cada granito de arena cuenta para meternos al top 10.";

  return {
    title: `🏆 ESTADO DE LA COPA — ${getClanName()}`,
    description: desc,
    color: 0xFFD700,
    fields,
    footer: { text: "🏰 Clan Nightcore • Copa semanal" },
    timestamp: new Date().toISOString(),
  };
}

export default cupRouter;
