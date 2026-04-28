import { type Context, Hono } from "hono";
import { getTursoClient } from "../lib/turso.ts";
import { formatEventoEmbed, isInTimeWindow, sendEmbed } from "../lib/discord.ts";

// ── Listas editables ──────────────────────────────────────────────
interface Evento {
  id: string;
  label: string;
}

// Solo disponibles sábado y domingo (UTC)
const WEEKEND_ONLY_IDS = new Set(["GuardiansOfTheCitadel", "SkeletonWarrior", "OtherworldlyGolem"]);

const INCURSIONES: Evento[] = [
  { id: "ReckoningOfTheGods",    label: "⚔️ Incursión: El ocaso de los dioses — ¡Iniciamos en 5 min!" },
  { id: "GuardiansOfTheCitadel", label: "🏰 Incursión: Guardianes de la Ciudadela — ¡Iniciamos en 5 min!" },
];

const JEFES_CLAN: Evento[] = [
  { id: "SkeletonWarrior",   label: "💀 Jefe de clan: Guerrero Esqueleto — ¡Iniciamos en 5 min!" },
  { id: "MalignantSpider",   label: "🕷️ Jefe de clan: Araña Maligna — ¡Iniciamos en 5 min!" },
  { id: "OtherworldlyGolem", label: "🪨 Jefe de clan: Gólem Sobrenatural — ¡Iniciamos en 5 min!" },
];

const EVENTOS_CLAN: Evento[] = [
  { id: "CombatBigLootDaily", label: "💰 Evento: Gran Botín de Combate — ¡Únete ahora!" },
  { id: "CombatBigExpDaily",  label: "✨ Evento: Gran Experiencia de Combate — ¡Únete ahora!" },
  { id: "Crafting",           label: "🔨 Evento: Fabricación — ¡Únete ahora!" },
  { id: "Gathering",          label: "🌿 Evento: Recolección — ¡Únete ahora!" },
];
// ─────────────────────────────────────────────────────────────────

function isWeekendUTC(): boolean {
  const day = new Date().getUTCDay(); // 0=Dom, 6=Sáb
  return day === 0 || day === 6;
}

function getTodayUTCDate(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type EventCategory = "incursion" | "jefe" | "evento";

export interface DailyEvent {
  category: EventCategory;
  id: string;
  label: string;
  selectedAt: string;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function selectDailyEvent(): DailyEvent {
  const now     = new Date().toISOString().slice(11, 16);
  const weekend = isWeekendUTC();

  const filter = (list: Evento[]) =>
    weekend ? list : list.filter((e) => !WEEKEND_ONLY_IDS.has(e.id));

  const categories: { key: EventCategory; list: Evento[] }[] = [
    { key: "incursion", list: filter(INCURSIONES) },
    { key: "jefe",      list: filter(JEFES_CLAN)  },
    { key: "evento",    list: EVENTOS_CLAN },
  ].filter((c) => c.list.length > 0) as { key: EventCategory; list: Evento[] }[];

  const { key: category, list } = pickRandom(categories);
  const picked = pickRandom(list);

  return { category, id: picked.id, label: picked.label, selectedAt: now };
}

export async function saveDailyEvents(): Promise<{ isNew: boolean; event: DailyEvent }> {
  const db = getTursoClient();
  const today = getTodayUTCDate();

  const existing = await db.execute({
    sql: `SELECT category, event_id, label, selected_at FROM daily_events WHERE event_date = ?`,
    args: [today],
  });

  if (existing.rows.length > 0) {
    const r = existing.rows[0] as unknown as {
      category: EventCategory; event_id: string; label: string; selected_at: string;
    };
    return {
      isNew: false,
      event: { category: r.category, id: r.event_id, label: r.label, selectedAt: r.selected_at },
    };
  }

  const event = selectDailyEvent();
  await db.execute({
    sql: `INSERT OR IGNORE INTO daily_events (event_date, category, event_id, label, selected_at) VALUES (?, ?, ?, ?, ?)`,
    args: [today, event.category, event.id, event.label, event.selectedAt],
  });

  const stored = await db.execute({
    sql: `SELECT category, event_id, label, selected_at FROM daily_events WHERE event_date = ?`,
    args: [today],
  });
  const r = stored.rows[0] as unknown as {
    category: EventCategory; event_id: string; label: string; selected_at: string;
  };
  return {
    isNew: true,
    event: { category: r.category, id: r.event_id, label: r.label, selectedAt: r.selected_at },
  };
}

const eventosClan = new Hono();

eventosClan.get("/lista", (c: Context) => {
  return c.json({
    incursiones: INCURSIONES,
    jefesClan:   JEFES_CLAN,
    eventosClan: EVENTOS_CLAN,
  });
});

eventosClan.get("/hoy", async (c) => {
  try {
    const { isNew, event } = await saveDailyEvents();
    const force   = c.req.query("force") === "true";
    const weekend = isWeekendUTC();
    const enviado = force ||
      isInTimeWindow(3, 0, 3, 59) ||
      (!weekend && isInTimeWindow(17, 0, 17, 59));

    if (enviado) {
      await sendEmbed("eventos", formatEventoEmbed(event));
    }

    return c.json({ date: getTodayUTCDate(), isNew, event, enviado });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

eventosClan.get("/sortear", async (c) => {
  try {
    const db = getTursoClient();
    const today = getTodayUTCDate();
    await db.execute({ sql: `DELETE FROM daily_events WHERE event_date = ?`, args: [today] });
    const { event } = await saveDailyEvents();
    await sendEmbed("eventos", formatEventoEmbed(event));
    return c.json({ date: today, event });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default eventosClan;
