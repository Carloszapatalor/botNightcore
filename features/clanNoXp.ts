import { Hono } from "hono";
import { idleGet } from "../lib/api.ts";
import { getClanName } from "../lib/env.ts";

interface MemberEntry {
  memberName: string;
}

interface RecruitmentData {
  memberlist: MemberEntry[];
}

interface PlayerContribution {
  username: string;
  totalExperience: number;
}

interface ClanExperienceSummary {
  playerContributions: PlayerContribution[];
}

const clanNoXp = new Hono();

clanNoXp.get("/", async (c) => {
  const hours = Number(c.req.query("hours") ?? 24);

  try {
    const clanName = getClanName();

    const [recruitment, experience] = await Promise.all([
      idleGet<RecruitmentData>(`/api/Clan/recruitment/${encodeURIComponent(clanName)}`),
      idleGet<ClanExperienceSummary>(
        `/api/Clan/${encodeURIComponent(clanName)}/experience?hours=${hours}`
      ),
    ]);

    const withXp = new Set(experience.playerContributions.map((p) => p.username));
    const noXp = recruitment.memberlist
      .map((m) => m.memberName)
      .filter((name) => !withXp.has(name));

    return c.json({
      hours,
      noXpCount: noXp.length,
      totalMembers: recruitment.memberlist.length,
      members: noXp,
    });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default clanNoXp;
