// Echo Iris — parte visual (Three.js).
// Warp field com cor por estrela, parallax de 2 camadas, drift de câmera
// não repetitivo, detecção de batida (grave) E de voz/palavras (médio-
// agudo), cada uma com seu próprio flash de cor, uma rotação de matiz
// autônoma, uma camada de "fumaça/gás" suave que reage à música, e
// transições com envelope (ataque/liberação) em vez de saltos bruscos
// entre os "estilos" de reação.

const canvas = document.getElementById('scene-canvas');

const scene = new THREE.Scene();

const BASE_FOV = 90;
const camera = new THREE.PerspectiveCamera(
  BASE_FOV,
  canvas.clientWidth / canvas.clientHeight,
  0.01,
  60
);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

// ---- Bloom (brilho real nas estrelas) ----
// EffectComposer/UnrealBloomPass vêm de scripts extras carregados no
// index.html — se algum deles falhar (CDN bloqueado, sem internet), THREE
// não vai ter essas classes, e a cena cai de volta pro render direto sem
// bloom, sem quebrar o resto da aplicação.
let composer = null;
try {
  if (THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass) {
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));

    const bloomPass = new THREE.UnrealBloomPass(
      new THREE.Vector2(canvas.clientWidth, canvas.clientHeight),
      0.85, // strength — intensidade do brilho
      0.55, // radius — o quanto o brilho "vaza" ao redor do ponto brilhante
      0.15  // threshold — só pixels bem claros (estrelas, flashes) brilham; a fumaça escura não
    );
    composer.addPass(bloomPass);
    console.log('[Echo Iris] bloom ativado.');
  } else {
    console.warn('[Echo Iris] módulos de bloom não encontrados, seguindo sem brilho extra.');
  }
} catch (err) {
  composer = null;
  console.warn('[Echo Iris] falha ao configurar bloom, seguindo sem brilho extra:', err.message);
}

// ---- Config ----
const STAR_COUNT = 1400;
const SPREAD = 7;
const FAR_DEPTH = 34;
const BASE_SPEED = 6;

const stars = [];
for (let i = 0; i < STAR_COUNT; i++) {
  const layer = Math.random() < 0.4 ? 0 : 1;
  stars.push({
    x: (Math.random() - 0.5) * SPREAD * (layer === 0 ? 1.6 : 1),
    y: (Math.random() - 0.5) * SPREAD * (layer === 0 ? 1.6 : 1),
    z: -Math.random() * FAR_DEPTH,
    layer,
    huePhase: Math.random() * Math.PI * 2,
    hueSpeed: 0.05 + Math.random() * 0.08,
    trail: layer === 0 ? 0.35 + Math.random() * 0.2 : 0.5 + Math.random() * 0.5,
    sparkle: 0, // brilho extra momentâneo — usado pelos "tics" (micro-batidas)
  });
}

const positions = new Float32Array(STAR_COUNT * 2 * 3);
const colors = new Float32Array(STAR_COUNT * 2 * 3);

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const material = new THREE.LineBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
});

const starField = new THREE.LineSegments(geometry, material);
scene.add(starField);

// ---- Camada de "fumaça/gás" — nuvens suaves e translúcidas que flutuam
// pelo campo, dando um respiro orgânico/lúdico entre os traços retos do
// warp field. Usa sprites (THREE.Points + textura radial gerada em canvas)
// em vez de geometria sólida, porque uma textura com borda suave é o que
// faz o efeito parecer "gás" e não "bolinha". Sempre presente em baixa
// intensidade (a cena nunca fica vazia), mas infla/acelera com a energia
// da música — assim ela reforça a mesma "respiração" que já existe no
// resto da cena, em vez de competir com ela.
function createSmokeTexture() {
  const size = 128;
  const tCanvas = document.createElement('canvas');
  tCanvas.width = size;
  tCanvas.height = size;
  const ctx = tCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(tCanvas);
}

// Cada nuvem de fumaça é um THREE.Sprite próprio (não um Points genérico) —
// é isso que permite cada uma ORBITAR seu próprio centro, GIRAR sobre si
// mesma em velocidades diferentes e RESPIRAR de tamanho de forma
// independente. Um Points único fazia tudo se mover igual/quase parado;
// sprites individuais são o que dá a sensação de "vida própria" real.
const SMOKE_COUNT = 130; // mais nuvens no campo — braços de espiral ficam mais densos/visíveis
const SMOKE_ARM_COUNT = 3; // número de "braços" da espiral que as nuvens formam
const smokeTexture = createSmokeTexture();

const smokeGroup = new THREE.Group();
scene.add(smokeGroup);

