"""
Camada do LLM. Enquanto a conta OCI não libera, usa as versões mock (ou
Gemini como alternativa — ver LLM_PROVIDER abaixo). Quando um provedor
real estiver configurado, tanto o chat quanto as cores passam a usar a IA
de verdade automaticamente, sem mexer no resto do código (app.py e
scene3d.js só conhecem get_llm_response/get_color_response/get_vibe_response).
"""

import os
import re
import json

# Antes era um booleano (USE_REAL_OCI = True/False) que só decidia entre
# "IA real da OCI" e "mock". Generalizado pra um seletor de provedor —
# assim dá pra trocar de "cérebro" sem tocar em app.py ou scene3d.js, que só
# conhecem get_llm_response/get_color_response/get_vibe_response.
#
# Valores aceitos: "mock" (padrão, sem IA real), "oci" (Generative AI da
# OCI, código original abaixo), "gemini" (fallback enquanto a OCI não
# libera — API gratuita, sem espera de aprovação).
#
# Lido de variável de ambiente pra não precisar mexer no código pra trocar
# de ambiente (local vs. VM) — cai em "mock" se LLM_PROVIDER não estiver
# definida no .env.
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "mock").strip().lower()


_NO_CONTEXT_REPLY = (
    "[RESPOSTA SIMULADA] Isso não parece estar no material do projeto — "
    "sou o assistente do Echo Iris, pergunte algo sobre o projeto, a "
    "curadoria de cores por IA ou o visualizador de áudio 3D."
)


def _clean_excerpt(text, max_chars=350):
    """Deixa um chunk cru do PDF apresentável como resposta: normaliza
    espaços/marcadores de lista, corta o início até a primeira letra
    maiúscula que abre frase (evita abrir no meio de uma palavra cortada
    pelo fatiamento do rag.py) e corta o fim no último ponto final dentro
    do limite de tamanho, em vez de truncar no meio de uma frase."""
    text = re.sub(r"\s+", " ", text).replace("●", "•").strip()

    start_match = re.search(r"[A-ZÀ-Ú]", text)
    if start_match:
        text = text[start_match.start():]

    if len(text) > max_chars:
        truncated = text[:max_chars]
        last_period = truncated.rfind(".")
        text = truncated[:last_period + 1] if last_period > 50 else truncated.rstrip() + "…"

    return text.strip()


def mock_llm_response(prompt, has_relevant_context=True):
    """Sem LLM real ainda: em vez de devolver sempre o mesmo texto genérico
    que ignora a pergunta, extrai e limpa o trecho mais relevante do
    CONTEXTO que já veio dentro do próprio prompt (rag.build_prompt monta
    esse prompt com "Contexto:\n...\n\nPergunta: ..."). Não é uma resposta
    gerada de verdade, mas já mostra o RAG funcionando ponta a ponta —
    troque LLM_PROVIDER pra "oci" ou "gemini" no .env quando um provedor
    real estiver configurado, pra uma resposta gerada pela IA de verdade.

    has_relevant_context vem do app.py comparando o melhor score de busca
    com um limiar mínimo — se a pergunta não tiver nada a ver com o PDF
    indexado (ex.: "oi, o que vc faz?"), evita devolver um trecho aleatório
    do material como se fosse resposta."""
    if not has_relevant_context:
        return _NO_CONTEXT_REPLY

    match = re.search(r"Contexto:\n(.*?)\n\nPergunta:", prompt, re.DOTALL)
    if not match:
        return _NO_CONTEXT_REPLY

    chunks = [c.strip() for c in match.group(1).strip().split("\n\n") if c.strip()]
    if not chunks:
        return _NO_CONTEXT_REPLY

    # Combina os 2 melhores trechos (chunks já vêm ordenados por
    # relevância, do rag.search) em vez de só o primeiro — numa base de
    # conhecimento pequena como essa, o #1 nem sempre é o mais específico
    # pra pergunta, então o #2 costuma cobrir o que faltou.
    excerpts = [_clean_excerpt(c) for c in chunks[:2]]
    excerpts = [e for e in excerpts if e]
    body = "\n\n".join(excerpts) if excerpts else chunks[0]

    return f"[simulado, baseado no material do projeto]\n\n{body}"


def real_llm_response_oci(prompt):
    """Chamada real à OCI Generative AI — mesma lógica do test_oci_connection.py."""
    import oci
    from dotenv import load_dotenv
    load_dotenv()

    compartment_id = os.getenv("OCI_COMPARTMENT_ID")
    region = os.getenv("OCI_REGION", "us-chicago-1")
    model_id = os.getenv("OCI_MODEL_ID", "meta.llama-3.1-70b-instruct")

    config = oci.config.from_file("~/.oci/config", "DEFAULT")
    client = oci.generative_ai_inference.GenerativeAiInferenceClient(
        config=config,
        service_endpoint=f"https://inference.generativeai.{region}.oci.oraclecloud.com",
    )

    message = oci.generative_ai_inference.models.Message(
        role="USER",
        content=[oci.generative_ai_inference.models.TextContent(text=prompt)],
    )

    chat_request = oci.generative_ai_inference.models.GenericChatRequest(
        api_format=oci.generative_ai_inference.models.BaseChatRequest.API_FORMAT_GENERIC,
        messages=[message],
        max_tokens=500,
        temperature=0.7,
    )

    chat_details = oci.generative_ai_inference.models.ChatDetails(
        compartment_id=compartment_id,
        serving_mode=oci.generative_ai_inference.models.OnDemandServingMode(model_id=model_id),
        chat_request=chat_request,
    )

    response = client.chat(chat_details)
    return response.data.chat_response.choices[0].message.content[0].text


