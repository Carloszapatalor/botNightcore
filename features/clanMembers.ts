import { Hono } from "hono";
import { idleGet } from "../lib/api.ts";
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

    return c.json({
      clan: data.clanName,
      memberCount: data.memberCount,
      members: data.memberlist.map((m) => ({ name: m.memberName, rank: m.rank })),
    });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default clanMembers;
