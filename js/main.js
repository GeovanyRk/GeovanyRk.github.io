// ===== CONFIG =====
const TWITCH_CLIENT_ID = '3spb0xbi38qc8ng1zwcoz5081lp524';
const BROADCASTER_LOGIN = 'geovannyrk';
const BOSS_SERVER = 'http://localhost:3000'; // Tu servidor Ramattra local

// ===== TWITCH STATUS =====
async function fetchTwitchStatus() {
  try {
    // Obtener app token
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        client_secret: '557parr27ogbsx4coajz40nnslrhi7',
        grant_type: 'client_credentials'
      })
    });
    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;

    // Obtener stream info
    const streamRes = await fetch(`https://api.twitch.tv/helix/streams?user_login=${BROADCASTER_LOGIN}`, {
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': 'Bearer ' + token
      }
    });
    const streamData = await streamRes.json();
    const stream = streamData.data[0];

    const dot = document.querySelector('.live-dot');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const liveLabel = document.getElementById('live-label');
    const gameEl = document.getElementById('stream-game');
    const viewersEl = document.getElementById('stream-viewers');

    if (stream) {
      // EN VIVO
      dot.classList.add('live');
      statusDot.classList.add('live');
      statusText.textContent = 'En vivo ahora';
      liveLabel.textContent = 'En vivo ahora';
      gameEl.textContent = '🎮 ' + stream.game_name;
      viewersEl.textContent = '👥 ' + stream.viewer_count.toLocaleString() + ' viewers';
    } else {
      // OFFLINE
      dot.classList.add('offline');
      statusDot.style.background = '#6b6b80';
      statusText.textContent = 'Sin conexión';
      liveLabel.textContent = 'Fuera de línea';
      gameEl.textContent = 'Próximo stream a las 7:00 PM';
      viewersEl.textContent = '';
    }
  } catch (err) {
    console.log('No se pudo obtener estado de Twitch:', err.message);
    document.getElementById('live-label').textContent = 'geovannyrk';
    document.getElementById('status-text').textContent = 'Ver en Twitch';
  }
}

// ===== BOSS HP =====
async function fetchBossHP() {
  try {
    const res = await fetch(BOSS_SERVER + '/');
    // El servidor ramattra responde HTML en /, necesitamos un endpoint /status
    // Intentar WebSocket como fallback visual
    connectBossWebSocket();
  } catch (err) {
    // Servidor local no disponible (página vista desde fuera del PC)
    updateBossDisplay(500000, 500000);
    document.getElementById('boss-offline').textContent =
      'El boss bar está activo solo durante el stream en vivo.';
  }
}

function connectBossWebSocket() {
  try {
    const ws = new WebSocket('ws://localhost:3000');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'hp_update' || data.type === 'damage' || data.type === 'heal' || data.type === 'reset') {
        updateBossDisplay(data.hp, data.maxHp);
      }
      if (data.type === 'boss_dead') {
        updateBossDisplay(0, 500000);
        document.getElementById('boss-phase').textContent = '💀 DERROTADO';
        document.getElementById('boss-phase').style.color = '#ff4444';
      }
    };
    ws.onopen = () => {
      document.getElementById('boss-offline').textContent = '✅ Boss conectado en tiempo real.';
    };
    ws.onerror = () => {
      document.getElementById('boss-offline').textContent =
        'El boss bar está activo solo durante el stream en vivo.';
    };
  } catch (e) {
    document.getElementById('boss-offline').textContent =
      'El boss bar está activo solo durante el stream en vivo.';
  }
}

function updateBossDisplay(hp, maxHp) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  document.getElementById('boss-bar').style.width = pct + '%';
  document.getElementById('boss-hp-current').textContent = hp.toLocaleString();
  document.getElementById('boss-percent').textContent = Math.round(pct) + '%';

  // Cambiar color según HP
  const bar = document.getElementById('boss-bar');
  if (pct > 50) {
    bar.style.background = 'linear-gradient(90deg, #ff4444, #ff8c00)';
  } else if (pct > 25) {
    bar.style.background = 'linear-gradient(90deg, #ff4444, #ff6600)';
  } else {
    bar.style.background = 'linear-gradient(90deg, #cc0000, #ff4444)';
    document.getElementById('boss-phase').textContent = 'Fase 2 — ¡HP crítico!';
  }

  // Fase
  if (hp <= 0) {
    document.getElementById('boss-phase').textContent = '💀 DERROTADO';
  } else if (pct <= 50) {
    document.getElementById('boss-phase').textContent = 'Fase 2';
  } else {
    document.getElementById('boss-phase').textContent = 'Fase 1';
  }
}

// ===== COPY CODE =====
function copyCode() {
  navigator.clipboard.writeText('SORTEOSRK').then(() => {
    showToast();
    document.getElementById('copy-arrow').textContent = '✓';
    setTimeout(() => { document.getElementById('copy-arrow').textContent = '→'; }, 2000);
  });
}

function showToast() {
  const toast = document.getElementById('toast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  fetchTwitchStatus();
  fetchBossHP();
  // Actualizar estado de Twitch cada 2 minutos
  setInterval(fetchTwitchStatus, 120000);
});