function spawnSmokeParticle(recycled, index) {
  const p = recycled || {};

  if (!p.mesh) {
    const mat = new THREE.SpriteMaterial({
      map: smokeTexture,
      transparent: true,
      depthWrite: false,
      // Blending normal (não aditivo): com ~90 sprites se sobrepondo, o
      // aditivo somava brilho de todas ao mesmo tempo e "estourava" pra
      // branco onde havia mais sobreposição — parecendo o núcleo de uma
      // galáxia em vez de fumaça colorida. Normal blending deixa cada
      // camada se misturar sem empilhar brilho, então a cor se mantém
      // visível mesmo com várias nuvens juntas.
      blending: THREE.NormalBlending,
      opacity: 0,
    });
    p.mesh = new THREE.Sprite(mat);
    smokeGroup.add(p.mesh);
  }

  const isFirstSpawn = !p.hasSpawned;
  p.hasSpawned = true;

  // Braço da espiral — fixo pra essa partícula (definido só na primeira vez
  // que ela nasce, com base no índice dela na lista). É isso que faz as
  // nuvens se organizarem em braços reconhecíveis em vez de espalhar sem
  // padrão nenhum.
  if (p.armIndex === undefined) {
    p.armIndex = (index !== undefined ? index : Math.floor(Math.random() * SMOKE_COUNT)) % SMOKE_ARM_COUNT;
  }

  // Centro em torno do qual a nuvem espirala — ele mesmo deriva devagar pra
  // cima/pros lados, como uma corrente de ar de fundo.
  p.centerX = (Math.random() - 0.5) * SPREAD * 2.4;
  p.centerY = (Math.random() - 0.5) * SPREAD * 2.0 - SPREAD * 0.25;
  p.centerZ = -Math.random() * FAR_DEPTH * 0.85 - 1.5;
  p.centerDriftX = (Math.random() - 0.5) * 0.35;
  // Sobe ou desce (sinal aleatório) de forma visível, não só um tremor —
  // antes só subia; agora parte das nuvens deriva pro lado oposto também,
  // dando mais variedade de movimento ao campo.
  p.centerDriftY = (Math.random() < 0.5 ? -1 : 1) * (0.22 + Math.random() * 0.35);
  p.centerDriftZ = 0.18 + Math.random() * 0.3;

  // Espiral: a nuvem nasce perto do centro e vai se afastando enquanto gira
  // (raio cresce com o ângulo, tipo uma espiral de Arquimedes) — é isso que
  // faz o formato de espiral aparecer AOS POUCOS ao longo da vida da
  // partícula, em vez de já nascer numa órbita pronta. p.spiralTurns
  // controla quantas voltas ela dá até chegar no raio máximo.
  p.orbitRadius = 0.9 + Math.random() * 1.6;
  p.orbitSpeed = (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.2);
  // Ângulo inicial = posição do braço + um pequeno espalhamento aleatório,
  // pra o braço ficar reconhecível mas não uma linha perfeitamente rígida.
  p.orbitPhase = (p.armIndex / SMOKE_ARM_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
  p.spiralTurns = 1 + Math.random() * 1.4;

  // Giro da própria textura (a "nuvem" roda sobre si mesma) — sentido e
  // velocidade aleatórios pra não parecer sincronizado.
  p.spin = (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.5);
  p.mesh.material.rotation = Math.random() * Math.PI * 2;

  // Leve achatamento/alongamento pra não parecer um círculo perfeito — lê
  // mais como um wisp de gás do que como uma bolinha.
  p.stretchX = 0.75 + Math.random() * 0.5;
  p.stretchY = 0.75 + Math.random() * 0.5;
  p.breathPhase = Math.random() * Math.PI * 2;
  p.breathSpeed = 0.5 + Math.random() * 0.6;

  p.baseSize = 2.4 + Math.random() * 3.6;
  p.age = 0;
  // Duração de vida variável — evita que todas as partículas nasçam/morram
  // juntas, o que quebraria a sensação de continuidade.
  p.lifespan = 7 + Math.random() * 8;
  // Faixa de variação de matiz bem mais larga que antes — cada nuvem puxa
  // pra um tom bem diferente das vizinhas, então o campo sempre parece
  // colorido/variado, em vez de todas convergirem pro mesmo branco.
  p.hueDrift = (Math.random() - 0.5) * 220;

  if (isFirstSpawn) p.age = Math.random() * p.lifespan; // fases de vida espalhadas desde o início

  return p;
}

const smokeParticles = [];
for (let i = 0; i < SMOKE_COUNT; i++) {
  smokeParticles.push(spawnSmokeParticle(null, i));
}

// ---- Curadoria extra da IA (endpoint /colors) ----
// Só empresta saturação/luminosidade/opacidade — o hue quem decide é o
// cálculo local (mais abaixo). Se falhar, cai num fallback fixo só pra
// esses três valores; a cor em si (hue) nunca depende disso.
const FALLBACK_PALETTE = { saturation: 0.6, lightness: 0.55, opacity: 0.85 };
let currentPalette = { ...FALLBACK_PALETTE };
const COLOR_FETCH_INTERVAL = 4000; // ms

async function fetchColorPalette() {
  try {
    const { bass, mid, treble, volume } = smoothed;
    const response = await fetch('http://localhost:5000/colors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bass,
        mid,
        treble,
        volume,
        base_hue: window.echoIrisBaseHue ?? null,
        // Mesmo slider que controla o hue no front (vibe vs. energia ao
        // vivo) — manda pro backend pra saturação/luminosidade seguirem a
        // mesma preferência, em vez de ficar só no hue calculado aqui.
        vibe_weight: window.echoIrisSettings?.vibeBalance ?? 0.75,
      }),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    currentPalette = await response.json();
  } catch (err) {
    console.warn('[Echo Iris] curadoria de IA indisponível, seguindo só com o cálculo local:', err.message);
    currentPalette = { ...FALLBACK_PALETTE };
  }
}

