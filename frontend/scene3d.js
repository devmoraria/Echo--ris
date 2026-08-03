// ===== Echo Iris — Imersão 3D (Fase 1) =====
// Depende de: THREE (via CDN, carregado antes deste arquivo no index.html)
//             getAudioData() (definido em script.js, mesmo escopo global)

const canvas = document.getElementById('scene-canvas');

// ---- Cena, câmera e renderer ----
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

// ---- Luzes ----
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(3, 4, 5);
scene.add(dirLight);

// ---- Objeto principal (esfera de teste) ----
const geometry = new THREE.SphereGeometry(1, 48, 48);
const material = new THREE.MeshStandardMaterial({
  color: 0x7c5cff, // cor inicial fixa — vira dinâmica só na Fase 2 (via IA)
  roughness: 0.35,
  metalness: 0.2,
});
const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

// ---- Suavização (lerp) pra evitar tremulação brusca ----
// Guarda valores atuais e vai interpolando em direção ao valor alvo a cada frame.
const smoothed = { bass: 0, mid: 0, treble: 0, volume: 0 };
const LERP_SPEED = 0.15;

function lerp(current, target, speed) {
  return current + (target - current) * speed;
}

// ---- Loop de animação ----
function animate() {
  requestAnimationFrame(animate);

  const { bass, mid, treble, volume } = getAudioData();

  smoothed.bass = lerp(smoothed.bass, bass, LERP_SPEED);
  smoothed.mid = lerp(smoothed.mid, mid, LERP_SPEED);
  smoothed.treble = lerp(smoothed.treble, treble, LERP_SPEED);
  smoothed.volume = lerp(smoothed.volume, volume, LERP_SPEED);

  // Escala reage ao volume geral (base 1.0, cresce até +0.8)
  const scale = 1 + smoothed.volume * 0.8;
  sphere.scale.set(scale, scale, scale);

  // Rotação reage a médio/agudo — dá sensação de "dança" sem depender só do volume
  sphere.rotation.y += 0.01 + smoothed.treble * 0.05;
  sphere.rotation.x += 0.005 + smoothed.mid * 0.03;

  renderer.render(scene, camera);
}

animate();

// ---- Responsividade ----
window.addEventListener('resize', () => {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
});