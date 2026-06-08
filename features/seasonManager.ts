import { getTursoClient } from "../lib/turso.ts";

export interface Season {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: number;
}

function getMonthEnd(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0));
  return last.toISOString().slice(0, 10);
}

export async function getOrCreateCurrentSeason(): Promise<Season> {
  const db = getTursoClient();

  const active = await db.execute(
    `SELECT * FROM seasons WHERE is_active = 1 ORDER BY id DESC LIMIT 1`
  );

  if (active.rows.length > 0) {
    const s = active.rows[0] as unknown as Season;
    // Si la temporada ya venció, crearla nueva
    const today = new Date().toISOString().slice(0, 10);
    if (today <= s.end_date) return s;
    // Cerrar la actual
    await db.execute({ sql: `UPDATE seasons SET is_active = 0 WHERE id = ?`, args: [s.id] });
  }

  // Crear temporada del mes actual
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = getMonthEnd(year, month + 1);
  const name = `Temporada ${now.toLocaleString("es", { month: "long", timeZone: "UTC" })} ${year}`;

  const result = await db.execute({
    sql: `INSERT INTO seasons (name, start_date, end_date, is_active) VALUES (?, ?, ?, 1)`,
    args: [name, startDate, endDate],
  });

  return {
    id: Number(result.lastInsertRowid),
    name,
    start_date: startDate,
    end_date: endDate,
    is_active: 1,
  };
}
