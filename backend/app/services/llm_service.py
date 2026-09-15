import json
import httpx
from typing import List, Dict, Any, AsyncGenerator, Optional

from app.core.config import settings
from app.services.retrieval_service import retrieval_service
from app.services.intent_service import IntentResult
from app.services.prompt_service import prompt_composer


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
        api_key: Optional[str] = None,
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
                title = await self._title_openai(prompt, model, api_key)
            elif provider == "gemini":
                title = await self._title_gemini(prompt, model, api_key)
            elif provider == "openrouter":
                title = await self._title_openrouter(prompt, model, api_key)
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

    async def _title_openai(self, prompt: str, model: str, api_key: Optional[str] = None) -> str:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=api_key or settings.LLM.OPENAI_API_KEY)
        resp = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=20,
            temperature=0,
        )
        return resp.choices[0].message.content or ""

    async def _title_gemini(self, prompt: str, model: str, api_key: Optional[str] = None) -> str:
        import google.generativeai as genai
        genai.configure(api_key=api_key or settings.LLM.GEMINI_API_KEY)
        instance = genai.GenerativeModel(model_name=model)
        response = await instance.generate_content_async(prompt)
        return response.text or ""

    async def _title_openrouter(self, prompt: str, model: str, api_key: Optional[str] = None) -> str:
        client = self._openrouter_client(api_key)
        resp = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=20,
            temperature=0,
        )
        return resp.choices[0].message.content or ""

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
        intent: Optional[IntentResult] = None,
        api_key: Optional[str] = None,
        inline_images: bool = False,
    ) -> AsyncGenerator[str, None]:
        """Route streaming generation to the correct provider."""
        system_prompt = self._prepare_system_prompt(
            context_chunks,
            history,
            intent,
            inline_images=inline_images,
            user_query=query,
        )

        if provider == "ollama":
            async for chunk in self._stream_ollama(model, query, system_prompt):
                yield chunk
        elif provider == "openai":
            async for chunk in self._stream_openai(model, query, system_prompt, api_key):
                yield chunk
        elif provider == "gemini":
            async for chunk in self._stream_gemini(model, query, system_prompt, api_key):
                yield chunk
        elif provider == "openrouter":
            async for chunk in self._stream_openrouter(model, query, system_prompt, api_key):
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
        self, model: str, query: str, system: str, api_key: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        try:
            from openai import AsyncOpenAI

            client = AsyncOpenAI(api_key=api_key or settings.LLM.OPENAI_API_KEY)
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
        self, model: str, query: str, system: str, api_key: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        try:
            import google.generativeai as genai

            genai.configure(api_key=api_key or settings.LLM.GEMINI_API_KEY)
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

    # Completion cap includes reasoning tokens. 2048 was often spent entirely on
    # thinking (Ling 3.0, Nemotron), so the stream finished with empty content.
    _OPENROUTER_MAX_TOKENS = 8192
    _OPENROUTER_REASONING_MAX_TOKENS = 2048

    @staticmethod
    def _coerce_text(value: Any) -> str:
        """Flatten OpenRouter/OpenAI content parts into a single string."""
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        if isinstance(value, dict):
            return LLMService._coerce_text(
                value.get("text")
                or value.get("content")
                or value.get("reasoning")
                or value.get("summary")
            )
        if isinstance(value, list):
            return "".join(LLMService._coerce_text(item) for item in value)
        return ""

    @staticmethod
    def _delta_payload(delta: Any) -> Dict[str, Any]:
        """Read content/reasoning from typed deltas and SDK extra fields."""
        if delta is None:
            return {}
        if isinstance(delta, dict):
            return delta
        dump = getattr(delta, "model_dump", None)
        if callable(dump):
            try:
                payload = dump(exclude_none=True)
            except TypeError:
                payload = dump()
            if isinstance(payload, dict):
                extra = payload.get("model_extra")
                if isinstance(extra, dict):
                    merged = {**payload, **extra}
                    merged.pop("model_extra", None)
                    return merged
                return payload
        payload: Dict[str, Any] = {}
        extra = getattr(delta, "model_extra", None)
        if isinstance(extra, dict):
            payload.update(extra)
        for key in ("content", "reasoning", "reasoning_content", "reasoning_details"):
            val = getattr(delta, key, None)
            if val not in (None, "", []):
                payload[key] = val
        return payload

    @staticmethod
    def _openrouter_stream_text(delta: Any) -> tuple[str, bool]:
        """Return (text, is_reasoning). Reasoning may live in extra SDK fields."""
        payload = LLMService._delta_payload(delta)
        content = LLMService._coerce_text(payload.get("content"))
        if content:
            return content, False
        reasoning = LLMService._coerce_text(
            payload.get("reasoning")
            or payload.get("reasoning_content")
            or payload.get("reasoning_details")
        )
        if reasoning:
            return reasoning, True
        return "", False

    @staticmethod
    def _visible_answer_from_reasoning(reasoning: str) -> str:
        """If CoT wraps the answer in think tags, return the part after them."""
        text = reasoning.strip()
        if not text:
            return ""
        lowered = text.lower()
        for marker in ("</think>", "</thinking>", "</reasoning>"):
            idx = lowered.rfind(marker)
            if idx == -1:
                continue
            rest = text[idx + len(marker) :].strip()
            if rest:
                return rest
        return text

    async def _stream_openrouter(
        self, model: str, query: str, system: str, api_key: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        if not api_key:
            yield f"data: {json.dumps({'type': 'error', 'content': 'OpenRouter API key is not configured. Add it in Settings.'})}\n\n"
            return
        try:
            client = self._openrouter_client(api_key)
            stream = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": query},
                ],
                stream=True,
                max_tokens=self._OPENROUTER_MAX_TOKENS,
                extra_body={
                    "reasoning": {
                        "max_tokens": self._OPENROUTER_REASONING_MAX_TOKENS,
                    }
                },
            )
            saw_answer = False
            saw_reasoning = False
            reasoning_parts: List[str] = []
            finish_reason: Optional[str] = None
            async for chunk in stream:
                if not chunk.choices:
                    continue
                choice = chunk.choices[0]
                reason = getattr(choice, "finish_reason", None)
                if reason:
                    finish_reason = reason
                text, is_reasoning = self._openrouter_stream_text(choice.delta)
                if not text:
                    continue
                if is_reasoning:
                    reasoning_parts.append(text)
                    if not saw_reasoning:
                        saw_reasoning = True
                        yield (
                            f"data: {json.dumps({'type': 'status', 'text': 'Model is reasoning — the reply will appear next…'})}\n\n"
                        )
                    continue
                saw_answer = True
                yield f"data: {json.dumps({'type': 'content', 'text': text})}\n\n"

            if not saw_answer:
                fallback = self._visible_answer_from_reasoning("".join(reasoning_parts))
                if fallback:
                    yield f"data: {json.dumps({'type': 'content', 'text': fallback})}\n\n"
                else:
                    if finish_reason == "length":
                        hint = (
                            "The model used its token budget on internal reasoning "
                            "before writing an answer. Send the message again, or "
                            "switch to a faster model such as OpenRouter → Ling 3.0 Flash."
                        )
                    else:
                        hint = (
                            "The model did not return a visible answer "
                            "(often due to long internal reasoning or provider overload). "
                            "Send the message again, or try OpenRouter → Ling 3.0 Flash."
                        )
                    yield f"data: {json.dumps({'type': 'error', 'content': hint})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'content': str(exc)})}\n\n"

    def _openrouter_client(self, api_key: Optional[str]):
        from openai import AsyncOpenAI

        return AsyncOpenAI(
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            default_headers={
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "BuildLens",
            },
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _prepare_system_prompt(
        self,
        context_chunks: List[Dict[str, Any]],
        history: List[Any],
        intent: Optional[IntentResult] = None,
        inline_images: bool = False,
        user_query: Optional[str] = None,
    ) -> str:
        context_text = retrieval_service.format_context_for_llm(context_chunks)

        if intent is not None:
            return prompt_composer.compose(
                intent,
                context_chunks,
                history,
                context_text,
                inline_images=inline_images,
                user_query=user_query,
            )

        # Legacy fallback (title generation, non-intent paths)
        history_text = (
            "\n".join([f"{m.role}: {m.content}" for m in history]) if history else ""
        )
        return (
            "You are a helpful assistant. Use the provided context and conversation history to answer.\n"
            "When several uploaded files are listed, answer only from the file the user is asking about "
            "(match their words to the Source filename). Never say a topic is absent if a filename matches.\n"
            f"Conversation History:\n{history_text}\n\n"
            f"Context from Documents:\n{context_text}\n\n"
            "If the answer is not in the context, say you don't know."
        )


    async def generate_text(
        self,
        prompt: str,
        system: str,
        provider: str,
        model: str,
        api_key: Optional[str] = None,
        max_tokens: int = 4096,
    ) -> str:
        """Non-streaming completion used by structured report extraction."""
        provider = (provider or "ollama").lower()
        if provider == "ollama":
            return await self._complete_ollama(model, prompt, system)
        if provider == "openai":
            return await self._complete_openai(model, prompt, system, api_key, max_tokens)
        if provider == "gemini":
            return await self._complete_gemini(model, prompt, system, api_key)
        if provider == "openrouter":
            return await self._complete_openrouter(model, prompt, system, api_key, max_tokens)
        raise RuntimeError(f"Unsupported provider: {provider}")

    async def _complete_ollama(self, model: str, prompt: str, system: str) -> str:
        collected = ""
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                f"{self.ollama_base_url}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "system": system,
                    "stream": True,
                    "options": {"temperature": 0},
                },
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

    async def _complete_openai(
        self,
        model: str,
        prompt: str,
        system: str,
        api_key: Optional[str],
        max_tokens: int,
    ) -> str:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=api_key or settings.LLM.OPENAI_API_KEY)
        resp = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            max_tokens=max_tokens,
            temperature=0,
        )
        return resp.choices[0].message.content or ""

    async def _complete_gemini(
        self, model: str, prompt: str, system: str, api_key: Optional[str]
    ) -> str:
        import google.generativeai as genai

        genai.configure(api_key=api_key or settings.LLM.GEMINI_API_KEY)
        instance = genai.GenerativeModel(
            model_name=model,
            system_instruction=system,
        )
        response = await instance.generate_content_async(prompt)
        return response.text or ""

    async def _complete_openrouter(
        self,
        model: str,
        prompt: str,
        system: str,
        api_key: Optional[str],
        max_tokens: int,
    ) -> str:
        if not api_key:
            raise RuntimeError("OpenRouter API key is not configured. Add it in Settings.")
        client = self._openrouter_client(api_key)
        resp = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            max_tokens=max_tokens,
            temperature=0,
            extra_body={"reasoning": {"max_tokens": 1024}},
        )
        message = resp.choices[0].message
        text = self._coerce_text(getattr(message, "content", None))
        if text:
            return text
        return self._visible_answer_from_reasoning(
            self._coerce_text(getattr(message, "reasoning", None))
            or self._coerce_text(getattr(message, "reasoning_content", None))
        )


llm_service = LLMService()
