
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



# Playbook EVA 1 → EVA 2 (lado frontend)

## 1. Prerrequisitos

1. **Repo listo**
   - Tener el repo clonado y dependencias instaladas en `eva/` (una vez):
     ```bash
     cd "<RAIZ-DEL-REPO>/eva"
     npm install
     ```

2. **EVA 1 (Next.js) accesible**
   - Ideal: tener EVA 1 corriendo en el mismo origin donde grabaste datos (normalmente `http://localhost:3000`):
     ```bash
     cd "<RAIZ-DEL-REPO>/eva"
     npm run dev
     ```
   - Nota: el export puede funcionar incluso si no tienes `next dev` corriendo (puede levantar un server dummy para `localhost/127.0.0.1`), pero **siempre** necesitas apuntar al **mismo origin** donde viven tus shards.

3. **Chrome profile correcto**
   - Abre EVA 1 en Chrome y entra a:
     - `chrome://version`
   - Copia el **Profile Path** (te dirá si es `Default` o `Profile N`).
   - Ese valor es el que usarás en `EVA_EXPORT_CHROME_PROFILE`.

4. **EVA 2 (opcional para publicar desde EVA 1)**
   - Para usar el botón **Publicar**, EVA 1 debe estar en **modo API** y con backend de EVA 2 accesible (depende de tu configuración de `getEvaDataMode()` / `getEvaAnalysisMode()`).
   - Si no está conectado, el UI bloqueará Publish y mostrará mensaje.

---

## 2. Grabar y revisar Emo-Shards

1. **Grabar**
   - En EVA 1, graba un episodio/clip (la app genera shards y los guarda localmente en IndexedDB: `eva-db`).

2. **Abrir el clip**
   - Ve a la lista de clips/episodios y abre uno.
   - La pantalla `clips/[id]` carga:
     - episodio desde `EpisodeStore` (IndexedDB)
     - shards desde `EmoShardStore` (IndexedDB)

3. **Revisar el shard**
   - En el panel del shard:
     - Ajusta campos y notas.
     - Revisa tags.
     - Opcional: ejecuta análisis (“Analizar este momento”) si aplica.

4. **Marcar listo para publicar (precondición)**
   - En `clips/[id]` (editor interno “Revisión”):
     - Cambia `status` a `readyToPublish`
     - Agrega al menos **1** `userTag`
     - Escribe `userNotes` (no vacío)
   - Pulsa **Guardar cambios del shard** (persistencia local en IndexedDB).

---

## 3. Exportar shards para EVA 2

### 3.1 Export normal (copy/paste)

```bash
cd "<RAIZ-DEL-REPO>/eva"
EVA_EXPORT_USER_DATA_DIR="$HOME/Library/Application Support/Google/Chrome" \
EVA_EXPORT_CHROME_PROFILE="Profile 1" \
EVA_EXPORT_PORT=3000 \
npm run export:shards-for-eva2
```

### 3.2 Qué hace cada env (1 línea)

- `EVA_EXPORT_USER_DATA_DIR`: carpeta raíz de perfiles de Chrome (macOS: `~/Library/Application Support/Google/Chrome`).
- `EVA_EXPORT_CHROME_PROFILE`: perfil específico dentro de esa carpeta (`Default` o `Profile N`).
- `EVA_EXPORT_PORT`: puerto default para construir el origin si no defines `EVA_EXPORT_ORIGINS` (típicamente 3000).

> El script realmente lee IndexedDB **por origin**. Si alguna vez usaste otro host/puerto (ej. `127.0.0.1`), lo correcto es usar `EVA_EXPORT_ORIGINS` (ver tips en sección 5).

### 3.3 Archivo final y snapshot

- El export escribe en:
  - `eva/tmp/eva1-shards-export.json`

- Para guardar un snapshot estable (ej. el de 112 shards), desde la carpeta `eva/`:
  ```bash
  cp tmp/eva1-shards-export.json tmp/eva1-shards-export-112.json
  ```

---

## 4. Estados posibles al pulsar “Publicar”

Cuando pulsas **Publicar Emo-Shard** en `clips/[id]`:

1. **Caso 404 (no sincronizado aún con EVA 2)**
   - Qué pasa:
     - [EpisodeClient.publishShard()](cci:1://file:///Users/hildebertoalemanguerrero/HGI%20-%20Christmas/CascadeProjects/windsurf-project/eva/src/lib/api/EpisodeClient.ts:20:2-20:57) devuelve `null` cuando el backend responde 404.
     - El UI muestra un mensaje amable tipo: “todavía no está sincronizado… intenta después”.
   - Qué hacer:
     - Esperar a que EVA 2 procese/sincronice ese shard y reintentar.

2. **Caso `not_ready_to_publish` (400)**
   - Qué pasa:
     - EVA 2 rechaza por reglas de negocio (ej. falta estado correcto).
     - El UI muestra error específico.
   - Qué hacer:
     - Asegúrate de:
       - `status = readyToPublish`
       - `userTags` ≥ 1
       - `userNotes` no vacío
     - Guardar y reintentar.

3. **Caso éxito**
   - Qué pasa:
     - El endpoint devuelve el shard actualizado.
     - EVA 1 actualiza el shard localmente (`EmoShardStore.update`).
   - Qué deberías ver:
     - `publishState` actualizado (ej. `published`) reflejado en la UI del clip.

---

## 5. Errores comunes y tips

1. **Origin equivocado (host/puerto distinto)**
   - Síntoma:
     - Export “funciona” pero sale `shards=0` o faltan muchos.
   - Fix:
     - Usa el origin exacto donde grabaste. Ejemplo:
       ```bash
       EVA_EXPORT_ORIGINS="http://localhost:3000,http://127.0.0.1:3000" \
       ```
     - (Puedes incluir varios origins para barrer).

2. **Perfil de Chrome equivocado**
   - Síntoma:
     - En UI ves datos pero export no los encuentra.
   - Fix:
     - En ese Chrome profile: `chrome://version` → **Profile Path**
     - Usa ese `Default` / `Profile N` en `EVA_EXPORT_CHROME_PROFILE`.

3. **El export se sobreescribe**
   - Síntoma:
     - Pierdes un export “bueno” al re-ejecutar.
   - Fix:
     - Copia a snapshot inmediatamente:
       ```bash
       cp tmp/eva1-shards-export.json tmp/eva1-shards-export-<N>.json
       ```

4. **Publish deshabilitado**
   - Causas típicas:
     - EVA 1 no está en modo `api`
     - Shard no está `readyToPublish`
     - Shard está marcado como `deleted`
   - Fix:
     - Conecta EVA 2 / configura modo API y cumple precondiciones del UI.

5. **Puertos no corriendo**
   - Nota:
     - El script puede levantar un server dummy para origins `localhost/127.0.0.1` si el puerto no responde.
   - Tip:
     - Aun así, si otro proceso ocupa el puerto, ese dummy server no podrá bindear; en ese caso evita ese puerto u apaga el proceso que lo ocupa.

---