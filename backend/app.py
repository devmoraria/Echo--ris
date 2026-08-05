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
    answer = llm.get_llm_response(prompt)

    return jsonify({"resposta": answer})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "chunks_indexados": len(rag._index)})


if __name__ == "__main__":
    app.run(debug=True, port=5000)