(() => {
  const runtime = globalThis.ZhihuExportRuntime;
  const { TYPE_CONFIGS, EXPORT_STATUS, ExportSession, exportPersistence, sleep } = runtime;

  // 入口文件只保留“启动/停止/恢复/消息分发”，
  // 具体抓取和导出细节全部放在 export/ 目录下。
  function getVisibleItemCount(type) {
    if (!type || !TYPE_CONFIGS[type]) {
      return 0;
    }

    return document.querySelectorAll(TYPE_CONFIGS[type].selector).length;
  }

  function getExportSummary(type) {
    if (!type || !TYPE_CONFIGS[type]) {
      return {
        totalCount: null,
        visibleCount: 0
      };
    }

    const collector = new runtime.ZhihuPageCollector(type);

    return {
      totalCount: collector.getTotalCount(),
      visibleCount: collector.getVisibleCount()
    };
  }

  function normalizeMaxItems(maxItems, exportAll = false) {
    const parsedValue = Number(maxItems);
    if (Number.isFinite(parsedValue) && parsedValue > 0) {
      return Math.floor(parsedValue);
    }

    return exportAll ? null : 500;
  }

  function normalizeUrlWithoutHash(url) {
    try {
      const parsedUrl = new URL(url, window.location.href);
      parsedUrl.hash = "";
      parsedUrl.search = "";
      return parsedUrl.href.replace(/\/$/, "");
    } catch (error) {
      console.warn("规范化导出 URL 失败:", error, url);
      return "";
    }
  }

  function isCurrentPendingTaskTarget(task) {
    if (!task?.type || !TYPE_CONFIGS[task.type]) {
      return false;
    }

    const currentUrl = normalizeUrlWithoutHash(window.location.href);
    const targetUrl = normalizeUrlWithoutHash(task.targetUrl);
    if (targetUrl) {
      return currentUrl === targetUrl;
    }

    return currentUrl.endsWith(TYPE_CONFIGS[task.type].profilePath);
  }

  function resolvePendingTaskMaxItems(task) {
    if (!task?.exportAll) {
      return task?.maxItems;
    }

    const totalCount = new runtime.ZhihuPageCollector(task.type).getTotalCount();
    return Number.isFinite(totalCount) && totalCount > 0 ? totalCount : null;
  }

  async function startExport(type, maxItems = 500, options = {}) {
    await exportPersistence.clearPendingTask();

    if (runtime.activeSession?.isActive()) {
      console.warn("已有导出任务正在执行，忽略新的开始请求");
      return;
    }

    // 同一时间只允许一个导出任务，避免多个会话同时写同一份 storage。
    const session = new ExportSession(
      type,
      normalizeMaxItems(maxItems, Boolean(options.exportAll))
    );
    runtime.activeSession = session;
    await session.start();
  }

  async function stopExport() {
    await exportPersistence.clearPendingTask();

    if (runtime.activeSession?.isActive()) {
      runtime.activeSession.stop();
      return;
    }

    await exportPersistence.clearAllTypeData();
    await exportPersistence.clearRuntimeState();
  }

  async function getExportStatus() {
    return exportPersistence.getRuntimeSnapshot();
  }

  async function maybeResumeExport() {
    // content script 重新注入后，按持久化状态自动接回上一次未完成的导出。
    const { status, progress } = await exportPersistence.getRuntimeSnapshot();
    const shouldResume =
      (status.status === EXPORT_STATUS.EXPORTING ||
        status.status === EXPORT_STATUS.REFRESHING) &&
      Boolean(status.type) &&
      !runtime.activeSession;

    if (!shouldResume) {
      return;
    }

    const resumedSession = new ExportSession(status.type, progress.total ?? null, {
      currentCount: progress.current || 0
    });

    runtime.activeSession = resumedSession;
    await resumedSession.start();
  }

  async function maybeStartPendingExport() {
    const pendingTask = await exportPersistence.getPendingTask();
    if (!pendingTask || runtime.activeSession || !isCurrentPendingTaskTarget(pendingTask)) {
      return;
    }

    const maxItems = resolvePendingTaskMaxItems(pendingTask);
    await startExport(pendingTask.type, maxItems, {
      exportAll: Boolean(pendingTask.exportAll)
    });
  }

  async function initializeExportState() {
    await maybeResumeExport();
    await maybeStartPendingExport();
  }

  runtime.startExport = startExport;
  runtime.stopExport = stopExport;
  runtime.getExportStatus = getExportStatus;
  runtime.getVisibleItemCount = getVisibleItemCount;

  if (typeof document !== "undefined" && document) {
    initializeExportState().catch(error => {
      console.error("导出恢复过程中出错:", error);
    });
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // popup 只和这一层通信，内部如何拆分模块对 UI 是透明的。
    const requestedMaxItems = request.maxItems ?? request.maxAnswers;
    const exportOptions = {
      exportAll: Boolean(request.exportAll)
    };

    const handlers = {
      startExport_answers: async () => {
        void startExport("answers", requestedMaxItems, exportOptions);
        sendResponse({ success: true });
      },
      startExport_articles: async () => {
        void startExport("articles", requestedMaxItems, exportOptions);
        sendResponse({ success: true });
      },
      startExport_pins: async () => {
        void startExport("pins", requestedMaxItems, exportOptions);
        sendResponse({ success: true });
      },
      stopExport: async () => {
        await stopExport();
        sendResponse({ success: true });
      },
      getExportStatus: async () => {
        const snapshot = await getExportStatus();
        sendResponse({
          status: snapshot.status.status,
          type: snapshot.status.type,
          progress: snapshot.progress
        });
      },
      getExportSummary: async () => {
        sendResponse(getExportSummary(request.exportType));
      },
      getTotalPages: async () => {
        console.log("知乎个人页已切换为无限下拉，返回估算页数");
        await sleep(1000);

        const visibleCount = getVisibleItemCount(
          runtime.activeSession?.type || request.exportType
        );
        sendResponse({
          totalPages: visibleCount > 0 ? 1 : 0
        });
      }
    };

    const handler = handlers[request.action];
    if (!handler) {
      return true;
    }

    handler().catch(error => {
      console.error("处理消息时出错:", error);
      sendResponse({
        success: false,
        error: error?.message || "未知错误"
      });
    });

    return true;
  });
})();
