import { Hono } from "hono";
import { idleGet } from "../lib/api.ts";
import { getClanName } from "../lib/env.ts";

interface SkillData {
  experience: number;
  level: number;
}

interface PlayerContribution {
  username: string;
  totalExperience: number;
  skills: Record<string, SkillData>;
}

interface ClanExperienceSummary {
  clanName: string;
  periodHours: number;
  totalExperience: number;
  playerContributions: PlayerContribution[];
}

const clanExperience = new Hono();

clanExperience.get("/", async (c) => {
  const hours = Number(c.req.query("hours") ?? 24);

  try {
    const clanName = getClanName();
    const data = await idleGet<ClanExperienceSummary>(
      `/api/Clan/${encodeURIComponent(clanName)}/experience?hours=${hours}`
    );

    const topContributors = [...data.playerContributions]
      .sort((a, b) => b.totalExperience - a.totalExperience)
      .map((p) => ({
        player: p.username,
        xp: p.totalExperience,
        topSkill: Object.entries(p.skills).sort((a, b) => b[1].experience - a[1].experience)[0]?.[0] ?? "N/A",
      }));

    return c.json({
      clan: data.clanName,
      hours: data.periodHours,
      totalXP: data.totalExperience,
      contributors: topContributors,
    });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default clanExperience;
