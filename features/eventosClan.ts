import { type Context, Hono } from "hono";
import { getTursoClient } from "../lib/turso.ts";
import { formatEventoEmbed, isInTimeWindow, sendEmbed } from "../lib/discord.ts";

// ── Listas editables ──────────────────────────────────────────────
interface Evento {
  id: string;
  label: string;
}

const INCURSIONES: Evento[] = [
  { id: "ReckoningOfTheGods",    label: "⚔️ Incursión: El ocaso de los dioses" },
  { id: "GuardiansOfTheCitadel", label: "🏰 Incursión: Guardianes de la Ciudadela" },
];

const JEFES_CLAN: Evento[] = [
  { id: "SkeletonWarrior",   label: "💀 Jefe de clan: Guerrero Esqueleto" },
  { id: "MalignantSpider",   label: "🕷️ Jefe de clan: Araña Maligna" },
  { id: "OtherworldlyGolem", label: "🪨 Jefe de clan: Gólem Sobrenatural" },
];

const EVENTOS_CLAN: Evento[] = [
  { id: "CombatBigLootDaily", label: "💰 Evento: Gran Botín de Combate" },
  { id: "CombatBigExpDaily",  label: "✨ Evento: Gran Experiencia de Combate" },
  { id: "Crafting",           label: "🔨 Evento: Fabricación" },
  { id: "Gathering",          label: "🌿 Evento: Recolección" },
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
  sent: boolean;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function selectDailyEvent(): DailyEvent {
  const now     = new Date().toISOString().slice(11, 16);
  const weekend = isWeekendUTC();

  // Entre semana: solo eventos | Fin de semana: todas las listas
  const categories: { key: EventCategory; list: Evento[] }[] = weekend
    ? [
        { key: "incursion", list: INCURSIONES },
        { key: "jefe",      list: JEFES_CLAN  },
        { key: "evento",   list: EVENTOS_CLAN },
      ]
    : [
        { key: "evento", list: EVENTOS_CLAN },
      ];

  const { key: category, list } = pickRandom(categories);
  const picked = pickRandom(list);

  return { category, id: picked.id, label: picked.label, selectedAt: now, sent: false };
}

export async function saveDailyEvents(): Promise<{ isNew: boolean; event: DailyEvent }> {
  const db = getTursoClient();
  const today = getTodayUTCDate();

  const existing = await db.execute({
    sql: `SELECT category, event_id, label, selected_at, sent FROM daily_events WHERE event_date = ?`,
    args: [today],
  });

  if (existing.rows.length > 0) {
    const r = existing.rows[0] as unknown as {
      category: EventCategory; event_id: string; label: string; selected_at: string; sent: number;
    };
    return {
      isNew: false,
      event: { category: r.category, id: r.event_id, label: r.label, selectedAt: r.selected_at, sent: !!r.sent },
    };
  }

  const event = selectDailyEvent();
  await db.execute({
    sql: `INSERT OR IGNORE INTO daily_events (event_date, category, event_id, label, selected_at, sent) VALUES (?, ?, ?, ?, ?, 0)`,
    args: [today, event.category, event.id, event.label, event.selectedAt],
  });

  const stored = await db.execute({
    sql: `SELECT category, event_id, label, selected_at, sent FROM daily_events WHERE event_date = ?`,
    args: [today],
  });
  const r = stored.rows[0] as unknown as {
    category: EventCategory; event_id: string; label: string; selected_at: string; sent: number;
  };
  return {
    isNew: true,
    event: { category: r.category, id: r.event_id, label: r.label, selectedAt: r.selected_at, sent: !!r.sent },
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
    const force = c.req.query("force") === "true";

    const utcDay = new Date().getUTCDay(); // 0=Dom, 1=Lun, ..., 6=Sáb

    const allows3UTC = utcDay >= 2 && utcDay <= 6;

    // Ventana 03 UTC (solo Mar-Sáb: día 2-6)
    const ventana3 =
      allows3UTC && isInTimeWindow(3, 0, 3, 59);

    // Ventana 17 UTC (todos los días)
    const ventana17 = isInTimeWindow(17, 0, 17, 59);

    let horaUTC = 17;
    if (ventana3 && !ventana17) {
      horaUTC = 3;
    } else if (ventana3 && ventana17) {
      horaUTC = event.sent ? 17 : 3;
    }

    const shouldSend =
      force || ventana3 || ventana17;

    // Evitar múltiples envíos
    if (shouldSend && !event.sent) {
      await sendEmbed("eventos", formatEventoEmbed(event, horaUTC));

      const db = getTursoClient();
      await db.execute({
        sql: `UPDATE daily_events SET sent = 1 WHERE event_date = ? AND category = ?`,
        args: [getTodayUTCDate(), event.category],
      });
    }

    return c.json({
      date: getTodayUTCDate(),
      isNew,
      event,
      enviado: shouldSend && !event.sent,
      debug: { utcDay, allows3UTC, force, ventana3, ventana17, horaUTC },
    });

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
    const horaUTC = 17;
    await sendEmbed("eventos", formatEventoEmbed(event, horaUTC));
    return c.json({ date: today, event, horaUTC });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

eventosClan.get("/debug-hora", (c) => {
  const now = new Date();
  return c.json({
    utcHora: now.toISOString(),
    utcHours: now.getUTCHours(),
    utcMinutes: now.getUTCMinutes(),
    localHora: now.toString(),
  });
});

export default eventosClan;
