# BuildLens: Multimodal Self-Hosted RAG System

**BuildLens** is an open-source Retrieval-Augmented Generation (RAG) platform for multimodal documents. Index PDFs, spreadsheets, diagrams, images, and source files; query them through a chat interface backed by local or cloud language models, with vectors and chat data under your control.

## Key Features

- **Multimodal Document Processing**: Upload individual files or drag-and-drop entire folders from the **Library** or attach files in **Chat**. Supports PDF, DOCX, PPTX, images, CSV, XLSX, JSON, TXT, MD, PUML, and source code.
- **Fast + full indexing**: Text PDFs use a **pypdf fast path** (seconds); scanned PDFs and images fall back to **Docling**. Session uploads get a **quick preview** for immediate chat while full vector indexing runs in the background.
- **Self-Hosted Data Privacy**: Vector storage (Qdrant), chat history (PostgreSQL), and original uploads (`uploads_data/`) stay on your machine. Use **Ollama** for a fully local LLM path.
- **Cloud LLM Support**: OpenAI, Gemini, Anthropic, **OpenRouter**, and other providers. API keys are stored in PostgreSQL via the Settings UI.
- **Grounded answers**: Retrieval over Qdrant with cited sources, optional session attachments, and SSE streaming in the chat UI.

## System Architecture

Modular monorepo deployed with Docker Compose:

| Layer | Technology | Role |
| ----- | ---------- | ---- |
| **Frontend** | Next.js 16 (App Router), TypeScript, Zustand, shadcn/ui | Chat, Library, Settings; calls API via `lib/api.ts` (REST + SSE) |
| **Backend** | FastAPI, Python 3.14, `uv`, SQLModel | Ingest, chunk, embed, retrieve, LLM orchestration |
| **Vector DB** | Qdrant v1.17.0 | Chunk embeddings + metadata (cosine search) |
| **Database** | PostgreSQL 16 | Sessions, messages, app settings, session attachments |
| **Storage** | `uploads_data/` (bind mount) | Original files for preview/download |
| **Model cache** | Docker volume `backend_model_cache` | FastEmbed ONNX weights (persisted across API restarts) |

### Deployment diagram

```mermaid
flowchart TB
  subgraph Host["Developer machine / server"]
    Browser["Browser :3000"]

    subgraph Docker["Docker Compose — buildlens-net"]
      UI["buildlens-ui<br/>Next.js dev :3000"]
      API["buildlens-api<br/>FastAPI :8000"]
      PG["buildlens-postgres<br/>PostgreSQL :5432"]
      QD["buildlens-vector-db<br/>Qdrant :6333 / :6334"]
    end

    VolUploads[("uploads_data/")]
    VolPG[("postgres_data/")]
    VolQD[("qdrant_data/")]
    VolCache[("backend_model_cache")]
    VolVenv[("backend_venv")]
  end

  Ollama["Ollama / Cloud LLMs<br/>(host or internet)"]

  Browser --> UI
  UI -->|"REST + SSE<br/>NEXT_PUBLIC_API_URL"| API
  API --> PG
  API --> QD
  API --> VolUploads
  API --> VolCache
  PG --> VolPG
  QD --> VolQD
  API --> VolVenv
  API --> Ollama
```

### Backend service map

```mermaid
flowchart LR
  subgraph API["FastAPI /api/v1"]
    ingest["ingest"]
    chat["chat"]
    docs["documents"]
    query["query"]
    models["models"]
    settings["settings"]
    data["data"]
  end

  subgraph Services["Services"]
    FS["file_service<br/>(Docling lazy)"]
    QE["quick_extract / fast_ingest<br/>(pypdf fast path)"]
    CH["chunking_service<br/>(HybridChunker 512 tok)"]
    VS["vector_service<br/>(FastEmbed + Qdrant)"]
    RS["retrieval_service"]
    LLM["llm_service"]
    CHS["chat_history_service"]
  end

  ingest --> FS
  ingest --> QE
  ingest --> CH
  ingest --> VS
  chat --> CHS
  chat --> RS
  chat --> LLM
  query --> RS
  docs --> RS
  RS --> VS
  VS --> QD[("Qdrant")]
  CHS --> PG[("PostgreSQL")]
  settings --> PG
```

## Document Ingest Flow

Uploads are **async**: the API saves the file, returns a `job_id`, and processes in a background task (one ingest at a time via semaphore).

