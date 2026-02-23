import httpx
from typing import List, Dict, Any, AsyncGenerator
from app.core.config import settings
from app.services.retrieval_service import retrieval_service
import json

class LLMService:
    def __init__(self):
        self.base_url = settings.LLM.OLLAMA_BASE_URL
        self.model = "kimi-k2.5:cloud"

    async def generate_answer(self, query: str, context_chunks: List[Dict[str, Any]]) -> str:
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
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": f"Question: {query}",
                    "system": system_prompt,
                    "stream": False,
                    "options": {
                        "num_ctx": 4096, # context window
                        "temperature": 0
                    }
                }
            )

            if response.status_code != 200:
                raise f"Error from LLM: {response.text}"

            return response.json().get("response", "")


    async def generate_answer_stream(self, query: str, context_chucks: List[Dict[str, Any]]) -> AsyncGenerator[str, None]:
        context_text = retrieval_service.format_context_for_llm(context_chucks)

        system_prompt = (
            "You are a helpful assistant. Use the provided context to answer the user's question. "
            "If the answer is not in the context, say that you don't know. "
            "Do not make up information.\n\n"
            f"Context:\n{context_text}"
        )

        payload = {
            "model": self.model,
            "prompt": f"Question: {query}",
            "system": system_prompt,
            "stream": True
        }

        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", f"{self.base_url}/api/generate", json=payload) as response:
                if response.status_code != 200:
                    yield f"data: {json.dumps({'type': 'error', 'content': f'LLM Error: {response.status_code}'})}\n\n"
                    return
                
                async for line in response.aiter_lines():
                    if not line:
                        continue
                
                    try:
                        data = json.loads(line)
                        chunk = data.get("response", "")
                        if chunk:
                            yield f"data: {json.dumps({'type': 'content', 'text': chunk})}\n\n"

                        if data.get("done") is True:
                            yield f"data: {json.dumps({'type': 'done'})}\n\n"
                            break

                    except json.JSONDecodeError:
                        print(f"Error decoding JSON: {line}")
                        continue
                    except Exception as e:
                        yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

llm_service = LLMService()