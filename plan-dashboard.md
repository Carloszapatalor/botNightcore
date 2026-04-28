# Plan: Dashboard separado del clan

## Contexto
El bot ya expone datos del clan (RPG, actividad, eventos) y gestiona la whitelist de inactividad. Se quiere un sitio web independiente con zona pública (ranking, guías) y un panel admin con login multi-usuario para gestionar el clan sin llamar a endpoints manualmente. Vive en su propio repo y Deno Deploy, compartiendo la misma BD Turso.

---

## Stack

| Tecnología | Decisión |
|---|---|
| Runtime | Deno + Deno Deploy |
| Router | Hono (mismo que el bot) |
| CSS | Tailwind CSS via CDN (sin build step) |
| DB | Misma instancia Turso del bot |
| Auth | JWT firmado con `hono/jwt`, almacenado en cookie HTTP-only |
| Passwords | `npm:bcryptjs` (puro JS, compatible con Deno Deploy) |
| Markdown | `npm:marked` (renderiza contenido de guías en el servidor) |

---

## Nuevas tablas en la BD compartida

```sql
CREATE TABLE IF NOT EXISTS admin_users (
  id            TEXT PRIMARY KEY,   -- uuid
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,       -- bcrypt
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS guides (
  id         TEXT PRIMARY KEY,       -- uuid
  slug       TEXT UNIQUE NOT NULL,   -- url-friendly
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,          -- Markdown
  published  INTEGER NOT NULL DEFAULT 0,
  author     TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

## Estructura del proyecto

```
clanDashboard/
├── deno.json
├── .env.example
├── .gitignore
├── main.ts                  ← app + rutas montadas
├── lib/
│   ├── turso.ts             ← mismo patrón del bot (TURSO_URL + TURSO_AUTH_TOKEN)
│   ├── auth.ts              ← sign/verify JWT, helpers de cookie
│   └── hash.ts              ← wrapper de bcryptjs
├── middleware/
│   └── requireAuth.ts       ← valida JWT de cookie, redirige a /auth/login si falla
├── routes/
│   ├── home.ts              ← GET /
│   ├── guias.ts             ← GET /guias, GET /guias/:slug
│   ├── auth.ts              ← GET+POST /auth/login, GET /auth/logout
│   └── admin/
│       ├── dashboard.ts     ← GET /admin
│       ├── miembros.ts      ← GET /admin/miembros
│       ├── whitelist.ts     ← GET /admin/whitelist + acciones POST/DELETE
│       ├── eventos.ts       ← GET /admin/eventos + sortear
│       ├── guias.ts         ← CRUD /admin/guias
│       └── usuarios.ts      ← gestionar admins (solo superadmin)
└── views/
    └── layout.ts            ← función base HTML con Tailwind CDN + nav
```

---

## Páginas públicas

| Ruta | Contenido |
|---|---|
| `/` | Ranking semanal RPG top 5, evento del día, total miembros activos |
| `/guias` | Lista de guías publicadas con título y preview |
| `/guias/:slug` | Guía completa: Markdown renderizado a HTML |

---

## Flujo de autenticación

1. `GET /auth/login` → formulario HTML (username + password)
2. `POST /auth/login` → bcrypt.compare → JWT 24h → cookie HTTP-only → redirect `/admin`
3. `middleware/requireAuth.ts` en todas las rutas `/admin/*` → verifica JWT → si inválido, redirect a `/auth/login`
4. `GET /auth/logout` → borra cookie → redirect `/`

---

## Panel admin

| Ruta | Funcionalidad |
|---|---|
| `/admin` | Resumen: EXP ganada hoy, evento activo, inactivos, últimas guías |
| `/admin/miembros` | Tabla: nombre, nivel RPG, título, EXP semanal, horas offline |
| `/admin/whitelist` | Ver lista + formulario añadir + botón quitar |
| `/admin/eventos` | Evento del día + botón "Forzar nuevo sorteo" |
| `/admin/guias` | Tabla de guías con acciones: publicar, editar, borrar |
| `/admin/guias/nueva` | Formulario: título, slug (auto), contenido Markdown, publicar |
| `/admin/guias/:id/editar` | Mismo formulario, pre-cargado |
| `/admin/usuarios` | Crear/desactivar admins (solo visible para el primer usuario) |

---

## Setup inicial

`GET /setup` → solo funciona si `admin_users` está vacía → formulario para crear el primer superadmin → después devuelve 404.

---

## Variables de entorno

```env
# Compartidas con el bot
TURSO_URL=libsql://tu-db.turso.io
TURSO_AUTH_TOKEN=tu-token

# Solo para el dashboard
JWT_SECRET=cadena-aleatoria-larga-y-segura
```

---

## deno.json

```json
{
  "tasks": {
    "dev": "deno run --watch --allow-net --allow-env --env-file=.env main.ts"
  },
  "imports": {
    "hono": "jsr:@hono/hono@^4"
  }
}
```

---

## Verificación

1. `deno task dev` arranca sin errores
2. `GET /setup` → crea primer admin → vuelve a entrar → 404
3. Login con credenciales correctas → cookie + redirect `/admin`
4. Login con credenciales incorrectas → error en el form
5. `GET /admin/miembros` → tabla con datos
6. `GET /admin/whitelist` → añadir "TestPlayer" → aparece en lista
7. Crear guía nueva → aparece en `GET /guias`
8. Cerrar sesión → `/admin` → redirect a login