def real_llm_response_gemini(prompt):
    """Chamada real à API do Gemini (Google AI Studio) — fallback enquanto a
    conta OCI não libera o Generative AI. Pega a chave de GEMINI_API_KEY no
    .env; o modelo é configurável por GEMINI_MODEL (default: um modelo
    rápido/gratuito, bom o bastante pra respostas de chat curtas)."""
    import google.generativeai as genai
    from dotenv import load_dotenv
    load_dotenv()

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY não configurada no .env")

    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name)
    response = model.generate_content(prompt)
    return response.text


def real_llm_response(prompt):
    """Dispatcher — escolhe o provedor real conforme LLM_PROVIDER. Separado
    do get_llm_response() de baixo porque real_color_response() e
    real_vibe_response() (mais abaixo) também chamam essa função pra gerar
    a paleta/vibe com a IA real — um único ponto de troca de provedor cobre
    chat, cores e vibe ao mesmo tempo."""
    if LLM_PROVIDER == "oci":
        return real_llm_response_oci(prompt)
    if LLM_PROVIDER == "gemini":
        return real_llm_response_gemini(prompt)
    raise RuntimeError(
        f"LLM_PROVIDER='{LLM_PROVIDER}' não reconhecido ou é 'mock' — "
        "real_llm_response() não deveria ter sido chamada nesse caso."
    )


def get_llm_response(prompt, has_relevant_context=True):
    """Ponto único de entrada do chat — troca o mock pela chamada real
    conforme LLM_PROVIDER (mock/oci/gemini)."""
    if LLM_PROVIDER in ("oci", "gemini"):
        return real_llm_response(prompt)
    return mock_llm_response(prompt, has_relevant_context=has_relevant_context)


def _parse_ai_color_json(text):
    """Tenta extrair um JSON válido da resposta da IA (às vezes vem com texto em volta)."""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("Nenhum JSON encontrado na resposta da IA")
    return json.loads(match.group(0))


# ===== Camada de decisão de cor em tempo real (psicologia das cores) =====
# Ideia: o front manda a "energia" atual do áudio (bass/mid/treble/volume),
# e essa camada devolve uma paleta. Se vier um base_hue (a cor-base da
# música, calculada pelo /vibe quando a faixa foi escolhida), a cor final
# orbita em torno dele — assim a identidade de cor da música se mantém, e
# a energia ao vivo só dá vida/variação em cima dela. Sem base_hue, cai no
# comportamento antigo (hue calculado 100% a partir da energia do momento).

def _heuristic_color(bass, mid, treble, volume, base_hue=None, vibe_weight=0.75):
    """Mapeia a energia do áudio pra uma cor, seguindo psicologia das cores básica:
    grave forte → vermelho/laranja (energia, intensidade)
    médio forte → verde/amarelo (equilíbrio, natureza)
    agudo forte → azul/roxo (calma, introspecção)

    vibe_weight (0-1) vem do slider de personalização do usuário no front —
    quanto a vibe/cor-base da música domina sobre a energia ao vivo. Antes
    era um valor fixo (0.75); default aqui mantém o mesmo comportamento pra
    quem não manda esse campo.
    """
    total = bass + mid + treble + 1e-6
    # hue 0 = vermelho, ~60 = amarelo, ~140 = verde, ~220 = azul, ~280 = roxo
    live_hue = (bass * 10 + mid * 130 + treble * 250) / total

    vibe_weight = max(0.0, min(1.0, vibe_weight))

    if base_hue is not None:
        # A vibe da música domina por vibe_weight, a energia ao vivo empurra
        # o tom pelo restante — dá variação sem sair da identidade da faixa.
        hue = (base_hue * vibe_weight + live_hue * (1 - vibe_weight)) % 360
    else:
        hue = live_hue

    saturation = min(1.0, 0.5 + volume * 0.5)
    lightness = 0.5 + volume * 0.15

    return {
        "hue": round(hue, 1),
        "saturation": round(saturation, 2),
        "lightness": round(lightness, 2),
        "opacity": round(0.7 + volume * 0.3, 2),
        "source": "heuristica_local",
    }


