"""
Camada do LLM. Enquanto a conta OCI nÃ£o libera, usa as versÃµes mock (ou
Gemini como alternativa â€” ver LLM_PROVIDER abaixo). Quando um provedor
real estiver configurado, tanto o chat quanto as cores passam a usar a IA
de verdade automaticamente, sem mexer no resto do cÃ³digo (app.py e
scene3d.js sÃ³ conhecem get_llm_response/get_color_response/get_vibe_response).
"""

import os
import re
import json

from dotenv import load_dotenv

# Precisa rodar ANTES de ler LLM_PROVIDER logo abaixo â€” sem isso, o .env sÃ³
# seria carregado dentro de real_llm_response_oci/real_llm_response_gemini,
# tarde demais: LLM_PROVIDER jÃ¡ teria sido fixado em "mock" no import do
# mÃ³dulo (get_llm_response nunca chegaria a chamar essas funÃ§Ãµes).
load_dotenv()

# Antes era um booleano (USE_REAL_OCI = True/False) que sÃ³ decidia entre
# "IA real da OCI" e "mock". Generalizado pra um seletor de provedor â€”
# assim dÃ¡ pra trocar de "cÃ©rebro" sem tocar em app.py ou scene3d.js, que sÃ³
# conhecem get_llm_response/get_color_response/get_vibe_response.
#
# Valores aceitos: "mock" (padrÃ£o, sem IA real), "oci" (Generative AI da
# OCI, cÃ³digo original abaixo), "gemini" (fallback enquanto a OCI nÃ£o
# libera â€” API gratuita, sem espera de aprovaÃ§Ã£o, mas com cota diÃ¡ria
# baixa: 20 req/dia no free tier), "cohere" (outra alternativa, cota
# mensal de 1.000 req/mÃªs â€” mais folgada pro volume deste projeto).
#
# Lido de variÃ¡vel de ambiente pra nÃ£o precisar mexer no cÃ³digo pra trocar
# de ambiente (local vs. VM) â€” cai em "mock" se LLM_PROVIDER nÃ£o estiver
# definida no .env.
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "mock").strip().lower()


_NO_CONTEXT_REPLY = (
    "[RESPOSTA SIMULADA] Isso nÃ£o parece estar no material do projeto â€” "
    "sou o assistente do Echo Iris, pergunte algo sobre o projeto, a "
    "curadoria de cores por IA ou o visualizador de Ã¡udio 3D."
)


def _clean_excerpt(text, max_chars=350):
    """Deixa um chunk cru do PDF apresentÃ¡vel como resposta: normaliza
    espaÃ§os/marcadores de lista, corta o inÃ­cio atÃ© a primeira letra
    maiÃºscula que abre frase (evita abrir no meio de uma palavra cortada
    pelo fatiamento do rag.py) e corta o fim no Ãºltimo ponto final dentro
    do limite de tamanho, em vez de truncar no meio de uma frase."""
    text = re.sub(r"\s+", " ", text).replace("â—", "â€¢").strip()

    start_match = re.search(r"[A-ZÃ€-Ãš]", text)
    if start_match:
        text = text[start_match.start():]

    if len(text) > max_chars:
        truncated = text[:max_chars]
        last_period = truncated.rfind(".")
        text = truncated[:last_period + 1] if last_period > 50 else truncated.rstrip() + "â€¦"

    return text.strip()


def mock_llm_response(prompt, has_relevant_context=True):
    """Sem LLM real ainda: em vez de devolver sempre o mesmo texto genÃ©rico
    que ignora a pergunta, extrai e limpa o trecho mais relevante do
    CONTEXTO que jÃ¡ veio dentro do prÃ³prio prompt (rag.build_prompt monta
    esse prompt com "Contexto:\n...\n\nPergunta: ..."). NÃ£o Ã© uma resposta
    gerada de verdade, mas jÃ¡ mostra o RAG funcionando ponta a ponta â€”
    troque LLM_PROVIDER pra "oci" ou "gemini" no .env quando um provedor
    real estiver configurado, pra uma resposta gerada pela IA de verdade.

    has_relevant_context vem do app.py comparando o melhor score de busca
    com um limiar mÃ­nimo â€” se a pergunta nÃ£o tiver nada a ver com o PDF
    indexado (ex.: "oi, o que vc faz?"), evita devolver um trecho aleatÃ³rio
    do material como se fosse resposta."""
    if not has_relevant_context:
        return _NO_CONTEXT_REPLY

    match = re.search(r"Contexto:\n(.*?)\n\nPergunta:", prompt, re.DOTALL)
    if not match:
        return _NO_CONTEXT_REPLY

    chunks = [c.strip() for c in match.group(1).strip().split("\n\n") if c.strip()]
    if not chunks:
        return _NO_CONTEXT_REPLY

    # Combina os 2 melhores trechos (chunks jÃ¡ vÃªm ordenados por
    # relevÃ¢ncia, do rag.search) em vez de sÃ³ o primeiro â€” numa base de
    # conhecimento pequena como essa, o #1 nem sempre Ã© o mais especÃ­fico
    # pra pergunta, entÃ£o o #2 costuma cobrir o que faltou.
    excerpts = [_clean_excerpt(c) for c in chunks[:2]]
    excerpts = [e for e in excerpts if e]
    body = "\n\n".join(excerpts) if excerpts else chunks[0]

    return f"[simulado, baseado no material do projeto]\n\n{body}"


