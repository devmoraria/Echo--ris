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

let audioCtx = null;
let analyser = null;
let source = null;
let freqData = null;

// Navegador só deixa criar o AudioContext depois que o usuário clica em algo
// (senão qualquer site poderia tocar som sozinho, seria um inferno).
// Por isso monto tudo isso só quando aperta play, e não no carregamento da página.
function setupAudioGraph() {
  if (audioCtx) return; // já tá montado, não precisa de novo

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256; // 128 bins de frequência, dá conta do recado

  source = audioCtx.createMediaElementSource(audioEl);
  source.connect(analyser);
  analyser.connect(audioCtx.destination);

  freqData = new Uint8Array(analyser.frequencyBinCount);

  console.log('[Echo Iris] audio graph pronto, bins:', analyser.frequencyBinCount);
}

// Pega o array cru de frequências e separa em grave/médio/agudo + volume geral.
// Tudo normalizado entre 0 e 1 pra ficar fácil de usar no visual depois.
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
});

playBtn.addEventListener('click', async () => {
  setupAudioGraph();

  // Às vezes o navegador deixa o contexto suspenso até o primeiro clique real.
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  audioEl.play();
  updateMeters();
});

pauseBtn.addEventListener('click', () => {
  audioEl.pause();
});