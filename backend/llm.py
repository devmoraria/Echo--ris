"""
Camada do LLM. Enquanto a conta OCI não libera, usa mock_llm_response().
Quando liberar, troca a chamada dentro de get_llm_response() pra usar
real_llm_response() no lugar do mock — o resto do código nem precisa mudar,
porque quem chama isso (app.py) só conhece get_llm_response().
"""

import os

# Muda pra True assim que a conta OCI estiver liberada e testada
# (o test_oci_connection.py já validou isso separadamente).
USE_REAL_OCI = False


def mock_llm_response(prompt):
    """Resposta fake, só pra validar o fluxo completo antes da OCI estar disponível."""
    return (
        "[RESPOSTA SIMULADA — troque USE_REAL_OCI pra True quando a OCI estiver liberada] "
        "Com base no contexto encontrado, aqui estaria a resposta gerada pela IA."
    )


def real_llm_response(prompt):
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


def get_llm_response(prompt):
    """Ponto único de entrada — troca o mock pela chamada real quando chegar a hora."""
    if USE_REAL_OCI:
        return real_llm_response(prompt)
    return mock_llm_response(prompt)