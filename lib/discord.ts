type DiscordChannel = "eventos" | "bosses" | "quests" | "ranking" | "inactividad" | "stats" | "cup";

interface DiscordField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields?: DiscordField[];
  footer?: { text: string };
  timestamp?: string;
}

const WEBHOOK_KEYS: Record<DiscordChannel, string> = {
  eventos:     "DISCORD_WEBHOOK_EVENTOS",
  bosses:      "DISCORD_WEBHOOK_BOSSES",
  quests:      "DISCORD_WEBHOOK_QUESTS",
  ranking:     "DISCORD_WEBHOOK_RANKING",
  inactividad: "DISCORD_WEBHOOK_INACTIVIDAD",
  stats:       "DISCORD_WEBHOOK_STATS",
  cup:         "DISCORD_WEBHOOK_INACTIVIDAD",
};

const COLORS: Record<DiscordChannel, number> = {
  eventos:     0xFFAA00,
  bosses:      0xDD2222,
  quests:      0x0099DD,
  ranking:     0xFFD700,
  inactividad: 0xFF6600,
  stats:       0x00DD88,
  cup:         0xFFD700,
};

// IDs de rol a mencionar por canal (opcional — si no está configurado, no menciona)
const ROLE_KEYS: Partial<Record<DiscordChannel, string>> = {
  eventos:     "DISCORD_ROLE_EVENTOS",
  bosses:      "DISCORD_ROLE_BOSSES",
  inactividad: "DISCORD_ROLE_INACTIVIDAD",
  stats:       "DISCORD_ROLE_STATS",
  cup:         "DISCORD_ROLE_CUP",
};

function getRoleMention(channel: DiscordChannel): string {
  const key = ROLE_KEYS[channel];
  if (!key) return "";
  const roleId = Deno.env.get(key);
  return roleId ? `<@&${roleId}>` : "";
}

const BOSS_EMOJI: Record<string, string> = {
  MalignantSpider:       "🕷️",
  SkeletonWarrior:       "💀",
  Griffin:               "🦅",
  Devil:                 "😈",
  Hades:                 "👿",
  Zeus:                  "⚡",
  Medusa:                "🐍",
  Chimera:               "🔥",
  Kronos:                "⏳",
  ReckoningOfTheGods:    "⚔️",
  OtherworldlyGolem:     "🪨",
  GuardiansOfTheCitadel: "🏰",
  BloodmoonMassacre:     "🌙",
  Sobek:                 "🐊",
  Mesines:               "💣",
};

export function getWebhookUrl(channel: DiscordChannel): string | null {
  return Deno.env.get(WEBHOOK_KEYS[channel]) ?? null;
}

export function isInTimeWindow(startH: number, startM: number, endH: number, endM: number): boolean {
  const now = new Date();
  const current = now.getUTCHours() * 60 + now.getUTCMinutes();
  return current >= startH * 60 + startM && current <= endH * 60 + endM;
}