```mermaid
flowchart TD
  Start([User uploads file]) --> Upload["POST /api/v1/ingest/upload"]
  Upload --> Save["Stream to uploads_data/{document_id}"]
  Save --> Job["Create job: queued"]
  Job --> BG["Background: _run_ingest_job"]

  BG --> Session{session_id<br/>provided?}
  Session -->|Yes| Quick["Quick extract<br/>(pypdf / text / docx…)"]
  Quick --> Attach["Session attachment<br/>status: quick_ready"]
  Attach --> PollChat["UI polls job → chat early"]

  Session -->|No| ProcLib["status: processing"]
  PollChat --> Index
  ProcLib --> Index

  Index["Full index: _index_document_on_disk"]
  Index --> Fast{Fast text path<br/>pypdf / docx?}
  Fast -->|Yes| Text["Extract text"]
  Fast -->|No| Docling["Docling convert<br/>(PDF OCR, images, PPTX…)"]
  Text --> Chunk["chunking_service.split_content"]
  Docling --> Chunk
  Chunk --> Embed["vector_service.upsert_chunks<br/>(batches → Qdrant)"]
  Embed --> Done["job: success"]
  Done --> Library["Library refresh / documents API"]
```

**Paths on disk**

| Path | Purpose |
| ---- | ------- |
| `uploads_data/` | Original uploaded bytes |
| `qdrant_data/` | Vector index |
| `postgres_data/` | Sessions, messages, settings |
| `backend_model_cache` (volume) | `nomic-ai/nomic-embed-text-v1.5` ONNX cache |

## Chat and RAG Sequence

Streaming uses **GET `/api/v1/chat/ask-stream`** (Server-Sent Events). The browser loads history via REST; each question triggers retrieve-then-generate on the server.

```mermaid
sequenceDiagram
  actor User
  participant UI as Next.js UI
  participant API as FastAPI
  participant PG as PostgreSQL
  participant QD as Qdrant
  participant Emb as FastEmbed
  participant LLM as LLM provider

  User->>UI: Send message
  UI->>API: GET /chat/ask-stream?question&session_id&provider&model
  API->>PG: Save user message
  API->>PG: Load recent history (limit 10)
  API->>API: Session attachment chunks (if any)

  alt Inventory question
    API->>QD: Scroll / list indexed docs
    API->>API: Build inventory context
  else Document RAG question
    API->>Emb: query_embed(question)
    Emb-->>API: query vector
    API->>QD: similarity search (top_k, threshold)
    QD-->>API: ranked chunks + metadata
  end

  API->>API: Merge session + vector context, intent, sources
  API-->>UI: SSE: sources, media, intent
  loop Stream tokens
    API->>LLM: generate_answer_stream(context + history)
    LLM-->>API: token chunk
    API-->>UI: SSE: content
  end
  API->>PG: Save assistant message + sources + mode
  UI-->>User: Render markdown + citations
```

## Quick Start (Docker)

BuildLens is fully containerized. Ensure **Docker** and **Docker Compose** are installed.

1. **Clone the repository:**

   ```bash
   git clone https://github.com/tharitthaveekittikul/DocRAG
   cd DocRAG
   ```

2. **Setup environment variables:**

   ```bash
   cp .env.example .env
   ```

   Set `NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1` for browser access when using Docker.

3. **Launch the stack:**

   ```bash
   docker compose up --build
   ```

4. **Access the application:**
   - **Frontend UI:** http://localhost:3000
   - **Library:** http://localhost:3000/library
   - **Backend API docs:** http://localhost:8000/docs
   - **Qdrant dashboard:** http://localhost:6333/dashboard

The API container is limited to **4 GB RAM / 2 CPUs** by default; embedding models load on first search/ingest and are cached in the `backend_model_cache` volume.

## Local Development

### Backend

1. `cd backend`
2. `uv sync`
3. Start Qdrant + Postgres: `docker compose up -d qdrant postgres`
4. Run:

   ```bash
   uv run uvicorn app.main:app --reload --port 8000
   ```

   Use `DB__HOST=localhost`, `QDRANT__HOST=localhost` in `.env` when not inside Docker.

### Frontend

1. `cd frontend`
2. `npm install`
3. `npm run dev`

## Supported Document Types

Default max upload size is **1 GB** (see Settings → Storage / `STORAGE__MAX_UPLOAD_BYTES`).

| Format | Processing |
| ------ | ---------- |
| **PDF** (text) | pypdf fast path → chunk → embed |
| **PDF** (scanned) / **images** / **DOCX** / **PPTX** | Docling (loaded on demand) |
| **CSV, XLSX** | pandas → text |
| **JSON, TXT, MD, PUML, source code** | Direct read + language-aware chunking |

Embeddings: **FastEmbed** with `nomic-ai/nomic-embed-text-v1.5` (768-dim). Chunking: **HybridChunker**, max **512 tokens** per chunk.

## Supported LLM Providers

Configure providers and API keys in **Settings**. Defaults can still come from `.env` (`LLM__PROVIDER`, `LLM__OLLAMA_BASE_URL`, etc.).

- **Ollama** (local, default in `.env.example`)
- **OpenAI**, **Gemini**, **Anthropic**
- **OpenRouter** and additional cloud routes used by the chat model picker

## Contributing

Contributions are welcome. Use conventional commits (`feat:`, `fix:`, `docs:`). Run `npm run lint` in `frontend` before opening PRs.
