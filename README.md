# Arcade

Tres juegos en el navegador, sin framework, sin build y sin dependencias en runtime más
que una hoja de estilos: HTML, CSS y JavaScript con módulos ES nativos.

| Juego | Qué es |
|---|---|
| **Zip** | Un solo trazo que recorre todas las casillas tocando los números en orden, esquivando muros. |
| **Tango** | Soles y lunas: mitad y mitad por fila y columna, nunca tres iguales seguidos, con restricciones `=` y `×`. Solución única garantizada. |
| **Blue Blur** | Plataformas con física de consola de 16 bits: inercia, pendientes, rodada, rulo de carga, anillos, enemigos y un boss al final del acto. |

## Cómo está armado

La lógica pura vive separada del dibujo, así los tests corren en Node sin navegador:

```
js/zip/logic.js      generador de caminos hamiltonianos + validación
js/zip/play.js       canvas e interacción
js/tango/logic.js    solver, detector de conflictos y generador de solución única
js/tango/play.js     canvas e interacción
js/sonic/physics.js  el modelo de movimiento completo
js/sonic/level.js    el mapa de alturas del acto, sus objetos y la arena del boss
js/sonic/boss.js     la Eggmobile: estados, péndulo, daño y dibujo
js/sonic/game.js     bucle, colisiones y render
```

El CSS propio son doce líneas: todo lo demás lo pone [Pico](https://picocss.com).
Los tres juegos se dibujan sobre `<canvas>`.

## Detalles que valen la pena

**Zip.** Generar el puzzle es generar un camino hamiltoniano al azar sobre la grilla. Un DFS
pelado no termina nunca en 7×7, así que se poda por dos lados: las casillas sin visitar tienen
que seguir formando una sola región alcanzable, y ninguna puede quedar con una sola entrada
salvo la última del camino. En grillas de lado impar sólo hay solución arrancando desde la
paridad mayoritaria del tablero, cosa que el generador tiene en cuenta.

**Tango.** El generador arranca de una solución completa al azar, agrega restricciones que la
respetan y después va sacando pistas mientras el solver siga encontrando **exactamente una**
solución. Nunca hace falta adivinar.

**Blue Blur.** Las constantes de física son las clásicas de Mega Drive (aceleración 0.046875,
gravedad 0.21875, salto 6.5, factor de pendiente 0.125). El terreno es un mapa de alturas,
lo que da colinas y rampas suaves pero descarta los rulos. Detalles que sí están: el salto se
corta si soltás el botón, las bajadas te dan velocidad por encima del máximo de carrera, las
pendientes empinadas te hacen resbalar si vas lento, y el rulo de carga sale a 8+ de velocidad.

El acto tiene una regla de diseño que un test hace cumplir: **ninguna subida puede pasar los
22°**, que es donde la pendiente te frena más rápido de lo que la carrera te acelera. Más que
eso y un jugador que llega sin envión queda trabado para siempre. Las bajadas no tienen límite.

**El boss.** Al final del acto hay una arena de exactamente una pantalla, con la cámara fija,
donde aparece una Eggmobile que arrastra una bola con cadena. La bola es un péndulo y siempre
lastima; a la cabina se le pega desde arriba, hecho bolita. Ocho golpes, y se acelera un 10%
por cada golpe recibido.

La geometría está atada a la física, no elegida a ojo: un salto completo levanta los pies
96 px (`salto² / 2·gravedad`), así que la cabina flota a 128 y la bola cuelga hasta 40 —
la altura de la cabeza de alguien parado. Mover cualquiera de esos tres números rompe la
pelea, y hay tests que lo verifican saltando de verdad contra el hitbox real. Otro test la
juega entera con un bot que persigue y salta: la gana en 11 segundos.

## Correr y probar

```bash
npm test        # 49 tests, sin dependencias
npm run dev     # servidor estático en http://localhost:3000
```

Los tests hacen falta porque casi todo acá es lógica que se rompe en silencio: que el puzzle
generado tenga solución, que sea única, que la física frene y acelere cuando corresponde, y
que el acto se pueda terminar de punta a punta corriendo para la derecha.

## Ver el juego sin navegador

Los juegos dibujan sobre un canvas y nada más, así que cambiar el contexto 2D del navegador
por uno nativo alcanza para ver exactamente lo que ve un jugador:

```bash
npm i -D @napi-rs/canvas          # ~33 MB, sólo para esto
node tools/shoot.mjs sonic shots/ # también: zip, tango
```

Sale una serie de PNG: pantalla de título, corriendo, saltando, rodando y la pelea contra el
boss. Sirve para revisar el aspecto en una máquina sin pantalla, y es bastante más rápido que
manejar un navegador de verdad. La dependencia queda fuera de `package.json` a propósito —
`npm test` no necesita nada instalado.

Ese modo fue el que hizo evidente el bug de escala: el personaje ocupaba un 6% del alto de
pantalla cuando en los originales ocupa un 18%. Las constantes de física son píxeles de Mega
Drive, así que la cámara tiene que mostrar una ventana del tamaño de una Mega Drive (448×252)
y ampliarla, no dibujar el mundo 1:1 sobre un canvas de 896.

Y para lo que sólo un navegador puede contestar — que los módulos ES resuelvan, que los
eventos de teclado y puntero lleguen, que la página no tire errores — hay un smoke test
end‑to‑end que levanta su propio servidor:

```bash
npm i -D playwright-core && npx playwright install --with-deps chromium
node tools/smoke.mjs
```

## Los tests

Los módulos de interfaz también se prueban, contra un DOM y un canvas falsos
(`test/helpers/fakedom.js`). El contexto de canvas es un `Proxy` que **tira error ante
cualquier método o propiedad que no conozca**, así que una llamada de dibujo mal escrita
rompe el test en vez de no hacer nada, y cualquier `NaN` que llegue al renderer salta ahí
mismo. Con eso los tests recorren el juego de verdad: arranca, corre quince segundos,
junta anillos, salta, rueda y hace el rulo de carga.
