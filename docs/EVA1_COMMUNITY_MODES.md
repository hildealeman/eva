# EVA 1 · Modos de Comunidad y Comportamiento de UI

## 1. Roles y Modos (vista Frontend)

EVA 1 muestra y manipula información de HGI a través de distintos roles y modos:

- **Fantasma** (`role=ghost`, `mode=passive`):
  - No tiene invitación ni número de sistema.
  - Puede crear un perfil básico para empezar a votar.
  - Su peso de voto es bajo (ej. 0.2 frente a 1.0 de un usuario activo).
- **Usuario Activo** (`role=active`, `mode=active|passive`):
  - Ya pasó criterios de compromiso y ética (TEV).
  - Puede ver colores de origen y participar en branches.
- **IA / Modelos**, **Sistema / Aldea / Purificadores**, **Comunidad**:
  - Aparecen como orígenes de decisiones/sugerencias en el UI (por color).

Los **modos** controlan cuánto contexto se ve:

- **Modo Pasivo**:
  - Sin colores de origen.
  - No muestra conteos de votos hasta que el usuario vota en cada elemento.
- **Modo Activo**:
  - Muestra colores de origen:
    - 🔵 IA
    - 🟢 Humano autor del shard
    - 🟠 Comunidad
    - 🔴 Sistema / Aldea / Purificadores
    - 👻 Fantasmas (gris)
  - Muestra estados de branch (abierto, cerrado, en disputa, etc.).

## 2. Comportamiento de Votación en Modo Pasivo (👻)

El modo pasivo es el estado inicial para cualquiera que crea un perfil sin invitación.

- Para poder votar (up/down), el usuario debe **crear un perfil** básico.
- En modo pasivo:
  - El usuario ve etiquetas, notas, transcripciones, etc., PERO:
  - **No ve los conteos de upvotes/downvotes de ningún elemento** hasta que él mismo vota ese elemento.
  - Al votar (up o down) en un elemento:
    - Se registra su participación.
    - Se desbloquea el conteo solo para ese elemento.
- Este patrón obliga a ejercer juicio propio antes de ser influenciado por los demás.
- Todos sus votos alimentan una barra de progreso diaria hacia “Usuario”.

Peso de votos:

- Fantasmas: peso reducido (ej. 0.2).
- Usuarios activos: peso completo (1.0) y posiblemente mayor con TEV alto.

## 3. Barra de Progreso diaria hacia "Usuario"

EVA 1 consumirá un endpoint como `GET /me/progress` (descrito en EVA_CONTRACT.md de EVA 2) que devuelve un objeto `ProgressSummary`.

La UI deberá mostrar al usuario en modo pasivo:

- Una barra de progreso "Hacia Usuario" basada en:
  - `progressTowardsActivation` (0.0–1.0)
  - `activitySeconds` (tiempo de actividad real)
  - número de votos (`votes.upvotes` / `votes.downvotes`)
  - consistencia de participación (sesiones, frecuencia)
- Un estado global simple:
  - "Avanzaste"
  - "Te mantuviste"
  - "Retrocediste"

La barra NO explica el detalle interno del TEV.
Solo comunica si, con su comportamiento del día, se acercó o alejó del rol de Usuario.

En términos de flujo:

- El modo pasivo está bloqueado a nivel de capacidades; la meta es convertirse en Usuario.
- Una vez alcanzado el criterio (según TEV definido en backend), `Profile.role` cambia a `active` y el usuario gana acceso al modo activo.

## 4. Modo Activo y Colores de Origen

En modo activo, EVA 1 muestra toda la capa de contexto:

- Colores de origen en chips, etiquetas, notas, etc.:
  - 🔵 IA (propuestas originales del modelo)
  - 🟢 Humano autor del shard (edición/verificación del creador)
  - 🟠 Comunidad (sugerencias de otros usuarios)
  - 🔴 Sistema / Aldea / Purificadores (intervenciones del núcleo HGI)
  - 👻 Fantasmas (actividad de usuarios en modo pasivo, gris)

Comportamiento:

- El usuario puede:
  - Votar con peso real (según TEV).
  - Ver y participar en branches de discusión generados por sugerencias de nuevas etiquetas o cambios de transcripción.
  - Ver estados de cada branch (abierto, cerrado, en disputa).
- Cambiar de modo:
  - Pasar de pasivo a activo, o viceversa, no es inmediato:
  - Debe haber cierta cantidad de actividad o tiempo (p.ej. 60 minutos de participación real) antes de poder alternar, para evitar “gaming” del sistema.

## 5. Invitaciones y Red de Confianza en la UI

Una vez que `Profile.role === "active"`:

- EVA 1 debe mostrar una card de “Invitaciones”:
  - Ejemplo: "Tienes 3 invitaciones para compartir HGI".
- Un usuario activo puede:
  - Crear invitaciones (POST /invitations en EVA 2).
  - Ver el estado de sus invitaciones (GET /me/invitations):
    - pending / accepted / revoked.

Reglas de comportamiento que la UI debe reflejar:

- Las invitaciones solo valen para perfiles realmente nuevos:
  - correo distinto
  - IP distinta
  - identidad nueva (según reglas que defina HGI)
- El comportamiento ético de los invitados afecta el TEV del invitador:
  - Si invita a nodos tóxicos, su influencia bajará a largo plazo.
  - Si invita a nodos benéficos, su influencia sube.
- Esto se refleja indirectamente en:
  - El peso de sus votos.
  - Cómo se ve su barra de influencia en vistas avanzadas (futuras).

La UI no necesita mostrar números de TEV explícitos, pero sí puede insinuar:

- "Tus invitaciones están fortaleciendo/deteriorando tu huella en HGI".