export async function sendEmbed(channel: DiscordChannel, embed: DiscordEmbed): Promise<boolean> {
  const url = getWebhookUrl(channel);
  if (!url) return false;
  try {
    const mention = getRoleMention(channel);
    const payload: Record<string, unknown> = { embeds: [embed] };
    if (mention) payload.content = mention;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Formateadores RPG ──────────────────────────────────────────────────────

export function formatEventoEmbed(event: { label: string; category: string }, horaUTC: number): DiscordEmbed {
  const categoryLabel =
    event.category === "incursion" ? "🗺️ Incursión" :
    event.category === "jefe"      ? "⚔️ Jefe de Clan" :
                                     "🎉 Evento de Clan";
  return {
    title:       "🔔 ¡ACTIVIDAD DEL DÍA DESBLOQUEADA!",
    description: `**${event.label}**`,
    color:       COLORS.eventos,
    fields: [
      { name: "Tipo",  value: categoryLabel, inline: true },
      { name: "Hora",  value: `${String(horaUTC).padStart(2, "0")}:00 UTC`,   inline: true },
    ],
    footer:    { text: "🏰 Clan Nightcore • Sistema de Eventos" },
    timestamp: new Date().toISOString(),
  };
}

export function formatBossReportEmbed(
  killsByBoss: Map<string, { player: string; kills: number }[]>,
  topKillers:  { player: string; total: number }[]
): DiscordEmbed {
  const today  = new Date().toISOString().slice(0, 10);
  const fields: DiscordField[] = [];

  if (killsByBoss.size === 0) {
    fields.push({ name: "Sin actividad", value: "Nadie ha matado jefes hoy.", inline: false });
  } else {
    for (const [boss, killers] of [...killsByBoss.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const emoji = BOSS_EMOJI[boss] ?? "⚔️";
      const lines = killers.map((k) => `${k.player}: **${k.kills}**`).join("\n");
      fields.push({ name: `${emoji} ${boss}`, value: lines.slice(0, 1024), inline: true });
    }
    const medals  = ["🥇", "🥈", "🥉"];
    const topText = topKillers
      .map(({ player, total }, i) => `${medals[i] ?? `${i + 1}.`} **${player}** — ${total} kills`)
      .join("\n");
    fields.push({ name: "🏆 Top Killers", value: topText.slice(0, 1024), inline: false });
  }

  return {
    title:       `⚔️ REPORTE DE BATALLA — ${today}`,
    description: "Kills registrados desde el inicio del día (UTC)",
    color:       COLORS.bosses,
    fields,
    footer:    { text: "🏰 Clan Nightcore" },
    timestamp: new Date().toISOString(),
  };
}

export function formatQuestsEmbed(
  combat:   Record<string, number>,
  skilling: Record<string, number>,
  date:     string
): DiscordEmbed {
  const sortDesc = (map: Record<string, number>) =>
    Object.entries(map).sort((a, b) => b[1] - a[1]);

  const combatText = sortDesc(combat).length > 0
    ? sortDesc(combat).map(([p, n]) => `**${p}**: ${n}`).join("\n")
    : "*Nadie completó misiones de combate*";

  const skillingText = sortDesc(skilling).length > 0
    ? sortDesc(skilling).map(([p, n]) => `**${p}**: ${n}`).join("\n")
    : "*Nadie completó misiones de habilidad*";

  return {
    title:       `📜 MISIONES COMPLETADAS — ${date}`,
    description: "Resumen de actividad del clan",
    color:       COLORS.quests,
    fields: [
      { name: "⚔️ Combate",    value: combatText.slice(0, 1024),   inline: true },
      { name: "🛠️ Habilidad", value: skillingText.slice(0, 1024), inline: true },
    ],
    footer:    { text: "🏰 Clan Nightcore • Sistema RPG" },
    timestamp: new Date().toISOString(),
  };
}

export function formatRankingEmbed(
  ranking:   { pos: number; player: string; title: string; level: number; weekExp: number }[],
  weekStart: string
): DiscordEmbed {
  const medals = ["🥇", "🥈", "🥉"];
  const lines  = ranking.map((r) =>
    `${medals[r.pos - 1] ?? `**${r.pos}.**`} **${r.player}** — ${r.title} *(Lv. ${r.level})* | ${r.weekExp.toLocaleString()} EXP`
  );

  return {
    title:       "🏆 RANKING SEMANAL",
    description: `Semana del **${weekStart}**\n\n${lines.join("\n")}`,
    color:       COLORS.ranking,
    footer:    { text: "🏰 Clan Nightcore • ¡Sigue luchando para escalar el ranking!" },
    timestamp: new Date().toISOString(),
  };
}

export function formatStreakAnnouncementEmbed(player: string, days: number): DiscordEmbed {
  const milestone = days >= 30 ? "🏆" : days >= 14 ? "🔥" : "⚡";
  return {
    title:       `${milestone} ¡RACHA ÉPICA!`,
    description: `**${player}** lleva **${days} días consecutivos** activo en el clan.`,
    color:       COLORS.stats,
    footer:    { text: "🏰 Clan Nightcore • Constancia es poder" },
    timestamp: new Date().toISOString(),
  };
}

export function formatDailyXpEmbed(
  totalXp: number,
  topContributors: { username: string; xp_gained: number }[]
): DiscordEmbed {
  const today = new Date().toISOString().slice(0, 10);
  const topText = topContributors.slice(0, 5).map((p, i) => {
    const medals = ["🥇", "🥈", "🥉"];
    const medal = medals[i] ?? `**${i + 1}.**`;
    return `${medal} **${p.username}** — ${p.xp_gained.toLocaleString()} XP`;
  }).join("\n");

  return {
    title:       `📈 RESUMEN DE XP — ${today}`,
    description: `El clan ganó **${totalXp.toLocaleString()} XP** hoy`,
    color:       COLORS.stats,
    fields: [
      { name: "🏆 Top Contribuidores", value: topText || "*Sin actividad hoy*", inline: false },
    ],
    footer:    { text: "🏰 Clan Nightcore • Sistema de métricas" },
    timestamp: new Date().toISOString(),
  };
}

export function formatRankUpEmbed(prevRank: number, newRank: number): DiscordEmbed {
  const gained = prevRank - newRank;
  return {
    title:       `🏆 ¡SUBIMOS EN EL RANKING!`,
    description: `El clan avanzó **${gained} posición${gained > 1 ? "es" : ""}** — ahora somos **#${newRank}**`,
    color:       COLORS.stats,
    fields: [
      { name: "Antes", value: `#${prevRank}`, inline: true },
      { name: "Ahora", value: `#${newRank}`, inline: true },
    ],
    footer:    { text: "🏰 Clan Nightcore • ¡Sigamos escalando!" },
    timestamp: new Date().toISOString(),
  };
}

export function formatRankGoalEmbed(
  currentRank: number,
  targetRank: number,
  xpNeeded: number
): DiscordEmbed {
  return {
    title:       `🎯 META EN VISTA`,
    description: `Estamos a **${xpNeeded.toLocaleString()} XP** del top **${targetRank}**`,
    color:       COLORS.stats,
    fields: [
      { name: "Rank actual", value: `#${currentRank}`, inline: true },
      { name: "Objetivo",    value: `#${targetRank}`,  inline: true },
    ],
    footer:    { text: "🏰 Clan Nightcore • ¡Podemos lograrlo!" },
    timestamp: new Date().toISOString(),
  };
}

export function formatExperienceEmbed(
  date: string,
  totalXp: number,
  contributors: { username: string; xp_gained: number; pct: number }[]
): DiscordEmbed {
  const medals = ["🥇", "🥈", "🥉"];
  const topText = contributors.slice(0, 10).map((c, i) => {
    const medal = medals[i] ?? `**${i + 1}.**`;
    return `${medal} **${c.username}** — ${c.xp_gained.toLocaleString()} XP — ${c.pct.toFixed(1)}%`;
  }).join("\n");

  return {
    title:       `📊 TOP XP DEL DÍA — ${date}`,
    description: `El clan ganó **${totalXp.toLocaleString()} XP** en total\n\n${topText}`,
    color:       COLORS.stats,
    footer:    { text: "🏰 Clan Nightcore • Reporte diario" },
    timestamp: new Date().toISOString(),
  };
}

export function formatInactividadEmbed(
  inactivos: { player: string; hoursOffline: number; lastTask: string | null }[],
  sinExp:    string[],
  total:     number
): DiscordEmbed {
  const inactivosText = inactivos.length > 0
    ? inactivos.map((p) => {
        const tarea = p.lastTask ? ` *(${p.lastTask})*` : "";
        return `**${p.player}** — ${p.hoursOffline}h offline${tarea}`;
      }).join("\n").slice(0, 1024)
    : "*Todos conectados recientemente ✅*";

  const sinExpText = sinExp.length > 0
    ? sinExp.map((p) => `**${p}**`).join(", ").slice(0, 1024)
    : "*Todos han ganado EXP recientemente ✅*";

  return {
    title:       "⚠️ REPORTE DE INACTIVIDAD",
    description: `Revisión del clan — ${new Date().toISOString().slice(0, 10)} | ${total} miembros`,
    color:       COLORS.inactividad,
    fields: [
      { name: "😴 Sin conexión +48h",    value: inactivosText, inline: false },
      { name: "💤 Sin EXP últimas 30h", value: sinExpText,     inline: false },
    ],
    footer:    { text: "🏰 Clan Nightcore • Reporte de actividad" },
    timestamp: new Date().toISOString(),
  };
}
