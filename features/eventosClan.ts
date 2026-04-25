import { type Context, Hono } from "hono";
import { getTursoClient } from "../lib/turso.ts";
import { getTodayUTC } from "./clanSnapshot.ts";
import { formatEventoEmbed, isInTimeWindow, sendEmbed } from "../lib/discord.ts";

// ── Listas editables ──────────────────────────────────────────────
// Cada entrada tiene un id interno y el label que se mostrará al anunciar
interface Evento {
  id: string;
  label: string;
}

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
  const now = new Date().toISOString().slice(11, 16);

  // 1. sortear categoría
  const categories: { key: EventCategory; list: Evento[] }[] = [
    { key: "incursion", list: INCURSIONES },
    { key: "jefe",      list: JEFES_CLAN  },
    { key: "evento",    list: EVENTOS_CLAN },
  ];
  const { key: category, list } = pickRandom(categories);

  // 2. sortear evento dentro de esa categoría
  const picked = pickRandom(list);

  return { category, id: picked.id, label: picked.label, selectedAt: now };
}

export async function saveDailyEvents(): Promise<{ isNew: boolean; event: DailyEvent }> {
  const db = getTursoClient();
  const today = getTodayUTC();

  const existing = await db.execute({
    sql: `SELECT category, event_id, label, selected_at FROM daily_events WHERE event_date = ?`,
    args: [today],
  });

  if (existing.rows.length > 0) {
    const r = existing.rows[0] as unknown as { category: EventCategory; event_id: string; label: string; selected_at: string };
    return { isNew: false, event: { category: r.category, id: r.event_id, label: r.label, selectedAt: r.selected_at } };
  }

  const event = selectDailyEvent();
  await db.execute({
    sql: `INSERT OR IGNORE INTO daily_events (event_date, category, event_id, label, selected_at) VALUES (?, ?, ?, ?, ?)`,
    args: [today, event.category, event.id, event.label, event.selectedAt],
  });

  // siempre leer lo que quedó en DB (por si otro proceso ganó la carrera)
  const stored = await db.execute({
    sql: `SELECT category, event_id, label, selected_at FROM daily_events WHERE event_date = ?`,
    args: [today],
  });
  const r = stored.rows[0] as unknown as { category: EventCategory; event_id: string; label: string; selected_at: string };
  return { isNew: true, event: { category: r.category, id: r.event_id, label: r.label, selectedAt: r.selected_at } };
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
    const force = c.req.query("force") === "true";
    if (force || isInTimeWindow(3, 0, 3, 15) || isInTimeWindow(17, 0, 17, 15)) {
      await sendEmbed("eventos", formatEventoEmbed(event));
    }
    return c.json({ date: getTodayUTC(), isNew, event });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

eventosClan.get("/sortear", async (c) => {
  try {
    const db = getTursoClient();
    const today = getTodayUTC();
    await db.execute({ sql: `DELETE FROM daily_events WHERE event_date = ?`, args: [today] });
    const { event } = await saveDailyEvents();
    return c.json({ date: today, event });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default eventosClan;
