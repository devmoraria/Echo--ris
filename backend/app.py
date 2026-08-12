"""
Echo Iris — backend.

Roda com: python app.py
Testa com: curl -X POST http://localhost:5000/ask -H "Content-Type: application/json" -d "{\"pergunta\": \"sua pergunta aqui\"}"
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import rag
import llm

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})  # libera chamadas vindas de outra porta/origem (o front roda separado do backend)

# Constrói o índice de embeddings uma vez, no start do servidor —
# não faz sentido reprocessar o PDF a cada pergunta.
rag.build_index()


@app.route("/ask", methods=["POST"])
def ask():
    data = request.get_json(force=True)
    question = data.get("pergunta", "").strip()

    if not question:
        return jsonify({"erro": "campo 'pergunta' vazio ou ausente"}), 400

    chunks = rag.search(question, top_k=3)
    prompt = rag.build_prompt(question, chunks)

    # Score de cosseno do trecho mais parecido — abaixo do limiar, a
    # pergunta provavelmente não tem nada a ver com o material indexado
    # (ex.: "oi, o que vc faz?"). 0.35 é um ponto de partida razoável pro
    # all-MiniLM-L6-v2; ajuste se estiver rejeitando perguntas válidas ou
    # aceitando perguntas soltas demais.
    RELEVANCE_THRESHOLD = 0.35
    best_score = chunks[0][0] if chunks else 0.0
    has_relevant_context = best_score >= RELEVANCE_THRESHOLD

    answer = llm.get_llm_response(prompt, has_relevant_context=has_relevant_context)

    return jsonify({"resposta": answer})


@app.route("/vibe", methods=["POST"])
def vibe():
    """Chamado quando o usuário escolhe/troca de música. Devolve a cor-base
    que representa a 'vibe' daquela faixa — essa cor vira a identidade visual
    da música, e o /colors só varia em torno dela conforme o áudio toca."""
    data = request.get_json(force=True)
    song_name = data.get("nome", "").strip()

    if not song_name:
        return jsonify({"erro": "campo 'nome' vazio ou ausente"}), 400

    palette = llm.get_vibe_response(song_name)
    return jsonify(palette)


@app.route("/colors", methods=["POST"])
def colors():
    data = request.get_json(force=True)
    bass = float(data.get("bass", 0))
    mid = float(data.get("mid", 0))
    treble = float(data.get("treble", 0))
    volume = float(data.get("volume", 0))

    # base_hue vem do /vibe, calculado quando a música foi escolhida — é
    # opcional pra manter compatibilidade se o front ainda não mandar.
    base_hue = data.get("base_hue")
    base_hue = float(base_hue) if base_hue is not None else None

    palette = llm.get_color_response(bass, mid, treble, volume, base_hue=base_hue)
    return jsonify(palette)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "chunks_indexados": len(rag._index)})


if __name__ == "__main__":
    app.run(debug=True, port=5000)