const smoothed = { bass: 0, mid: 0, treble: 0, volume: 0 };
const LERP_SPEED = 0.2;

function lerp(current, target, speed) {
  return current + (target - current) * speed;
}

// Interpola hue pelo caminho mais curto no círculo (0-360) — sem isso, ir
// de hue 350 pra hue 10 daria a volta inteira em vez do atalho de 20°.
function lerpHue(a, b, t) {
  const diff = (((b - a) % 360) + 540) % 360 - 180;
  return (a + diff * t + 360) % 360;
}

fetchColorPalette();
setInterval(fetchColorPalette, COLOR_FETCH_INTERVAL);

// ---- Cor ao vivo (psicologia das cores, calculada aqui mesmo) ----
// grave forte → vermelho/laranja (energia, intensidade)
// médio forte → verde/amarelo (equilíbrio, natureza)
// agudo forte → azul/roxo (calma, introspecção)
//
// As proporções são AMPLIFICADAS em torno da divisão neutra (1/3 pra cada
// banda) — assim uma pequena mudança no equilíbrio espectral já produz uma
// mudança de hue bem mais visível, em vez de ficar sempre preso perto da
// mesma família de cor.
function liveHueFromEnergy(bass, mid, treble) {
  const total = bass + mid + treble + 1e-6;
  const bassP = bass / total;
  const midP = mid / total;
  const trebleP = treble / total;

  const AMPLIFY = 2.4;
  const bassW = Math.max(0, 1 / 3 + (bassP - 1 / 3) * AMPLIFY);
  const midW = Math.max(0, 1 / 3 + (midP - 1 / 3) * AMPLIFY);
  const trebleW = Math.max(0, 1 / 3 + (trebleP - 1 / 3) * AMPLIFY);
  const wTotal = bassW + midW + trebleW + 1e-6;

  const hue = (bassW * 10 + midW * 140 + trebleW * 260) / wTotal;
  return ((hue % 360) + 360) % 360;
}

// Cor mostrada na tela — suavizada frame a frame (não pula bruscamente),
// mas sempre caminhando pra onde a música está mandando agora.
let displayedHue = 260;
// Tom de "flash" usado nas batidas/palavras — só muda quando um evento é detectado.
let accentHue = 260;

// Rotação de matiz autônoma: gira devagar pelo círculo inteiro de cores ao
// longo do tempo (mais rápido quando a música está mais "cheia"). Isso
// garante um leque amplo de cores mesmo em faixas com equilíbrio espectral
// parecido do início ao fim (grave sempre dominante, por exemplo) — sem
// essa rotação, a cor calculada só pela proporção instantânea podia ficar
// travada sempre na mesma família (foi o que causava o "fica muito no
// verde").
let hueRotation = 0;
const HUE_ROTATION_BASE_SPEED = 10; // graus/segundo no mínimo
const HUE_ROTATION_ENERGY_SPEED = 20; // graus/segundo extra, proporcional à energia

