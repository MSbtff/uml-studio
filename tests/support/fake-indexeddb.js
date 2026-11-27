'use strict';

function clone(value) {
  if (value == null) return value;
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

class FakeTransaction {
  constructor(database, storeNames) {
    this.database = database;
    this.storeNames = new Set(Array.isArray(storeNames) ? storeNames : [storeNames]);
    this.error = null;
    this.oncomplete = null;
    this.onabort = null;
    this.onerror = null;
    this.pending = 0;
    this.aborted = false;
    this.completed = false;
    this.completionGeneration = 0;
    this.scheduleCompletion();
  }

  objectStore(name) {
    if (!this.storeNames.has(name)) throw new Error(`Store is outside transaction: ${name}`);
    const definition = this.database.stores.get(name);
    if (!definition) throw new Error(`Missing object store: ${name}`);
    return new FakeObjectStore(this, definition);
  }

  request(operation) {
    const request = { result: undefined, error: null, onsuccess: null, onerror: null };
    this.pending += 1;
    this.completionGeneration += 1;
    setImmediate(() => {
      if (this.aborted) return;
      try {
        request.result = clone(operation());
        request.onsuccess?.();
      } catch (error) {
        request.error = error;
        this.error = error;
        request.onerror?.();
        this.onerror?.();
      } finally {
        this.pending -= 1;
        this.scheduleCompletion();
      }
    });
    return request;
  }

  scheduleCompletion() {
    const generation = ++this.completionGeneration;
    setImmediate(() => {
      if (generation !== this.completionGeneration || this.pending || this.aborted || this.completed) return;
      this.completed = true;
      this.oncomplete?.();
    });
  }

  abort() {
    if (this.aborted || this.completed) return;
    this.aborted = true;
    setImmediate(() => this.onabort?.());
  }
}

class FakeIndex {
  constructor(transaction, definition, field) {
    this.transaction = transaction;
    this.definition = definition;
    this.field = field;
  }

  getAll(value) {
    return this.transaction.request(() => [...this.definition.records.values()]
      .filter(record => record[this.field] === value));
  }
}

class FakeObjectStore {
  constructor(transaction, definition) {
    this.transaction = transaction;
    this.definition = definition;
  }

  createIndex(name, field) {
    this.definition.indexes.set(name, field);
    return new FakeIndex(this.transaction, this.definition, field);
  }

  index(name) {
    const field = this.definition.indexes.get(name);
    if (!field) throw new Error(`Missing index: ${name}`);
    return new FakeIndex(this.transaction, this.definition, field);
  }

  get(key) {
    return this.transaction.request(() => this.definition.records.get(key));
  }

  getAll() {
    return this.transaction.request(() => [...this.definition.records.values()]);
  }

  put(record) {
    return this.transaction.request(() => {
      const stored = clone(record);
      const key = stored[this.definition.keyPath];
      this.definition.records.set(key, stored);
      return key;
    });
  }

  delete(key) {
    return this.transaction.request(() => this.definition.records.delete(key));
  }
}

class FakeDatabase {
  constructor() {
    this.stores = new Map();
    this.onversionchange = null;
  }

  get objectStoreNames() {
    return { contains: name => this.stores.has(name) };
  }

  createObjectStore(name, options = {}) {
    const definition = {
      keyPath: options.keyPath || 'id',
      records: new Map(),
      indexes: new Map(),
    };
    this.stores.set(name, definition);
    const upgradeTransaction = new FakeTransaction(this, name);
    return new FakeObjectStore(upgradeTransaction, definition);
  }

  transaction(storeNames) {
    return new FakeTransaction(this, storeNames);
  }

  close() {}
}

function createFakeIndexedDB() {
  const databases = new Map();
  return {
    databases,
    open(name) {
      const request = {
        result: undefined,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      };
      setImmediate(() => {
        let database = databases.get(name);
        const created = !database;
        if (!database) {
          database = new FakeDatabase();
          databases.set(name, database);
        }
        request.result = database;
        if (created) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
}

module.exports = { createFakeIndexedDB };
