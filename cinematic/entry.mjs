// GitHub Pages and Telegram WebApp share World Server; local QA keeps legacy demo.
const params=new URLSearchParams(location.search);
const connected=location.hostname==='mpaykin1.github.io'||
  params.has('unified')||Boolean(window.Telegram?.WebApp?.initData);
await import(connected?'./unified-main.mjs':'./main.mjs');
