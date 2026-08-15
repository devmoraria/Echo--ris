import os
os.environ['LLM_PROVIDER'] = 'gemini'
from dotenv import load_dotenv
load_dotenv()
import llm
print(llm.real_llm_response_gemini('Responda em uma frase curta: você está funcionando?'))
