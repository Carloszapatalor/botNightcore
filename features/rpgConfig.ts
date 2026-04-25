// ── EXP por fuente ────────────────────────────────────────────────
export const EXP_QUEST_COMBAT   = 50;
export const EXP_QUEST_SKILLING = 30;

export const BOSS_EXP: Record<string, number> = {
  // Fáciles
  MalignantSpider:  1,
  SkeletonWarrior:  1,
  // Medios
  Griffin:  2,
  Devil:    2,
  Hades:    2,
  Zeus:     2,
  Medusa:   2,
  Chimera:  2,
  // Difíciles
  Kronos:             5,
  ReckoningOfTheGods: 5,
  // Jefes de clan
  OtherworldlyGolem:      3,
  GuardiansOfTheCitadel:  3,
  BloodmoonMassacre:      3,
  Sobek:                  3,
  Mesines:                3,
};

export const EXP_EVENTO     = 100;
export const EXP_INCURSION  = 200;

// ── EXP por nivel (cada 200 EXP = +1 nivel) ──────────────────────
export const EXP_PER_LEVEL = 200;

// ── Títulos (se otorgan al alcanzar ese total de EXP acumulado) ───
export const TITLES: { minExp: number; title: string }[] = [
  { minExp: 0,     title: "🌱 Buscador"         },
  { minExp: 500,   title: "⚔️  Cazador"          },
  { minExp: 2000,  title: "🛡️  Guerrero"         },
  { minExp: 6000,  title: "💀 Asesino"           },
  { minExp: 15000, title: "👑 Leyenda del Clan"  },
];

export function calcLevel(totalExp: number): number {
  return Math.floor(totalExp / EXP_PER_LEVEL) + 1;
}

export function calcTitle(totalExp: number): string {
  let title = TITLES[0].title;
  for (const t of TITLES) {
    if (totalExp >= t.minExp) title = t.title;
  }
  return title;
}
