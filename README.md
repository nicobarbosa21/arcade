# Arcade

Tres juegos en el navegador, sin framework, sin build y sin dependencias en runtime más
que una hoja de estilos: HTML, CSS y JavaScript con módulos ES nativos.

| Juego | Qué es |
|---|---|
| **Zip** | Un solo trazo que recorre todas las casillas tocando los números en orden, esquivando muros. |
| **Tango** | Soles y lunas: mitad y mitad por fila y columna, nunca tres iguales seguidos, con restricciones `=` y `×`. Solución única garantizada. |
| **Blue Blur** | Plataformas con física de consola de 16 bits: inercia, pendientes, rodada, rulo de carga, anillos y enemigos. |

## Cómo está armado

La lógica pura vive separada del dibujo, así los tests corren en Node sin navegador:

```
js/zip/logic.js      generador de caminos hamiltonianos + validación
js/zip/play.js       canvas e interacción
js/tango/logic.js    solver, detector de conflictos y generador de solución única
js/tango/play.js     canvas e interacción
js/sonic/physics.js  el modelo de movimiento completo
js/sonic/level.js    el mapa de alturas del acto y sus objetos
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

## Correr y probar

```bash
npm test        # 36 tests, sin dependencias
npm run dev     # servidor estático en http://localhost:3000
```

Los tests hacen falta porque casi todo acá es lógica que se rompe en silencio: que el puzzle
generado tenga solución, que sea única, que la física frene y acelere cuando corresponde, y
que el acto se pueda terminar de punta a punta corriendo para la derecha.

Los módulos de interfaz también se prueban, contra un DOM y un canvas falsos
(`test/helpers/fakedom.js`). El contexto de canvas es un `Proxy` que **tira error ante
cualquier método o propiedad que no conozca**, así que una llamada de dibujo mal escrita
rompe el test en vez de no hacer nada, y cualquier `NaN` que llegue al renderer salta ahí
mismo. Con eso los tests recorren el juego de verdad: arranca, corre quince segundos,
junta anillos, salta, rueda y hace el rulo de carga.
