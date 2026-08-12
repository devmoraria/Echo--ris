// Echo Iris — parte de áudio.
// Base de tudo: pega o som, extrai os dados de frequência
// e devolve pronto pra alimentar o Three.js.

const audioEl = document.getElementById('audio-el');
const fileInput = document.getElementById('file-input');
const playBtn = document.getElementById('play-btn');
const pauseBtn = document.getElementById('pause-btn');

const valBass = document.getElementById('val-bass');
const valMid = document.getElementById('val-mid');
const valTreble = document.getElementById('val-treble');
const valVolume = document.getElementById('val-volume');

const BACKEND_URL = 'http://localhost:5000';

let audioCtx = null;
let analyser = null;
let source = null;
let freqData = null;

// Cor-base da música atual (vinda do /vibe). scene3d.js lê essa variável
// global toda vez que busca uma paleta nova, pra orbitar a cor em torno
// dela em vez de recalcular o hue do zero a cada poucos segundos.
window.echoIrisBaseHue = null;

// Contador incrementado toda vez que uma faixa é carregada (mesmo que seja
// a mesma música de novo). scene3d.js observa essa variável pra sortear uma
// "personalidade de movimento" nova a cada carregamento — assim o jeito de
// se mover (drift de câmera, giro, shake, estilos de reação) nunca repete
// entre duas músicas inseridas, mesmo que a cor/vibe seja parecida.
window.echoIrisSongLoadId = 0;

// Pergunta ao backend qual é a "vibe"/cor-base dessa música, a partir do
// título. Roda toda vez que uma faixa nova é escolhida.
async function fetchSongVibe(title) {
  try {
    const response = await fetch(`${BACKEND_URL}/vibe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: title }),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const palette = await response.json();
    window.echoIrisBaseHue = palette.hue;
    console.log(`[Echo Iris] vibe de "${title}": hue ${palette.hue} (${palette.source})`);
  } catch (err) {
    // Sem cor-base, scene3d.js volta a calcular o hue só pela energia ao
    // vivo — o visual continua funcionando, só perde a identidade por faixa.
    window.echoIrisBaseHue = null;
    console.warn('[Echo Iris] não consegui buscar a vibe da música, seguindo sem cor-base:', err.message);
  }
}

// Transforma o nome do arquivo num título mais legível pra mandar pro /vibe
// ("minha-musica_favorita.mp3" -> "minha musica favorita").
function titleFromFilename(filename) {
  return filename.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim();
}

// Navegador só deixa criar o AudioContext depois que o usuário clica em algo
// (senão qualquer site poderia tocar som sozinho, seria um inferno).
// Por isso monto tudo isso só quando aperta play, e não no carregamento da página.
function setupAudioGraph() {
  if (audioCtx) return; // já tá montado, não precisa de novo

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  // fftSize maior = mais resolução de frequência. Com 256 (o valor antigo),
  // cada "bin" cobria uma faixa larga demais, misturando grave de verdade
  // com médio-grave — a detecção de batida ficava borrada. Com 2048, cada
  // bin cobre só ~23Hz, o suficiente pra isolar o grave (kick/808) do resto.
  analyser.fftSize = 2048;

  source = audioCtx.createMediaElementSource(audioEl);
  source.connect(analyser);
  analyser.connect(audioCtx.destination);

  freqData = new Uint8Array(analyser.frequencyBinCount);

  console.log('[Echo Iris] audio graph pronto, bins:', analyser.frequencyBinCount);
}

// Pega o array cru de frequências e separa em grave/médio/agudo + volume geral.
// Tudo normalizado entre 0 e 1 pra ficar fácil de usar no visual depois.
//
// As faixas usam Hz de verdade (não uma fração arbitrária do array de bins)
// — grave = ~20-150Hz, onde vive o corpo de um kick/808; médio = 150-2000Hz;
// agudo = o resto. Antes a divisão era só "os primeiros 15% dos bins", que
// com fftSize baixo acabava indo bem além do grave de verdade.
function getAudioData() {
  if (!analyser) {
    return { bass: 0, mid: 0, treble: 0, volume: 0 };
  }

  analyser.getByteFrequencyData(freqData);

  const len = freqData.length;
  const nyquist = audioCtx.sampleRate / 2;
  const hzPerBin = nyquist / len;

  const bassEnd = Math.min(len - 1, Math.max(1, Math.round(150 / hzPerBin)));
  const midEnd = Math.min(len, Math.max(bassEnd + 1, Math.round(2000 / hzPerBin)));

  const avg = (start, end) => {
    let sum = 0;
    for (let i = start; i < end; i++) sum += freqData[i];
    return sum / (end - start) / 255;
  };

  const bass = avg(0, bassEnd);
  const mid = avg(bassEnd, midEnd);
  const treble = avg(midEnd, len);
  const volume = avg(0, len);

  return { bass, mid, treble, volume };
}

// Roda em loop e atualiza os números na tela — só pra eu conseguir ver
// ao vivo que os dados tão mesmo variando conforme a música toca.
let metersLoopStarted = false;

function updateMeters() {
  const { bass, mid, treble, volume } = getAudioData();

  valBass.textContent = bass.toFixed(2);
  valMid.textContent = mid.toFixed(2);
  valTreble.textContent = treble.toFixed(2);
  valVolume.textContent = volume.toFixed(2);

  requestAnimationFrame(updateMeters);
}

// ---- Botões e input de arquivo ----

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  audioEl.src = url;
  playBtn.disabled = false;
  pauseBtn.disabled = false;

  window.echoIrisSongLoadId++;
  fetchSongVibe(titleFromFilename(file.name));
});

playBtn.addEventListener('click', () => {
  audioEl.play();
});

// Centralizado aqui: não importa se o play veio do botão, do teclado ou dos
// controles nativos do <audio> — sempre que a música realmente começa a
// tocar, garante que o AudioContext/analyser estão montados e o loop de
// leitura dos dados está rodando. Isso evita o cenário em que o visual
// fica "morto" (sem reagir a nada) por causa da análise de áudio nunca
// ter sido conectada.
audioEl.addEventListener('play', async () => {
  setupAudioGraph();

  // Às vezes o navegador deixa o contexto suspenso até o primeiro clique real.
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  if (!metersLoopStarted) {
    metersLoopStarted = true;
    updateMeters();
  }
});

pauseBtn.addEventListener('click', () => {
  audioEl.pause();
});

// Busca a vibe da faixa padrão (a que já vem carregada no <audio>) assim
// que a página abre, pra já começar com a cor certa em vez do fallback fixo.
window.echoIrisSongLoadId++;
fetchSongVibe(titleFromFilename(audioEl.src.split('/').pop()));