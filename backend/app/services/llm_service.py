import json
import httpx
from typing import List, Dict, Any, AsyncGenerator

from app.core.config import settings
from app.services.retrieval_service import retrieval_service


class LLMService:
    def __init__(self):
        self.ollama_base_url = settings.LLM.OLLAMA_BASE_URL

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def generate_title(
        self,
        first_question: str,
        provider: str = "ollama",
        model: str = "",
    ) -> str:
        """Generate a short session title using the same provider the user is chatting with."""
        prompt = (
            "Generate a very short, concise title (max 5 words) for a chat session "
            f"based on this first message: '{first_question}'. "
            "Return only the title text without quotes or punctuation."
        )
        try:
            if provider == "ollama":
                title = await self._title_ollama(prompt, model)
            elif provider == "openai":
                title = await self._title_openai(prompt, model)
            elif provider == "gemini":
                title = await self._title_gemini(prompt, model)
            else:
                # Unknown provider — fall back to truncation
                return self._truncate_title(first_question)
            return title.strip().strip('"') or self._truncate_title(first_question)
        except Exception as exc:
            import traceback
            print(f"Title generation failed ({provider}/{model}): {type(exc).__name__}: {exc}")
            print(traceback.format_exc())
            return self._truncate_title(first_question)

    def _truncate_title(self, text: str, max_len: int = 40) -> str:
        text = text.strip()
        return text[:max_len].rstrip() + "…" if len(text) > max_len else text

    async def _title_ollama(self, prompt: str, model: str) -> str:
        """Use streaming to generate title — cloud-routed Ollama models only support stream:True."""
        collected = ""
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                f"{self.ollama_base_url}/api/generate",
                json={"model": model, "prompt": prompt, "stream": True,
                      "options": {"num_ctx": 512, "temperature": 0}},
            ) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    raise RuntimeError(f"Ollama error {resp.status_code}: {body.decode()}")
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    data = json.loads(line)
                    collected += data.get("response", "")
                    if data.get("done"):
                        break
        return collected

    async def _title_openai(self, prompt: str, model: str) -> str:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.LLM.OPENAI_API_KEY)
        resp = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=20,
            temperature=0,
        )
        return resp.choices[0].message.content or ""

    async def _title_gemini(self, prompt: str, model: str) -> str:
        import google.generativeai as genai
        genai.configure(api_key=settings.LLM.GEMINI_API_KEY)
        instance = genai.GenerativeModel(model_name=model)
        response = await instance.generate_content_async(prompt)
        return response.text or ""

    async def generate_answer(
        self,
        query: str,
        context_chunks: List[Dict[str, Any]],
        model: str = "minimax-m2:cloud",
    ) -> str:
        """Non-streaming answer via Ollama (used for title generation)."""
        context_text = retrieval_service.format_context_for_llm(context_chunks)

        system_prompt = (
            "You are a helpful assistant. Use the provided context to answer the user's question. "
            "If the answer is not in the context, say that you don't know. "
            "Do not make up information.\n\n"
            f"Context:\n{context_text}"
        )

        timeout = httpx.Timeout(300.0, read=300.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{self.ollama_base_url}/api/generate",
                json={
                    "model": model,
                    "prompt": f"Question: {query}",
                    "system": system_prompt,
                    "stream": False,
                    "options": {"num_ctx": 4096, "temperature": 0},
                },
            )

        if response.status_code != 200:
            raise RuntimeError(f"Ollama error: {response.text}")

        return response.json().get("response", "")

    async def generate_answer_stream(
        self,
        query: str,
        context_chunks: List[Dict[str, Any]],
        history: List[Any],
        provider: str,
        model: str,
    ) -> AsyncGenerator[str, None]:
        """Route streaming generation to the correct provider."""
        system_prompt = self._prepare_system_prompt(context_chunks, history)

        if provider == "ollama":
            async for chunk in self._stream_ollama(model, query, system_prompt):
                yield chunk
        elif provider == "openai":
            async for chunk in self._stream_openai(model, query, system_prompt):
                yield chunk
        elif provider == "gemini":
            async for chunk in self._stream_gemini(model, query, system_prompt):
                yield chunk
        else:
            yield f"data: {json.dumps({'type': 'error', 'content': f'Unsupported provider: {provider}'})}\n\n"

    async def fetch_ollama_models(self) -> List[Dict[str, Any]]:
        """Return list of locally available Ollama models."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{self.ollama_base_url}/api/tags")
                return resp.json().get("models", [])
        except Exception:
            return []

    # ------------------------------------------------------------------
    # Private: Provider streaming implementations
    # ------------------------------------------------------------------

    async def _stream_ollama(
        self, model: str, query: str, system: str
    ) -> AsyncGenerator[str, None]:
        payload = {
            "model": model,
            "prompt": f"Question: {query}",
            "system": system,
            "stream": True,
        }
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream(
                    "POST", f"{self.ollama_base_url}/api/generate", json=payload
                ) as resp:
                    if resp.status_code != 200:
                        yield f"data: {json.dumps({'type': 'error', 'content': f'Ollama error: {resp.status_code}'})}\n\n"
                        return
                    async for line in resp.aiter_lines():
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                            text = data.get("response", "")
                            if text:
                                yield f"data: {json.dumps({'type': 'content', 'text': text})}\n\n"
                            if data.get("done"):
                                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                                break
                        except json.JSONDecodeError:
                            continue
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'content': str(exc)})}\n\n"

    async def _stream_openai(
        self, model: str, query: str, system: str
    ) -> AsyncGenerator[str, None]:
        try:
            from openai import AsyncOpenAI

            client = AsyncOpenAI(api_key=settings.LLM.OPENAI_API_KEY)
            messages = [
                {"role": "system", "content": system},
                {"role": "user", "content": query},
            ]
            stream = await client.chat.completions.create(
                model=model,
                messages=messages,
                stream=True,
            )
            async for chunk in stream:
                text = chunk.choices[0].delta.content or ""
                if text:
                    yield f"data: {json.dumps({'type': 'content', 'text': text})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'content': str(exc)})}\n\n"

    async def _stream_gemini(
        self, model: str, query: str, system: str
    ) -> AsyncGenerator[str, None]:
        try:
            import google.generativeai as genai

            genai.configure(api_key=settings.LLM.GEMINI_API_KEY)
            model_instance = genai.GenerativeModel(
                model_name=model,
                system_instruction=system,
            )
            response = await model_instance.generate_content_async(
                query,
                stream=True,
            )
            async for chunk in response:
                if chunk.text:
                    yield f"data: {json.dumps({'type': 'content', 'text': chunk.text})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'content': str(exc)})}\n\n"

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _prepare_system_prompt(
        self, context_chunks: List[Dict[str, Any]], history: List[Any]
    ) -> str:
        context_text = retrieval_service.format_context_for_llm(context_chunks)
        history_text = (
            "\n".join([f"{m.role}: {m.content}" for m in history]) if history else ""
        )
        return (
            "You are a helpful assistant. Use the provided context and conversation history to answer.\n"
            f"Conversation History:\n{history_text}\n\n"
            f"Context from Documents:\n{context_text}\n\n"
            "If the answer is not in the context, say you don't know."
        )


llm_service = LLMService()
