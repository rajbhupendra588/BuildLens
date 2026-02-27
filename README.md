# 🛸 DocRAG: Multimodal Self-Hosted RAG System

**DocRAG** is a high-performance, open-source Retrieval-Augmented Generation (RAG) engine designed for developers who value data privacy and technical flexibility. It allows you to chat with "anything"—from complex PDFs and Excel sheets to PlantUML diagrams and images—using local or cloud-based LLMs.

## ✨ Key Features

- **Multimodal Document Processing**: Upload individual files or drag-and-drop entire folders. Chat with PDFs, DOCX, Images (PNG/JPG), CSV, XLSX, JSON, TXT, MD, PUML, and various source code files.
- **Self-Hosted Data Privacy**: All vector storage (Qdrant) and relational data (PostgreSQL) are hosted locally. You can use local LLMs via Ollama for a 100% offline and private experience.
- **Cloud LLM Support**: Seamlessly switch between local models and cloud providers like OpenAI, Gemini, and Anthropic. API keys are managed securely via the UI Settings page instead of `.env` files.
- **Advanced Processing**: Uses **Docling** for superior document layout parsing and **FastEmbed** (`sentence-transformers/all-MiniLM-L6-v2`) for high-quality embeddings.

## 🏗 System Architecture

Our architecture follows a modular monorepo pattern:

- **Frontend:** Next.js (App Router) - Responsive UI built with TypeScript, Tailwind CSS v4, shadcn/ui, and Zustand.
- **Backend:** FastAPI (Python) - High-performance async orchestration using the `uv` package manager and SQLModel.
- **Vector DB:** Qdrant v1.17.0 - High-fidelity vector storage with gRPC support for fast retrievals.
- **Database**: PostgreSQL 16 - Persistent storage for chat sessions and message history.

## 🚀 Quick Start (Production/Docker)

DocRAG is fully containerized. To get started, ensure you have **Docker** and **Docker Compose** installed.

1. **Clone the repository:**

   ```bash
   git clone https://github.com/tharitthaveekittikul/DocRAG
   cd DocRAG
   ```

2. **Setup Environment Variables:**

   ```bash
   cp .env.example .env
   ```

3. **Launch the stack:**

   ```bash
   docker-compose up --build
   ```

4. **Access the application:**
   - **Frontend UI:** http://localhost:3000
   - **Backend API Docs:** http://localhost:8000/docs
   - **Qdrant Dashboard:** http://localhost:6333/dashboard

## 💻 Local Development Setup

If you wish to develop without Docker or run services individually:

### Backend

1. Navigate to the backend directory: `cd backend`
2. Install dependencies using `uv` (recommended over pip): `uv sync` or `uv add <package>`
3. Run the development server:
   ```bash
   uv run uvicorn app.main:app --reload --port 8000
   ```
   _(Note: You will still need Qdrant and PostgreSQL running, which you can start selectively via Docker: `docker-compose up -d qdrant postgres`)_.

### Frontend

1. Navigate to the frontend directory: `cd frontend`
2. Install dependencies: `npm install`
3. Start the dev server:
   ```bash
   npm run dev
   ```

## 📄 Supported Document Types (Max 20MB)

| Format                               | Processing Engine         |
| ------------------------------------ | ------------------------- |
| **PDF, DOCX, Images**                | Docling DocumentConverter |
| **CSV, XLSX**                        | pandas                    |
| **JSON, TXT, MD, PUML, Source Code** | Native direct read        |

## 🧠 Supported LLM Providers

Configure the active provider and your API keys directly in the **Settings page** of the application interface—no need to edit `.env` files manually.

- **ollama** (Local, default) - Requires Ollama running on your machine/host. Default URL is pre-configured.
- **openai**
- **gemini**
- **anthropic**

## 🤝 Contributing

Contributions are welcome! Please follow the conventional commits specification (`feat:`, `fix:`, `docs:`). Make sure to run `npm run lint` on the frontend before submitting PRs.