def real_llm_response_oci(prompt):
    """Chamada real Ã  OCI Generative AI â€” mesma lÃ³gica do test_oci_connection.py."""
    import oci

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
    """Chamada real Ã  API do Gemini (Google AI Studio) â€” fallback enquanto a
    conta OCI nÃ£o libera o Generative AI. Pega a chave de GEMINI_API_KEY no
    .env; o modelo Ã© configurÃ¡vel por GEMINI_MODEL (default: modelo estÃ¡vel
    mais recente disponÃ­vel pra novas contas na API gratuita).

    Usa o SDK "google-genai" (pacote novo, `from google import genai`) â€”
    o pacote antigo "google-generativeai" foi descontinuado pela Google e
    parou de dar acesso a modelos novos pra contas criadas recentemente."""
    from google import genai

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY nÃ£o configurada no .env")

    model_name = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(model=model_name, contents=prompt)
    return response.text


def real_llm_response_cohere(prompt):
    """Chamada real Ã  API do Cohere â€” alternativa ao Gemini quando a cota
    diÃ¡ria dele (20 requisiÃ§Ãµes/dia no free tier) nÃ£o Ã© suficiente. Pega a
    chave de COHERE_API_KEY no .env; o modelo Ã© configurÃ¡vel por
    COHERE_MODEL (default: command-r-plus-08-2024, disponÃ­vel em trial
    keys). Cota do trial: 1.000 chamadas/mÃªs, 20/min â€” bem mais folgada
    que a diÃ¡ria do Gemini pro volume de uso deste projeto.

    Usa o SDK "cohere" (ClientV2, `co.chat(...)`) â€” o mÃ©todo antigo
    co.generate() estÃ¡ descontinuado desde ago/2025, nÃ£o usar."""
    import cohere

    api_key = os.getenv("COHERE_API_KEY")
    if not api_key:
        raise RuntimeError("COHERE_API_KEY nÃ£o configurada no .env")

    model_name = os.getenv("COHERE_MODEL", "command-r-plus-08-2024")

    client = cohere.ClientV2(api_key=api_key)
    response = client.chat(
        model=model_name,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.message.content[0].text


def real_llm_response(prompt):
    """Dispatcher â€” escolhe o provedor real conforme LLM_PROVIDER. Separado
    do get_llm_response() de baixo porque real_color_response() e
    real_vibe_response() (mais abaixo) tambÃ©m chamam essa funÃ§Ã£o pra gerar
    a paleta/vibe com a IA real â€” um Ãºnico ponto de troca de provedor cobre
    chat, cores e vibe ao mesmo tempo."""
    if LLM_PROVIDER == "oci":
        return real_llm_response_oci(prompt)
    if LLM_PROVIDER == "gemini":
        return real_llm_response_gemini(prompt)
    if LLM_PROVIDER == "cohere":
        return real_llm_response_cohere(prompt)
    raise RuntimeError(
        f"LLM_PROVIDER='{LLM_PROVIDER}' nÃ£o reconhecido ou Ã© 'mock' â€” "
        "real_llm_response() nÃ£o deveria ter sido chamada nesse caso."
    )


def get_llm_response(prompt, has_relevant_context=True):
    """Ponto Ãºnico de entrada do chat â€” troca o mock pela chamada real
    conforme LLM_PROVIDER (mock/oci/gemini).

    Mesma lÃ³gica de resiliÃªncia das outras camadas (cores/vibe): se a IA
    real falhar (rate limit, 503 de sobrecarga do provedor, timeout, etc.),
    cai pro mock em vez de devolver erro 500 pro usuÃ¡rio â€” o chat continua
    respondendo, sÃ³ que em modo simulado atÃ© a prÃ³xima pergunta funcionar."""
    if LLM_PROVIDER in ("oci", "gemini", "cohere"):
        try:
            return real_llm_response(prompt)
        except Exception as e:
            print(f"[chat] IA real falhou ({e}), usando fallback simulado.")
            return mock_llm_response(prompt, has_relevant_context=has_relevant_context)
    return mock_llm_response(prompt, has_relevant_context=has_relevant_context)


def _parse_ai_color_json(text):
    """Tenta extrair um JSON vÃ¡lido da resposta da IA (Ã s vezes vem com texto em volta)."""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("Nenhum JSON encontrado na resposta da IA")
    return json.loads(match.group(0))


# ===== Camada de decisÃ£o de cor em tempo real (psicologia das cores) =====
# Ideia: o front manda a "energia" atual do Ã¡udio (bass/mid/treble/volume),
# e essa camada devolve uma paleta. Se vier um base_hue (a cor-base da
# mÃºsica, calculada pelo /vibe quando a faixa foi escolhida), a cor final
# orbita em torno dele â€” assim a identidade de cor da mÃºsica se mantÃ©m, e
# a energia ao vivo sÃ³ dÃ¡ vida/variaÃ§Ã£o em cima dela. Sem base_hue, cai no
# comportamento antigo (hue calculado 100% a partir da energia do momento).

def _heuristic_color(bass, mid, treble, volume, base_hue=None, vibe_weight=0.75):
    """Mapeia a energia do Ã¡udio pra uma cor, seguindo psicologia das cores bÃ¡sica:
    grave forte â†’ vermelho/laranja (energia, intensidade)
    mÃ©dio forte â†’ verde/amarelo (equilÃ­brio, natureza)
    agudo forte â†’ azul/roxo (calma, introspecÃ§Ã£o)

    vibe_weight (0-1) vem do slider de personalizaÃ§Ã£o do usuÃ¡rio no front â€”
    quanto a vibe/cor-base da mÃºsica domina sobre a energia ao vivo. Antes
    era um valor fixo (0.75); default aqui mantÃ©m o mesmo comportamento pra
    quem nÃ£o manda esse campo.
    """
    total = bass + mid + treble + 1e-6
    # hue 0 = vermelho, ~60 = amarelo, ~140 = verde, ~220 = azul, ~280 = roxo
    live_hue = (bass * 10 + mid * 130 + treble * 250) / total

    vibe_weight = max(0.0, min(1.0, vibe_weight))

    if base_hue is not None:
        # A vibe da mÃºsica domina por vibe_weight, a energia ao vivo empurra
        # o tom pelo restante â€” dÃ¡ variaÃ§Ã£o sem sair da identidade da faixa.
        hue = (base_hue * vibe_weight + live_hue * (1 - vibe_weight)) % 360
    else:
        hue = live_hue

    # Faixa recomendada no base.pdf (seÃ§Ã£o 3): S entre 0.50 e 0.90 â€”
    # acima disso a cor perde a leitura de "identidade" descrita no guia.
    saturation = min(0.9, 0.5 + volume * 0.5)
    lightness = 0.5 + volume * 0.15

    return {
        "hue": round(hue, 1),
        "saturation": round(saturation, 2),
        "lightness": round(lightness, 2),
        "opacity": round(0.7 + volume * 0.3, 2),
        "source": "heuristica_local",
    }


def real_color_response(bass, mid, treble, volume, base_hue=None, vibe_weight=0.75):
    """Pergunta pra IA de verdade qual paleta combina com esse momento da mÃºsica."""
    base_hue_txt = (
        f"A cor-base identificada pra essa mÃºsica Ã© hue={base_hue:.0f}; "
        f"ela deve pesar {vibe_weight * 100:.0f}% na decisÃ£o final, e a energia "
        f"ao vivo o restante ({(1 - vibe_weight) * 100:.0f}%). "
        if base_hue is not None
        else ""
    )
    prompt = (
        "VocÃª Ã© um especialista em psicologia das cores curando um visualizador de mÃºsica. "
        f"Os nÃ­veis de Ã¡udio agora sÃ£o: grave={bass:.2f}, mÃ©dio={mid:.2f}, agudo={treble:.2f}, "
        f"volume={volume:.2f} (todos de 0 a 1). "
        f"{base_hue_txt}"
        "Responda APENAS um JSON, sem texto extra, no formato: "
        '{"hue": <0-360>, "saturation": <0-1>, "lightness": <0-1>, "opacity": <0-1>}'
    )
    raw = real_llm_response(prompt)
    return _parse_ai_color_json(raw)


def get_color_response(bass, mid, treble, volume, base_hue=None, vibe_weight=0.75):
    """Ponto Ãºnico de entrada das cores em tempo real.

    SEMPRE usa a heurÃ­stica local (_heuristic_color), nunca a IA generativa.
    Motivo: o front chama esse endpoint a cada 4s (COLOR_FETCH_INTERVAL em
    scene3d.js) enquanto a mÃºsica toca â€” uma faixa de poucos minutos jÃ¡ gera
    dezenas de chamadas sozinha, o que estoura qualquer cota gratuita de LLM
    (foi exatamente isso que zerou a cota diÃ¡ria do Gemini). AlÃ©m disso, o
    mapeamento de cor por energia sonora (base.pdf, seÃ§Ã£o 2-3: faixas de hue
    por Hz, limites de saturaÃ§Ã£o/luminosidade) Ã© uma regra determinÃ­stica,
    nÃ£o uma decisÃ£o que precisa de um LLM â€” a heurÃ­stica jÃ¡ implementa essas
    regras fielmente, com latÃªncia ~0 e sem depender de rede/cota.

    real_color_response() continua existindo no cÃ³digo (nÃ£o foi removida)
    caso queira reativar chamadas pontuais Ã  IA aqui no futuro, mas nÃ£o Ã©
    mais chamada por este ponto de entrada.

    vibe_weight (0-1) vem do slider "identidade vs. energia" do usuÃ¡rio no
    front (settings.js)."""
    return _heuristic_color(bass, mid, treble, volume, base_hue=base_hue, vibe_weight=vibe_weight)


# ===== Camada de "vibe" da mÃºsica (identidade de cor por faixa) =====
# Chamada uma vez quando o usuÃ¡rio escolhe/troca de mÃºsica. Devolve a
# cor-base que vai identificar aquela faixa visualmente. Hoje, sem analisar
# o Ã¡udio de verdade, a heurÃ­stica usa palavras-chave do tÃ­tulo/nome do
# arquivo; quando a IA real estiver ligada, ela pode inferir a partir do
# tÃ­tulo com mais nuance (gÃªnero, emoÃ§Ã£o sugerida etc.).

_VIBE_KEYWORDS = {
    # hue aproximado -> palavras-chave (pt/en) associadas a essa vibe
    200: ["chill", "lofi", "lo-fi", "calm", "calma", "sad", "triste", "blue", "noite", "night", "dream", "sonho"],
    330: ["love", "amor", "coraÃ§Ã£o", "coracao", "romance", "romantic", "paixao", "paixÃ£o"],
    40: ["party", "festa", "dance", "funk", "remix", "upbeat", "baile", "favela"],
    0: ["trap", "rap", "drill", "fight", "briga", "raiva", "war", "guerra"],
    140: ["folk", "acoustic", "acustico", "acÃºstico", "forest", "floresta", "natureza", "nature"],
}


def _hash_hue(text):
    """Gera um hue estÃ¡vel (sempre o mesmo pra mesma mÃºsica) a partir do
    nome â€” assim toda mÃºsica tem uma identidade de cor prÃ³pria e
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
    mÃºsica, a partir do tÃ­tulo."""
    prompt = (
        "VocÃª Ã© um especialista em psicologia das cores curando um visualizador de mÃºsica. "
        f'A mÃºsica escolhida se chama "{song_name}". '
        "Baseado no que esse tÃ­tulo sugere sobre gÃªnero e emoÃ§Ã£o, escolha uma cor-base "
        "que represente a vibe dela. "
        "Responda APENAS um JSON, sem texto extra, no formato: "
        '{"hue": <0-360>, "saturation": <0-1>, "lightness": <0-1>, "opacity": <0-1>}'
    )
    raw = real_llm_response(prompt)
    return _parse_ai_color_json(raw)


def get_vibe_response(song_name):
    """Ponto Ãºnico de entrada da vibe/cor-base de uma faixa. Mesma lÃ³gica de
    resiliÃªncia das outras camadas: se a IA real falhar, cai pro heurÃ­stico."""
    if LLM_PROVIDER in ("oci", "gemini", "cohere"):
        try:
            return real_vibe_response(song_name)
        except Exception as e:
            print(f"[vibe] IA real falhou ({e}), usando fallback heurÃ­stico.")
            return _heuristic_vibe(song_name)
    return _heuristic_vibe(song_name)
