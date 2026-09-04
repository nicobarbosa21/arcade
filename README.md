# Blue Blur

Un plataformas de velocidad en el navegador, con la física de las consolas de 16 bits.
Sin framework, sin build y sin dependencias en runtime más que una hoja de estilos: HTML,
CSS y JavaScript con módulos ES nativos.

**Tres actos** con loopings, inercia, pendientes, rodada, rulo de carga, anillos, enemigos
y un boss al final de cada uno. Las teclas 1, 2 y 3 saltan de acto.

## El arte

El personaje es **Pixel Adventure de [Pixel Frog](https://pixelfrog-assets.itch.io/pixel-adventure-1)**,
publicado bajo CC0 — dominio público, sin atribución requerida, pero se acredita igual.
Todo lo demás (terreno, cielo, anillos, enemigos, boss, fuente de la HUD) se dibuja por
código. Si las hojas de sprites no cargan, el juego cae a un personaje dibujado a mano en
`art.js` en vez de quedarse sin protagonista.

## Cómo está armado

La lógica pura vive separada del dibujo, así los tests corren en Node sin navegador:

```
js/sonic/art.js      paleta, temas por acto, fuente de mapa de bits y sprites
js/sonic/sprites.js  carga de las hojas de sprites del personaje
js/sonic/physics.js  el modelo de movimiento completo
js/sonic/tiles.js    colisión por tiles con sensores, y el rasterizador de niveles
js/sonic/level.js    la geometría del acto y sus objetos
js/sonic/boss.js     la Eggmobile: estados, péndulo, daño y dibujo
js/sonic/game.js     bucle, colisiones y render
```

El CSS propio son once líneas: todo lo demás lo pone [Pico](https://picocss.com).
El juego entero se dibuja sobre un `<canvas>`.

## Detalles que valen la pena

Las constantes de física son las clásicas de Mega Drive: aceleración 0.046875, gravedad
0.21875, salto 6.5, factor de pendiente 0.125. El salto se corta si soltás el botón, las
bajadas te dan velocidad por encima del máximo de carrera, las pendientes empinadas te
hacen resbalar si vas lento, y el rulo de carga sale a 8+ de velocidad.

**El framebuffer es de 448×252 y se amplía ×2 con vecino más cercano.** Las constantes de
física son píxeles de Mega Drive, así que el viewport tiene que ser del tamaño de una Mega
Drive. Y dibujar a resolución nativa es lo que hace que se lea como 16 bits: las formas
caen sobre píxeles enteros en vez de ser curvas vectoriales suavizadas.

Todos los colores se ajustan a la rampa de 3 bits por canal de la Mega Drive (`md(r,g,b)`
en `art.js`), que es la mitad de por qué la paleta se siente de época. El cielo son bandas
planas con costuras dithered, porque ocho pasos por canal no alcanzan para un degradé. La
tierra es un damero dibujado en coordenadas del mundo y recortado contra el terreno, así
que se desplaza con el nivel. La HUD usa una fuente de mapa de bits de 5×7 propia: a este
tamaño cualquier fuente del sistema sale borrosa.

Los sprites se escriben como filas de píxeles, un carácter por píxel. Apilar elipses da un
borrón por más que se lo ajuste; sólo un sprite dibujado píxel a píxel tiene silueta.

**La colisión es por tiles con sensores.** Un mapa de alturas sólo guarda una altura de
piso por cada x, lo que descarta loopings, techos y rutas superpuestas. En su lugar hay una
grilla de tiles de 16×16 con máscara de solidez, y sensores que se lanzan contra ella en
cuatro modos —piso, pared derecha, techo, pared izquierda—, de modo que el mismo código
lleva al jugador por la cara interna de un looping.

Los niveles se autoran como **campos de distancia con signo**, matemática en vez de tiles
puestos a mano, y se rasterizan una vez al construir. El campo es negativo dentro del
sólido, así que unir formas es `Math.min` y el gradiente da el normal exacto de la
superficie gratis:

```js
union(ringField(cx, cy, 84, 132), groundField(x => 284))   // un looping tangente al piso
```

**Los actos.** Los objetos no se listan a mano: `populate()` recorre los segmentos del
terreno y cuelga cosas de lo que encuentra — arcos de anillos sobre las colinas, resortes
en el fondo de los valles, enemigos patrullando lo llano. Los peligros nunca van en una
subida, porque ahí se llega sin velocidad y sin margen para reaccionar, y eso se lee como
injusto en vez de difícil. Agregar un acto es describir el terreno y elegir en qué
segmentos van los loopings; el resto se acomoda solo.

**El boss.** Al final del acto hay una arena de exactamente una pantalla, con la cámara
fija, donde aparece una Eggmobile que arrastra una bola con cadena. La bola es un péndulo y
siempre lastima; a la cabina se le pega desde arriba, hecho bolita. Ocho golpes, y se
acelera un 10% por cada golpe recibido.

Su geometría está atada a la física, no elegida a ojo: un salto completo levanta los pies
96 px (`salto² / 2·gravedad`), así que la cabina flota a 128 y la bola cuelga hasta 40 —
la altura de la cabeza de alguien parado. Mover cualquiera de esos tres números rompe la
pelea, y hay tests que lo verifican saltando de verdad contra el hitbox real. Otro test la
juega entera con un bot que persigue y salta: la gana en 17 segundos.

## Correr y probar

```bash
npm test        # 45 tests en ~25s, sin dependencias
npm run dev     # servidor estático en http://localhost:3000
```

Los tests hacen falta porque casi todo acá es lógica que se rompe en silencio: que la
física frene y acelere cuando corresponde, que los sensores encuentren la superficie con el
ángulo correcto en los cuatro modos, y que el acto se pueda terminar de punta a punta.

El módulo de interfaz también se prueba, contra un DOM y un canvas falsos
(`test/helpers/fakedom.js`). El contexto de canvas es un `Proxy` que **tira error ante
cualquier método o propiedad que no conozca**, así que una llamada de dibujo mal escrita
rompe el test en vez de no hacer nada, y cualquier `NaN` que llegue al renderer salta ahí
mismo. Con eso los tests corren el juego de verdad: arranca, corre, junta anillos, salta,
rueda, hace el rulo de carga y llega hasta el boss.

## Ver el juego sin navegador

El juego dibuja sobre un canvas y nada más, así que cambiar el contexto 2D del navegador
por uno nativo alcanza para ver exactamente lo que ve un jugador:

```bash
npm i -D @napi-rs/canvas          # ~33 MB, sólo para esto
node tools/shoot.mjs shots/
```

Sale una serie de PNG: título, corriendo, saltando, rodando y la pelea contra el boss.
Sirve para revisar el aspecto en una máquina sin pantalla, y es bastante más rápido que
manejar un navegador de verdad. La dependencia queda fuera de `package.json` a propósito —
`npm test` no necesita nada instalado.

Ese modo fue el que hizo evidente el bug de escala del viewport.

Y para lo que sólo un navegador puede contestar —que los módulos ES resuelvan, que los
eventos de teclado y puntero lleguen, que la página no tire errores— hay un smoke test
end‑to‑end que levanta su propio servidor:

```bash
npm i -D playwright-core && npx playwright install --with-deps chromium
node tools/smoke.mjs

BASE_URL=https://arcade-psi-lyart.vercel.app node tools/smoke.mjs   # contra el deploy
```

Correrlo contra local no dice nada sobre si el deploy anda: un MIME type equivocado, un
archivo que no subió o un rewrite mal configurado sólo aparecen contra la URL real.
