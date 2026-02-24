# DocRAG - CLAUDE.md

## Project Overview

DocRAG is an open-source Retrieval-Augmented Generation (RAG) engine for multimodal document processing. Users can chat with PDFs, Excel sheets, PlantUML diagrams, and images using local (Ollama) or cloud LLMs (OpenAI, Gemini, Anthropic), with a self-hosted architecture for data privacy.

## Architecture

```
DocRAG/
├── backend/          # FastAPI (Python)
├── frontend/         # Next.js (TypeScript)
├── postgres_data/    # PostgreSQL persistence (gitignored)
├── qdrant_data/      # Vector DB persistence (gitignored)
├── docker-compose.yml
├── .env / .env.example
└── reports/
```

## Tech Stack

### Backend
- **Runtime:** Python 3.14, FastAPI, Uvicorn
- **Package Manager:** `uv` (not pip/poetry)
- **ORM:** SQLModel (SQL + Pydantic)
- **Vector DB:** Qdrant v1.17.0 (HTTP port 6333, gRPC port 6334)
- **DB:** PostgreSQL 16 (port 5432)
- **Document Processing:** Docling (PDFs, DOCX, images), pandas (CSV/Excel)
- **Embeddings:** FastEmbed (`sentence-transformers/all-MiniLM-L6-v2`)
- **LLM Clients:** HTTPX async (Ollama), OpenAI SDK, Google Generative AI SDK

### Frontend
- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript 5
- **State:** Zustand 5
- **UI:** shadcn/ui (Radix UI + Tailwind CSS 4)
- **Markdown:** react-markdown + react-syntax-highlighter
- **Streaming:** Server-Sent Events (SSE)

## Development Commands

### Docker (Recommended - Full Stack)
```bash
docker-compose up --build    # Start all services
docker-compose down          # Stop all services
```

### Backend (Local)
```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

### Frontend (Local)
```bash
cd frontend
npm run dev      # Dev server on port 3000
npm run build    # Production build
npm run lint     # ESLint
```

## API Endpoints (`/api/v1/`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/health` | GET | Health check (DB + Qdrant status) |
| `/ingest/upload` | POST | Upload & index document |
| `/chat/sessions` | POST/GET | Create / list chat sessions |
| `/chat/sessions/{id}` | PATCH/DELETE | Rename / delete session |
| `/chat/history/{id}` | GET | Session message history |
| `/chat/ask` | POST | Single Q&A |
| `/chat/ask-stream` | GET | Streaming SSE response |
| `/documents/` | GET | List indexed documents |
| `/documents/{id}` | DELETE | Remove document from vector DB |
| `/query/search` | GET | Semantic search chunks |
| `/models/` | GET | List available LLM models |

## Key Files

### Backend
- `backend/app/main.py` — FastAPI app, CORS, router mounting
- `backend/app/core/config.py` — Pydantic settings (nested models with `__` delimiter)
- `backend/app/core/database.py` — SQLModel engine & session dependency
- `backend/app/core/exceptions.py` — Global exception handler
- `backend/app/models/chat.py` — `ChatSession`, `ChatMessage` SQLModel models
- `backend/app/services/llm_service.py` — Multi-provider LLM orchestration + streaming
- `backend/app/services/retrieval_service.py` — Qdrant vector search + context formatting
- `backend/app/services/vector_service.py` — Embedding generation + Qdrant UPSERT
- `backend/app/services/chunking_service.py` — HybridChunker (512 tokens max)
- `backend/app/services/file_service.py` — Docling conversion, 20MB limit, UUID temp files
- `backend/app/services/chat_history_service.py` — Session/message CRUD
- `backend/app/api/v1/` — Route handlers (chat.py, ingest.py, documents.py, etc.)
- `backend/pyproject.toml` — Dependencies (use `uv add` to install)

### Frontend
- `frontend/src/app/layout.tsx` — Root layout with sidebar provider
- `frontend/src/app/page.tsx` — Main chat page
- `frontend/src/lib/api.ts` — Typed API client (apiRequest, apiStream, apiUpload)
- `frontend/src/types/chat.ts` — TypeScript interfaces (Message, ChatSession)
- `frontend/src/hooks/use-chat-store.ts` — Zustand store (sessions, currentSessionId)
- `frontend/src/hooks/use-chat-stream.ts` — SSE streaming handler
- `frontend/src/components/app-sidebar.tsx` — Navigation + session management
- `frontend/src/components/chat/chat-interface.tsx` — Message display + input
- `frontend/src/components/chat/chat-message-item.tsx` — Per-message rendering (markdown)
- `frontend/src/components/chat/knowledge-base.tsx` — Document upload/list/delete UI

## Environment Variables

Configure via `.env` (copy from `.env.example`):

```bash
# App
APP_NAME=DocRAG
ENVIRONMENT=development

# PostgreSQL (nested with __ delimiter)
DB__USER=postgres
DB__PASSWORD=password
DB__NAME=docrag_db
DB__HOST=postgres        # 'postgres' inside Docker, 'localhost' outside
DB__PORT=5432

# Qdrant
QDRANT__HOST=qdrant      # 'qdrant' inside Docker, 'localhost' outside
QDRANT__PORT=6333
QDRANT__COLLECTION_NAME=knowledge_base

# LLM Providers
LLM__PROVIDER=ollama     # ollama | openai | gemini | anthropic
LLM__OLLAMA_BASE_URL=http://host.docker.internal:11434
LLM__OPENAI_API_KEY=
LLM__ANTHROPIC_API_KEY=
LLM__GEMINI_API_KEY=
```

## Conventions & Patterns

### Backend
- **Settings:** Pydantic nested models — `QDRANT__HOST` → `settings.QDRANT.HOST`
- **Services:** Module-level singletons (`llm_service = LLMService()`)
- **Async-first:** Use `async/await` for all I/O; HTTPX async client for LLM calls
- **Chunking:** HybridChunker → max 512 tokens → fallback character split (1000 chars)
- **Streaming:** SSE JSON chunks — `data: {"type": "content", "text": "..."}`
- **Naming:** snake_case files/functions, CamelCase classes, UUID-based temp files

### Frontend
- **"use client"** directive on all interactive components
- **API:** Centralized in `lib/api.ts` — never call `fetch` directly in components
- **State:** Zustand for global session state, local `useState` for component state
- **UI:** Always use shadcn/ui + Radix primitives before writing custom HTML

### Commit Style
```
feat (module): description
fix (module): description
docs: description
```

## Supported Document Types

| Format | Processing |
|--------|-----------|
| PDF | Docling DocumentConverter |
| DOCX | Docling DocumentConverter |
| Images (PNG/JPG) | Docling DocumentConverter |
| CSV / XLSX | pandas read + text conversion |
| JSON / TXT / MD | Direct read |
| PUML | Direct read (text mode) |

Max file size: **20MB**

## Docker Services

| Service | Image | Port |
|---------|-------|------|
| postgres | postgres:16-alpine | 5432 |
| qdrant | qdrant/qdrant:v1.17.0 | 6333 (HTTP), 6334 (gRPC) |
| backend | ./backend | 8000 |
| frontend | ./frontend | 3000 |

## LLM Provider Support

- **Ollama** (local) — default, requires Ollama running on host
- **OpenAI** — GPT models via OpenAI SDK
- **Gemini** — Google models via `google-generativeai`
- **Anthropic** — Claude models (in progress)

Provider is configured per chat session; models listed via `/api/v1/models/`.
