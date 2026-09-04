# Contexto para continuar — Blue Blur

Pegá este archivo en el chat nuevo, o simplemente decí "leé HANDOFF.md".

---

## Qué es esto

Un plataformas de velocidad en el navegador con la física de las consolas de 16 bits.
Sin framework y sin build: HTML, CSS y JavaScript con módulos ES nativos. El CSS propio
son once líneas; el resto lo pone Pico.

- Repo: https://github.com/nicobarbosa21/arcade
- Sitio: https://arcade-psi-lyart.vercel.app
- Local: `/home/nicobarbosa/development/arcade`

Leé el `README.md` primero: tiene la arquitectura y las decisiones de diseño explicadas.

## Estado

`npm test` → **45 tests en verde**, sin dependencias. Todo pusheado y desplegado.

El acto tiene dos loopings jugables, enemigos, resortes, púas, anillos y un boss al final.
La migración de mapa de alturas a colisión por tiles con sensores está **terminada**.

## Qué sigue, en orden de impacto

1. **Sonido.** El juego está completamente mudo, y eso es fácilmente un tercio de lo que
   hace que algo se sienta terminado. Se puede sintetizar todo con Web Audio API sin un
   solo archivo: anillo, salto, rulo de carga, resorte, golpe, jingle de fin de acto.
   Cero assets, cero licencias.
2. **Rutas alta y baja.** Los tiles recién ahora lo permiten: hasta acá el nivel era una
   línea. Con plataformas y capas se puede premiar la velocidad con un camino de arriba.
3. **Más variedad de enemigos** y monitores de ítems (escudo, invencibilidad, zapatillas).

## Reglas de diseño que hay que respetar

Cada una tiene un test que la hace cumplir. No son preferencias.

- **La geometría del boss está derivada de la física, no elegida a ojo.** Un salto completo
  levanta los pies 96px (`salto² / 2·gravedad`), así que la cabina flota a 128 y la bola
  cuelga hasta 40. Hay un test que salta de verdad contra el hitbox real.
- **Ninguna subida del acto pasa los 22°** (`asin(acc/slope)`), que es donde la pendiente
  frena más rápido de lo que la carrera acelera: más que eso y un jugador sin envión queda
  trabado para siempre. Las bajadas no tienen límite.
- **Los loopings van tangentes a piso plano**, con la llanura a ambos lados y una velocidad
  mínima para entrar. Si el anillo no toca el piso, la subida es un escalón.
- **Púas y enemigos sólo en terreno plano o de lomas suaves.** En una subida se llega sin
  velocidad y sin margen para reaccionar: se lee como injusto, no como difícil.
- **La cámara muestra 448×252 y amplía ×2.** Las constantes de física son píxeles de Mega
  Drive; dibujar el mundo 1:1 sobre el canvas de 896 hacía que el personaje ocupara un 6%
  del alto de pantalla contra el 18% de los originales. Si tocás `ZOOM`, hay que reescalar
  terreno, parallax, arena del boss y cartel de meta con él.
- **Nada de sprites de SEGA.** El sitio es público; eso es lo que se lleva un DMCA, no el
  clon de físicas. Todo el arte se dibuja procedimentalmente.
- **Open source y costo cero.** Preferencia explícita de Nico.

## Cómo funcionan los loopings

Vale entenderlo antes de tocar `physics.js` o `level.js`.

Un anillo de material sólido tangente al piso no alcanza por sí solo: viniendo por el
suelo el jugador choca contra su cara externa. Por eso hay **dos capas de colisión** — la
0 es piso pelado, la 1 agrega los anillos — y un **switcher** en el punto de tangencia que
lo pasa de una a otra. Volver al mismo punto después de dar la vuelta lo devuelve a la
capa 0, que es lo que permite salir en vez de girar para siempre.

El switcher sólo actúa parado y en modo piso, así que cruzar esa línea de cabeza en el
techo del looping se ignora. Y hay una red de seguridad: si el jugador está en la capa de
un looping pero lejos de él, vuelve a la capa 0 — sin eso, un salto mal timeado lo dejaba
encerrado dentro del anillo.

## Herramientas: cómo ver el juego

Esto costó trabajo montarlo, no lo rehagas.

Las dependencias viven en **`~/.cache/arcade-devtools/node_modules`**, fuera del scratchpad
de la sesión, que se borra al cerrarla. `node_modules/` en el repo es un symlink ahí. Si
aparece un `ERR_MODULE_NOT_FOUND`, el symlink se rompió; se arregla con:

```bash
ln -sfn ~/.cache/arcade-devtools/node_modules node_modules
```

Si el directorio desapareció, reinstalá — pero ojo: **npm es lentísimo en esta máquina**
(8 minutos para `@napi-rs/canvas`). Usá timeouts largos y `--os=linux --cpu=x64` para no
bajar los binarios de las otras plataformas:

```bash
mkdir -p ~/.cache/arcade-devtools && cd ~/.cache/arcade-devtools
npm install @napi-rs/canvas --os=linux --cpu=x64 playwright-core
```

```bash
# Ver el aspecto, sin navegador. Renderiza frames reales a PNG y después los abrís con Read.
node tools/shoot.mjs shots/

# End-to-end en navegador real (módulos ES, eventos, errores de consola)
CHROME_PATH=/home/nicobarbosa/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome \
  node tools/smoke.mjs shots/

# Lo mismo contra el sitio publicado, que es lo único que detecta un deploy roto
BASE_URL=https://arcade-psi-lyart.vercel.app CHROME_PATH=... node tools/smoke.mjs
```

Las dos se complementan: `shoot` deja *ver* pero no detecta que un `<script type="module">`
no cargue; `smoke` detecta eso pero no muestra nada.

## Deploy

**Automático.** El repo está conectado a Vercel: cada push a `main` deploya solo. No hacen
falta tokens. `.vercelignore` deja fuera tests, herramientas y documentación.

Ojo: conectar el repo no dispara un build por sí solo, hace falta un push posterior.

## Trampas conocidas

- **`git add -A` se lleva la skill adentro.** Ya están `.agents/` y `.claude/` en el
  `.gitignore`, pero revisá `git status` antes de commitear igual.
- El corredor de tests de Node toma cualquier archivo bajo `test/` como test; por eso el
  script es `node --test test/*.test.js` y no `test/`.
- **`p.y` es el centro del cuerpo, no los pies.** Los pies son `p.y + BODY.half`. Esto
  cambió al pasar a sensores: son ellos los que rotan con el jugador.
- **Cuidado con los clamps de una sola dirección.** `Math.min(P.top, xsp + acc)` te *baja*
  la velocidad si venías más rápido por una bajada. Ese bug apareció dos veces, una en el
  suelo y otra en el aire; la segunda hacía que un looping fuera inentrable tras saltar.
- `-(i - 1)` devuelve `-0` cuando `i` es 1, y `-0` no pasa una comparación estricta contra 0.
- Al sacar capturas, el jugador parpadea mientras es invulnerable: un frame cualquiera
  puede no dibujarlo. `tools/shoot.mjs` no lo tiene en cuenta.

## Sobre la skill

`game-engine` (de github/awesome-copilot) está instalada **con alcance de proyecto**, en
`arcade/.claude/skills/`. Se activa sola al trabajar sobre archivos dentro de `arcade/` —
no hace falta reiniciar nada ni invocarla a mano. Trae referencias de tilemaps, colisión,
Web Audio y gamepad. `skills-lock.json` tiene fuente y hash para reinstalarla:

```bash
npx skills add https://github.com/github/awesome-copilot --skill game-engine
```
