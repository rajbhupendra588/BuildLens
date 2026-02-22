from typing import List, Union, Any
from docling_core.transforms.chunker.hybrid_chunker import HybridChunker
from docling_core.types.doc.document import DoclingDocument
import uuid

class ChunkingService:
    def __init__(self):
        # HybridChunker is preferred as it respects document hierarchy
        # max_tokens can be adjested based on your LLM context (e.g., 400-800)
        self.chunker = HybridChunker(
            tokenizer="sentence-transformers/all-MiniLM-L6-v2",
            max_tokens=512,
            merge_peers=True
        )

    
    def split_content(self, input_data: Any, file_name: str) -> List[dict]:
        """
        Handles rich DoclingDocument objects and raw strings (txt, md, json, csv).
        """
        # 1. Check if input is a rich document or a plain string
        if isinstance(input_data, (DoclingDocument, dict)):
            # Use the advanced hierarchical chunking for PDF/DOCX/Images
            chunks = self.chunker.chunk(input_data)
        else:
            # 2. FALLBACK: For plain strings (CSV, TXT, MD, PUML, JSON)
            # We wrap the string in a simple way or use the chunker's text mode
            # If HybridChunker fails on raw strings, we use the internal tokenizer split
            try:
                chunks = self.chunker.chunk(str(input_data))
            except Exception:
                # Manual fallback if Docling's Pydantic validation still complains
                return self._simple_split(str(input_data), file_name)

        processed_chunks = []
        for i, chunk in enumerate(chunks):
            chunk_text = self.chunker.serialize(chunk)
            token_count = self.chunker.tokenizer.count_tokens(chunk_text)

            processed_chunks.append({ 
                "id": str(uuid.uuid4()),
                "content": chunk_text,
                "metadata": {
                    "file_name": file_name,
                    "chunk_index": i,
                    "char_count": len(chunk_text),
                    "token_count": token_count
                }
            })
        return processed_chunks

        
    def _simple_split(self, text: str, file_name: str, chunk_size: int = 1000) -> List[dict]:
        """A basic character-based fallback for problematic strings."""
        # Simple split by character length as a last resort
        return [{
            "id": str(uuid.uuid4()),
            "content": text[i:i+chunk_size],
            "metadata": {
                "file_name": file_name,
                "chunk_index": idx,
                "char_count": len(text[i:i+chunk_size]),
                "token_count": 0
                }
            } for idx, i in enumerate(range(0, len(text), chunk_size))]
    
chunking_service = ChunkingService()

   