import { Hono } from "hono";
import clanMembers from "./features/clanMembers.ts";
import clanQuests from "./features/clanQuests.ts";
import clanExperience from "./features/clanExperience.ts";
import clanActivity from "./features/clanActivity.ts";
import clanNoXp from "./features/clanNoXp.ts";
import playerProfile from "./features/playerProfile.ts";
import itemPrice from "./features/itemPrice.ts";
import clanSnapshot from "./features/clanSnapshot.ts";
import clanBossReport from "./features/clanBossReport.ts";
import eventosClan, { saveDailyEvents } from "./features/eventosClan.ts";
import { initDb } from "./lib/turso.ts";

const ENDPOINTS = [
  { method: "GET",  path: "/clan/members",          description: "Lista de miembros del clan con su rango" },
  { method: "GET",  path: "/clan/quests",            description: "Misiones de combate y habilidad completadas hoy (UTC)" },
  { method: "GET",  path: "/clan/experience?hours=24", description: "Top contribuidores de XP del clan (1-168h, default 24h)" },
  { method: "GET",  path: "/clan/activity?hours=50", description: "Miembros sin conexión más de N horas (default 50h)" },
  { method: "GET",  path: "/clan/noxp?hours=24",     description: "Miembros que no han ganado XP en las últimas N horas (default 24h)" },
  { method: "GET",  path: "/clan/snapshot",          description: "Guarda pvmStats de todos los miembros en Turso (ejecutar 1x/día)" },
  { method: "GET",  path: "/clan/boss-report",    description: "Kills de jefes del día (live vs baseline). Top killers" },
  { method: "GET",  path: "/clan/eventos/lista",  description: "Lista de incursiones, jefes y eventos disponibles" },
  { method: "GET",  path: "/clan/eventos/hoy",    description: "Evento del día sorteado a las 3:00 AM UTC" },
  { method: "GET",  path: "/clan/eventos/sortear",description: "Fuerza un nuevo sorteo para hoy" },
  { method: "GET",  path: "/player/:name",           description: "Perfil de un jugador: skills por XP, última tarea, horas offline" },
  { method: "GET",  path: "/market/:itemId",         description: "Precio de un item: mínimo venta, máximo compra, promedio y volumen" },
];

const app = new Hono();

app.get("/", (c) => {
  const rows = ENDPOINTS.map(
    (e) => `<tr><td>${e.method}</td><td><code>${e.path}</code></td><td>${e.description}</td></tr>`
  ).join("");

  return c.html(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>botNightcore API</title>
  <style>
    body { font-family: sans-serif; max-width: 900px; margin: 40px auto; padding: 0 16px; }
    h1 { font-size: 1.4rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { text-align: left; padding: 8px 12px; background: #f0f0f0; border-bottom: 2px solid #ccc; }
    td { padding: 8px 12px; border-bottom: 1px solid #e0e0e0; vertical-align: top; }
    td:first-child { font-weight: bold; font-size: 0.8em; color: #555; white-space: nowrap; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    tr:hover td { background: #fafafa; }
  </style>
</head>
<body>
  <h1>botNightcore — Idle Clans API</h1>
  <table>
    <thead><tr><th>Método</th><th>Ruta</th><th>Descripción</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`);
});

app.route("/clan/members",     clanMembers);
app.route("/clan/quests",      clanQuests);
app.route("/clan/experience",  clanExperience);
app.route("/clan/activity",    clanActivity);
app.route("/clan/noxp",        clanNoXp);
app.route("/clan/snapshot",    clanSnapshot);
app.route("/clan/boss-report", clanBossReport);
app.route("/player",           playerProfile);
app.route("/market",           itemPrice);
app.route("/clan/eventos",     eventosClan);

// Cron: sorteo de eventos a las 3:00 AM UTC
Deno.cron("daily-event-selection", "0 3 * * *", async () => {
  await saveDailyEvents();
});

// Inicializar DB al arrancar
await initDb().catch((e) => console.warn("Turso not configured:", e.message));

Deno.serve(app.fetch);
