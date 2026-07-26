// ============================================================
//  ganadores.js — Registro de ganadores + SALDOS para GeoArmyBot
//  Comandos: /ganador /ganadores /entregar /borrarganador
//            /saldo /saldos /gastar /editar
//  Guarda en ganadores.json, postea en #ganadores y lo sube a la web (GitHub).
// ============================================================

const fs = require('fs');
const path = require('path');
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

// ====================== CONFIG — EDITA ESTO ======================
const GUILD_ID        = '1510362208037507142';        // ID de tu servidor de Discord
const CANAL_GANADORES = '1516979272512835604';        // ID del canal #ganadores

// --- Sincronización con tu web ---
const GITHUB_TOKEN = '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';   // ⚠️ regenera el viejo y pega el nuevo
const GITHUB_OWNER = 'GeovanyRk';
const GITHUB_REPO  = 'GeovanyRk.github.io';
const GITHUB_FILE  = 'ganadores.json';
// ================================================================

const DATA_FILE = path.join(__dirname, 'ganadores.json');

// ---------- Monedas ----------
const MONEDAS = {
  pavos:   { nombre: 'Pavos',     emoji: '🟣' },
  owcoins: { nombre: 'OW Coins',  emoji: '🪙' },
  usd:     { nombre: 'Dólares',   emoji: '💵' },
};
const OPCIONES_MONEDA = [
  { name: '🟣 Pavos (Fortnite)', value: 'pavos' },
  { name: '🪙 OW Coins',         value: 'owcoins' },
  { name: '💵 Dólares (USD)',    value: 'usd' },
];
function fmt(cant, moneda) {
  const m = MONEDAS[moneda];
  if (!m) return `${cant}`;
  return moneda === 'usd' ? `${m.emoji} $${cant}` : `${m.emoji} ${cant.toLocaleString()} ${m.nombre}`;
}

// ---------- helpers de datos ----------
function cargar() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!d.ganadores) d.ganadores = [];
    if (!d.gastos)    d.gastos = [];      // registro de lo que ya gastaron
    return d;
  } catch { return { ganadores: [], gastos: [] }; }
}
function guardar(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}
function nuevoId(lista) {
  return lista.length ? Math.max(...lista.map(g => g.id)) + 1 : 1;
}
// Normaliza nombres para comparar (ignora mayúsculas y espacios)
const norm = (s) => (s || '').toLowerCase().trim();

// Convierte "D/M/AAAA" (como guarda /ganador) en un objeto Date
function parseFecha(f) {
  if (!f) return null;
  const partes = String(f).split('/');
  if (partes.length !== 3) return null;
  const [d, m, y] = partes.map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// ---------- RANKING mensual de pavos ----------
// Solo cuenta premios con id > rankingDesdeId (los registrados desde que se activó el ranking)
// y cuya fecha caiga en el mes/año en curso.
function rankingPavosMes(data) {
  const ahora = new Date();
  const anoM = ahora.getFullYear();
  const mesM = ahora.getMonth();
  const desdeId = typeof data.rankingDesdeId === 'number' ? data.rankingDesdeId : 0;

  const porUsuario = new Map();
  for (const g of data.ganadores) {
    if (g.moneda !== 'pavos') continue;
    if (!(g.id > desdeId)) continue;
    const f = parseFecha(g.fecha);
    if (!f || f.getFullYear() !== anoM || f.getMonth() !== mesM) continue;

    const key = norm(g.usuario);
    if (!porUsuario.has(key)) porUsuario.set(key, { nombre: g.usuario, total: 0, premios: 0 });
    const r = porUsuario.get(key);
    r.total += (g.cantidad || 0);
    r.premios += 1;
    r.nombre = g.usuario; // conserva la última forma en que se escribió el nombre
  }
  return [...porUsuario.values()].sort((a, b) => b.total - a.total);
}

// ---------- SALDOS ----------
// Devuelve { pavos: {ganado, gastado, saldo}, owcoins: {...}, usd: {...} }
function saldoDe(data, usuario) {
  const u = norm(usuario);
  const r = {};
  for (const m of Object.keys(MONEDAS)) r[m] = { ganado: 0, gastado: 0, saldo: 0 };

  for (const g of data.ganadores) {
    if (norm(g.usuario) !== u) continue;
    if (!g.moneda || !r[g.moneda]) continue;
    r[g.moneda].ganado += (g.cantidad || 0);
  }
  for (const x of data.gastos) {
    if (norm(x.usuario) !== u) continue;
    if (!x.moneda || !r[x.moneda]) continue;
    r[x.moneda].gastado += (x.cantidad || 0);
  }
  for (const m of Object.keys(r)) r[m].saldo = r[m].ganado - r[m].gastado;
  return r;
}
// Nombre "bonito" tal como se escribió la última vez
function nombreReal(data, usuario) {
  const u = norm(usuario);
  const hit = [...data.ganadores].reverse().find(g => norm(g.usuario) === u);
  return hit ? hit.usuario : usuario;
}
function lineasSaldo(s) {
  const l = [];
  for (const [mon, v] of Object.entries(s)) {
    if (v.ganado === 0 && v.gastado === 0) continue;
    l.push(`${fmt(v.saldo, mon)}  *(ganó ${v.ganado.toLocaleString()} · gastó ${v.gastado.toLocaleString()})*`);
  }
  return l.length ? l.join('\n') : 'Sin saldo.';
}

// ---------- subir a GitHub ----------
async function subirAGitHub() {
  if (!GITHUB_TOKEN || GITHUB_TOKEN.startsWith('PEGA_AQUI')) return;
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;
  const headers = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'GeoArmyBot',
  };
  try {
    let sha;
    const get = await fetch(`${url}?t=${Date.now()}`, { headers });
    if (get.ok) sha = (await get.json()).sha;

    const contenido = Buffer.from(fs.readFileSync(DATA_FILE, 'utf8')).toString('base64');
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: 'Actualizar ganadores',
        content: contenido,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!res.ok) console.error('⚠️  GitHub:', res.status, await res.text());
  } catch (e) {
    console.error('⚠️  No se pudo subir a GitHub:', e.message);
  }
}

