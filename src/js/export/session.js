(() => {
  const runtime = globalThis.ZhihuExportRuntime;
  const {
    TYPE_CONFIGS,
    EXPORT_STATUS,
    EXPORT_LOOP_SETTINGS,
    ZhihuPageCollector,
    exportPersistence,
    fileExporter
  } = runtime;

  class ExportSession {
    constructor(type, maxCount, options = {}) {
      // 一个 session 对应一次完整的导出任务，负责串起采集、存储、进度和收尾。
      this.type = type;
      this.config = TYPE_CONFIGS[type];
      this.maxCount = maxCount;
      this.currentCount = options.currentCount || 0;
      this.active = true;
      this.idleRounds = 0;
      this.items = [];
      this.itemIds = new Set();
      this.collector = new ZhihuPageCollector(type, this);
    }

    isActive() {
      return this.active && runtime.activeSession === this;
    }

    stop() {
      this.active = false;
    }

    async initialize() {
      const storedData = await exportPersistence.loadTypeData(this.type);
      this.items = storedData.items;
      this.itemIds = new Set(storedData.ids.map(String));
      this.currentCount = Math.min(this.currentCount || this.items.length, this.maxCount);

      await this.persistRuntime(EXPORT_STATUS.EXPORTING);
    }

    async persistRuntime(status) {
      await exportPersistence.saveRuntimeStatus(status, this.type);
      await exportPersistence.saveRuntimeProgress(this.currentCount, this.maxCount);
    }

    async persistTypeData() {
      await exportPersistence.saveTypeData(
        this.type,
        this.items,
        Array.from(this.itemIds)
      );
    }

    notifyProgress() {
      chrome.runtime.sendMessage({
        action: "updateProgress",
        current: Math.min(this.currentCount, this.maxCount),
        total: this.maxCount
      });
    }

    async collectVisibleItems() {
      let savedCount = 0;

      for (const item of this.collector.getVisibleItems()) {
        if (!this.isActive()) {
          console.log("检测到停止信号，终止保存内容");
          break;
        }

        if (this.currentCount >= this.maxCount) {
          console.log("已达到最大导出数量，停止保存");
          break;
        }

        const didSave = await this.saveItemFromNode(item);
        if (didSave) {
          savedCount += 1;
        }
      }

      return savedCount;
    }

    async saveItemFromNode(item) {
      const extractedItem = this.collector.extractVisibleItem(item);
      if (!extractedItem) {
        console.log(`${item} 不是有效的${this.config.itemLabel}，跳过`);
        return false;
      }

      const { id, title } = extractedItem;

      if (this.itemIds.has(id)) {
        console.log(`${this.config.itemLabel}:${id} 已存在，跳过`);
        return false;
      }

      // 先展开，再读正文，避免只导出截断内容。
      await this.collector.expandItem(item, title);

      const content = this.collector.getContentElement(item)?.innerText?.trim() || "";
      const record = this.config.createRecord({
        title,
        id,
        content,
        url: this.config.buildUrl(id)
      });

      this.itemIds.add(id);
      this.items.push(record);
      this.currentCount += 1;

      await this.persistTypeData();
      await exportPersistence.saveRuntimeProgress(this.currentCount, this.maxCount);

      console.log(`${this.config.itemLabel}:${id} 已保存`);
      this.notifyProgress();
      return true;
    }

    updateIdleRounds(savedCount, scrollResult) {
      // “本轮没有新增”并不一定代表到底了，所以只有在没有新增且页面也没有继续变化时，
      // 才累计 idleRounds，连续多轮后再判定结束。
      const afterMetrics = scrollResult?.afterMetrics || this.collector.getPageMetrics();
      const hasLoadSignal =
        Boolean(scrollResult?.hasVisibleGrowth) ||
        Boolean(scrollResult?.hasPageGrowth) ||
        Boolean(scrollResult?.hasScrollShift);

      console.log(
        `本轮新增${this.config.itemLabel}:${savedCount}，当前可见:${afterMetrics.visibleCount}，页面高度:${afterMetrics.scrollHeight}`
      );

      if (savedCount === 0 && !hasLoadSignal) {
        this.idleRounds += 1;
        console.log(
          `连续无新增轮次: ${this.idleRounds}/${EXPORT_LOOP_SETTINGS.MAX_IDLE_ROUNDS}`
        );
        return;
      }

      this.idleRounds = 0;
    }

    async run() {
      const initialVisibleCount = await this.collector.waitForVisibleItems();
      console.log(`导出开始，首屏可见${this.config.itemLabel}数量:`, initialVisibleCount);

      while (this.isActive() && this.currentCount < this.maxCount) {
        console.log("current_count:", this.currentCount);
        await exportPersistence.saveRuntimeProgress(this.currentCount, this.maxCount);

        const savedCount = await this.collectVisibleItems();
        if (!this.isActive()) {
          break;
        }

        if (this.currentCount >= this.maxCount) {
          console.log("已达到最大条数，结束导出");
          break;
        }

        const scrollResult = await this.collector.scrollForMore();
        if (!this.isActive()) {
          break;
        }

        this.updateIdleRounds(savedCount, scrollResult);
        if (this.idleRounds >= EXPORT_LOOP_SETTINGS.MAX_IDLE_ROUNDS) {
          console.log("连续多轮未加载到新内容，结束导出");
          break;
        }
      }
    }

    async handleCompleted() {
      await exportPersistence.saveRuntimeProgress(this.currentCount, this.maxCount);
      await fileExporter.exportMarkdown(this.type, this.items);
      await exportPersistence.clearTypeData(this.type);
      await exportPersistence.saveRuntimeStatus(EXPORT_STATUS.COMPLETED, this.type);

      chrome.runtime.sendMessage({
        action: "exportCompleted"
      });
    }

    async handleStopped() {
      await exportPersistence.clearTypeData(this.type);
      await exportPersistence.clearRuntimeState();

      chrome.runtime.sendMessage({
        action: "exportStopped"
      });
    }

    async handleError(error) {
      console.error("导出过程中出错:", error);
      await exportPersistence.clearTypeData(this.type);
      await exportPersistence.clearRuntimeState();

      chrome.runtime.sendMessage({
        action: "exportError",
        error: error?.message || "未知错误"
      });
    }

    async start() {
      // 统一在这里兜底成功、停止和异常三种收尾，避免外部调用方还要处理状态机。
      try {
        await this.initialize();
        await this.run();

        if (!this.isActive()) {
          await this.handleStopped();
          return;
        }

        await this.handleCompleted();
      } catch (error) {
        await this.handleError(error);
      } finally {
        this.active = false;
        if (runtime.activeSession === this) {
          runtime.activeSession = null;
        }
      }
    }
  }

  runtime.ExportSession = ExportSession;
})();
