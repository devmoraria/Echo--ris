"""
Teste isolado de conexão com a OCI Generative AI.
Roda esse arquivo sozinho primeiro — só depois que ele funcionar
é que faz sentido plugar isso no Flask de verdade.

Uso:
    python test_oci_connection.py
"""

import os
import oci
from dotenv import load_dotenv

load_dotenv()

COMPARTMENT_ID = os.getenv("OCI_COMPARTMENT_ID")
REGION = os.getenv("OCI_REGION", "us-chicago-1")
MODEL_ID = os.getenv("OCI_MODEL_ID", "meta.llama-3.1-70b-instruct")

# Lê as credenciais do arquivo ~/.oci/config (perfil DEFAULT)
config = oci.config.from_file("~/.oci/config", "DEFAULT")

client = oci.generative_ai_inference.GenerativeAiInferenceClient(
    config=config,
    service_endpoint=f"https://inference.generativeai.{REGION}.oci.oraclecloud.com",
)

# Monta uma mensagem simples, só pra confirmar que a chamada volta com resposta
message = oci.generative_ai_inference.models.Message(
    role="USER",
    content=[
        oci.generative_ai_inference.models.TextContent(
            text="Responda em uma frase curta: você está funcionando?"
        )
    ],
)

chat_request = oci.generative_ai_inference.models.GenericChatRequest(
    api_format=oci.generative_ai_inference.models.BaseChatRequest.API_FORMAT_GENERIC,
    messages=[message],
    max_tokens=100,
    temperature=0.7,
)

chat_details = oci.generative_ai_inference.models.ChatDetails(
    compartment_id=COMPARTMENT_ID,
    serving_mode=oci.generative_ai_inference.models.OnDemandServingMode(model_id=MODEL_ID),
    chat_request=chat_request,
)

print("Chamando a OCI Generative AI...")
response = client.chat(chat_details)

print("\n--- Resposta ---")
print(response.data)