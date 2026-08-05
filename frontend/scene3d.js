// Echo Iris — parte visual (Three.js).
// Efeito de "viagem no espaço" (starfield warp), tipo a animação de fundo
// do GitHub. Cada estrela é um risco (linha) que se move na direção da
// câmera; a perspectiva do Three.js já faz o resto — os riscos ficam mais
// compridos perto da borda e mais curtos no centro, naturalmente.

const canvas = document.getElementById('scene-canvas');

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  90,
  canvas.clientWidth / canvas.clientHeight,
  0.01,
  60
);
camera.position.set(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

// ---- Config do campo de estrelas ----
const STAR_COUNT = 900;
const SPREAD = 6;        // o quão espalhadas as estrelas ficam no eixo x/y
const FAR_DEPTH = 30;     // distância inicial (bem longe, "atrás" da câmera olhando pra -z)
const TRAIL_LENGTH = 0.6; // comprimento do rastro de cada estrela
const BASE_SPEED = 6;     // velocidade "de repouso", sem música tocando

// Cada estrela guarda x, y fixos e um z que avança com o tempo.
const stars = [];
for (let i = 0; i < STAR_COUNT; i++) {
  stars.push({
    x: (Math.random() - 0.5) * SPREAD,
    y: (Math.random() - 0.5) * SPREAD,
    z: -Math.random() * FAR_DEPTH, // espalha o início, senão todas reiniciam juntas
  });
}

// Cada estrela = 1 segmento de linha = 2 vértices (ponta da frente e rastro atrás)
const positions = new Float32Array(STAR_COUNT * 2 * 3);
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

const material = new THREE.LineBasicMaterial({
  color: 0xd8d0ff, // branco levemente lilás, combina com o roxo da marca
  transparent: true,
  opacity: 0.85,
  blending: THREE.AdditiveBlending, // dá aquele brilho de "risco de luz"
});

const starField = new THREE.LineSegments(geometry, material);
scene.add(starField);

// ---- Suavização (lerp) — sem isso qualquer pico de volume dá um solavanco feio ----
const smoothed = { bass: 0, mid: 0, treble: 0, volume: 0 };
const LERP_SPEED = 0.15;

function lerp(current, target, speed) {
  return current + (target - current) * speed;
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const { bass, mid, treble, volume } = getAudioData();

  smoothed.bass = lerp(smoothed.bass, bass, LERP_SPEED);
  smoothed.mid = lerp(smoothed.mid, mid, LERP_SPEED);
  smoothed.treble = lerp(smoothed.treble, treble, LERP_SPEED);
  smoothed.volume = lerp(smoothed.volume, volume, LERP_SPEED);

  // Grave (bass) dá o "chute" de velocidade nas batidas fortes — é o que
  // faz sentir que a viagem acelera junto com a música.
  const speed = BASE_SPEED * (1 + smoothed.volume * 2 + smoothed.bass * 3);

  for (let i = 0; i < STAR_COUNT; i++) {
    const star = stars[i];
    star.z += speed * delta;

    // Passou da câmera — manda de volta lá pro fundo, com posição nova.
    if (star.z > 0) {
      star.z = -FAR_DEPTH;
      star.x = (Math.random() - 0.5) * SPREAD;
      star.y = (Math.random() - 0.5) * SPREAD;
    }

    const base = i * 6;
    // ponta de trás (rastro)
    positions[base] = star.x;
    positions[base + 1] = star.y;
    positions[base + 2] = star.z - TRAIL_LENGTH;
    // ponta da frente (mais perto da câmera)
    positions[base + 3] = star.x;
    positions[base + 4] = star.y;
    positions[base + 5] = star.z;
  }

  geometry.attributes.position.needsUpdate = true;

  // Agudo (treble) empurra a cor pra um tom mais saturado/roxo nos momentos
  // "brilhantes" da música — sutil, não é pra virar arco-íris.
  const hue = 0.72 - smoothed.treble * 0.08; // fica entre roxo e azul-lilás
  material.color.setHSL(hue, 0.5, 0.75 + smoothed.volume * 0.15);

  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
});