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
  const orientation = window.matchMedia('(orientation: portrait) and (max-width: 900px)');
  let portrait = orientation.matches;
  const width = 480;
  const stageHeight = () => portrait
    ? Math.max(720, Math.min(1300, Math.round(width * stage.clientHeight / Math.max(1,stage.clientWidth))))
    : 360;
  let orientationPending = false;
  let generation = 0;
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
      relocate('Злой Джинн', -w / 2 + 36, panelY - 11, Math.min(90, panelSize));
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
      const panelX = -Math.min(w / 8, 160);
      relocate('Диалог Джинна', panelX, panelY, panelSize);
      relocate('Злой Джинн', -w / 2 + 90,
        panelY - 13, 145);
    }
    // Native '?' and reset sprites duplicate the accessible HTML toolbar.
    // Keep their Scratch scripts/assets, hide only their drawings.
    target('Помощь')?.setVisible?.(false);
    target('Начать заново')?.setVisible?.(false);
  }
  function snapshotState() {
    const vars = player?.vm?.runtime?.getTargetForStage?.()?.variables || {};
    return Object.fromEntries(Object.values(vars).map(v => [v.name, v.value]));
  }
  function restoreState(snapshot) {
    if (!snapshot || !player) return;
    const runtime = player.vm.runtime;
    const vars = runtime.getTargetForStage().variables;
    for (const v of Object.values(vars)) {
      if (Object.prototype.hasOwnProperty.call(snapshot, v.name)) {
        v.value = v.name === 'Занято' ? 0 : snapshot[v.name];
      }
    }
    const visuals = {Город: 'city', Лес: 'forest', Энергия: 'energy', Вулкан: 'volcano'};
    for (const [name, event] of Object.entries(visuals)) {
      if (Number(snapshot['Построено' + name]) > 0) {
        runtime.startHats('event_whenbroadcastreceived', {BROADCAST_OPTION: 'visual_' + event});
      }
    }
    for (const event of ['panel', 'render']) {
      runtime.startHats('event_whenbroadcastreceived', {BROADCAST_OPTION: event});
    }
  }
  function disposePlayer() {
    ready = false;
    window.__ownTurboWarp = null;
    if (player) {
      try { player.stopAll?.(); } catch (error) { console.warn('stopAll', error); }
      try { player.dispose?.(); } catch (error) { console.warn('dispose', error); }
      try { player.vm?.quit?.(); } catch (error) { console.warn('vm.quit', error); }
      player = null;
    }
    stage.replaceChildren();
  }
  async function verifyBundle(bytes, expected) {
    if (!expected || !window.crypto?.subtle) return true;
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    const actual = Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2, '0')).join('');
    return actual === expected;
  }
  async function start({preserveState = false} = {}) {
    if (busy) {
      orientationPending = true;
      return;
    }
    busy = true;
    const snapshot = preserveState && ready ? snapshotState() : null;
    const run = ++generation;
    diagnostics.error = null;
    diagnostics.started = false;
    portrait = orientation.matches;
    diagnostics.portrait = portrait;
    retry.hidden = true;
    loading.classList.remove('error');
    loading.hidden = false;
    message.textContent = 'Загружаем собственный TurboWarp и анимацию…';
    try {
      if (!window.Scaffolding?.Scaffolding) {
        throw new Error('Локальный TurboWarp не загружен (vendor/scaffolding-with-music.js)');
      }
      disposePlayer();
      player = new window.Scaffolding.Scaffolding();
      player.width = width;
      player.height = stageHeight();
      player.resizeMode = 'dynamic-resize';
      player.editableLists = false;
      player.shouldConnectPeripherals = true;
      player.usePackagedRuntime = false;
      player.setup();
      player.appendTo(stage);
      diagnostics.source = portrait ? './chain-reaction-portrait.sb3' : './chain-reaction-wide.sb3';
      const manifestResponse = await fetch('./build-manifest.json', {cache: 'no-store'});
      const manifest = manifestResponse.ok ? await manifestResponse.json() : null;
      const version = manifest?.version || 'legacy';
      diagnostics.buildVersion = version;
      const sourceName = diagnostics.source.slice(2);
      const url = diagnostics.source + '?v=' + encodeURIComponent(version);
      const download = async cache => {
        const response = await fetch(url, {cache});
        if (!response.ok) throw new Error('Наш файл игры недоступен: HTTP ' + response.status);
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength < 200_000) throw new Error('Файл Scratch слишком мал или повреждён');
        return bytes;
      };
      let bytes = await download('default');
      const expected = manifest?.sha256?.[sourceName];
      if (!(await verifyBundle(bytes, expected))) {
        // The manifest is tiny and fresh; recover once from a stale/corrupt cached bundle.
        bytes = await download('reload');
        if (!(await verifyBundle(bytes, expected))) throw new Error('SHA-256 Scratch-файла не совпал');
      }
      await player.loadProject(bytes);
      if (run !== generation) return;
      player.greenFlag();
      ready = true;
      diagnostics.started = true;
      loading.hidden = true;
      window.__ownTurboWarp = {
        diagnostics, player, relocate, relayout: responsiveLayout,
        restart: () => { player.stopAll(); player.greenFlag(); requestAnimationFrame(responsiveLayout); }
      };
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (run !== generation) return;
        restoreState(snapshot);
        responsiveLayout();
      }));
    } catch (error) {
      if (run === generation) {
        disposePlayer();
        setError(error);
      }
    } finally {
      busy = false;
      if (orientationPending || portrait !== orientation.matches) {
        orientationPending = false;
        if (portrait !== orientation.matches) void start({preserveState: ready});
      }
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
  retry.addEventListener('click', () => start());
  orientation.addEventListener('change', () => {
    if (busy) orientationPending = true;
    else if (ready) void start({preserveState: true});
    else void start();
  });
  window.addEventListener('resize', () => {
    if (!ready) return;
    requestAnimationFrame(responsiveLayout);
  }, {passive: true});
  document.addEventListener('fullscreenchange', () =>
    setTimeout(responsiveLayout, 150));
  start();
})();
