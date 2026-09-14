# BuildLens API Report

**Project:** BuildLens — Multimodal Self-Hosted RAG System  
**Version:** 0.1.0  
**Backend:** FastAPI (Python 3.14) | **Frontend:** Next.js 15+  
**Generated:** 2026-02-23

---

## System Architecture

```
┌──────────────────────────────────────────────────────┐
│                  BuildLens Stack                     │
│                                                      │
│  [Frontend: Next.js 15]  ←→  [Backend: FastAPI]      │
│       localhost:3000           localhost:8000         │
│                                   │                  │
│                          ┌────────┴────────┐         │
│                          │                 │         │
│                    [PostgreSQL 16]    [Qdrant v1.17] │
│                     localhost:5432   localhost:6333   │
│                   (Chat History)    (Vector Storage)  │
│                                                      │
│  [LLM Inference: Ollama / OpenAI / Anthropic / Gemini]│
└──────────────────────────────────────────────────────┘
```

---

## API Endpoints Reference

### 🩺 Health

| Method | Endpoint  | Description                           |
| ------ | --------- | ------------------------------------- |
| GET    | `/health` | Returns app health, Qdrant & LLM info |

**Response:**

```json
{
  "status": "healthy",
  "app_name": "BuildLens",
  "app_version": "0.1.0",
  "python_version": "3.14.x",
  "environment": "development",
  "qdrant": {
    "connected": true,
    "status": "connected",
    "url": "http://qdrant:6333"
  },
  "llm": { "provider": "ollama" }
}
```

---

### 📥 Ingestion — `/api/v1/ingest`

| Method | Endpoint         | Description                           |
| ------ | ---------------- | ------------------------------------- |
| POST   | `/ingest/upload` | Upload & index a document into Qdrant |

**Supported File Types:** `.pdf`, `.docx`, `.pptx`, `.png`, `.jpg`, `.jpeg`, `.puml`, `.txt`, `.md`, `.json`, `.csv`, `.xlsx`  
**Max File Size:** 20 MB

**Request:** `multipart/form-data` with field `file`

**Response:**

```json
{
  "document_id": "uuid-v4",
  "file_name": "example.pdf",
  "total_chunks": 42,
  "chunks_preview": [...],
  "status": "success",
  "message": "Successfully indexed 42 chunks into Vector DB"
}
```

---

### 🔍 Query (Retrieval) — `/api/v1/query`

| Method | Endpoint        | Parameters   | Description                            |
| ------ | --------------- | ------------ | -------------------------------------- |
| GET    | `/query/search` | `q` (string) | Semantic search over indexed documents |

**Response:**

```json
{
  "query": "what is RAG?",
  "count": 5,
  "results": [
    {
      "content": "...",
      "score": 0.87,
      "metadata": { "document_id": "...", "file_name": "..." }
    }
  ]
}
```

---

### 💬 Chat — `/api/v1/chat`

| Method | Endpoint                      | Parameters               | Description                                |
| ------ | ----------------------------- | ------------------------ | ------------------------------------------ |
| POST   | `/chat/ask`                   | `question` (query param) | One-shot Q&A (non-streaming)               |
| GET    | `/chat/ask-stream`            | `question`, `session_id` | Streaming Q&A with SSE (text/event-stream) |
| POST   | `/chat/sessions`              | —                        | Create a new chat session                  |
| GET    | `/chat/sessions`              | —                        | List all sessions (newest first)           |
| PATCH  | `/chat/sessions/{session_id}` | `title` (query param)    | Rename a session                           |
| DELETE | `/chat/sessions/{session_id}` | —                        | Delete a session and its messages          |
| GET    | `/chat/history/{session_id}`  | —                        | Get message history for a session          |

**Streaming Response Format (SSE):**

```
data: {"type": "content", "text": "Hello, "}
data: {"type": "content", "text": "world!"}
data: {"type": "done"}
```

---

### 📂 Documents — `/api/v1/documents`

| Method | Endpoint                   | Description                            |
| ------ | -------------------------- | -------------------------------------- |
| GET    | `/documents/`              | List all indexed documents from Qdrant |
| DELETE | `/documents/{document_id}` | Delete all chunks of a document        |

**List Response:**

```json
{
  "documents": [{ "document_id": "uuid-v4", "file_name": "report.pdf" }]
}
```

---

## Data Models

### ChatSession

| Field        | Type     | Notes                       |
| ------------ | -------- | --------------------------- |
| `id`         | UUID     | Primary key                 |
| `title`      | string   | Default: "New Conversation" |
| `created_at` | datetime | UTC                         |
| `updated_at` | datetime | UTC                         |

### ChatMessage

| Field        | Type     | Notes                         |
| ------------ | -------- | ----------------------------- |
| `id`         | UUID     | Primary key                   |
| `session_id` | UUID     | FK → ChatSession              |
| `role`       | string   | `user`, `assistant`, `system` |
| `content`    | string   | Message text                  |
| `created_at` | datetime | UTC                           |

### VectorChunk (Qdrant payload)

| Field                  | Type   | Notes                |
| ---------------------- | ------ | -------------------- |
| `content`              | string | Text of the chunk    |
| `metadata.document_id` | string | Parent document UUID |
| `metadata.file_name`   | string | Original file name   |
| `metadata.chunk_index` | int    | Position in document |
| `metadata.char_count`  | int    | Character count      |
| `metadata.token_count` | int    | Token count (MiniLM) |

---

## Configuration

| Setting                  | Default                                  |
| ------------------------ | ---------------------------------------- |
| `APP_NAME`               | `BuildLens`                              |
| `ENVIRONMENT`            | `development`                            |
| `EMBED_MODEL`            | `sentence-transformers/all-MiniLM-L6-v2` |
| `QDRANT.HOST`            | `qdrant`                                 |
| `QDRANT.PORT`            | `6333`                                   |
| `QDRANT.COLLECTION_NAME` | `knowledge_base`                         |
| `LLM.PROVIDER`           | `ollama`                                 |
| `LLM.OLLAMA_BASE_URL`    | `http://localhost:11434`                 |
| `DB.HOST`                | `localhost`                              |
| `DB.PORT`                | `5432`                                   |
| `DB.NAME`                | `buildlens_db`                           |
