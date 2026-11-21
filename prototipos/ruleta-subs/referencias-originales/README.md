# Referencias: archivos originales de OBS

Estos HTML son las copias que Geo adjuntó en el chat. Se guardan solo para contrastar el código y las probabilidades; no se ha comprobado que sean la versión que se está usando actualmente en OBS. No se deben desplegar ni sustituir las fuentes activas sin esa comprobación.

- `ruleta-fortnite.html`: original adjunto `ruleta-fortnite.html`, SHA-256 `fd672a4578a65dfc78f2661f1131fddb3973e1df816202c991e84a59c6641efc`.
- `ruleta-overwatch.html`: original adjunto `ruleta-ow(1).html`, SHA-256 `e3c748ee332f586870d19e9d14ef3285ac943fbb5c8ab4e1c3a9e0b47a0d53bd`.

Los HTML hacen referencia a imágenes y audio locales que no se incluyen aquí. Las tablas `PRIZES` de estos dos archivos coinciden, en proporciones relativas, con los pesos del modelo `draw-model.cjs` de la ruleta de suscriptores. La regla acordada para la nueva ruleta es una probabilidad total de ganar de 1/30 y una garantía al llegar a 30 intentos sin premio; esto no es igual a copiar literalmente las probabilidades totales de las ruletas anteriores. Los HTML originales también tenían un límite local de ganadores: no se debe trasladar de forma que impida la garantía acordada.
