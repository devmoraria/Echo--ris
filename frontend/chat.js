// Echo Iris — conecta o chat da interface ao backend (endpoint /ask).
// Se um dia você mudar a porta do Flask, só ajusta essa constante aqui.
const BACKEND_URL = 'http://localhost:5000';

const chatLog = document.getElementById('chat-log');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');

// Assim que a página carrega, já libera o campo — não precisa esperar
// nada do áudio pra poder conversar com o agente.
chatInput.disabled = false;
chatSend.disabled = false;

// Tira aquele texto de placeholder inicial na primeira mensagem real
let firstMessageSent = false;

function addMessage(text, from) {
  if (!firstMessageSent) {
    chatLog.innerHTML = '';
    firstMessageSent = true;
  }

  const msg = document.createElement('p');
  msg.textContent = (from === 'user' ? 'Você: ' : 'Echo Iris: ') + text;
  msg.style.marginBottom = '8px';
  msg.style.color = from === 'user' ? '#e8e8f0' : '#7c5cff';

  chatLog.appendChild(msg);
  chatLog.scrollTop = chatLog.scrollHeight; // rola pra sempre mostrar a última mensagem
}

async function sendQuestion() {
  const question = chatInput.value.trim();
  if (!question) return;

  addMessage(question, 'user');
  chatInput.value = '';
  chatSend.disabled = true; // evita clique duplo enquanto espera a resposta

  try {
    const response = await fetch(`${BACKEND_URL}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pergunta: question }),
    });

    if (!response.ok) {
      throw new Error(`Servidor respondeu com status ${response.status}`);
    }

    const data = await response.json();
    addMessage(data.resposta, 'agent');
  } catch (err) {
    console.error('[Echo Iris] erro ao chamar o backend:', err);
    addMessage(
      'Não consegui falar com o backend agora. Confirma se o "python app.py" está rodando.',
      'agent'
    );
  } finally {
    chatSend.disabled = false;
  }
}

chatSend.addEventListener('click', sendQuestion);

// Também manda ao apertar Enter, sem precisar clicar no botão
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    sendQuestion();
  }
});