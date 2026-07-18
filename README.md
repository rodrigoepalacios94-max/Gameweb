# GAME Web

GAME es una plataforma web para administrar torneos de tenis: jugadores, categorias, inscripciones, partidos, ranking, notificaciones y disciplina.

Esta primera etapa implementa la base completa del frontend local. No incluye backend real, Supabase, Mercado Pago ni algoritmos definitivos de llaves o cronograma.

## Tecnologias

- React
- Vite
- JavaScript
- React Router
- CSS normal
- lucide-react

No se utiliza Tailwind.

## Instalacion

```bash
npm install
```

## Ejecucion local

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Estructura

```txt
src/
  assets/
  components/
    common/
    layout/
    player/
    admin/
    tournaments/
    brackets/
  pages/
    auth/
    player/
    admin/
  layouts/
  routes/
  services/
  mocks/
  hooks/
  context/
  utils/
  styles/
```

## Roles disponibles

La app usa un `AuthContext` mock con dos roles:

- `player`
- `admin`

El selector visible en la barra superior permite alternar entre Jugador y Admin sin autenticacion real.

## Rutas principales

Jugador:

- `/player`
- `/player/tournaments`
- `/player/tournaments/:id`
- `/player/tournaments/:id/register`
- `/player/ranking`
- `/player/matches`
- `/player/notifications`
- `/player/profile`

Administrador:

- `/admin`
- `/admin/tournaments`
- `/admin/tournaments/new`
- `/admin/players`
- `/admin/ranking`
- `/admin/categories`
- `/admin/matches`
- `/admin/discipline`
- `/admin/notifications`
- `/admin/settings`

## Datos mock

Los datos estan centralizados en:

- `src/mocks/mockPlayers.js`
- `src/mocks/mockTournaments.js`
- `src/mocks/mockMatches.js`
- `src/mocks/mockRankings.js`
- `src/mocks/mockNotifications.js`
- `src/mocks/mockCategories.js`
- `src/mocks/mockDiscipline.js`

Los services dentro de `src/services/` consumen esos mocks y quedan preparados para reemplazarse por Supabase, Mercado Pago y backend real en proximas etapas.

## Estado actual

Implementado:

- Arquitectura base del frontend.
- Layout mobile-first para jugador con navegacion inferior.
- Layout administrador con sidebar en escritorio y navegacion adaptada en movil.
- Dashboard del jugador.
- Torneos, detalle e inscripcion mock por pasos.
- Ranking por categoria con perfil deportivo mock.
- Mis partidos.
- Centro de notificaciones.
- Perfil del jugador.
- Dashboard administrador.
- Gestion visual de torneos y asistente de nuevo torneo.
- Gestion visual de jugadores.
- Gestion visual de categorias.
- Ranking admin con historial de puntos.
- Listado general de partidos con filtros.
- Modulo disciplinario mock.
- Configuracion general mock.

Pendiente para siguientes etapas:

- Supabase Auth y base de datos.
- Mercado Pago real.
- Notificaciones push/email.
- Algoritmos definitivos de preliminares, zonas, llaves, cabezas de serie y cronograma.
- Persistencia real de formularios y acciones administrativas.

## Documentacion funcional

`docs/estructura.md` es la fuente funcional oficial del proyecto y no debe modificarse desde el desarrollo de frontend.
