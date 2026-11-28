# GEO ARMY COMMAND CENTER — Fase 1E.2

Centro administrativo del bot de Twitch de GeoArmy.tv. Interfaz estática (HTML/CSS/JS sin build) conectada a la API real del VPS.

## Ruta de acceso

| Entorno | URL |
|---|---|
| Producción (`main`) | `https://geoarmy.tv/admin/command-center/` |
| Producción, modo DEMO (explícito) | `https://geoarmy.tv/admin/command-center/?demo=1` |
| Beta (repo de pruebas `geoarmy-v2`) | `https://geoarmy.tv/geoarmy-v2/admin/command-center/` (allí `SITE_BASE_BOOTSTRAP` es `'/geoarmy-v2/'`) |

No existe un hub administrativo en el sitio: las páginas de `admin/` (recompensas, reseñas, fulfillments, streamer-vs-viewer) son independientes y no están enlazadas desde páginas públicas. Por eso el Command Center es una página administrativa independiente (`noindex,nofollow`) y **no** añade ningún pin ni enlace público en los mundos de Geo Army.

Secciones (hash): `#/overview`, `#/commands`, `#/config`, `#/stats`, `#/audit`. Módulos futuros bloqueados (sin funciones): Geo Army Arcade, Notificaciones automáticas, Overlays OBS, Inteligencia artificial.

## Archivos

Creados (ninguno existente fue modificado):

- `admin/command-center/index.html` — armazón y cargador (único valor a cambiar al promover: `SITE_BASE_BOOTSTRAP`).
- `css/command-center.css` — estilos aislados bajo `.cc-*`.
- `js/command-center-core.js` — núcleo sin DOM: cliente API, modelo confirmado/pendiente, ETag, descripciones, disponibilidad, sondeo.
- `js/command-center-app.js` — interfaz, sesión Supabase, vistas, guardado, conflictos 412, modales.
- `js/command-center-demo.js` — servidor DEMO en memoria (solo se carga con `?demo=1`).
- `tests/command-center.test.cjs` — pruebas del núcleo (`node --test tests/command-center.test.cjs`).
- `docs/command-center.md` — este documento.

## Autenticación y seguridad

- Reutiliza la sesión Supabase del sitio: mismo `js/geoarmy-config.js`, misma copia fijada `lib/supabase.min.js` y mismo almacenamiento → no pide un segundo inicio de sesión. Si no hay sesión, ofrece «Continuar con Twitch» con el mismo flujo/callback (`auth/callback/`, clave `geoarmy_return_to_v1`).
- Usa **solo** el `access_token` de Supabase Auth, leído en el momento de cada solicitud con `getSession()`. No usa `provider_token` de Twitch, no guarda ni imprime tokens.
- **No hay comprobaciones locales de rol**: la autorización la decide el backend. Un 403 muestra «Acceso denegado» y un 401 «Sesión vencida» (antes se intenta una renovación de la sesión existente).
- El token solo se envía a `https://geoarmy.duckdns.org/api/bot-admin/v1` (`credentials: omit`, `redirect: error`, sin referrer).
- Al cerrar sesión o cambiar de cuenta: se cancelan las solicitudes pendientes (AbortController), se borran datos, cambios pendientes, avisos y DOM administrativo.
- Todo texto de la API se inserta con `textContent`; las únicas inserciones de HTML son los SVG constantes internos.

## Persistencia y concurrencia

- Dos estados separados: **configuración confirmada** (última respuesta real del servidor + ETag) y **cambios pendientes** (borrador local). Barra fija «N cambios pendientes» con Descartar / Revisar y guardar.
- Guardar abre un modal con cada cambio («Antes → Ahora») y envía `PATCH /config` con `Authorization`, `Content-Type: application/json` e `If-Match` (ETag **con comillas**) y **solo los campos modificados**.
- El ETag usado es el de la configuración que el administrador estaba editando (el de su último `GET /config`). Reobtenerlo justo antes de enviar permitiría sobrescribir cambios ajenos sin avisar.
- No se asume éxito hasta recibir HTTP 200; entonces la UI adopta la respuesta real (config + ETag). Si la respuesta no trae configuración/ETag, se vuelve a pedir `GET /config`.
- Error ≠ 200: se mantiene la configuración confirmada, los cambios siguen pendientes y se explica el error (con el código de la API).
- **412 `stale_config`**: se recupera `GET /config`, se reaplica el borrador sobre la versión nueva y se abre un modal con conflictos (campos que ambos cambiaron), cambios ajenos y cambios ya aplicados. Nunca se reenvía solo: el administrador revisa y guarda de nuevo, o descarta.
- **PUBLIC** exige casilla de confirmación + escribir `PUBLIC` exacto. No se activa en desarrollo ni en pruebas.
- Los cooldowns se validan con `cooldownBounds` real recibido. `ownerUserId`, `allowedUserIds` y `cooldownBounds` son de solo lectura.
- Si el navegador no puede leer `ETag` (CORS), la edición se bloquea con una explicación.

