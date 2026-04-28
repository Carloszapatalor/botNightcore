# botNightcore

Asistente automático para el clan **Nightcore** en [Idle Clans](https://idleclans.com). Monitorea la actividad de los miembros y mantiene al clan organizado mediante avisos diarios en Discord.

## ¿Qué hace?

**Reporte de inactividad**
Detecta automáticamente quién lleva más de 48 horas sin conectarse y quién no ha ganado experiencia en las últimas 30 horas. Publica el reporte cada día en Discord para que los líderes puedan actuar. Los jugadores justificados pueden agregarse a una lista de exentos.

**Evento del día**
Sortea cada mañana la actividad del clan: una incursión, un jefe o un evento especial. Lo anuncia en Discord a las 3:00 AM UTC con un recordatorio a las 5:00 PM entre semana. Los fines de semana se habilitan eventos exclusivos de mayor dificultad.

**Ranking RPG semanal**
Los miembros acumulan puntos según su actividad diaria (misiones, jefes, eventos). Cada semana el bot publica el top del clan en Discord con medallas y títulos por nivel.

**Reporte de jefes**
Al cierre del día muestra cuántos jefes eliminó cada miembro y el ranking de los cazadores más activos.

## Stack

- [Deno](https://deno.com) + [Deno Deploy](https://deno.com/deploy)
- [Hono](https://hono.dev) — framework web
- [Turso](https://turso.tech) — base de datos
- Discord Webhooks — notificaciones automáticas