// ---- Detector de evento genérico (usado pra grave E pra voz/palavras) ----
// Guarda um histórico curto de energia e usa MEDIANA + MAD (desvio absoluto
// da mediana) em vez de média/desvio-padrão — assim uma ou duas amostras
// altas isoladas (a própria batida/palavra) não "contaminam" a linha de
// base, o que permite detectar eventos próximos um do outro sem que o
// primeiro atrapalhe a detecção do segundo.
function createOnsetDetector({ historySize, madMult, minEnergy, cooldown, lerpSpeed, decayPerSecond }) {
  let history = [];
  let smoothedValue = 0;
  let pulse = 0;
  let cooldownTimer = 0;

  function median(sortedArr) {
    const mid = Math.floor(sortedArr.length / 2);
    return sortedArr.length % 2 !== 0
      ? sortedArr[mid]
      : (sortedArr[mid - 1] + sortedArr[mid]) / 2;
  }

  return {
    tick(rawValue, delta) {
      smoothedValue = lerp(smoothedValue, rawValue, lerpSpeed);

      history.push(smoothedValue);
      if (history.length > historySize) history.shift();

      const sorted = [...history].sort((a, b) => a - b);
      const med = median(sorted);
      const absDevs = history.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
      const mad = median(absDevs);
      const threshold = med + Math.max(0.006, mad * madMult);

      cooldownTimer -= delta;
      const isHit =
        smoothedValue > minEnergy &&
        smoothedValue > threshold &&
        history.length >= 15 &&
        cooldownTimer <= 0;

      if (isHit) {
        pulse = 1;
        cooldownTimer = cooldown;
      }
      pulse = Math.max(0, pulse - delta * decayPerSecond);

      return isHit;
    },
    get pulse() {
      return pulse;
    },
  };
}

// Grave (batida): sensível, cooldown curto pra pegar batidas próximas.
const bassDetector = createOnsetDetector({
  historySize: 50,
  madMult: 1.05,
  minEnergy: 0.02,
  cooldown: 0.09,
  lerpSpeed: 0.65,
  decayPerSecond: 7,
});

// Voz/palavras: opera na faixa médio-agudo (onde vive a fala/canto), ainda
// mais sensível que o grave — palavras costumam ter picos mais sutis que
// um kick de bateria.
const vocalDetector = createOnsetDetector({
  historySize: 50,
  madMult: 0.85,
  minEnergy: 0.015,
  cooldown: 0.07,
  lerpSpeed: 0.6,
  decayPerSecond: 8,
});

// Tics (micro-batidas): hi-hats e afins — bem mais rápidos e sutis que uma
// batida de grave. Opera direto no agudo, com cooldown bem curto (pega
// tics em sequência rápida) e decaimento rápido (o efeito é um brilho
// pontual, não um pulso grande).
const ticDetector = createOnsetDetector({
  historySize: 40,
  madMult: 0.75,
  minEnergy: 0.01,
  cooldown: 0.045,
  lerpSpeed: 0.8,
  decayPerSecond: 14,
});

let beatPulse = 0; // pulso "forte" (grave) — usado pra shake/zoom/velocidade
let colorFlashPulse = 0; // flash de cor do grave/voz, decai mais devagar (visível)
let voicePulse = 0; // flash de cor mais sutil, disparado pela voz/palavras
let ticPulse = 0; // brilho pontual e rápido, disparado pelos tics (hi-hat)
let beatIndicatorTimer = 0;
let voiceIndicatorTimer = 0;
let ticIndicatorTimer = 0;

// Mescla de formatos: cada batida/voz sorteia um "estilo" de reação — em
// vez de reagir sempre do mesmo jeito, às vezes os rastros esticam (efeito
// warp dramático), às vezes encolhem com um brilho seco (efeito punch), às
// vezes o campo ganha um giro extra (efeito espiral), às vezes a fumaça
// "explode" um pouco de tamanho. Tudo decai de volta ao normal sozinho — o
// campo infinito de estrelas nunca para ou muda de estrutura, só a REAÇÃO
// varia.
//
// trailBoost/spiralKick/smokeBoost usam um envelope de ataque+liberação
// (como um ADSR de sintetizador) em vez de saltar direto pro valor de pico:
// no evento, só o ALVO muda instantaneamente; o valor exibido caminha até
// lá suavemente (ataque) e o alvo depois relaxa de volta a zero (release).
// Isso garante que a transição ENTRE os formatos/estilos sempre pareça
// fluida, nunca um corte seco de um estado pro outro.
let trailBoost = 0; // -1 (rastros curtos) .. +1 (rastros compridos) — valor exibido
let trailBoostTarget = 0;
let spiralKick = 0;
let spiralKickTarget = 0;
let smokeBoost = 0; // infla o tamanho/brilho da fumaça num evento
let smokeBoostTarget = 0;

const ENVELOPE_ATTACK_SPEED = 9; // quão rápido o valor exibido alcança o alvo
const TRAIL_RELEASE_SPEED = 2.2; // quão rápido o alvo de trail relaxa a zero
const SPIRAL_RELEASE_SPEED = 3;
const SMOKE_RELEASE_SPEED = 1.4; // a fumaça relaxa mais devagar — reforça o clima etéreo

const valHue = document.getElementById('val-hue');
const valBeat = document.getElementById('val-beat');
const valVoice = document.getElementById('val-voice');
const valTic = document.getElementById('val-tic');

