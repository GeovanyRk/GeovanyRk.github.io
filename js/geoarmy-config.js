// ===== Config compartida de Supabase para todo el sitio (Fase 1 — Mi Geo Army) =====
// Pega aquí, UNA SOLA VEZ, los valores reales de tu proyecto de Supabase
// (Project Settings -> API -> Project URL / anon public key).
// Estos dos valores son PÚBLICOS por diseño (protegidos por RLS en el propio
// schema.sql) — es normal y seguro que vivan en el código del sitio. Lo que
// NUNCA va aquí es la Service Role Key ni el Client Secret de Twitch.
//
// Este archivo se carga ANTES de js/geoarmy-account.js en cada página
// (index.html, mi-geoarmy.html, auth/callback/index.html), así que solo
// hay que editar los valores en este único lugar.
window.GEOARMY_SUPABASE_URL = 'https://zhegmjppvpgvrnhlevsc.supabase.co';
window.GEOARMY_SUPABASE_ANON_KEY = 'sb_publishable_NOs6VaVgUOQiib5r0GJQiQ_ZoWt1_qb';

// ===== Carpeta base de ESTE despliegue (con barra final) =====
// "/" si esto es el sitio principal en la raíz del dominio.
// "/geoarmy-v2/" mientras esto sea la beta publicada en geoarmy.tv/geoarmy-v2/.
// Todas las rutas del sistema de cuenta (login, callback, logout, "volver al
// inicio") se calculan a partir de este valor — NO se adivinan a partir de la
// URL del navegador, porque algunos hosts quitan la barra final de una URL de
// carpeta y eso hacía que el login mandara al usuario a la raíz de
// producción en vez de quedarse en esta beta. Si mueves esto a otra carpeta
// o lo promueves a producción, este es el ÚNICO lugar que hay que cambiar.
window.GEOARMY_SITE_BASE = '/';

// ===== Sincronización automática del perfil de Twitch =====
// Interruptor de la función js/geoarmy-profile-sync.js (llama a la Edge Function
// `sync-twitch-profile`). APAGADO por defecto: cámbialo a true SOLO cuando la
// Edge Function y el SQL de soporte ya estén instalados en Supabase; mientras
// sea false no se carga ni se ejecuta nada de la sincronización.
window.GEOARMY_PROFILE_SYNC_ENABLED = true;

// ===== Cosméticos (marco VIP violeta y plata) — SOLO PRESENTACIÓN =====
// GEOARMY_COSMETICS_ENABLED: interruptor general. false = js/geoarmy-cosmetics.js queda INERTE (no consulta nada, no pinta,
//   no carga estilos ni scripts). true = con sesión iniciada consulta la RPC geo_vip_my_appearance_v1() (barra y Mi Geo Army)
//   y el ranking usa la vista geo_vip_ranking_v1; si algo falla (error, tiempo, respuesta inválida) se ve el usuario normal
//   y el ranking de siempre (xp_leaderboard). Solo reconoce el código vip_violet_silver.
// GEOARMY_COSMETICS_SIMULATION: SOLO PARA PRUEBAS EN UN EQUIPO LOCAL (carga js/geoarmy-cosmetics-sim.js, que inventa usuarios
//   VIP de ejemplo y sustituye al servidor). Debe quedar en false en lo que se publica; además se ignora sola fuera de localhost.
window.GEOARMY_COSMETICS_ENABLED = false;
window.GEOARMY_COSMETICS_SIMULATION = false;
