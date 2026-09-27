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
    if (!ready) return;
    // This is an actual resizable Scratch stage, not a 4:3 iframe
    // enlarged with CSS. Coordinate the original native sprite objects.
    player.relayout();
    const w = player?.vm?.runtime?.stageWidth || stage.clientWidth;
    const h = player?.vm?.runtime?.stageHeight || stage.clientHeight;
    const cardNames = ['Город', 'Лес', 'Энергия', 'Вулкан', 'Идея'];
    const meters = ['Население', 'Энергия', 'Вода', 'Еда', 'Экология', 'Бюджет'];
    if (portrait) {
      const cardSize = Math.min(100, (w - 18) / (5 * 88) * 100);
      const cardWidth = 88 * cardSize / 100;
      const cardGap = Math.max(2, (w - 10 - 5 * cardWidth) / 4);
      const total = cardWidth * 5 + cardGap * 4;
      const cardY = -h / 2 + 17 + 67 * cardSize / 200;
      cardNames.forEach((name, i) => relocate('Выбор ' + name,
        -total / 2 + cardWidth / 2 + i * (cardWidth + cardGap), cardY, cardSize));
      const meterSize = Math.min(135, (w - 24) / (3 * 75) * 100);
      const meterX = w * .32;
      const top = h / 2 - 40;
      meters.forEach((name, i) => relocate('HUD ' + name,
        (i % 3 - 1) * meterX, top - 48 * Math.floor(i / 3), meterSize));
      relocate('HUD Ход', w / 2 - 51, top - 108, 118);
      relocate('Помощь', -w / 2 + 27, top - 108, 110);
      relocate('Начать заново', -w / 2 + 70, top - 108, 110);
      const panelSize = Math.min(100, (w - 18) / 348 * 100);
      const panelY = cardY + 67 * cardSize / 200 + 111 * panelSize / 200 + 13;
      relocate('Диалог Джинна', 0, panelY, panelSize);
      relocate('Злой Джинн', -w / 2 + 55, panelY - 11, Math.min(90, panelSize));
    } else {
      // Landscape iPhone + widescreen desktop both get full-size true native
      // Scratch scenes with 1920x1080 approved original background artwork.
      const cardWidth = Math.min(165, (w - 40) / 5);
      const cardSize = cardWidth * 100 / 88;
      const gap = Math.min(23, Math.max(7, (w - 5 * cardWidth) / 6));
      const total = cardWidth * 5 + 4 * gap;
      const cardY = -h / 2 + 13 + (67 * cardSize / 200);
      cardNames.forEach((name, i) => relocate('Выбор ' + name,
        -total / 2 + cardWidth / 2 + i * (cardWidth + gap), cardY, cardSize));
      const meterSize = Math.min(150, (w - 168) / (6 * 75) * 100);
      const meterWidth = 75 * meterSize / 100;
      const meterGap = Math.min(13, Math.max(3, (w - 170 - 6 * meterWidth) / 5));
      const headerTotal = 6 * meterWidth + 5 * meterGap;
      const headerOffset = w < 980 ? -52 : 0;
      const top = h / 2 - 34;
      meters.forEach((name, i) => relocate('HUD ' + name,
        -headerTotal / 2 + meterWidth / 2 +
        i * (meterWidth + meterGap) + headerOffset, top, meterSize));
      relocate('HUD Ход', w / 2 - 70, top - 64, 130);
      relocate('Помощь', -w / 2 + 29, top - 65, 110);
      relocate('Начать заново', -w / 2 + 71, top - 65, 110);
      const panelSize = h < 450 ? 135 : 155;
      const panelY = cardY + 67 * cardSize / 200 + 111 * panelSize / 200 + 16;
      const panelX = -Math.min(w / 4, 280);
      relocate('Диалог Джинна', panelX, panelY, panelSize);
      relocate('Злой Джинн', panelX - 348 * panelSize / 200 - 30,
        panelY - 13, 145);
    }
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
      player.resizeMode = 'dynamic-resize';
      player.editableLists = false;
      player.shouldConnectPeripherals = true;
      player.usePackagedRuntime = false;
      player.setup();
      player.appendTo(stage);
      diagnostics.source = portrait ? './chain-reaction-portrait.sb3' : './chain-reaction-wide.sb3';
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
