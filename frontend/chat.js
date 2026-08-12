// Echo Iris — conecta o chat da interface ao backend (endpoint /ask).
// BACKEND_URL já é declarado em script.js (mesmo escopo global, script
// carregado antes deste) — redeclarar aqui com "const" causava um
// SyntaxError que quebrava o arquivo inteiro e deixava o chat travado.

const chatLog = document.getElementById('chat-log');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');

// Checagem defensiva: se algum desses IDs não existir no HTML (renomeado
// sem querer, arquivo errado, etc.), antes o script quebrava silenciosamente
// bem aqui — e como era a PRIMEIRA coisa que ele fazia, o campo/botão
// ficavam travados em "disabled" pra sempre, sem nenhuma pista do porquê.
// Agora ele avisa exatamente qual elemento não foi encontrado, no console.
if (!chatLog || !chatInput || !chatSend) {
  console.error(
    '[Echo Iris] chat.js não encontrou um ou mais elementos esperados no HTML:',
    {
      'chat-log': !!chatLog,
      'chat-input': !!chatInput,
      'chat-send': !!chatSend,
    },
    '— confirme se os IDs no index.html batem com esses nomes, e se o chat.js está sendo carregado (aba Network do DevTools).'
  );
} else {
  chatInput.disabled = false;
  chatSend.disabled = false;
  console.log('[Echo Iris] chat.js carregado, campo de chat liberado.');
}

let firstMessageSent = false;

function addMessage(text, from) {
  if (!chatLog) return;

  if (!firstMessageSent) {
    chatLog.innerHTML = '';
    firstMessageSent = true;
  }

  const msg = document.createElement('p');
  msg.textContent = (from === 'user' ? 'Você: ' : 'Echo Iris: ') + text;
  msg.style.marginBottom = '8px';
  msg.style.color = from === 'user' ? '#e8e8f0' : '#7c5cff';

  chatLog.appendChild(msg);
  chatLog.scrollTop = chatLog.scrollHeight;
}

async function sendQuestion() {
  if (!chatInput || !chatSend) return;

  const question = chatInput.value.trim();
  if (!question) return;

  addMessage(question, 'user');
  chatInput.value = '';
  chatSend.disabled = true;

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

if (chatSend) {
  chatSend.addEventListener('click', sendQuestion);
}

if (chatInput) {
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendQuestion();
    }
  });
}