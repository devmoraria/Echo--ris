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

_model = SentenceTransformer("all-MiniLM-L6-v2")

_index = []


def load_and_chunk_pdf(pdf_path=PDF_PATH, chunk_size=250, overlap=30):
    reader = PdfReader(pdf_path)

    full_text = ""
    for page in reader.pages:
        full_text += page.extract_text() + "\n"

    raw_chunks = [c.strip() for c in full_text.split("\n\n") if len(c.strip()) > 30]

    needs_resplit = any(len(c) > chunk_size * 1.5 for c in raw_chunks) or len(raw_chunks) <= 1
    if needs_resplit:
        raw_chunks = []
        step = chunk_size - overlap
        cursor = 0
        text_len = len(full_text)
        while cursor < text_len:
            end = min(cursor + chunk_size, text_len)
            # Empurra o fim do corte pro espaço/quebra de linha mais próximo
            # antes do limite, em vez de cortar no meio de uma palavra —
            # sem isso, chunks como "...gestão de lum" | "inosidade..."
            # ficavam ilegíveis quando exibidos como resposta.
            if end < text_len:
                boundary = full_text.rfind(" ", cursor, end)
                if boundary > cursor:
                    end = boundary
            piece = full_text[cursor:end].strip()
            if len(piece) > 30:
                raw_chunks.append(piece)
            cursor += step

    return raw_chunks


def build_index(pdf_path=PDF_PATH):
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
    """Devolve uma lista de tuplas (score, texto), já ordenada da mais
    parecida com a pergunta pra menos. O score (similaridade de cosseno,
    0 a 1) é o que permite ao chamador decidir se a pergunta realmente tem
    a ver com o material indexado ou não — antes essa informação se perdia
    aqui dentro e o app.py não tinha como saber."""
    if not _index:
        raise RuntimeError("Índice vazio — chama build_index() antes de search().")

    question_embedding = _model.encode([question])[0]

    scored = [
        (_cosine_similarity(question_embedding, item["embedding"]), item["text"])
        for item in _index
    ]
    scored.sort(key=lambda x: x[0], reverse=True)

    return scored[:top_k]


def build_prompt(question, retrieved_chunks):
    """retrieved_chunks é a lista de tuplas (score, texto) que vem do
    search() — aqui só interessa o texto."""
    context = "\n\n".join(text for score, text in retrieved_chunks)
    return (
        "Use o contexto abaixo pra responder a pergunta. "
        "Se a resposta não estiver no contexto, diga que não sabe. "
        "Responda de forma clara e didática, como se estivesse explicando pra "
        "alguém conhecendo o projeto agora — organize em tópicos com **negrito** "
        "nos termos-chave quando isso ajudar a explicação, mas sem exagerar na "
        "extensão.\n\n"
        f"Contexto:\n{context}\n\n"
        f"Pergunta: {question}"
    )