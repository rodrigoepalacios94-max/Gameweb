# GAME Web

GAME es una plataforma profesional para la gestión integral de torneos de tenis, desarrollada como una Progressive Web App (PWA). Permite administrar jugadores, categorías, temporadas, inscripciones, pagos, cuadros, rankings, programación automática de partidos, reglamentos, notificaciones y disciplina desde una única plataforma.

## Stack tecnológico

### Frontend

- React
- Vite
- JavaScript
- React Router
- CSS
- Progressive Web App (PWA)

### Backend

- Supabase
  - PostgreSQL
  - Authentication
  - Row Level Security (RLS)
  - Storage
  - Edge Functions

### Integraciones

- Mercado Pago (Checkout Pro + Webhooks)
- Resend (emails transaccionales)

### Infraestructura

- Netlify
- Supabase
- pg_cron
- pg_net

---

## Instalación

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

## Build de producción

```bash
npm run build
```

---

## Funcionalidades

### Jugadores

- Registro e inicio de sesión
- Perfil deportivo
- Ranking
- Historial
- Inscripción a torneos
- Disponibilidad horaria
- Mis partidos
- Notificaciones
- Reglamento
- Álbum de fotos

### Administración

- Dashboard
- Gestión de jugadores
- Gestión de categorías
- Gestión de torneos
- Gestión de temporadas
- Sistema de puntuación
- Disciplina
- Programación automática
- Seguridad
- Reglamento
- Notificaciones

### Torneos

- Eliminación directa
- Fase de grupos
- Preliminares
- Ranking automático
- Cabezas de serie
- Disponibilidad de jugadores
- Programación automática de partidos

### Pagos

- Mercado Pago
- Webhooks
- Confirmación automática

### Emails

- Apertura de torneos
- Recordatorios
- Suspensión de partidos
- Avisos de pago
- Cola automática mediante Edge Functions y Cron

---

## Arquitectura

```
React (Vite PWA)
        │
        ▼
     Netlify
        │
        ▼
 Supabase
 ├── PostgreSQL
 ├── Auth
 ├── Storage
 ├── Edge Functions
 ├── pg_cron
 └── pg_net
        │
 ├── Mercado Pago
 └── Resend
```

---

## Documentación

La documentación funcional oficial del proyecto se encuentra en:

```
docs/estructura.md
docs/formatos.md
```

Estos documentos representan la especificación funcional del sistema y constituyen la fuente principal de las reglas de negocio del proyecto.
