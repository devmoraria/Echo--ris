// ===== Echo Iris — Fundação de Áudio (Fase 0) =====

const audioEl = document.getElementById('audio-el');
const fileInput = document.getElementById('file-input');
const playBtn = document.getElementById('play-btn');
const pauseBtn = document.getElementById('pause-btn');

const valBass = document.getElementById('val-bass');
const valMid = document.getElementById('val-mid');
const valTreble = document.getElementById('val-treble');
const valVolume = document.getElementById('val-volume');

let audioCtx = null;
let analyser = null;
let source = null;
let freqData = null;

// O AudioContext só pode ser criado depois de uma interação do usuário
// (política dos navegadores). Por isso, montamos tudo no primeiro play.
function setupAudioGraph() {
  if (audioCtx) return; // já configurado, não recria

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256; // 128 bins de frequência — suficiente pro que precisamos

  source = audioCtx.createMediaElementSource(audioEl);
  source.connect(analyser);
  analyser.connect(audioCtx.destination);

  freqData = new Uint8Array(analyser.frequencyBinCount);

  console.log('[Echo Iris] AudioContext configurado. frequencyBinCount:', analyser.frequencyBinCount);
}

// Divide o array de frequências em 3 faixas (grave/médio/agudo) e calcula volume geral.
// Retorna valores normalizados de 0 a 1, prontos pra alimentar o Three.js na Fase 1.
function getAudioData() {
  if (!analyser) {
    return { bass: 0, mid: 0, treble: 0, volume: 0 };
  }

  analyser.getByteFrequencyData(freqData);

  const len = freqData.length;
  const bassEnd = Math.floor(len * 0.15);
  const midEnd = Math.floor(len * 0.5);

  const avg = (start, end) => {
    let sum = 0;
    for (let i = start; i < end; i++) sum += freqData[i];
    return sum / (end - start) / 255; // normaliza pra 0-1
  };

  const bass = avg(0, bassEnd);
  const mid = avg(bassEnd, midEnd);
  const treble = avg(midEnd, len);
  const volume = avg(0, len);

  return { bass, mid, treble, volume };
}

// Loop de leitura contínua — vai virar o input do Three.js na Fase 1.
// Por enquanto só atualiza o mostrador numérico na tela, pra confirmar visualmente
// que os dados estão chegando de verdade.
function updateMeters() {
  const { bass, mid, treble, volume } = getAudioData();

  valBass.textContent = bass.toFixed(2);
  valMid.textContent = mid.toFixed(2);
  valTreble.textContent = treble.toFixed(2);
  valVolume.textContent = volume.toFixed(2);

  requestAnimationFrame(updateMeters);
}

// ===== Wiring da interface =====

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  audioEl.src = url;
  playBtn.disabled = false;
  pauseBtn.disabled = false;
});

playBtn.addEventListener('click', async () => {
  setupAudioGraph();

  // Se o navegador suspendeu o contexto (comum antes da 1ª interação), retoma.
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  audioEl.play();
  updateMeters();
});

pauseBtn.addEventListener('click', () => {
  audioEl.pause();
});