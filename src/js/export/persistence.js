(() => {
  const runtime = globalThis.ZhihuExportRuntime;
  const { STORAGE_KEYS, EXPORT_STATUS, TYPE_CONFIGS } = runtime;

  // 把 callback 风格的 chrome.storage 包一层 Promise，
  // 这样导出主流程里可以统一使用 async/await。
  runtime.chromeStorage = {
    get(keys) {
      return new Promise(resolve => {
        chrome.storage.local.get(keys, resolve);
      });
    },

    set(values) {
      return new Promise(resolve => {
        chrome.storage.local.set(values, resolve);
      });
    },

    remove(keys) {
      return new Promise(resolve => {
        chrome.storage.local.remove(keys, resolve);
      });
    }
  };

  runtime.exportPersistence = {
    async loadTypeData(type) {
      const config = TYPE_CONFIGS[type];
      const result = await runtime.chromeStorage.get([config.listKey, config.idsKey]);

      return {
        items: Array.isArray(result[config.listKey]) ? result[config.listKey] : [],
        ids: Array.isArray(result[config.idsKey]) ? result[config.idsKey] : []
      };
    },

    async saveTypeData(type, items, ids) {
      const config = TYPE_CONFIGS[type];
      await runtime.chromeStorage.set({
        [config.listKey]: items,
        [config.idsKey]: ids
      });
    },

    async clearTypeData(type) {
      const config = TYPE_CONFIGS[type];
      await runtime.chromeStorage.remove([config.listKey, config.idsKey]);
    },

    async clearAllTypeData() {
      await runtime.chromeStorage.remove([
        STORAGE_KEYS.ANSWER.LIST,
        STORAGE_KEYS.ANSWER.IDS,
        STORAGE_KEYS.ARTICLE.LIST,
        STORAGE_KEYS.ARTICLE.IDS,
        STORAGE_KEYS.PIN.LIST,
        STORAGE_KEYS.PIN.IDS
      ]);
    },

    async saveRuntimeStatus(status, type) {
      await runtime.chromeStorage.set({
        [STORAGE_KEYS.EXPORT_STATUS]: {
          status,
          type,
          timestamp: Date.now()
        }
      });
    },

    async saveRuntimeProgress(current, total) {
      await runtime.chromeStorage.set({
        [STORAGE_KEYS.EXPORT_PROGRESS]: {
          current,
          total,
          timestamp: Date.now()
        }
      });
    },

    async getPendingTask() {
      const result = await runtime.chromeStorage.get(STORAGE_KEYS.EXPORT_TASK);
      return result[STORAGE_KEYS.EXPORT_TASK] || null;
    },

    async clearPendingTask() {
      await runtime.chromeStorage.remove(STORAGE_KEYS.EXPORT_TASK);
    },

    async getRuntimeSnapshot() {
      // 这里把运行时状态和进度打包返回，popup 恢复 UI、页面恢复导出都靠它。
      const result = await runtime.chromeStorage.get([
        STORAGE_KEYS.EXPORT_STATUS,
        STORAGE_KEYS.EXPORT_PROGRESS
      ]);

      return {
        status: result[STORAGE_KEYS.EXPORT_STATUS] || {
          status: EXPORT_STATUS.IDLE,
          type: ""
        },
        progress: result[STORAGE_KEYS.EXPORT_PROGRESS] || {
          current: 0,
          total: 0
        }
      };
    },

    async clearRuntimeState() {
      await runtime.chromeStorage.remove([
        STORAGE_KEYS.EXPORT_STATUS,
        STORAGE_KEYS.EXPORT_PROGRESS
      ]);
    }
  };
})();
