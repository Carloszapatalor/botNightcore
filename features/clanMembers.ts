import { Hono } from "hono";
import { idleGet, fetchMemberProfiles } from "../lib/api.ts";
import { getClanName } from "../lib/env.ts";

interface MemberEntry {
  memberName: string;
  rank: number;
}

interface RecruitmentData {
  clanName: string;
  memberCount: number;
  memberlist: MemberEntry[];
}

const clanMembers = new Hono();

clanMembers.get("/", async (c) => {
  try {
    const clanName = getClanName();
    const data = await idleGet<RecruitmentData>(
      `/api/Clan/recruitment/${encodeURIComponent(clanName)}`
    );

    const members = data.memberlist.map((m) => m.memberName);
    const profiles = await fetchMemberProfiles(members);
    const profileMap = new Map(profiles.map((p) => [p.name, p]));

    return c.json({
      clan: data.clanName,
      memberCount: data.memberCount,
      members: data.memberlist.map((m) => {
        const p = profileMap.get(m.memberName);
        return {
          name: m.memberName,
          rank: m.rank,
          hoursOffline: p ? Math.round(p.hoursOffline) : -1,
          lastTask: p?.lastTask ?? null,
        };
      }),
    });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default clanMembers;
