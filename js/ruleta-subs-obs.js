'use strict';

if (new URLSearchParams(location.search).get('demo') !== '1') {
  const endpoint = 'https://geoarmy.duckdns.org/api/ruleta-subs/obs';

  async function actualizarRuleta() {
    try {
      const response = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (response.ok) {
        const eventos = await response.json();
        if (Array.isArray(eventos)) {
          for (const evento of eventos) window.GeoArmyRuletaOBS.showConfirmed(evento);
        }
      }
    } catch {
      // Mantener transparente la fuente si el servicio aún no está disponible.
    } finally {
      setTimeout(actualizarRuleta, 1500);
    }
  }

  actualizarRuleta();
}
