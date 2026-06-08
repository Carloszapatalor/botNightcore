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

const TARGET_CATEGORIES = [
  "Mining", "Exterminating", "Farming",
  "Fishing", "Woodcutting", "SkeletonWarriorKills",
];

function getIcon(objective: string): string {
  return CATEGORY_ICONS[objective] ?? "📋";
}

function getNameES(objective: string): string {
  return CATEGORY_NAMES_ES[objective] ?? objective;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
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

  interface Candidate {
    objective: string;
    ourScore: number;
    ourRank: number | null;
    targetScore: number;
    targetRank: number;
    gap: number;
  }

  const candidates: Candidate[] = [];

  for (const cat of TARGET_CATEGORIES) {
    const ourEntry = standings.find(s => s.objective === cat);
    const ourScore = ourEntry?.score ?? 0;
    const ourRank = ourEntry?.rank ?? null;

    const topEntry = topClans.topScoreClans.find(t => t.objective === cat);
    if (!topEntry || topEntry.standings.length === 0) continue;

    const bottom = topEntry.standings[topEntry.standings.length - 1];
    let targetScore: number;
    let targetRank: number;

    if (ourRank === null || ourRank > bottom.rank) {
      targetScore = bottom.score;
      targetRank = bottom.rank;
    } else if (ourRank > 1) {
      const next = topEntry.standings.find(s => s.rank === ourRank - 1);
      if (!next) continue;
      targetScore = next.score;
      targetRank = next.rank;
    } else {
      continue;
    }

    const gap = Math.max(0, targetScore - ourScore);
    if (gap > 0 || ourScore < targetScore) {
      candidates.push({ objective: cat, ourScore, ourRank, targetScore, targetRank, gap });
    }
  }

  candidates.sort((a, b) => a.gap - b.gap);
  const top3 = candidates.slice(0, 3);

  const fields: { name: string; value: string; inline: boolean }[] = [];

  for (const g of top3) {
    const icon = getIcon(g.objective);
    const nameES = getNameES(g.objective);
    const rankStr = g.ourRank ? `Puesto #${g.ourRank}` : "Sin puesto";

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

  if (top3.length > 0) {
    const totalGap = top3.reduce((s, g) => s + g.gap, 0);
    fields.push({
      name: "💡 Restante total",
      value: `**${fmtNum(totalGap)}** de score para alcanzar los 3 objetivos`,
      inline: false,
    });
  } else {
    fields.push({
      name: "🎉 Todo en objetivo",
      value: "No hay categorías para mejorar.",
      inline: false,
    });
  }

  const goalSummary = top3.length > 0
    ? top3.map((g, i) => `${i + 1}. ${getIcon(g.objective)} ${getNameES(g.objective)} → Top #${g.targetRank} (${fmtNum(g.gap)})`).join("\n")
    : "Sin objetivos pendientes.";

  const embedData: DiscordEmbed = {
    title: `🏆 COPA SEMANAL — ${getClanName()}`,
    description: `**${top3.length} objetivos** para esta semana:\n${goalSummary}`,
    color: 0xFFD700,
    fields,
    footer: { text: "🏰 Clan Nightcore • Copa semanal" },
    timestamp: new Date().toISOString(),
  };

  const signature = top3.map(g => `${g.objective}:${g.targetRank}:${Math.round(g.ourScore / 1000)}`).sort().join("|");

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

    await sendEmbed("stats", embed);
    await db.execute({
      sql: `INSERT OR REPLACE INTO app_cache (key, value, updated_at) VALUES ('cup_weekly', ?, ?)`,
      args: [signature, new Date().toISOString()],
    });
    return c.json({ ok: true, cached: false, embed });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default cupRouter;
