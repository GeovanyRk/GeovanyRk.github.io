'use strict';

// Interpreta la respuesta de texto de la recompensa. Un valor no reconocido
// queda pendiente de revisión; nunca se elige un juego por defecto.
function parseGameInput(value) {
  if (typeof value !== 'string' || value.length > 80) return null;
  const normalized = value.normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, ' ');
  if (normalized === 'fortnite' || normalized === 'fn') return 'fortnite';
  if (['overwatch', 'overwatch 2', 'overwatch2', 'ow', 'ow2'].includes(normalized)) return 'overwatch';
  return null;
}

module.exports = { parseGameInput };