## Datos en vivo

- `GET /status` y `GET /stats` cada 30 s con la pestaña visible: ciclo encadenado (el siguiente se programa al terminar el anterior ⇒ nunca hay solicitudes simultáneas), pausa con la pestaña oculta y refresco inmediato al volver. No sondea `/config`, así que no pisa cambios pendientes.
- «API inaccesible» (red/CORS/servidor) se distingue de una desconexión real (`irc.connected=false`, `discordConnected=false`). Con la API caída se conserva el último dato atenuado y marcado como antiguo.
- No se muestran sockets IRC (la API no los entrega), ni históricos diarios/semanales/mensuales, ni valores anteriores en el historial (`changed` solo trae valores nuevos).

## Supuestos a confirmar con el backend

1. `PATCH /config` 200 devuelve la configuración completa (o `{config: …}`) y cabecera `ETag`; si no, la UI hace `GET /config`.
2. `allowOffline: false` bloquea comandos con el canal offline; se usa para la «disponibilidad efectiva» (nunca para autorizar).
3. Las descripciones de comandos son textos locales de la interfaz (`COMMAND_INFO` en `command-center-core.js`); la API solo da nombre, alias y estado. Un comando nuevo de la API aparece igual, sin descripción.
4. Se asume que `/audit` ya devuelve el orden más reciente primero; igualmente se reordena en cliente.

## DEMO vs producción

| | DEMO (`?demo=1`) | Producción (sin parámetro) |
|---|---|---|
| Datos | Fixtures simulados con el contrato real, en memoria | API real |
| Red | Ninguna solicitud sale | Solo `geoarmy.duckdns.org/api/bot-admin/v1` |
| Sesión | No se usa ni se pide | Sesión Supabase existente |
| Aviso | Banner permanente «MODO DEMO» + simulador (API caída, 401, 403, 503, 412, IRC/Discord/canal) | — |
| Si la API falla | n/a | Error real; **nunca** cae a DEMO |
| Carga de `command-center-demo.js` | Sí | No |

El DEMO solo se activa de forma explícita; ningún fallo de la API lo activa. CORS de la API admite únicamente el origen `https://geoarmy.tv`; no se usa ningún proxy.

## Despliegue en `main`

Esta copia ya viene adaptada para `GeovanyRk.github.io`: `SITE_BASE_BOOTSTRAP = '/'` (idéntico a `GEOARMY_SITE_BASE` de `js/geoarmy-config.js` de `main`). Los 7 archivos son nuevos; no se sobrescribe ningún archivo existente y **no se debe tocar** el `geoarmy-config.js` de `main`.

1. Copiar los 7 archivos respetando rutas (`command-center-demo.js` es opcional; si se omite, `?demo=1` muestra un error de carga controlado).
2. Si se editan archivos después, subir `ASSET_REV` en `admin/command-center/index.html` para invalidar caché.
3. Con la cuenta propietaria abrir `https://geoarmy.tv/admin/command-center/`: comprobar que entra sin segundo login y que un 403 con otra cuenta muestra «Acceso denegado».
4. El bot permanece en **TEST**; no activar PUBLIC hasta decidirlo explícitamente.

## Aislamiento de sesión

Toda operación asíncrona captura al iniciar su sesión (`AbortController`) y su cliente de API. Una respuesta de una sesión anterior (carga de config/ETag, PATCH en vuelo, 401/403 tardío, renovación de token) no puede modificar ETag, configuración ni datos de una sesión nueva: el ETag solo se escribe tras comprobar que la sesión sigue vigente, `guarded` no renueva ni reintenta si la sesión cambió, y el token queda ligado al uid que creó el cliente.

## Estado de la validación

- Validado con pruebas automáticas: núcleo (15), DEMO (43) y ruta real con **red y sesión simuladas** (53). Eso verifica cabeceras, ETag/If-Match, cuerpo mínimo, 412/400/500/503, 401/403, cancelación y sondeo.
- Validación real realizada por el propietario desde `geoarmy.tv`: autenticación, CORS, consultas, guardado de configuración e historial administrativo correctos.
- Aislamiento de sesión verificado con pruebas dirigidas (cambio de cuenta con respuestas tardías, incluso con la cancelación de red desactivada).
