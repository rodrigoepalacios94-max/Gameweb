# GAME data model draft

Este documento es un borrador tecnico para preparar la futura integracion con Supabase. No reemplaza a `docs/estructura.md`, no define SQL definitivo y no define politicas RLS.

## Entidades propuestas

### profiles / users
- id
- auth_user_id
- role
- first_name
- last_name
- email
- avatar_url
- status

Relaciones: un profile puede estar asociado a un player o a un profesor/admin.

### players
- id
- profile_id
- dni
- birth_date
- gender
- phone
- category_id
- ranking_position
- points
- status
- discipline_status
- discipline_faults
- discipline_fault_limit

Relaciones: pertenece a una categoria vigente. Participa en enrollments, matches, ranking_movements, discipline_claims y discipline_fouls.

### categories
- id
- name
- branch
- hierarchy_level
- status

Relaciones: usada por players, tournaments, enrollments, matches y category_change_requests. Las comparaciones deportivas deben usar `hierarchy_level`, no el nombre.

### tournaments
- id
- name
- description
- edition
- start_date
- semifinals_date
- finals_date
- status
- tournament_type
- scoring_system
- inscription_price
- max_players_per_category
- specific_rules
- internal_notes

Relaciones: tiene muchas tournament_categories, enrollments, matches, brackets/schedule y discipline_claims.

### tournament_categories
- id
- tournament_id
- category_id

Relacion puente para categorias participantes.

### enrollments
- id
- tournament_id
- player_id
- category_id
- status
- payment_status
- date
- unavailable_slots

Relaciones: conecta jugador, torneo y categoria. El pago real queda para una etapa posterior.

### matches
- id
- tournament_id
- category_id
- phase
- round
- player_a_id
- player_b_id
- date
- time
- court
- status
- result
- winner_id
- walkover_player_id
- double_walkover
- observations

Relaciones: tiene match_sets y puede originar ranking_movements y discipline_claims.

### match_sets
- id
- match_id
- set_number
- player_a_games
- player_b_games
- is_super_tiebreak

### ranking_movements
- id
- player_id
- tournament_id
- match_id
- concept
- points
- date
- reason
- created_by

Conceptos soportados: inscripcion, jugar preliminar, ganar preliminar, clasificacion, ronda, campeon, subcampeon, ajuste manual y penalizacion.

### discipline_claims
- id
- match_id
- tournament_id
- reported_player_id
- claimant_player_id
- reason
- observations
- status
- date
- reviewed_by

Estados: pendiente, confirmado, rechazado.

### discipline_fouls
- id
- claim_id
- match_id
- player_id
- reason
- observations
- date
- professor_id

Regla: al llegar a 3 faltas confirmadas, el jugador queda bloqueado hasta rehabilitacion manual.

### notifications
- id
- role
- user_id
- type
- title
- description
- date
- read
- priority
- related_entity_type
- related_entity_id
- action_to

### category_change_requests
- id
- player_id
- current_category_id
- requested_category_id
- date
- status
- note
- reviewed_by

Estados: pendiente, aprobada, rechazada.

### audit_logs
- id
- action
- entity_type
- entity_id
- description
- date
- actor

Acciones esperadas: cambio de categoria, ajuste de puntos, resultado editado, W.O., falta confirmada, bloqueo, desbloqueo y solicitud aceptada/rechazada.

## Relaciones conceptuales

- `players.category_id` referencia `categories.id`.
- `tournament_categories.tournament_id` referencia `tournaments.id`.
- `tournament_categories.category_id` referencia `categories.id`.
- `enrollments.player_id`, `matches.player_a_id`, `matches.player_b_id`, `matches.winner_id` y `matches.walkover_player_id` referencian `players.id`.
- `matches.tournament_id` referencia `tournaments.id`.
- `match_sets.match_id` referencia `matches.id`.
- `ranking_movements.player_id` referencia `players.id`.
- `discipline_claims.match_id` referencia `matches.id`.
- `discipline_fouls.claim_id` referencia `discipline_claims.id`.
- `notifications.related_entity_id` es polimorfico y debe resolverse junto con `related_entity_type`.
- `audit_logs` registra acciones relevantes sin borrar historial.

## Pendiente para Supabase

- Definir SQL definitivo.
- Definir indices y constraints.
- Definir RLS por rol jugador/profesor.
- Definir Supabase Auth y asociacion con profiles.
- Definir Storage para avatars.
- Definir estrategia para pagos y webhooks cuando llegue Mercado Pago.