def real_color_response(bass, mid, treble, volume, base_hue=None, vibe_weight=0.75):
    """Pergunta pra IA de verdade qual paleta combina com esse momento da música."""
    base_hue_txt = (
        f"A cor-base identificada pra essa música é hue={base_hue:.0f}; "
        f"ela deve pesar {vibe_weight * 100:.0f}% na decisão final, e a energia "
        f"ao vivo o restante ({(1 - vibe_weight) * 100:.0f}%). "
        if base_hue is not None
        else ""
    )
    prompt = (
        "Você é um especialista em psicologia das cores curando um visualizador de música. "
        f"Os níveis de áudio agora são: grave={bass:.2f}, médio={mid:.2f}, agudo={treble:.2f}, "
        f"volume={volume:.2f} (todos de 0 a 1). "
        f"{base_hue_txt}"
        "Responda APENAS um JSON, sem texto extra, no formato: "
        '{"hue": <0-360>, "saturation": <0-1>, "lightness": <0-1>, "opacity": <0-1>}'
    )
    raw = real_llm_response(prompt)
    return _parse_ai_color_json(raw)


def get_color_response(bass, mid, treble, volume, base_hue=None, vibe_weight=0.75):
    """Ponto único de entrada das cores em tempo real. Se a IA real falhar ou
    não estiver disponível, cai pro fallback local — isso é o item de
    resiliência que o escopo original do projeto pedia (fallback de cor se
    a API falhar).

    vibe_weight (0-1) vem do slider "identidade vs. energia" do usuário no
    front (settings.js) — repassado tanto pra IA real quanto pro fallback."""
    if LLM_PROVIDER in ("oci", "gemini"):
        try:
            return real_color_response(bass, mid, treble, volume, base_hue=base_hue, vibe_weight=vibe_weight)
        except Exception as e:
            print(f"[cores] IA real falhou ({e}), usando fallback local.")
            return _heuristic_color(bass, mid, treble, volume, base_hue=base_hue, vibe_weight=vibe_weight)
    return _heuristic_color(bass, mid, treble, volume, base_hue=base_hue, vibe_weight=vibe_weight)


# ===== Camada de "vibe" da música (identidade de cor por faixa) =====
# Chamada uma vez quando o usuário escolhe/troca de música. Devolve a
# cor-base que vai identificar aquela faixa visualmente. Hoje, sem analisar
# o áudio de verdade, a heurística usa palavras-chave do título/nome do
# arquivo; quando a IA real estiver ligada, ela pode inferir a partir do
# título com mais nuance (gênero, emoção sugerida etc.).

_VIBE_KEYWORDS = {
    # hue aproximado -> palavras-chave (pt/en) associadas a essa vibe
    200: ["chill", "lofi", "lo-fi", "calm", "calma", "sad", "triste", "blue", "noite", "night", "dream", "sonho"],
    330: ["love", "amor", "coração", "coracao", "romance", "romantic", "paixao", "paixão"],
    40: ["party", "festa", "dance", "funk", "remix", "upbeat", "baile", "favela"],
    0: ["trap", "rap", "drill", "fight", "briga", "raiva", "war", "guerra"],
    140: ["folk", "acoustic", "acustico", "acústico", "forest", "floresta", "natureza", "nature"],
}


def _hash_hue(text):
    """Gera um hue estável (sempre o mesmo pra mesma música) a partir do
    nome — assim toda música tem uma identidade de cor própria e
    consistente, mesmo quando nenhuma palavra-chave bate."""
    h = 0
    for ch in text:
        h = (h * 31 + ord(ch)) % 360
    return h


def _heuristic_vibe(song_name):
    name_lower = song_name.lower()
    for hue, keywords in _VIBE_KEYWORDS.items():
        if any(kw in name_lower for kw in keywords):
            return {
                "hue": hue,
                "saturation": 0.6,
                "lightness": 0.55,
                "opacity": 0.85,
                "source": "heuristica_local",
            }
    return {
        "hue": _hash_hue(song_name),
        "saturation": 0.55,
        "lightness": 0.55,
        "opacity": 0.85,
        "source": "heuristica_local_hash",
    }


def real_vibe_response(song_name):
    """Pergunta pra IA de verdade qual vibe/cor-base combina com essa
    música, a partir do título."""
    prompt = (
        "Você é um especialista em psicologia das cores curando um visualizador de música. "
        f'A música escolhida se chama "{song_name}". '
        "Baseado no que esse título sugere sobre gênero e emoção, escolha uma cor-base "
        "que represente a vibe dela. "
        "Responda APENAS um JSON, sem texto extra, no formato: "
        '{"hue": <0-360>, "saturation": <0-1>, "lightness": <0-1>, "opacity": <0-1>}'
    )
    raw = real_llm_response(prompt)
    return _parse_ai_color_json(raw)


def get_vibe_response(song_name):
    """Ponto único de entrada da vibe/cor-base de uma faixa. Mesma lógica de
    resiliência das outras camadas: se a IA real falhar, cai pro heurístico."""
    if LLM_PROVIDER in ("oci", "gemini"):
        try:
            return real_vibe_response(song_name)
        except Exception as e:
            print(f"[vibe] IA real falhou ({e}), usando fallback heurístico.")
            return _heuristic_vibe(song_name)
    return _heuristic_vibe(song_name)