
# EVA – Frontend 🎧💬

Interfaz web de EVA (Human Grounded Intelligence) para:

- Grabar audio desde el micrófono.
- Segmentar en *shards* (momentos cortos).
- Enviar cada shard al backend `eva-analysis-service`.
- Visualizar:
  - Transcripción.
  - Emoción primaria y etiquetas.
  - Rasgos de la señal (RMS, pico, frecuencia, ZCR).
  - Análisis semántico (resumen, topics, tipo de momento, flags).
- Navegar una librería de clips y ver el detalle de cada uno.

---

## Requisitos

- Node.js 20+ (o LTS reciente).
- npm o pnpm (el proyecto está preparado para npm por defecto).
- Backend `eva-analysis-service` corriendo en `http://localhost:5005` (o la URL que configures).

---

## Instalación

Clona el repo:

```bash
git clone https://github.com/hildealeman/eva.git
cd eva

Instala dependencias:

npm install


⸻

Configuración (.env.local)

Hay un archivo de ejemplo:

cp .env.local.example .env.local

Contenido típico de .env.local:

NEXT_PUBLIC_EVA_DATA_MODE=local
NEXT_PUBLIC_EVA_ANALYSIS_MODE=local
NEXT_PUBLIC_EVA_LOCAL_ANALYSIS_BASE=http://localhost:5005
NEXT_PUBLIC_SHOW_WAVEFORM_MVP=0

	•	NEXT_PUBLIC_EVA_DATA_MODE:
	•	local → episodios leídos desde IndexedDB (EpisodeStore).
	•	api → lectura/escritura desde el backend:
	•	GET /episodes
	•	GET /episodes/{id}
	•	PATCH /episodes/{id}
	•	PATCH /shards/{id}
	•	NEXT_PUBLIC_EVA_ANALYSIS_MODE:
	•	local → usa `NEXT_PUBLIC_EVA_LOCAL_ANALYSIS_BASE`.
	•	cloud → usa `NEXT_PUBLIC_EVA_CLOUD_ANALYSIS_BASE`.
	•	none → desactiva análisis.
	•	NEXT_PUBLIC_EVA_LOCAL_ANALYSIS_BASE → base URL del backend FastAPI (ej. http://localhost:5005).
	•	NEXT_PUBLIC_SHOW_WAVEFORM_MVP:
	•	0 → oculta el placeholder de waveform.
	•	1 → muestra el bloque MVP para el waveform.

Las variables NEXT_PUBLIC_... se exponen al navegador, así que solo se usan para configuración de UI / endpoint público del backend local.

⸻

Correr en desarrollo

npm run dev

Abrir en el navegador:

http://localhost:3000


⸻

Páginas principales
	•	/
	•	Pantalla principal de grabación.
	•	Botón para iniciar/detener grabación.
	•	Segmentación de audio en shards.
	•	Crea y mantiene un episodio actual (episodeId) mientras escuchas.
	•	Envía shards a POST /analyze-shard en el backend (meta incluye episodeId).
	•	/clips
	•	Lista de episodios (histórico) usando almacenamiento local (IndexedDB) vía EpisodeStore.
	•	/clips/[id]
	•	Detalle de un episodio:
	•	Header con stats (duración total, shards, crisis/followups).
	•	Lista de shards seleccionable.
	•	Transcripción.
	•	Lectura emocional.
	•	Análisis semántico (“Análisis semántico”).
	•	Rasgos de la señal.
	•	Etiquetas sugeridas dinámicas (topics, emoción primaria, activación, prosodia).

⸻

Estructura destacada
	•	src/app/page.tsx
	•	Home: lógica de grabación, envío a backend, panel principal.
	•	src/app/clips/page.tsx
	•	Listado de episodios.
	•	src/app/clips/[id]/page.tsx
	•	Vista detallada de un episodio con lista de shards.
	•	src/components/audio/
	•	LiveLevelMeter.tsx: visualización básica de niveles de entrada.
	•	src/components/emotion/
	•	ShardDetailPanel.tsx: panel principal de detalle emocional/semántico.
	•	ShardListItem.tsx: item de lista para cada shard.
	•	TagEditor.tsx, EmotionStatusPill.tsx, etc.
	•	src/lib/api/evaAnalysisClient.ts
	•	Cliente para llamar a eva-analysis-service.
	•	Maneja timeouts con AbortController (por defecto 60s).
	•	src/lib/audio/
	•	AudioInputManager, AudioBufferRing, createWavBlob, etc.
	•	src/lib/store/EmoShardStore.ts
	•	Capa de persistencia (IndexedDB) para shards.
	•	src/lib/store/EpisodeStore.ts
	•	Capa de persistencia (IndexedDB) para episodios (EpisodeSummary) y reconstrucción de EpisodeDetail.
	•	src/types/emotion.ts
	•	Tipos compartidos para emociones, features, semantic, etc (incluye EpisodeSummary/EpisodeDetail).

⸻

Flujo de extremo a extremo
	1.	El usuario abre http://localhost:3000/.
	2.	Inicia una grabación desde el micrófono.
	3.	Se crea un episodio actual (episodeId) al iniciar.
	4.	El audio se segmenta en shards (trozos de ~10–15 segundos).
	5.	Por cada shard:
	•	Se calculan features locales (RMS, ZCR, etc.).
	•	Se construye un FormData y se llama a POST /analyze-shard en el backend.
	•	meta incluye shardId, episodeId, source, startTime, endTime.
	6.	El backend devuelve un ShardAnalysisResult con:
	•	transcript, emotion, signalFeatures, semantic, etc.
	7.	El frontend:
	•	Actualiza el shard en memoria y en IndexedDB.
	•	Refresca campos agregados del episodio (tags, momentTypes, emotion dominante, etc.).
	•	Muestra los resultados en el panel de detalle (ShardDetailPanel).
	8.	En /clips y /clips/[id] se puede revisar el histórico.

⸻

Desarrollo

Lint:

npm run lint

Build:

npm run build


⸻

Notas
	•	La app está pensada como un MVP de laboratorio para explorar EVA (Human Grounded Intelligence).
	•	Se puede extender con:
	•	Waveform real.
	•	Controles de reproducción.
	•	Filtros por emoción, momentType, topics.
	•	Exportar sesiones / episodios.
