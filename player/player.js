/* Own TurboWarp-compatible Scratch player. Only local runtime + local .sb3.
 * The original Scratch event scripts still own all simulation/animation.
 * Local GPL? No: the upstream Scaffolding bundle is MPL-2.0, see vendor/LICENSE.
 */
(() => {
  'use strict';
  const el = (id) => document.getElementById(id);
  const app = el('app');
  const stage = el('stage');
  const loading = el('loading');
  const message = el('message');
  const retry = el('retry');
  const info = el('info');
  const portrait = window.matchMedia('(orientation: portrait) and (max-width: 900px)').matches;
  const width = 480;
  const gameHeight = portrait
    ? Math.max(720, Math.min(1300, Math.round(width * stage.clientHeight / stage.clientWidth)))
    : 360;
  let player = null;
  let ready = false;
  let busy = false;
  const diagnostics = {portrait, source: '', runtimeLocal: true, started: false, error: null};

  function setError(error) {
    const text = String(error?.message || error);
    diagnostics.error = text;
    loading.classList.add('error');
    loading.hidden = false;
    retry.hidden = false;
    message.textContent = 'Не удалось запустить игру: ' + text;
    console.error('[world-server-player]', error);
    busy = false;
  }
  function target(name) {
    const targets = player?.vm?.runtime?.targets;
    return targets?.find(t => !t.isStage && t.getName?.() === name);
  }
  function relocate(name, x, y, size) {
    const t = target(name);
    if (!t) return;
    if (Number.isFinite(size)) t.setSize(size);
    t.setXY(x, y, true, true);
  }
  function responsiveLayout() {
    if (!ready || !portrait) return;
    // TurboWarp dynamic-resize extends stage bounds with the viewport; none of
    // the original five cards may drift offscreen on iPhone address-bar resize.
    player.relayout();
    const h = player?.vm?.runtime?.stageHeight || gameHeight;
    const bottom = -h / 2 + 59;
    const top = h / 2 - 35;
    ['Город', 'Лес', 'Энергия', 'Вулкан', 'Идея'].forEach((name, i) =>
      relocate('Выбор ' + name, -192 + 96 * i, bottom, 100));
    ['Население', 'Энергия', 'Вода', 'Еда', 'Экология', 'Бюджет']
      .forEach((name, i) => relocate('HUD ' + name,
        [-155, 0, 155][i % 3], top - 45 * Math.floor(i / 3), 130));
    relocate('HUD Ход', 164, top - 112, 120);
    relocate('Помощь', -205, top - 112, 110);
    relocate('Начать заново', -168, top - 112, 110);
    relocate('Диалог Джинна', 36, bottom + 109, 100);
    relocate('Злой Джинн', -180, bottom + 97, 88);
  }
  async function start() {
    if (busy) return;
    busy = true;
    diagnostics.error = null;
    retry.hidden = true;
    loading.classList.remove('error');
    loading.hidden = false;
    message.textContent = 'Загружаем собственный TurboWarp и анимацию…';
    try {
      if (!window.Scaffolding?.Scaffolding) {
        throw new Error('Локальный TurboWarp не загружен (vendor/scaffolding-with-music.js)');
      }
      stage.replaceChildren();
      player = new window.Scaffolding.Scaffolding();
      player.width = width;
      player.height = gameHeight;
      player.resizeMode = portrait ? 'dynamic-resize' : 'preserve-ratio';
      player.editableLists = false;
      player.shouldConnectPeripherals = true;
      player.usePackagedRuntime = false;
      player.setup();
      player.appendTo(stage);
      diagnostics.source = portrait ? './chain-reaction-portrait.sb3' : '../chain-reaction-animated.sb3';
      const response = await fetch(diagnostics.source, {cache: 'no-cache'});
      if (!response.ok) throw new Error('Наш файл игры недоступен: HTTP ' + response.status);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength < 200_000) throw new Error('Файл Scratch слишком мал или повреждён');
      await player.loadProject(bytes);
      player.greenFlag();
      ready = true;
      diagnostics.started = true;
      loading.hidden = true;
      requestAnimationFrame(responsiveLayout);
      setTimeout(responsiveLayout, 500);
      window.__ownTurboWarp = {
        diagnostics, player, relocate, relayout: responsiveLayout,
        restart: () => { player.stopAll(); player.greenFlag(); setTimeout(responsiveLayout, 150); }
      };
    } catch (error) {
      setError(error);
    } finally {
      busy = false;
    }
  }

  el('fullscreen').addEventListener('click', async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    } else if (document.fullscreenEnabled && app.requestFullscreen) {
      await app.requestFullscreen().catch(() => info.classList.add('open'));
    } else {
      info.classList.add('open'); // iOS Safari's Fullscreen API is restricted
    }
    setTimeout(responsiveLayout, 150);
  });
  el('restart').addEventListener('click', () => {
    if (ready) {
      player.stopAll();
      player.greenFlag();
      setTimeout(responsiveLayout, 150);
    } else start();
  });
  el('help').addEventListener('click', () => info.classList.add('open'));
  el('close-info').addEventListener('click', () => info.classList.remove('open'));
  info.addEventListener('click', e => { if (e.target === info) info.classList.remove('open'); });
  retry.addEventListener('click', start);
  window.addEventListener('resize', () => {
    if (!ready) return;
    requestAnimationFrame(responsiveLayout);
  }, {passive: true});
  document.addEventListener('fullscreenchange', () =>
    setTimeout(responsiveLayout, 150));
  start();
})();
