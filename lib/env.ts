export function getClanName(): string {
  const v = Deno.env.get("CLAN_NAME");
  if (!v) throw new Error("CLAN_NAME not configured");
  return v;
}
