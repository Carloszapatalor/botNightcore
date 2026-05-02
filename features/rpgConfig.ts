// ── EXP por fuente ────────────────────────────────────────────────
export const EXP_QUEST_COMBAT   = 20;   // era 50 → más moderado
export const EXP_QUEST_SKILLING = 10;   // era 30 → más moderado

export const BOSS_EXP: Record<string, number> = {
  // Fáciles — poco valor
  MalignantSpider:  2,   // era 1
  SkeletonWarrior:  2,   // era 1
  // Medios — valor moderado
  Griffin:  5,   // era 2
  Devil:    5,   // era 2
  Hades:    5,   // era 2
  Zeus:     5,   // era 2
  Medusa:   5,   // era 2
  Chimera:  5,   // era 2
  // Difíciles — alto valor
  Kronos:             15,  // era 5
  ReckoningOfTheGods: 15,  // era 5
  // Jefes de clan — valor medio-alto
  OtherworldlyGolem:      8,   // era 3
  GuardiansOfTheCitadel:  8,   // era 3
  BloodmoonMassacre:      8,   // era 3
  Sobek:                  8,   // era 3
  Mesines:                8,   // era 3
};

export const EXP_EVENTO    = 50;   // era 100 → la mitad
export const EXP_INCURSION = 100;  // era 200 → la mitad

// ── Progresión de nivel (curva cuadrática) ────────────────────────
// Nivel n requiere: BASE_EXP * n^2 EXP acumulada
// Ejemplo: Nivel 10 → 5000 EXP total | Nivel 50 → 125 000 | Nivel 100 → 500 000
export const BASE_EXP_PER_LEVEL = 50; // constante de escala

export function calcLevel(totalExp: number): number {
  // Despejando: n^2 ≤ totalExp / BASE_EXP_PER_LEVEL  →  n = floor(sqrt(...)) + 1
  return Math.floor(Math.sqrt(totalExp / BASE_EXP_PER_LEVEL)) + 1;
}

// ── EXP necesaria para alcanzar un nivel (referencia) ────────────
export function expForLevel(level: number): number {
  return BASE_EXP_PER_LEVEL * Math.pow(level - 1, 2);
}

// ── Títulos únicos (25 rangos con nombre exclusivo) ───────────────
// Se asigna según el NIVEL alcanzado (no EXP total)
export const RANK_TITLES: { minLevel: number; title: string }[] = [
  { minLevel:   1, title: "🌱 Aprendiz"             },
  { minLevel:   3, title: "🔍 Explorador"            },
  { minLevel:   6, title: "🗡️ Iniciado"             },
  { minLevel:  10, title: "⚔️ Cazador"              },
  { minLevel:  15, title: "🛡️ Defensor"             },
  { minLevel:  21, title: "🔥 Combatiente"           },
  { minLevel:  28, title: "🌩️ Guerrero"             },
  { minLevel:  36, title: "🦅 Luchador Élite"        },
  { minLevel:  45, title: "🐺 Depredador"            },
  { minLevel:  55, title: "💀 Asesino"               },
  { minLevel:  66, title: "🔱 Veterano"              },
  { minLevel:  78, title: "🌑 Sombra del Abismo"     },
  { minLevel:  91, title: "⚡ Campeón"               },
  { minLevel: 105, title: "🏹 Arquero Oscuro"        },
  { minLevel: 120, title: "🌀 Guardián del Caos"     },
  { minLevel: 136, title: "🦂 Cazador de Dioses"     },
  { minLevel: 153, title: "🔮 Maestro del Vacío"     },
  { minLevel: 171, title: "⚰️ Señor de la Muerte"   },
  { minLevel: 190, title: "🐉 Jinete del Dragón"    },
  { minLevel: 210, title: "🌌 Viajero Estelar"      },
  { minLevel: 231, title: "👁️ Ojo del Abismo"       },
  { minLevel: 253, title: "🗝️ Portador de Runas"   },
  { minLevel: 276, title: "🌟 Arconte Inmortal"     },
  { minLevel: 300, title: "💠 Elegido del Clan"     },
  { minLevel: 325, title: "👑 Leyenda Eterna"       },
];

export function calcTitle(totalExp: number): string {
  const level = calcLevel(totalExp);
  let title = RANK_TITLES[0].title;
  for (const t of RANK_TITLES) {
    if (level >= t.minLevel) title = t.title;
  }
  return title;
}
