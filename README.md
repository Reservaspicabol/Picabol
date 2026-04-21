# PICABOL — Sistema de Administración de Canchas

Sistema interno para administrar las 4 canchas de Pickleball de PICABOL en Cancún.
Roles: **Admin** (acceso total + ventas) y **Host** (operación diaria).

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite |
| Base de datos + Auth | Supabase (Postgres + Row Level Security) |
| Hosting | Netlify (deploy automático desde GitHub) |

---

## Paso 1 — Crear proyecto en Supabase

1. Ve a [https://supabase.com](https://supabase.com) y crea una cuenta (gratis).
2. Crea un nuevo proyecto. Anota:
   - **Project URL** → `https://xxxxxxxx.supabase.co`
   - **Anon public key** → llave larga que empieza con `eyJ...`
3. En el menú lateral ve a **SQL Editor**.
4. Copia todo el contenido de `supabase_schema.sql` y ejecútalo.
   - Esto crea las tablas, políticas de seguridad y el trigger de registro.

---

## Paso 2 — Crear usuarios (Admin y Host)

1. En Supabase ve a **Authentication → Users → Invite user**.
2. Crea los correos del admin y del host.
3. Una vez creados, ve a **Table Editor → profiles**.
4. Cambia el `role` del admin a `admin` (por defecto todos entran como `host`).

---

## Paso 3 — Configurar variables de entorno

1. En la raíz del proyecto copia `.env.example` a `.env`:
   ```
   cp .env.example .env
   ```
2. Edita `.env` y llena los valores:
   ```
   VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
   VITE_SUPABASE_ANON_KEY=TU_ANON_KEY
   ```

---

## Paso 4 — Correr en local (para probar)

```bash
npm install
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173).

---

## Paso 5 — Subir a GitHub

1. Crea un repositorio nuevo en [https://github.com](https://github.com) (puede ser privado).
2. En la carpeta del proyecto:
   ```bash
   git init
   git add .
   git commit -m "PICABOL v1.0"
   git remote add origin https://github.com/TU_USUARIO/picabol.git
   git push -u origin main
   ```

---

## Paso 6 — Deploy en Netlify

1. Ve a [https://netlify.com](https://netlify.com) y crea una cuenta.
2. Haz clic en **Add new site → Import from Git**.
3. Conecta tu cuenta de GitHub y selecciona el repositorio `picabol`.
4. Configuración de build:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
5. Antes de publicar ve a **Site configuration → Environment variables** y agrega:
   ```
   VITE_SUPABASE_URL    = https://TU_PROYECTO.supabase.co
   VITE_SUPABASE_ANON_KEY = TU_ANON_KEY
   ```
6. Haz clic en **Deploy site**.
7. Netlify te dará una URL tipo `https://picabol-admin.netlify.app`.
   Puedes cambiarla a un dominio personalizado en **Domain settings**.

---

## Estructura del proyecto

```
picabol/
├── src/
│   ├── components/
│   │   ├── Layout.jsx        ← Sidebar + nav principal
│   │   ├── CourtCard.jsx     ← Tarjeta de cancha con cronómetro
│   │   └── BookingModal.jsx  ← Formulario walkin/reserva
│   ├── hooks/
│   │   ├── useAuth.jsx       ← Contexto de autenticación
│   │   └── useBookings.js    ← CRUD reservas + realtime
│   ├── lib/
│   │   ├── supabase.js       ← Cliente Supabase
│   │   └── utils.js          ← Funciones y constantes compartidas
│   ├── pages/
│   │   ├── Login.jsx         ← Pantalla de login
│   │   ├── Courts.jsx        ← Panel principal de 4 canchas
│   │   ├── Calendar.jsx      ← Calendario semanal de reservas
│   │   └── Ventas.jsx        ← Dashboard de ventas (solo Admin)
│   ├── App.jsx               ← Rutas y protección de roles
│   ├── main.jsx              ← Entrada React
│   └── index.css             ← Estilos globales + variables
├── supabase_schema.sql       ← Esquema BD (ejecutar en Supabase)
├── netlify.toml              ← Config de deploy
├── vite.config.js
└── package.json
```

---

## Lógica de negocio clave

| Regla | Implementación |
|-------|---------------|
| Tolerancia 10 min | `CourtCard.jsx` calcula `toleranceMs()` cada segundo; si llega a 0 llama `expireBooking()` |
| Aviso 10 min antes del fin | `CourtCard.jsx` detecta `remainingMs() <= WARN_BEFORE_MS` y dispara notificación |
| Open Play = 3 horas | `isSlotBlocked()` en `utils.js` bloquea `hour`, `hour+1`, `hour+2` |
| Realtime entre dispositivos | `useBookings.js` usa Supabase Realtime; cambios de otro host se reflejan al instante |
| Admin vs Host | `ProtectedRoute adminOnly` redirige a hosts que intenten entrar a `/ventas` |

---

## Próximas funcionalidades planeadas

- [ ] Módulo de torneos y ligas
- [ ] Registro y perfil de socios frecuentes
- [ ] Vista pública para jugadores (reservas + open play)
- [ ] Notificaciones push (recordatorios 1h / 2h antes de reserva)
- [ ] Integración de pagos (Stripe / Conekta)
