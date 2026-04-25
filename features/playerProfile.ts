import { Hono } from "hono";
import { idleGet } from "../lib/api.ts";

interface PlayerProfile {
  username: string;
  gameMode: string;
  guildName: string | null;
  skillExperiences: Record<string, number>;
  taskTypeOnLogout: number | null;
  taskNameOnLogout: string | null;
  hoursOffline: number;
}

const playerProfile = new Hono();

playerProfile.get("/:name", async (c) => {
  const name = c.req.param("name");

  try {
    const data = await idleGet<PlayerProfile>(
      `/api/Player/profile/${encodeURIComponent(name)}`
    );

    const skills = Object.entries(data.skillExperiences)
      .sort((a, b) => b[1] - a[1])
      .map(([skill, xp]) => ({ skill, xp }));

    return c.json({
      username: data.username,
      gameMode: data.gameMode,
      clan: data.guildName,
      lastTask: data.taskNameOnLogout || null,
      hoursOffline: data.hoursOffline,
      skills,
    });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

export default playerProfile;
