# Contexto para continuar — Arcade / Blue Blur

Pegá este archivo entero en el chat nuevo, o simplemente decí "leé HANDOFF.md".

---

## Qué es esto

Tres juegos en el navegador, sin framework y sin build: **Zip** y **Tango** (puzzles tipo
LinkedIn) y **Blue Blur** (plataformas estilo Sonic clásico). HTML, CSS y JavaScript con
módulos ES nativos. El único CSS propio son doce líneas; el resto lo pone Pico.

- Repo: https://github.com/nicobarbosa21/arcade
- Sitio: https://arcade-psi-lyart.vercel.app
- Local: `/home/nicobarbosa/development/arcade`

Leé el `README.md` primero: tiene la arquitectura y las decisiones de diseño ya explicadas.

## Estado

`npm test` → **62 tests en verde**, sin dependencias. Todo lo demás está pusheado.

**El sitio en línea está atrasado.** Tiene el boss y el arreglo de escala, pero no el
sistema de tiles, porque todavía no está integrado.

## La tarea que sigue

La migración a tiles con sensores está **terminada**: el acto tiene dos loopings jugables.
Lo que sigue, en orden de impacto:

1. **Sonido.** El juego está completamente mudo, y eso es fácilmente un tercio de lo que
   hace que algo se sienta terminado. Se puede sintetizar todo con Web Audio API sin un
   solo archivo: anillo, salto, rulo de carga, resorte, golpe, jingle de fin de acto.
2. **Rutas alta y baja.** Los tiles recién ahora lo permiten: hasta acá el nivel era una
   línea. Con plataformas y capas se puede premiar la velocidad con un camino de arriba.
3. **Más variedad de enemigos** y monitores de ítems (escudo, invencibilidad, zapatillas).

## Reglas de diseño que hay que respetar

- **La geometría del boss está derivada de la física, no elegida a ojo.** Un salto completo
  levanta los pies 96px (`salto² / 2·gravedad`), así que la cabina flota a 128 y la bola
  cuelga hasta 40. Hay tests que saltan de verdad contra el hitbox real y fallan si se
  mueven esos números.
- **Ninguna subida del acto pasa los 22°** (`asin(acc/slope)`), que es donde la pendiente
  frena más rápido de lo que la carrera acelera: más que eso y un jugador sin envión queda
  trabado para siempre. Hay un test que lo hace cumplir. Las bajadas no tienen límite.
- **La cámara muestra 448×252 y amplía ×2.** Las constantes de física son píxeles de Mega
  Drive; dibujar el mundo 1:1 sobre el canvas de 896 hacía que el personaje ocupara un 6%
  del alto de pantalla contra el 18% de los originales. Si tocás `ZOOM`, hay que reescalar
  terreno, parallax, arena del boss y cartel de meta con él.
- **Nada de sprites de SEGA.** El sitio es público; eso es lo que se lleva un DMCA, no el
  clon de físicas. Todo el arte se dibuja procedimentalmente.
- **Open source y costo cero.** Preferencia explícita de Nico.

## Herramientas: cómo ver el juego

Esto costó trabajo montarlo, no lo rehagas.

Las dependencias viven en **`~/.cache/arcade-devtools/node_modules`**, fuera del scratchpad
de la sesión, que se borra al cerrarla. `node_modules/` en el repo es un symlink ahí. Si
aparece un `ERR_MODULE_NOT_FOUND`, el symlink se rompió; se arregla con:

```bash
ln -sfn ~/.cache/arcade-devtools/node_modules node_modules
```

Si el directorio en sí desapareció, reinstalá — pero ojo: **npm es lentísimo en esta
máquina** (8 minutos para `@napi-rs/canvas`). Usá timeouts largos y `--os=linux --cpu=x64`
para no bajar los binarios de las otras plataformas:

```bash
mkdir -p ~/.cache/arcade-devtools && cd ~/.cache/arcade-devtools
npm install @napi-rs/canvas --os=linux --cpu=x64 playwright-core
```

```bash
# Ver el aspecto, sin navegador. Renderiza frames reales a PNG y después los abrís con Read.
node tools/shoot.mjs sonic shots/     # también: zip, tango

# End-to-end en navegador real (módulos ES, eventos, errores de consola)
CHROME_PATH=/home/nicobarbosa/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome \
  node tools/smoke.mjs shots/

# Lo mismo contra el sitio publicado, que es lo único que detecta un deploy roto
BASE_URL=https://arcade-psi-lyart.vercel.app CHROME_PATH=... node tools/smoke.mjs
```

Las dos se complementan: `shoot` deja *ver* pero no detecta que un `<script type="module">`
no cargue; `smoke` detecta eso pero no muestra nada.

## Deploy

**Es manual y necesita un token que da Nico cada vez.** No hay CLI de Vercel instalado (se
muere al instalarse) y el proyecto no está conectado a GitHub, así que un push no deploya.

El script está en el scratchpad de la sesión anterior, así que probablemente haya que
reescribirlo: son ~40 líneas que hacen `POST https://api.vercel.com/v13/deployments` con
los archivos en base64 (`name: 'arcade'`, `target: 'production'`, `projectSettings` todo en
null para que no intente build), y después consultan hasta que `readyState` quede en READY.
Subir sólo los HTML, `css/` y `js/` — nada de `package.json` ni tests.

**Lo que más conviene:** que Nico conecte el repo una vez en vercel.com/new (framework
"Other", sin build command) y esto deje de hacer falta para siempre.

## Trampas conocidas

- **`git add -A` se lleva la skill adentro.** Ya están `.agents/` y `.claude/` en el
  `.gitignore`, pero revisá `git status` antes de commitear igual.
- El corredor de tests de Node toma cualquier archivo bajo `test/` como test; por eso el
  script es `node --test test/*.test.js` y no `test/`.
- Un caminante ciego en Zip presiona la dirección opuesta y **borra** el camino que acaba de
  dibujar — eso es el gesto de borrado del juego, no un bug. Ya me confundió dos veces.
- Los generadores de puzzles usan `Math.random`; para tests deterministas hay que sembrarlo
  con `mulberry32` antes de importar el módulo de interfaz.
- `-(i - 1)` devuelve `-0` cuando `i` es 1, y `-0` no pasa una comparación estricta contra 0.

## Sobre la skill

`game-engine` (de github/awesome-copilot) está instalada **con alcance de proyecto**, en
`arcade/.claude/skills/`. Se activa sola al trabajar sobre archivos dentro de `arcade/` —
no hace falta reiniciar nada ni invocarla a mano. Trae referencias de tilemaps, colisión,
Web Audio y gamepad. `skills-lock.json` tiene fuente y hash para reinstalarla:

```bash
npx skills add https://github.com/github/awesome-copilot --skill game-engine
```

## Después de los tiles

En orden de impacto, lo que más acerca esto a los originales:

1. **Sonido.** Está completamente mudo. Se puede sintetizar todo con Web Audio API sin un
   solo archivo de audio: anillo, salto, rulo de carga, resorte, golpe, jingle de fin de
   acto. Cero assets, cero licencias.
2. **Nivel más largo con rutas alta y baja**, que es lo que los tiles recién ahora permiten.
3. **Más variedad de enemigos** y monitores de ítems.
