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

// Mini-renderizador de markdown — só o essencial que o Gemini usa nas
// respostas (negrito, listas com * ou -, listas numeradas, parágrafos).
// Sempre escapa o texto cru ANTES de aplicar qualquer tag, pra nunca
// interpretar o conteúdo da resposta como HTML de verdade (mesmo vindo
// da IA, não custa nada tratar como não-confiável).
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineFormat(str) {
  // só negrito por enquanto — itálico com * simples é arriscado de
  // detectar corretamente quando a mesma linha também tem marcador de
  // lista, então preferi deixar de fora a ambiguidade.
  return str.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderMarkdown(text) {
  const lines = escapeHtml(text).split(/\r?\n/);
  let html = '';
  let listType = null; // 'ul' | 'ol' | null

  const closeList = () => {
    if (listType) {
      html += `</${listType}>`;
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '') {
      closeList();
      continue;
    }

    const bulletMatch = line.match(/^[*-]\s+(.*)/);
    const numberedMatch = line.match(/^\d+[.)]\s+(.*)/);

    if (bulletMatch) {
      if (listType !== 'ul') { closeList(); html += '<ul>'; listType = 'ul'; }
      html += `<li>${inlineFormat(bulletMatch[1])}</li>`;
    } else if (numberedMatch) {
      if (listType !== 'ol') { closeList(); html += '<ol>'; listType = 'ol'; }
      html += `<li>${inlineFormat(numberedMatch[1])}</li>`;
    } else {
      closeList();
      html += `<p>${inlineFormat(line)}</p>`;
    }
  }
  closeList();
  return html;
}

function addMessage(text, from) {
  if (!chatLog) return;

  if (!firstMessageSent) {
    chatLog.innerHTML = '';
    firstMessageSent = true;
  }

  const msg = document.createElement('div');
  msg.style.marginBottom = '8px';
  msg.style.color = from === 'user' ? '#e8e8f0' : '#7c5cff';

  if (from === 'user') {
    // Mensagem do usuário: texto puro, sem markdown — não precisa
    // renderizar nada, e evita qualquer ambiguidade de conteúdo digitado.
    msg.textContent = 'Você: ' + text;
  } else {
    msg.innerHTML = '<strong>Echo Iris:</strong> ' + renderMarkdown(text);
  }

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