// 테스트용 localStorage 대역 (담당: 지훈)
export class MemoryStorage {
  constructor(initial = {}) {
    this.items = new Map(Object.entries(initial));
  }
  getItem(key) {
    return this.items.has(key) ? this.items.get(key) : null;
  }
  setItem(key, value) {
    this.items.set(key, String(value));
  }
  removeItem(key) {
    this.items.delete(key);
  }
}
