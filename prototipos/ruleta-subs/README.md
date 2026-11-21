# Ruleta de suscriptores: prototipo para OBS

Esta rama contiene una **vista de prueba**, no una ruleta conectada ni un sistema de premios. No se ha activado ni se puede usar para acreditar monedas. No modifica las ruletas existentes.

## Acuerdos del sistema

- Una ruleta visual para Fortnite y Overwatch. La persona escribe el juego cuando canjea la recompensa de Twitch; el moderador la maneja en OBS. Cada canje costará 500 puntos del canal.
- La cuenta es individual y compartida entre ambos juegos. Geo decidió subir el umbral inicial de 10 tiradas sin premio; el nuevo umbral está por definirse. Cualquier premio reinicia el contador.
- Guardar cada tirada y, si hay premio, acreditarlo a la billetera correspondiente. Los resultados históricos incompletos no se usan como si fueran tiradas nuevas.
- El cliente OBS no decide el resultado ni acredita el premio. Solo muestra un resultado ya registrado por un servidor confiable.

## Vista actual

`dist/index.html` contiene un componente visual sin dependencias externas. La ruta con `?demo=1` muestra un ejemplo ficticio de Overwatch claramente marcado como prueba. El componente dispone de `window.GeoArmyRuletaOBS.showConfirmed(event)` para que una integración futura presente un resultado confirmado. Ese método solo dibuja; por sí solo no valida la autenticidad del evento.

La muestra usa los importes observados en los archivos de las ruletas originales: Fortnite 500, 800, 1200 y 1500 V-Bucks; Overwatch 500, 1000 y 1500 monedas. Las probabilidades definitivas y el modo de elegir el premio garantizado aún requieren su integración y verificación.

`game-input.cjs` interpreta una respuesta inequívoca de juego; si el texto es vacío, ambiguo o inesperado, no elige uno por defecto. Aún no está conectado al receptor de Twitch.

`node --test test-display.cjs test-game-input.cjs` prueba la representación de una victoria, una pérdida y la validación básica de eventos y elección de juego. No prueba el sistema de canjes ni billeteras.

## Pendiente antes de usar

Crear y configurar la recompensa de Twitch, capturar su identificador y el texto elegido, validar la condición de suscriptor, integrar la acción autorizada del moderador, implementar un registro durable idempotente y la garantía bajo concurrencia, acreditar con las funciones reales de billetera y deuda en la misma transacción, conectar el resultado confirmado a OBS y presentar el historial. Definir también el tratamiento de canjes cancelados, usuarios sin perfil, texto inválido y fallos. Probar toda la cadena antes de activar.
