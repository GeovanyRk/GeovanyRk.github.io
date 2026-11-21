# Ruleta de suscriptores: prototipo para OBS

Esta rama contiene una **vista de prueba**, no una ruleta conectada ni un sistema de premios. No se ha activado ni se puede usar para acreditar monedas. No modifica las ruletas existentes.

## Acuerdos del sistema

- Una ruleta visual para Fortnite y Overwatch. La persona escribe el juego cuando canjea la recompensa de Twitch; el moderador la maneja en OBS. Cada canje costará 500 puntos del canal y habrá un máximo de tres por persona y día.
- La cuenta es individual y compartida entre ambos juegos. Después de 29 tiradas seguidas sin premio, la tirada número 30 garantiza uno. Cualquier premio reinicia el contador.
- En las tiradas normales la probabilidad total de ganar es de 1 entre 30 para cualquiera de los dos juegos.
- Guardar cada tirada y, si hay premio, acreditarlo a la billetera correspondiente. Los resultados históricos incompletos no se usan como si fueran tiradas nuevas.
- El cliente OBS no decide el resultado ni acredita el premio. Solo muestra un resultado ya registrado por un servidor confiable.

## Vista actual

`dist/index.html` contiene un componente visual sin dependencias externas. La ruta con `?demo=1` muestra un ejemplo ficticio de Overwatch claramente marcado como prueba. El componente dispone de `window.GeoArmyRuletaOBS.showConfirmed(event)` para que una integración futura presente un resultado confirmado. Ese método solo dibuja; por sí solo no valida la autenticidad del evento.

La muestra usa los importes observados en los archivos de las ruletas originales: Fortnite 500, 800, 1200 y 1500 V-Bucks; Overwatch 500, 1000 y 1500 monedas. El modelo de prueba conserva las proporciones relativas entre premios de cada ruleta original, tanto en la victoria normal como en la garantizada; esto sigue sujeto a verificación al integrar.

`game-input.cjs` interpreta una respuesta inequívoca de juego; si el texto es vacío, ambiguo o inesperado, no elige uno por defecto. Aún no está conectado al receptor de Twitch.

`draw-model.cjs` es un modelo aislado del sorteo y la racha, con aleatoriedad segura en Node y probabilidades comprobables. No es un backend terminado: no guarda estados, no serializa intentos simultáneos y no acredita billeteras.

`node --test test-display.cjs test-game-input.cjs test-draw-model.cjs` prueba la vista, la elección de juego y la lógica aislada. No prueba el sistema de canjes, la concurrencia ni las billeteras.

## Pendiente antes de usar

Crear y configurar la recompensa de Twitch, capturar su identificador y el texto elegido, validar la condición de suscriptor, integrar la acción autorizada del moderador, implementar un registro durable idempotente y la garantía bajo concurrencia, acreditar con las funciones reales de billetera y deuda en la misma transacción, conectar el resultado confirmado a OBS y presentar el historial. Definir también el tratamiento de canjes cancelados, usuarios sin perfil, texto inválido y fallos. Probar toda la cadena antes de activar.

Twitch ofrece el límite de canjes por persona **por directo**, no una garantía de tres por día de calendario. La integración debe comprobar el día por su cuenta y considerar también solicitudes pendientes y cancelaciones. Si una solicitud no puede aceptarse, debe poder devolverse el canje sin dejar al usuario sin puntos; para modificar su estado mediante la API, Twitch exige que la misma aplicación haya creado la recompensa y tenga el permiso correspondiente. Verificar el mecanismo real y la zona horaria antes de habilitarlo.