const clock = new THREE.Clock();
const tmpColor = new THREE.Color();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const t = clock.getElapsedTime();
  const { bass, mid, treble, volume } = getAudioData();

  smoothed.bass = lerp(smoothed.bass, bass, LERP_SPEED);
  smoothed.mid = lerp(smoothed.mid, mid, LERP_SPEED);
  smoothed.treble = lerp(smoothed.treble, treble, LERP_SPEED);
  smoothed.volume = lerp(smoothed.volume, volume, LERP_SPEED);

  // Energia contínua (grave pesa mais) — faz tudo reagir o tempo todo,
  // acompanhando o "corpo" da música, não só os picos de batida.
  const energy = smoothed.bass * 0.5 + smoothed.mid * 0.3 + smoothed.treble * 0.2;
  // Faixa que carrega mais a voz/palavras (médio + agudo)
  const vocalEnergy = mid * 0.55 + treble * 0.45;

  // ---- Eventos: batida (grave), voz/palavras (médio-agudo) e tics (agudo rápido) ----
  const isBeat = bassDetector.tick(bass, delta);
  const isVoiceHit = vocalDetector.tick(vocalEnergy, delta);
  const isTic = ticDetector.tick(treble, delta);
  beatPulse = bassDetector.pulse;
  voicePulse = vocalDetector.pulse;
  ticPulse = ticDetector.pulse;

  // ---- Configurações personalizáveis (settings.js) ----
  // Lidas A CADA FRAME (não só uma vez) — assim mexer num slider reflete na
  // cena na hora. Defaults aqui cobrem o caso de settings.js não ter
  // carregado (CDN falhou, etc.) — a cena nunca fica travada por isso.
  const userSettings = window.echoIrisSettings || {};
  const speedSetting = userSettings.speed ?? 1;
  const beatIntensitySetting = userSettings.beatIntensity ?? 1;
  const smokeAmountSetting = userSettings.smokeAmount ?? 1;
  const vibeBalanceSetting = userSettings.vibeBalance ?? 0.75;
  const bloomEnabled = userSettings.bloom !== false;
  const shakeEnabled = userSettings.cameraShake !== false;

  // O flash de COR decai bem mais devagar que o beatPulse — rápido demais
  // e o olho não registra que a cor mudou.
  const COLOR_FLASH_DECAY_PER_SECOND = 2.2;
  colorFlashPulse = Math.max(0, colorFlashPulse - delta * COLOR_FLASH_DECAY_PER_SECOND);

  // ---- Envelope de ataque + liberação pros "estilos" de reação ----
  // 1) o ALVO relaxa devagar de volta a zero (release)
  trailBoostTarget = lerp(trailBoostTarget, 0, Math.min(1, delta * TRAIL_RELEASE_SPEED));
  spiralKickTarget = Math.max(0, spiralKickTarget - delta * SPIRAL_RELEASE_SPEED);
  smokeBoostTarget = lerp(smokeBoostTarget, 0, Math.min(1, delta * SMOKE_RELEASE_SPEED));
  // 2) o valor EXIBIDO caminha suavemente até o alvo (ataque) — isso é o
  // que faz cada transição entre formatos parecer fluida em vez de um corte.
  trailBoost = lerp(trailBoost, trailBoostTarget, Math.min(1, delta * ENVELOPE_ATTACK_SPEED));
  spiralKick = lerp(spiralKick, spiralKickTarget, Math.min(1, delta * ENVELOPE_ATTACK_SPEED));
  smokeBoost = lerp(smokeBoost, smokeBoostTarget, Math.min(1, delta * ENVELOPE_ATTACK_SPEED));

  if (isBeat) {
    colorFlashPulse = 1;
    beatIndicatorTimer = 0.25;

    // Mescla de formatos: cada batida sorteia um estilo de reação diferente
    // — nunca reage sempre igual, mas nunca sai do campo infinito de
    // estrelas, só varia COMO ele reage. Os valores viram ALVOS agora
    // (não o valor final direto), então a troca de estilo em si também
    // fica suave.
    const style = Math.random();
    if (style < 0.25) {
      trailBoostTarget = 1 * beatIntensitySetting; // "estica": rastros compridos, warp dramático
    } else if (style < 0.5) {
      trailBoostTarget = -0.7 * beatIntensitySetting; // "contrai": rastros curtos, brilho seco (punch)
    } else if (style < 0.75) {
      spiralKickTarget = 1 * beatIntensitySetting; // "espiral": giro extra no campo
    } else {
      smokeBoostTarget = 1 * beatIntensitySetting; // "sopro": a fumaça infla e brilha por um instante
    }
  }
  if (isVoiceHit) {
    // Voz dá um flash mais sutil — não "rouba a cena" do grave, mas ainda
    // é bem visível, principalmente em trechos sem batida marcada.
    colorFlashPulse = Math.max(colorFlashPulse, 0.65);
    voiceIndicatorTimer = 0.25;
  }
  if (isTic) {
    ticIndicatorTimer = 0.15;
    // Brilho pontual só numa fatia aleatória das estrelas — dá um
    // "chispar" rápido e localizado, diferente do flash geral da batida.
    const SPARK_COUNT = Math.floor(STAR_COUNT * 0.06);
    for (let s = 0; s < SPARK_COUNT; s++) {
      stars[(Math.random() * STAR_COUNT) | 0].sparkle = 1;
    }
  }

  beatIndicatorTimer -= delta;
  voiceIndicatorTimer -= delta;
  ticIndicatorTimer -= delta;
  if (valBeat) valBeat.textContent = beatIndicatorTimer > 0 ? 'BATIDA!' : '-';
  if (valVoice) valVoice.textContent = voiceIndicatorTimer > 0 ? 'VOZ!' : '-';
  if (valTic) valTic.textContent = ticIndicatorTimer > 0 ? 'TIC!' : '-';

  // Velocidade: energia contínua + volume, com rajada extra na batida,
  // multiplicada pela preferência de velocidade do usuário (slider).
  const speedMultiplier = (1 + energy * 5 + smoothed.volume * 2 + beatPulse * 6) * speedSetting;

  // ---- Cor ao vivo ----
  hueRotation += delta * (HUE_ROTATION_BASE_SPEED + energy * HUE_ROTATION_ENERGY_SPEED);

  const spectralHue = liveHueFromEnergy(smoothed.bass, smoothed.mid, smoothed.treble);
  const instantHue = (spectralHue + hueRotation) % 360;
  const vibeHue = window.echoIrisBaseHue;
  const hasVibe = vibeHue !== null && vibeHue !== undefined;
  // A vibe da música (do /vibe) dita, por padrão, 75% da identidade de cor —
  // mesma proporção definida no guia de direção de arte (harmonia de vibe) —
  // mas agora é configurável pelo usuário (slider "identidade vs. energia").
  const targetHue = hasVibe ? lerpHue(instantHue, vibeHue, vibeBalanceSetting) : instantHue;
  displayedHue = lerpHue(displayedHue, targetHue, 0.15);

  // Flash de cor no evento: a cada batida OU palavra detectada, sorteia um
  // tom de "destaque" bem diferente do atual (100°-260° de distância no
  // círculo de matiz).
  if (isBeat || isVoiceHit) {
    accentHue = (displayedHue + 100 + Math.random() * 160) % 360;
  }
  const beatColorBlend = Math.min(1, colorFlashPulse * 1.2);
  const finalHue = lerpHue(displayedHue, accentHue, beatColorBlend);

  if (valHue) valHue.textContent = Math.round(finalHue);

  for (let i = 0; i < STAR_COUNT; i++) {
    const star = stars[i];
    const layerSpeed = star.layer === 0 ? 0.5 : 1.3;
    star.z += BASE_SPEED * layerSpeed * speedMultiplier * delta;

    if (star.z > 0) {
      star.z = -FAR_DEPTH;
      star.x = (Math.random() - 0.5) * SPREAD * (star.layer === 0 ? 1.6 : 1);
      star.y = (Math.random() - 0.5) * SPREAD * (star.layer === 0 ? 1.6 : 1);
    }

    const base = i * 6;
    // trailBoost varia o comprimento do rastro (mescla de formatos: "estica"
    // no estilo warp, "contrai" no estilo punch) — sempre dentro do mesmo
    // campo infinito, nunca troca a estrutura da cena. Multiplicador alto
    // de propósito (3x) — com um valor pequeno, o efeito ficava perdido no
    // meio do resto do movimento da cena.
    const effectiveTrail = Math.max(0.06, star.trail * (1 + trailBoost * 3));
    positions[base] = star.x;
    positions[base + 1] = star.y;
    positions[base + 2] = star.z - effectiveTrail;
    positions[base + 3] = star.x;
    positions[base + 4] = star.y;
    positions[base + 5] = star.z;

    // Sparkle (tic) decai rápido, estrela por estrela
    star.sparkle = Math.max(0, star.sparkle - delta * 10);

    // Cada estrela oscila em torno do hue atual no seu próprio ritmo —
    // dá vida sem perder a cor que a música está passando agora.
    const paletteHue = finalHue / 360;
    const hue = paletteHue + 0.06 * Math.sin(t * star.hueSpeed + star.huePhase);
    const baseLightness = currentPalette.lightness ?? 0.55;
    const baseSaturation = currentPalette.saturation ?? 0.6;
    // Luminosidade com teto bem abaixo de 1 — perto de 1 no HSL é sempre
    // branco, não importa a cor (foi isso que lavava a cor pra branco nas
    // batidas antes). A batida não mexe na luminosidade.
    const lightness = Math.min(
      0.7,
      baseLightness * (star.layer === 0 ? 0.75 : 1) + smoothed.treble * 0.15 + energy * 0.1
    );
    const saturation = Math.min(1, baseSaturation + smoothed.treble * 0.25 + energy * 0.1);
    tmpColor.setHSL(hue, saturation, lightness);

    // Brilho extra: batida/voz dão um flash geral; o tic soma um brilho só
    // nas estrelas "sorteadas" (star.sparkle) — formatos diferentes de
    // reação coexistindo na mesma cena.
    const beatGlow = 1 + beatPulse * 1.4 * beatIntensitySetting + voicePulse * 0.5 + star.sparkle * 1.6;

    colors[base] = tmpColor.r * 0.55 * beatGlow;
    colors[base + 1] = tmpColor.g * 0.55 * beatGlow;
    colors[base + 2] = tmpColor.b * 0.55 * beatGlow;
    colors[base + 3] = tmpColor.r * beatGlow;
    colors[base + 4] = tmpColor.g * beatGlow;
    colors[base + 5] = tmpColor.b * beatGlow;
  }

  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;

  // ---- Atualização da fumaça/gás ----
  // Cada nuvem tem um centro que deriva pra cima/pros lados (corrente de
  // ar de fundo) e ORBITA esse centro girando (não sobe reta) — mais a
  // textura girando sobre si mesma e o tamanho "respirando". É a soma
  // dessas três coisas que faz cada partícula parecer ter vida própria,
  // em vez de um ponto quase parado. Tudo reage à energia/volume da
  // música e recebe um "sopro" extra no envelope smokeBoost (evento
  // sorteado na batida).
  for (let i = 0; i < SMOKE_COUNT; i++) {
    const p = smokeParticles[i];
    p.age += delta;

    // Centro sobe/deriva de forma visível — não é um tremor sutil.
    const centerSpeed = 1 + energy * 1.4 + smoothed.volume * 0.6;
    p.centerX += p.centerDriftX * delta * centerSpeed;
    p.centerY += p.centerDriftY * delta * centerSpeed;
    p.centerZ += p.centerDriftZ * delta * (1 + energy);

    // Ciclo de vida suave: fade-in no início, fade-out no fim.
    const lifeT = p.age / p.lifespan;
    let fade;
    if (lifeT < 0.2) {
      fade = lifeT / 0.2;
    } else if (lifeT > 0.75) {
      fade = Math.max(0, (1 - lifeT) / 0.25);
    } else {
      fade = 1;
    }

    // Recicla bem antes de chegar perto da câmera (antes era 0.5, quase
    // atravessando a lente) — perto da câmera o sprite fica enorme em tela
    // e vira um borrão que toma o quadro inteiro, apagando o contraste do
    // warp field. -0.3 ainda deixa a nuvem se aproximar visivelmente, sem
    // chegar a "engolir" a cena.
    if (lifeT >= 1 || p.centerZ > -0.3) {
      spawnSmokeParticle(p);
      continue;
    }

    // Fade extra por proximidade: além do ciclo de vida (fade), a nuvem
    // também vai sumindo conforme se aproxima do limite de reciclagem —
    // assim a última fase da vida dela é "some no ar" em vez de um pop
    // repentino, e ela nunca chega perto o bastante da câmera pra virar
    // aquele borrão que cobre a tela toda.
    const NEAR_FADE_START = -1.4;
    const proximityFade = p.centerZ > NEAR_FADE_START
      ? Math.max(0, (-0.3 - p.centerZ) / (-0.3 - NEAR_FADE_START))
      : 1;

    // Espiral: em vez de uma órbita de raio fixo, o raio cresce com o
    // progresso de vida da partícula (spiralProgress 0→1) enquanto o
    // ângulo acumula p.spiralTurns voltas completas — isso é o que faz o
    // braço de espiral aparecer AOS POUCOS: a nuvem nasce perto do centro
    // e vai se desenrolando pra fora conforme envelhece, em vez de já
    // nascer numa órbita pronta. spiralProgress satura em 1 antes do fim
    // da vida (em 85%), então a nuvem já está na posição final do braço
    // durante boa parte do fade-out.
    const spiralProgress = Math.min(1, lifeT / 0.85);
    const spiralAngle = p.orbitPhase + spiralProgress * p.spiralTurns * Math.PI * 2
      + t * p.orbitSpeed * 0.2 * (1 + energy * 0.5); // giro extra suave por cima, reage um pouco à energia
    const spiralRadius = p.orbitRadius * (0.12 + spiralProgress * 0.88) * (1 + energy * 0.3);
    const x = p.centerX + Math.cos(spiralAngle) * spiralRadius;
    const y = p.centerY + Math.sin(spiralAngle) * spiralRadius * 0.6;
    const z = p.centerZ;

    p.mesh.position.set(x, y, z);

    // Giro da textura sobre o próprio eixo — dá o efeito de a nuvem estar
    // realmente girando, não só se deslocando.
    p.mesh.material.rotation += p.spin * delta * (1 + energy * 1.5);

    // "Respiração": o tamanho pulsa devagar por conta própria, além de
    // reagir à música — sem isso as nuvens ficam com tamanho estático.
    const breath = 1 + 0.18 * Math.sin(t * p.breathSpeed + p.breathPhase);
    const size = p.baseSize * (1 + energy * 0.6 + smokeBoost * 0.8) * fade * breath * smokeAmountSetting;
    p.mesh.scale.set(size * p.stretchX, size * p.stretchY, 1);

    // A cor da fumaça parte do mesmo hue final da cena (coerência visual),
    // mas cada nuvem se afasta bastante dele (hueDrift largo) — o campo
    // fica sempre colorido e variado, nunca uma massa monocromática.
    // Saturação alta + luminosidade moderada (não perto de 1) é o que
    // mantém a cor visível em vez de lavar pra branco. O quanto ela clareia
    // ao "respirar"/crescer (smokeBoost) foi reduzido um pouco — brilho
    // mais contido nesse pico, sem tirar a variação por completo.
    const smokeHue = ((finalHue + p.hueDrift) % 360 + 360) % 360 / 360;
    const smokeSaturation = Math.min(1, 0.7 + energy * 0.2);
    const smokeLightness = Math.min(0.55, 0.42 + smokeBoost * 0.08);
    tmpColor.setHSL(smokeHue, smokeSaturation, smokeLightness);
    p.mesh.material.color.copy(tmpColor);
    // Opacidade contida (blending normal, várias nuvens sobrepostas) e
    // agora também multiplicada pelo proximityFade — perto do limite de
    // reciclagem, a nuvem já está bem apagada em vez de estourada.
    p.mesh.material.opacity = Math.min(0.55, fade * proximityFade * (0.22 + smoothed.volume * 0.25 + smokeBoost * 0.25)) * smokeAmountSetting;
  }

  // Drift de câmera não repetitivo
  const driftX = Math.sin(t * 0.031) * 0.4 + Math.sin(t * 0.017) * 0.15;
  const driftY = Math.cos(t * 0.023) * 0.3 + Math.sin(t * 0.041) * 0.1;

  // Shake na batida — deslocamento aleatório por cima do drift suave,
  // proporcional ao beatPulse (só o grave dispara shake de câmera; a voz só
  // mexe na cor/brilho, pra não virar uma tremedeira constante). Zerado por
  // completo quando shakeEnabled é false (não só reduzido) — ajuda quem é
  // sensível a movimento de câmera (enxaqueca, vestibular).
  const SHAKE_MAGNITUDE = 0.18;
  const shakeAmount = shakeEnabled ? beatPulse * beatIntensitySetting : 0;
  const shakeX = (Math.random() - 0.5) * 2 * SHAKE_MAGNITUDE * shakeAmount;
  const shakeY = (Math.random() - 0.5) * 2 * SHAKE_MAGNITUDE * shakeAmount;
  const shakeRotZ = (Math.random() - 0.5) * 2 * 0.03 * shakeAmount;

  camera.position.x = driftX + shakeX;
  camera.position.y = driftY + shakeY;
  camera.rotation.z = Math.sin(t * 0.013) * 0.05 + shakeRotZ;

  // "Zoom punch" na batida — o FOV abre de repente e volta. Também respeita
  // o toggle de shake (é outra forma de movimento de câmera abrupto) e a
  // intensidade de batida configurada.
  camera.fov = BASE_FOV + (shakeEnabled ? beatPulse * 18 * beatIntensitySetting : 0);
  camera.updateProjectionMatrix();

  // Giro do campo, mais forte com o grave sustentado e com a batida, e o
  // "estilo espiral" sorteado em algumas batidas (spiralKick). O
  // coeficiente do spiralKick é bem mais alto que os outros de propósito:
  // como ele já decai rápido, um coeficiente pequeno resultava numa
  // rotação total imperceptível — o cálculo (área sob a curva de
  // decaimento) mostra que precisa de ~7 pra dar uma volta visível (~1
  // radiano) por evento.
  starField.rotation.z += (0.01 + smoothed.bass * 0.04 + beatPulse * 0.05 + spiralKick * 7) * delta;
  // A fumaça acompanha o mesmo giro do campo, só que mais devagar — reforça
  // que ela faz parte da mesma cena, sem imitar o movimento 1:1.
  smokeGroup.rotation.z += (0.004 + smoothed.bass * 0.015 + spiralKick * 2) * delta;

  if (composer && bloomEnabled) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
}

animate();

window.addEventListener('resize', () => {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  if (composer) composer.setSize(width, height);
});