// The API interprets ideas; only the existing deterministic game engine may apply them.
const ENDPOINT = 'https://world-server.mmmpaykin.workers.dev/api/chain-ai';
const WORDS = Object.freeze({ city: 'город', forest: 'лес', energy: 'энергия',
  volcano: 'вулкан', farm: 'ферма', irrigation: 'орошение', recycling: 'очистка' });
export function compileAiGameActions(response) {
  if (!response?.ok || !Array.isArray(response.proposal?.commands)) throw Error('Некорректный ответ ИИ.');
  const supported = [], eventKinds = [], unsupported = [...(Array.isArray(response.proposal.unknowns) ? response.proposal.unknowns : [])];
  const styles = [];
  for (const command of response.proposal.commands.slice(0, 4)) {
    if (command?.action === 'event' && ['dragon','attack'].includes(command.kind)) {
      eventKinds.push(command.kind);
      continue;
    }
    if (!command || command.action !== 'create' || !Object.hasOwn(WORDS, command.kind)) {
      unsupported.push(String(command?.details || command?.kind || 'Неизвестное действие').slice(0, 130));
      continue;
    }
    if (!supported.includes(command.kind)) supported.push(command.kind);
    if (command.style) styles.push(String(command.style).slice(0, 60));
  }
  return {
    commandText: supported.map(kind => WORDS[kind]).join(', '),
    supported, eventKinds, unsupported: unsupported.slice(0, 6), styles,
    summary: String(response.proposal.summary || '').slice(0, 300),
    provider: response.provider === 'groq' ? 'Groq' : response.provider === 'gemini' ? 'Gemini' : 'Cloudflare AI'
  };
}
export async function interpretGameIdea(text, provider, worldContext, fetchImpl = fetch) {
  const allowed = ['auto', 'cloudflare', 'groq', 'gemini'];
  const chosen = allowed.includes(provider) ? provider : 'auto';
  const response = await fetchImpl(ENDPOINT, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ text, provider: chosen, worldContext })
  });
  if (!response.ok) throw Error('ИИ временно недоступен (' + response.status + ').');
  return compileAiGameActions(await response.json());
}
