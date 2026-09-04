// Drives the real game module against a fake DOM. This is what catches a mistyped canvas
// call, a NaN reaching the renderer or a control that stopped being wired up — none of
// which the pure-logic tests can see.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers/fakedom.js';

test('blue blur boots, runs, collects rings and survives every animation branch', async () => {
  const dom = installDom({ ids: ['game', 'restart'], groups: { '#pad button': ['left', 'right', 'down', 'jump'] } });
  await import('../js/sonic/game.js');

  dom.tick(3);
  assert.ok(dom.log.text.includes('BLUE BLUR'), 'title screen should render');

  dom.fire('keydown', { key: ' ' });
  dom.fire('keyup', { key: ' ' });
  dom.fire('keydown', { key: 'ArrowRight' });
  dom.tick(900); // fifteen seconds of running

  const hud = dom.log.text;
  const i = hud.lastIndexOf('ANILLOS');
  assert.ok(i > 0, 'the HUD should be drawing');
  assert.ok(Number(hud[i + 1]) > 0, `no rings collected in 15s (got ${hud[i + 1]})`);
  assert.notEqual(hud[i + 3], '00:00', 'the clock should be running');
  assert.ok(!hud.includes('GAME OVER'), 'a clean run should not die');

  dom.fire('keydown', { key: ' ' });   // jump
  dom.tick(20);
  dom.fire('keyup', { key: ' ' });
  dom.tick(40);
  dom.fire('keydown', { key: 'ArrowDown' }); // roll
  dom.tick(60);
  dom.fire('keyup', { key: 'ArrowRight' });
  dom.tick(120);
  dom.fire('keydown', { key: ' ' });   // spin dash charge
  dom.fire('keyup', { key: ' ' });
  dom.tick(30);
  dom.fire('keyup', { key: 'ArrowDown' }); // release, launch
  dom.tick(120);
  dom.fire('keyup', { key: 'ArrowRight' });

  // The on-screen pad has to move him too.
  const [, right, , jump] = dom.group('#pad button');
  jump.dispatch('pointerdown');
  jump.dispatch('pointerup');
  right.dispatch('pointerdown');
  dom.tick(200);
  right.dispatch('pointerleave');
  dom.tick(30);

  dom.el('restart').onclick();
  dom.tick(10);
  const j = dom.log.text.lastIndexOf('ANILLOS');
  assert.equal(dom.log.text[j + 1], '0', 'restart should reset the ring count');

  // Run the act end to end. Reaching the arena takes about 30 seconds of game time,
  // so this is the one test that proves the whole level is traversable in the real game
  // and not just in the physics model.
  dom.log.text.length = 0;
  dom.fire('keydown', { key: 'ArrowRight' });
  for (let i = 0; i < 45; i++) {
    dom.tick(70);
    dom.fire('keydown', { key: ' ' }); // hop, so nothing on the ground stops the run
    dom.tick(10);
    dom.fire('keyup', { key: ' ' });
  }
  assert.ok(!dom.log.text.includes('GAME OVER'), 'the run should survive the act');
  assert.ok(dom.log.text.includes('EGGMOBILE'), 'the boss should have turned up');
  assert.ok(!dom.log.text.includes('¡ACTO SUPERADO!'), 'the act cannot end while the boss lives');
  dom.restore();
});
