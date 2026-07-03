// ===== CONFIG =====
const TWITCH_CLIENT_ID = '3spb0xbi38qc8ng1zwcoz5081lp524';
const BROADCASTER_LOGIN = 'geovannyrk';

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
  // Actualizar estado de Twitch cada 2 minutos
  setInterval(fetchTwitchStatus, 120000);
});
