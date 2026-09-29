export const CONFIG = Object.freeze({
  INITIAL_POPULATION: 32, INITIAL_BUDGET: 50, MAX_RESOURCE: 100,
  CRISIS_THRESHOLD: 10, IDEA_COST: 6, SAVE_VERSION: 1, MAX_LOG: 40,
});
export const RESOURCE_KEYS = Object.freeze(['population','power','water','food','eco','budget']);
export const BUILD_KINDS = Object.freeze(['city','forest','energy','volcano']);
const INITIAL = Object.freeze({
  turn: 0, population: 32, power: 0, water: 0, food: 0, eco: 0, budget: 50,
});
const own = (object,key) => Object.prototype.hasOwnProperty.call(object,key);
const validCount = value => Number.isSafeInteger(value) && value >= 0 && value <= 100000;

export class GameState {
  constructor(snapshot) {
    this.reset();
    if (snapshot) this.restore(snapshot);
  }
  reset() {
    this.values = { ...INITIAL };
    this.placed = Object.fromEntries(BUILD_KINDS.map(kind => [kind,0]));
    this.pendingDecision = false;
    this.log = [];
  }
  applyEffect(effect) {
    for (const [key,delta] of Object.entries(effect)) {
      if (!RESOURCE_KEYS.includes(key) || !Number.isFinite(delta)) {
        throw new TypeError('Недопустимый эффект: ' + key);
      }
      this.values[key] = Math.max(0, Math.min(
        CONFIG.MAX_RESOURCE, this.values[key] + delta,
      ));
    }
  }
  restore(snapshot) {
    if (!snapshot || snapshot.version !== CONFIG.SAVE_VERSION) return false;
    const values = snapshot.values, placed = snapshot.placed;
    if (!values || !placed || !validCount(values.turn)) return false;
    if (!RESOURCE_KEYS.every(key => own(values,key) &&
      Number.isFinite(values[key]) && values[key] >= 0 &&
      values[key] <= CONFIG.MAX_RESOURCE)) return false;
    if (!BUILD_KINDS.every(key => own(placed,key) && validCount(placed[key]))) return false;
    if (typeof snapshot.pendingDecision !== 'boolean') return false;
    const log = Array.isArray(snapshot.log) ? snapshot.log : [];
    if (!log.every(entry => typeof entry === 'string' && entry.length <= 900)) return false;
    this.values = { turn: values.turn };
    for (const key of RESOURCE_KEYS) this.values[key] = values[key];
    this.placed = Object.fromEntries(BUILD_KINDS.map(key => [key,placed[key]]));
    this.pendingDecision = snapshot.pendingDecision;
    this.log = log.slice(-CONFIG.MAX_LOG);
    return true;
  }
  snapshot() {
    return {
      version: CONFIG.SAVE_VERSION, values: { ...this.values },
      placed: { ...this.placed }, pendingDecision: this.pendingDecision,
      log: [...this.log],
    };
  }
  record(event) {
    this.log.push(String(event).slice(0,900));
    this.log = this.log.slice(-CONFIG.MAX_LOG);
  }
}
