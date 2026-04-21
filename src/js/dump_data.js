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

  async function startExport(type, maxItems = 500) {
    if (runtime.activeSession?.isActive()) {
      console.warn("已有导出任务正在执行，忽略新的开始请求");
      return;
    }

    // 同一时间只允许一个导出任务，避免多个会话同时写同一份 storage。
    const session = new ExportSession(type, maxItems);
    runtime.activeSession = session;
    await session.start();
  }

  async function stopExport() {
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

    const resumedSession = new ExportSession(status.type, progress.total || 500, {
      currentCount: progress.current || 0
    });

    runtime.activeSession = resumedSession;
    await resumedSession.start();
  }

  runtime.startExport = startExport;
  runtime.stopExport = stopExport;
  runtime.getExportStatus = getExportStatus;
  runtime.getVisibleItemCount = getVisibleItemCount;

  if (typeof document !== "undefined" && document) {
    maybeResumeExport().catch(error => {
      console.error("导出恢复过程中出错:", error);
    });
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // popup 只和这一层通信，内部如何拆分模块对 UI 是透明的。
    const handlers = {
      startExport_answers: async () => {
        void startExport("answers", request.maxAnswers || 500);
        sendResponse({ success: true });
      },
      startExport_articles: async () => {
        void startExport("articles", request.maxAnswers || 500);
        sendResponse({ success: true });
      },
      startExport_pins: async () => {
        void startExport("pins", request.maxAnswers || 500);
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
