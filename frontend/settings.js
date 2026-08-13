// Echo Iris — configurações personalizáveis do visual.
// window.echoIrisSettings é lido pelo scene3d.js A CADA FRAME (não só na
// carga da página), então mexer num slider aqui reflete na cena na hora,
// sem precisar recarregar nada. Persistido em localStorage pra sobreviver
// entre sessões.

const SETTINGS_STORAGE_KEY = 'echoIrisSettings';

const DEFAULT_SETTINGS = {
  speed: 1,          // multiplicador de velocidade do warp field (0.5x - 2x)
  beatIntensity: 1,  // multiplicador de shake/zoom-punch/flash na batida (0.3x - 2x)
  smokeAmount: 1,     // multiplicador de opacidade/tamanho da fumaça (0x - 1.5x)
  vibeBalance: 0.75,  // 0-1: quanto a cor-base (vibe) da música domina sobre a energia ao vivo
  bloom: true,        // brilho (bloom) ligado/desligado
  cameraShake: true,  // shake de câmera na batida ligado/desligado — desligar ajuda quem
                       // é sensível a movimento (enxaqueca, vestibular)
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    // Mescla com o padrão (não só o que veio salvo) — assim, se uma versão
    // futura adicionar uma configuração nova, quem já tinha configurações
    // salvas de uma versão antiga não fica com "undefined" nela.
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (err) {
    console.warn('[Echo Iris] configurações salvas inválidas, usando padrão:', err.message);
    return { ...DEFAULT_SETTINGS };
  }
}

// Global lido pelo scene3d.js — existe assim que este script carrega,
// então precisa vir ANTES de scene3d.js no index.html.
window.echoIrisSettings = loadSettings();

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(window.echoIrisSettings));
  } catch (err) {
    // Ex.: modo privado/anônimo bloqueando localStorage — a cena continua
    // funcionando normalmente, só não persiste entre sessões.
    console.warn('[Echo Iris] não consegui salvar configurações (localStorage indisponível):', err.message);
  }
}

// Liga cada input da UI ao valor correspondente em window.echoIrisSettings,
// nos dois sentidos: aplica o valor salvo no controle ao carregar, e
// atualiza a configuração (+ label + localStorage) quando o usuário mexe.
function bindRange(id, key, labelId, formatter) {
  const input = document.getElementById(id);
  const label = labelId ? document.getElementById(labelId) : null;
  if (!input) return;

  const apply = (value) => {
    input.value = value;
    if (label) label.textContent = formatter ? formatter(value) : String(value);
  };

  apply(window.echoIrisSettings[key]);

  input.addEventListener('input', () => {
    const value = parseFloat(input.value);
    window.echoIrisSettings[key] = value;
    if (label) label.textContent = formatter ? formatter(value) : String(value);
    saveSettings();
  });
}

function bindToggle(id, key) {
  const input = document.getElementById(id);
  if (!input) return;

  input.checked = window.echoIrisSettings[key];
  input.addEventListener('change', () => {
    window.echoIrisSettings[key] = input.checked;
    saveSettings();
  });
}

function bindSettingsUI() {
  bindRange('set-speed', 'speed', 'set-speed-val', (v) => `${v.toFixed(1)}x`);
  bindRange('set-beat', 'beatIntensity', 'set-beat-val', (v) => `${v.toFixed(1)}x`);
  bindRange('set-smoke', 'smokeAmount', 'set-smoke-val', (v) => `${v.toFixed(1)}x`);
  bindRange('set-vibe', 'vibeBalance', 'set-vibe-val', (v) => `${Math.round(v * 100)}%`);
  bindToggle('set-bloom', 'bloom');
  bindToggle('set-shake', 'cameraShake');

  const resetBtn = document.getElementById('set-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      window.echoIrisSettings = { ...DEFAULT_SETTINGS };
      saveSettings();
      bindSettingsUI(); // reaplica os valores padrão em todos os controles
    });
  }
}

// Este script é carregado no fim do <body> (depois do HTML dos controles
// já existir no DOM), igual script.js e chat.js — não precisa esperar
// DOMContentLoaded.
if (!document.getElementById('set-speed')) {
  console.warn('[Echo Iris] settings.js não encontrou os controles de personalização no HTML — confirme os IDs em index.html.');
} else {
  bindSettingsUI();
  console.log('[Echo Iris] configurações carregadas:', window.echoIrisSettings);
}