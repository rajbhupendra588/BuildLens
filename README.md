# 🛸 DocRAG: Multimodal Self-Hosted RAG System

**DocRAG** is a high-performance, open-source Retrieval-Augmented Generation (RAG) engine designed for developers who value data privacy and technical flexibility. It allows you to chat with "anything"—from complex PDFs and Excel sheets to PlantUML diagrams and images—using local or cloud-based LLMs.

---

## 🏗 System Architecture

Our architecture follows a modular monorepo pattern:

- **Frontend:** Next.js 15+ (App Router) - Responsive UI for document management and chat.
- **Backend:** FastAPI (Python 3.14) - High-performance orchestration using `uv`.
- **Vector DB:** Qdrant v1.17.0 - High-fidelity vector storage with gRPC support.
- **Inference:** Hybrid support for Ollama (Local) and OpenAI/Anthropic/Gemini (Cloud).

---

## 🚀 Quick Start (Single Command)

DocRAG is fully containerized. To get started, ensure you have **Docker** and **Docker Compose** installed.

1. **Clone the repository:**

   ```bash
   git clone https://github.com/your-username/DocRAG.git
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
   - Frontend: http://localhost:3000
   - Backend: http://localhost:8000
   - Qdrant: http://localhost:6333
