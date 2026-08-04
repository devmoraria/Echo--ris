// Echo Iris — parte visual (Three.js).
// Precisa do THREE carregado antes (via CDN no index.html) e da
// getAudioData() do script.js, que roda no mesmo escopo global.

const canvas = document.getElementById('scene-canvas');

// ---- Cena básica: câmera, luz, renderer ----
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60,
  canvas.clientWidth / canvas.clientHeight,
  0.1,
  1000
);
camera.position.z = 4;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

// luz ambiente pra não ficar tudo preto nas sombras + uma direcional pra dar volume
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(3, 4, 5);
scene.add(dirLight);

// ---- A esfera que vai reagir a tudo ----
const geometry = new THREE.SphereGeometry(1, 48, 48);
const material = new THREE.MeshStandardMaterial({
  roughness: 0.35,
  metalness: 0.2,
});
const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

// ---- Cor variando com o tempo (hardcoded por enquanto) ----
// Isso aqui não tem nada a ver com a música ainda — é só pra provar que o
// pipeline de cor funciona antes de plugar a IA de verdade na Fase 2.
// Fica passeando por um arco-íris devagar usando HSL.
const clock = new THREE.Clock();
const COLOR_CYCLE_SPEED = 0.05; // quanto maior, mais rápido passeia pelas cores

function updateColor() {
  const t = clock.getElapsedTime();
  const hue = (t * COLOR_CYCLE_SPEED) % 1;
  material.color.setHSL(hue, 0.65, 0.55);
}

// ---- Suavização (lerp) pra não tremer feito surto ----
// Sem isso, qualquer pico de volume faz o objeto pular de forma bem feia.
// Aqui a gente vai "andando devagar" na direção do valor real a cada frame.
const smoothed = { bass: 0, mid: 0, treble: 0, volume: 0 };
const LERP_SPEED = 0.15;

function lerp(current, target, speed) {
  return current + (target - current) * speed;
}

// ---- Loop principal ----
function animate() {
  requestAnimationFrame(animate);

  const { bass, mid, treble, volume } = getAudioData();

  smoothed.bass = lerp(smoothed.bass, bass, LERP_SPEED);
  smoothed.mid = lerp(smoothed.mid, mid, LERP_SPEED);
  smoothed.treble = lerp(smoothed.treble, treble, LERP_SPEED);
  smoothed.volume = lerp(smoothed.volume, volume, LERP_SPEED);

  // volume manda na escala — quanto mais alto, mais a esfera "respira"
  const scale = 1 + smoothed.volume * 0.8;
  sphere.scale.set(scale, scale, scale);

  // médio/agudo mandam na rotação, dá um efeito de "dança"
  sphere.rotation.y += 0.01 + smoothed.treble * 0.05;
  sphere.rotation.x += 0.005 + smoothed.mid * 0.03;

  updateColor();

  renderer.render(scene, camera);
}

animate();

// ---- Redimensiona junto com a janela, senão distorce tudo ----
window.addEventListener('resize', () => {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
});