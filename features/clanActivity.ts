import { Hono } from "hono";
import { idleGet } from "../lib/api.ts";
import { getClanName } from "../lib/env.ts";

const OFFLINE_THRESHOLD = 50;

interface MemberEntry {
  memberName: string;
}

interface RecruitmentData {
  memberlist: MemberEntry[];
}

interface SimpleProfile {
  hoursOffline: number;
  taskTypeOnLogout: number | null;
  taskNameOnLogout: string | null;
}

const clanActivity = new Hono();

clanActivity.get("/", async (c) => {
  const threshold = Number(c.req.query("hours") ?? OFFLINE_THRESHOLD);

  try {
    const clanName = getClanName();

    const recruitment = await idleGet<RecruitmentData>(
      `/api/Clan/recruitment/${encodeURIComponent(clanName)}`
    );
    const members = recruitment.memberlist.map((m) => m.memberName);

    const profiles = await Promise.all(
      members.map((name) =>
        idleGet<SimpleProfile>(`/api/Player/profile/simple/${encodeURIComponent(name)}`)
          .then((p) => ({ name, hoursOffline: p.hoursOffline, lastTask: p.taskNameOnLogout || null }))
          .catch(() => ({ name, hoursOffline: -1, lastTask: null }))
      )
    );

    const inactive = profiles
      .filter((p) => p.hoursOffline >= threshold)
      .sort((a, b) => b.hoursOffline - a.hoursOffline)
      .map((p) => ({
        player: p.name,
        hoursOffline: Math.round(p.hoursOffline),
        lastTask: p.lastTask,
      }));

    return c.json({
      threshold,
      inactiveCount: inactive.length,
      totalMembers: members.length,
      inactive,
    });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default clanActivity;
