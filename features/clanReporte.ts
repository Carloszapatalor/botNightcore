import { Hono } from "hono";
import { idleGet } from "../lib/api.ts";
import { getClanName } from "../lib/env.ts";
import { getTursoClient } from "../lib/turso.ts";
import { formatInactividadEmbed, isInTimeWindow, sendEmbed } from "../lib/discord.ts";

const OFFLINE_HOURS = 48;
const NO_XP_HOURS   = 30;

interface MemberEntry       { memberName: string; }
interface RecruitmentData   { memberlist: MemberEntry[]; }
interface SimpleProfile     { hoursOffline: number; taskNameOnLogout: string | null; }
interface PlayerContribution { username: string; }
interface ClanExpSummary    { playerContributions: PlayerContribution[]; }

const clanReporte = new Hono();

clanReporte.get("/", async (c) => {
  try {
    const clanName = getClanName();

    const db = getTursoClient();

    // miembros, exp y whitelist en paralelo
    const [recruitment, experience, whitelistRows] = await Promise.all([
      idleGet<RecruitmentData>(`/api/Clan/recruitment/${encodeURIComponent(clanName)}`),
      idleGet<ClanExpSummary>(`/api/Clan/${encodeURIComponent(clanName)}/experience?hours=${NO_XP_HOURS}`),
      db.execute(`SELECT username FROM inactivity_whitelist`),
    ]);

    const whitelist = new Set(
      (whitelistRows.rows as unknown as { username: string }[]).map((r) => r.username)
    );

    const members = recruitment.memberlist.map((m) => m.memberName);

    // perfiles simples para ver horas offline (en paralelo)
    const profiles = await Promise.all(
      members.map((name) =>
        idleGet<SimpleProfile>(`/api/Player/profile/simple/${encodeURIComponent(name)}`)
          .then((p) => ({ name, hoursOffline: p.hoursOffline, lastTask: p.taskNameOnLogout ?? null }))
          .catch(() => ({ name, hoursOffline: -1, lastTask: null }))
      )
    );

    // inactivos: sin conexión más de 48h (excluye whitelist)
    const inactivos = profiles
      .filter((p) => p.hoursOffline >= OFFLINE_HOURS && !whitelist.has(p.name))
      .sort((a, b) => b.hoursOffline - a.hoursOffline)
      .map((p) => ({
        player:       p.name,
        hoursOffline: Math.round(p.hoursOffline),
        lastTask:     p.lastTask,
      }));

    // sin exp: no aparecen en el top de exp de las últimas 30h (excluye whitelist)
    const withXp = new Set(experience.playerContributions.map((p) => p.username));
    const sinExp = members.filter((name) => !withXp.has(name) && !whitelist.has(name));

    const force = c.req.query("force") === "true";
    if (force || isInTimeWindow(12, 0, 12, 15)) {
      await sendEmbed("inactividad", formatInactividadEmbed(inactivos, sinExp, members.length));
    }

    return c.json({
      totalMembers: members.length,
      inactivos48h: { count: inactivos.length, players: inactivos },
      sinExp30h:    { count: sinExp.length,    players: sinExp },
    });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default clanReporte;