// ---------- definición de comandos ----------
const comandos = [
  new SlashCommandBuilder()
    .setName('ganador')
    .setDescription('Registrar un nuevo ganador')
    .addStringOption(o => o.setName('usuario').setDescription('Nombre del ganador').setRequired(true))
    .addIntegerOption(o => o.setName('cantidad').setDescription('Cantidad ganada (ej: 500)').setRequired(true).setMinValue(1))
    .addStringOption(o => o.setName('moneda').setDescription('Tipo de premio').setRequired(true).addChoices(...OPCIONES_MONEDA))
    .addStringOption(o => o.setName('evento').setDescription('Ruleta, Pity, Sorteo…').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('ganadores')
    .setDescription('Ver la lista de ganadores')
    .addStringOption(o => o.setName('filtro').setDescription('Estado a mostrar').setRequired(false)
      .addChoices(
        { name: 'Pendientes', value: 'pendientes' },
        { name: 'Entregados', value: 'entregados' },
      ))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('entregar')
    .setDescription('Marcar un premio como entregado')
    .addIntegerOption(o => o.setName('id').setDescription('ID del ganador').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('borrarganador')
    .setDescription('Eliminar un registro')
    .addIntegerOption(o => o.setName('id').setDescription('ID del ganador').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // ---------- NUEVOS ----------
  new SlashCommandBuilder()
    .setName('saldo')
    .setDescription('Ver el saldo acumulado de una persona')
    .addStringOption(o => o.setName('usuario').setDescription('Nombre del ganador').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('saldos')
    .setDescription('Ver todos los que tienen saldo disponible')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('gastar')
    .setDescription('Descontar del saldo de una persona')
    .addStringOption(o => o.setName('usuario').setDescription('Nombre del ganador').setRequired(true))
    .addIntegerOption(o => o.setName('cantidad').setDescription('Cuánto gastó (ej: 1000)').setRequired(true).setMinValue(1))
    .addStringOption(o => o.setName('moneda').setDescription('Tipo').setRequired(true).addChoices(...OPCIONES_MONEDA))
    .addStringOption(o => o.setName('concepto').setDescription('En qué lo gastó').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('editar')
    .setDescription('Corregir un registro (nombre, cantidad, moneda o evento)')
    .addIntegerOption(o => o.setName('id').setDescription('ID del registro').setRequired(true))
    .addStringOption(o => o.setName('usuario').setDescription('Nuevo nombre').setRequired(false))
    .addIntegerOption(o => o.setName('cantidad').setDescription('Nueva cantidad').setRequired(false).setMinValue(1))
    .addStringOption(o => o.setName('moneda').setDescription('Nueva moneda').setRequired(false).addChoices(...OPCIONES_MONEDA))
    .addStringOption(o => o.setName('evento').setDescription('Nuevo evento').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // Público — cualquiera en el server lo puede usar
  new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Ver quién ha ganado más pavos este mes'),
].map(c => c.toJSON());

const MIS_COMANDOS = [
  'ganador', 'ganadores', 'entregar', 'borrarganador',
  'saldo', 'saldos', 'gastar', 'editar', 'ranking',
];

// ---------- setup ----------
function setupGanadores(client) {

  client.once('ready', async () => {
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      for (const c of comandos) await guild.commands.create(c);
      console.log('✅ Comandos de ganadores listos');
    } catch (e) {
      console.error('Aviso registrando comandos de ganadores:', e.message);
    }

    // Activa el ranking mensual de pavos a partir de este momento (no cuenta lo viejo)
    try {
      const data = cargar();
      if (typeof data.rankingDesdeId !== 'number') {
        data.rankingDesdeId = data.ganadores.length ? Math.max(...data.ganadores.map(g => g.id)) : 0;
        guardar(data);
        await subirAGitHub();
        console.log(`🏁 Ranking mensual de pavos activado desde el ID #${data.rankingDesdeId}`);
      }
    } catch (e) {
      console.error('Aviso activando ranking mensual:', e.message);
    }
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (!MIS_COMANDOS.includes(interaction.commandName)) return;

    const data = cargar();

    // ---- /ganador ----
    if (interaction.commandName === 'ganador') {
      const usuario  = interaction.options.getString('usuario');
      const cantidad = interaction.options.getInteger('cantidad');
      const moneda   = interaction.options.getString('moneda');
      const evento   = interaction.options.getString('evento') || 'General';
      const fecha    = new Date().toLocaleDateString('es-ES');
      const id       = nuevoId(data.ganadores);
      const premio   = fmt(cantidad, moneda).replace(/^\S+\s/, ''); // texto legible p/ la web

      data.ganadores.push({ id, usuario, premio, cantidad, moneda, evento, fecha, entregado: false });
      guardar(data);

      const s = saldoDe(data, usuario);
      await interaction.reply({
        content: `🏆 Registrado #${id} — **${usuario}** ganó ${fmt(cantidad, moneda)}\n💰 Saldo ahora: **${fmt(s[moneda].saldo, moneda)}**`,
        ephemeral: true,
      });
      await subirAGitHub();

      const embed = new EmbedBuilder()
        .setColor(0xFFD23F)
        .setTitle('🏆 ¡Nuevo ganador de la Geo Army!')
        .addFields(
          { name: '👤 Usuario', value: usuario, inline: true },
          { name: '🎁 Premio',  value: fmt(cantidad, moneda), inline: true },
          { name: '🎯 Evento',  value: evento, inline: true },
          { name: '📅 Fecha',   value: fecha,  inline: true },
          { name: '💰 Saldo acumulado', value: fmt(s[moneda].saldo, moneda), inline: true },
          { name: '📦 Estado',  value: '⏳ Pendiente de entrega', inline: true },
        )
        .setFooter({ text: `ID #${id} · Geo Army` })
        .setTimestamp();

      try {
        const canal = await client.channels.fetch(CANAL_GANADORES);
        await canal.send({ embeds: [embed] });
      } catch (e) { console.error('No pude postear en #ganadores:', e.message); }
      return;
    }

    // ---- /ganadores ----
    if (interaction.commandName === 'ganadores') {
      const f = interaction.options.getString('filtro');
      let lista = [...data.ganadores].sort((a, b) => b.id - a.id);
      if (f === 'pendientes') lista = lista.filter(g => !g.entregado);
      if (f === 'entregados') lista = lista.filter(g => g.entregado);

      if (!lista.length) {
        return interaction.reply({ content: 'No hay ganadores en esa lista todavía.', ephemeral: true });
      }
      const lineas = lista.slice(0, 25).map(g =>
        `\`#${g.id}\` ${g.entregado ? '✅' : '⏳'} **${g.usuario}** — ${g.cantidad ? fmt(g.cantidad, g.moneda) : g.premio}  *(${g.evento})*`
      ).join('\n');

      const embed = new EmbedBuilder()
        .setColor(0x9D6BFF)
        .setTitle(`📋 Ganadores ${f ? `(${f})` : ''}`)
        .setDescription(lineas)
        .setFooter({ text: `Total: ${data.ganadores.length} · ⏳ pendientes: ${data.ganadores.filter(g => !g.entregado).length}` });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ---- /entregar ----
    if (interaction.commandName === 'entregar') {
      const id = interaction.options.getInteger('id');
      const g = data.ganadores.find(x => x.id === id);
      if (!g) return interaction.reply({ content: `No encontré el ID #${id}.`, ephemeral: true });
      if (g.entregado) return interaction.reply({ content: `El #${id} (${g.usuario}) ya estaba entregado.`, ephemeral: true });

      g.entregado = true;
      guardar(data);
      await interaction.reply({ content: `✅ Premio del #${id} (${g.usuario}) marcado como entregado.`, ephemeral: true });
      await subirAGitHub();
      return;
    }

    // ---- /borrarganador ----
    if (interaction.commandName === 'borrarganador') {
      const id = interaction.options.getInteger('id');
      const i = data.ganadores.findIndex(x => x.id === id);
      if (i === -1) return interaction.reply({ content: `No encontré el ID #${id}.`, ephemeral: true });

      const [borrado] = data.ganadores.splice(i, 1);
      guardar(data);
      await interaction.reply({ content: `🗑️ Eliminado #${id} (${borrado.usuario}).`, ephemeral: true });
      await subirAGitHub();
      return;
    }

    // ---- /saldo ----
    if (interaction.commandName === 'saldo') {
      const usuario = interaction.options.getString('usuario');
      const u = norm(usuario);

      const suyos = data.ganadores.filter(g => norm(g.usuario) === u).sort((a, b) => b.id - a.id);
      const gastos = data.gastos.filter(x => norm(x.usuario) === u).sort((a, b) => b.id - a.id);

      if (!suyos.length && !gastos.length) {
        return interaction.reply({ content: `No encontré a "${usuario}" en los registros.`, ephemeral: true });
      }

      const s = saldoDe(data, usuario);
      const nombre = nombreReal(data, usuario);

      const historial = suyos.slice(0, 10).map(g =>
        `\`#${g.id}\` ${g.entregado ? '✅' : '⏳'} +${g.cantidad ? fmt(g.cantidad, g.moneda) : g.premio} *(${g.evento})*`
      ).join('\n') || '—';

      const listaGastos = gastos.slice(0, 10).map(x =>
        `\`G${x.id}\` −${fmt(x.cantidad, x.moneda)} *(${x.concepto || 'sin concepto'})* · ${x.fecha}`
      ).join('\n');

      const embed = new EmbedBuilder()
        .setColor(0x00D9FF)
        .setTitle(`💰 Saldo de ${nombre}`)
        .setDescription(lineasSaldo(s))
        .addFields({ name: '🏆 Premios ganados', value: historial.slice(0, 1000), inline: false });

      if (listaGastos) embed.addFields({ name: '🛒 Gastos', value: listaGastos.slice(0, 1000), inline: false });
      embed.setFooter({ text: `${suyos.length} premio(s) · ${gastos.length} gasto(s)` });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ---- /saldos ----
    if (interaction.commandName === 'saldos') {
      const usuarios = new Map();
      for (const g of data.ganadores) usuarios.set(norm(g.usuario), g.usuario);
      for (const x of data.gastos)    if (!usuarios.has(norm(x.usuario))) usuarios.set(norm(x.usuario), x.usuario);

      const filas = [];
      for (const [clave, nombre] of usuarios) {
        const s = saldoDe(data, clave);
        const partes = Object.entries(s)
          .filter(([, v]) => v.saldo !== 0)
          .map(([mon, v]) => fmt(v.saldo, mon));
        if (partes.length) filas.push({ nombre, texto: partes.join(' · '), total: Object.values(s).reduce((a, v) => a + v.saldo, 0) });
      }

      if (!filas.length) {
        return interaction.reply({ content: '🎉 Nadie tiene saldo pendiente. Todo gastado.', ephemeral: true });
      }
      filas.sort((a, b) => b.total - a.total);

      const embed = new EmbedBuilder()
        .setColor(0xFFD23F)
        .setTitle('💰 Saldos disponibles')
        .setDescription(filas.slice(0, 25).map(f => `**${f.nombre}** — ${f.texto}`).join('\n'))
        .setFooter({ text: `${filas.length} persona(s) con saldo` });

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ---- /gastar ----
    if (interaction.commandName === 'gastar') {
      const usuario  = interaction.options.getString('usuario');
      const cantidad = interaction.options.getInteger('cantidad');
      const moneda   = interaction.options.getString('moneda');
      const concepto = interaction.options.getString('concepto') || 'Canje';
      const u = norm(usuario);

      const existe = data.ganadores.some(g => norm(g.usuario) === u);
      if (!existe) {
        return interaction.reply({ content: `No encontré a "${usuario}" entre los ganadores.`, ephemeral: true });
      }

      const antes = saldoDe(data, usuario)[moneda].saldo;
      if (cantidad > antes) {
        return interaction.reply({
          content: `⚠️ **${nombreReal(data, usuario)}** solo tiene ${fmt(antes, moneda)} disponibles — no puede gastar ${fmt(cantidad, moneda)}.`,
          ephemeral: true,
        });
      }

      const id = nuevoId(data.gastos);
      const fecha = new Date().toLocaleDateString('es-ES');
      data.gastos.push({ id, usuario: nombreReal(data, usuario), cantidad, moneda, concepto, fecha });
      guardar(data);

      const despues = saldoDe(data, usuario)[moneda].saldo;
      await interaction.reply({
        content: `🛒 **${nombreReal(data, usuario)}** gastó ${fmt(cantidad, moneda)} *(${concepto})*\n💰 Le quedan: **${fmt(despues, moneda)}**`,
        ephemeral: true,
      });
      await subirAGitHub();
      return;
    }

    // ---- /editar ----
    if (interaction.commandName === 'editar') {
      const id = interaction.options.getInteger('id');
      const g = data.ganadores.find(x => x.id === id);
      if (!g) return interaction.reply({ content: `No encontré el ID #${id}.`, ephemeral: true });

      const nUsuario  = interaction.options.getString('usuario');
      const nCantidad = interaction.options.getInteger('cantidad');
      const nMoneda   = interaction.options.getString('moneda');
      const nEvento   = interaction.options.getString('evento');

      if (!nUsuario && !nCantidad && !nMoneda && !nEvento) {
        return interaction.reply({ content: 'No me diste nada que cambiar. Usa al menos una opción.', ephemeral: true });
      }

      const cambios = [];
      if (nUsuario)  { cambios.push(`👤 ${g.usuario} → **${nUsuario}**`);  g.usuario = nUsuario; }
      if (nCantidad) { cambios.push(`🔢 ${g.cantidad || '?'} → **${nCantidad}**`); g.cantidad = nCantidad; }
      if (nMoneda)   { cambios.push(`💱 ${g.moneda || '?'} → **${MONEDAS[nMoneda].nombre}**`); g.moneda = nMoneda; }
      if (nEvento)   { cambios.push(`🎯 ${g.evento} → **${nEvento}**`); g.evento = nEvento; }

      // Recalcula el texto legible del premio
      if (g.cantidad && g.moneda) g.premio = fmt(g.cantidad, g.moneda).replace(/^\S+\s/, '');

      guardar(data);

      const s = saldoDe(data, g.usuario);
      await interaction.reply({
        content: `✏️ **Registro #${id} actualizado**\n${cambios.join('\n')}\n\n💰 Saldo de ${g.usuario}:\n${lineasSaldo(s)}`,
        ephemeral: true,
      });
      await subirAGitHub();
      return;
    }

    // ---- /ranking ----
    if (interaction.commandName === 'ranking') {
      const lista = rankingPavosMes(data);
      const ahora = new Date();
      const tituloMes = `${MESES[ahora.getMonth()]} ${ahora.getFullYear()}`;

      if (!lista.length) {
        return interaction.reply({
          content: `🟣 Todavía nadie ha ganado pavos este mes (${tituloMes}). ¡Sé el primero!`,
        });
      }

      const medallas = ['🥇', '🥈', '🥉'];
      const lineas = lista.slice(0, 10).map((r, i) => {
        const pos = medallas[i] || `**${i + 1}.**`;
        return `${pos} **${r.nombre}** — ${fmt(r.total, 'pavos')} *(${r.premios} premio${r.premios === 1 ? '' : 's'})*`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setColor(0xFFD23F)
        .setTitle(`🏆 Ranking de Pavos — ${tituloMes}`)
        .setDescription(lineas)
        .setFooter({ text: `${lista.length} persona(s) compitiendo este mes` });

      return interaction.reply({ embeds: [embed] });
    }
  });
}

module.exports = { setupGanadores };
