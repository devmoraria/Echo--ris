"""
Pipeline de RAG do Echo Iris.

Roda 100% local — usa um modelo de embeddings pequeno (all-MiniLM-L6-v2, via
sentence-transformers) que baixa uma vez e depois roda offline. Isso serve só
pra validar a lógica agora; lá na frente dá pra trocar por embeddings da OCI
sem mudar a estrutura do resto do pipeline (ver embed_text() no final).
"""

import os
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
import numpy as np

PDF_PATH = os.path.join(os.path.dirname(__file__), "knowledge_base", "base.pdf")

# Carrega o modelo uma vez só, na importação do módulo (é meio pesado pra
# carregar toda hora dentro de uma função chamada em loop).
_model = SentenceTransformer("all-MiniLM-L6-v2")

# Índice em memória: lista de {"text": ..., "embedding": ...}
# Pro tamanho do challenge isso é suficiente — nada de banco vetorial complexo.
_index = []


def load_and_chunk_pdf(pdf_path=PDF_PATH, chunk_size=500, overlap=50):
    """Lê o PDF e devolve uma lista de chunks de texto.

    Tenta primeiro dividir por parágrafo (quebra dupla de linha). Se isso
    resultar em blocos grandes demais ou só 1 chunk (comum quando o pypdf
    extrai o PDF sem preservar linhas em branco), cai pra um fatiamento por
    tamanho fixo de caracteres, com uma pequena sobreposição entre os pedaços
    pra não cortar uma frase importante bem no meio da divisão.
    """
    reader = PdfReader(pdf_path)

    full_text = ""
    for page in reader.pages:
        full_text += page.extract_text() + "\n"

    # Tentativa 1: por parágrafo
    raw_chunks = [c.strip() for c in full_text.split("\n\n") if len(c.strip()) > 30]

    # Se ainda ficou muito grande (ou só 1 bloco), refatia por tamanho fixo
    needs_resplit = any(len(c) > chunk_size * 1.5 for c in raw_chunks) or len(raw_chunks) <= 1
    if needs_resplit:
        raw_chunks = []
        step = chunk_size - overlap
        for i in range(0, len(full_text), step):
            piece = full_text[i:i + chunk_size].strip()
            if len(piece) > 30:
                raw_chunks.append(piece)

    return raw_chunks


def build_index(pdf_path=PDF_PATH):
    """Monta o índice de embeddings a partir do PDF. Chama isso uma vez no start do app."""
    global _index
    chunks = load_and_chunk_pdf(pdf_path)

    embeddings = _model.encode(chunks)

    _index = [
        {"text": chunk, "embedding": emb}
        for chunk, emb in zip(chunks, embeddings)
    ]

    print(f"[RAG] Índice construído com {len(_index)} chunks.")
    return _index


def _cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))


def search(question, top_k=3):
    """Devolve os chunks mais relevantes pra pergunta, ordenados por similaridade."""
    if not _index:
        raise RuntimeError("Índice vazio — chama build_index() antes de search().")

    question_embedding = _model.encode([question])[0]

    scored = [
        (_cosine_similarity(question_embedding, item["embedding"]), item["text"])
        for item in _index
    ]
    scored.sort(key=lambda x: x[0], reverse=True)

    return [text for score, text in scored[:top_k]]


def build_prompt(question, retrieved_chunks):
    """Monta o prompt final: contexto recuperado + pergunta do usuário."""
    context = "\n\n".join(retrieved_chunks)
    return (
        "Use o contexto abaixo pra responder a pergunta. "
        "Se a resposta não estiver no contexto, diga que não sabe.\n\n"
        f"Contexto:\n{context}\n\n"
        f"Pergunta: {question}"
    )