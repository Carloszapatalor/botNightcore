type DiscordChannel = "eventos" | "bosses" | "quests" | "ranking" | "inactividad";

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
};

const COLORS: Record<DiscordChannel, number> = {
  eventos:     0xFFAA00,
  bosses:      0xDD2222,
  quests:      0x0099DD,
  ranking:     0xFFD700,
  inactividad: 0xFF6600,
};

// IDs de rol a mencionar por canal (opcional — si no está configurado, no menciona)
const ROLE_KEYS: Partial<Record<DiscordChannel, string>> = {
  eventos:     "DISCORD_ROLE_EVENTOS",
  bosses:      "DISCORD_ROLE_BOSSES",
  inactividad: "DISCORD_ROLE_INACTIVIDAD",
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
