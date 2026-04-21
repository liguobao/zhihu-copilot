(() => {
  const runtime = globalThis.ZhihuExportRuntime || {};

  // 所有导出脚本共享的基础常量和工具都挂在同一个 runtime 上，
  // manifest 按顺序加载这些脚本，所以后续模块可以直接复用这里的定义。
  runtime.STORAGE_KEYS = {
    ANSWER: {
      LIST: "zhihu_ans_list",
      IDS: "zhihu_ans_ids"
    },
    ARTICLE: {
      LIST: "zhihu_article_list",
      IDS: "zhihu_article_ids"
    },
    PIN: {
      LIST: "zhihu_pin_list",
      IDS: "zhihu_pin_ids"
    },
    EXPORT_STATUS: "zhihu_export_status",
    EXPORT_PROGRESS: "zhihu_export_progress"
  };

  runtime.EXPORT_STATUS = {
    IDLE: "idle",
    EXPORTING: "exporting",
    REFRESHING: "refreshing",
    COMPLETED: "completed",
    STOPPED: "stopped"
  };

  runtime.EXPORT_LOOP_SETTINGS = {
    INITIAL_LOAD_TIMEOUT_MS: 15000,
    INITIAL_LOAD_POLL_MS: 500,
    EXPAND_WAIT_MS: 1000,
    CLICK_EXPAND_WAIT_MS: 300,
    LOAD_WAIT_MS: 3000,
    LOAD_WAIT_STEP_MS: 250,
    MAX_IDLE_ROUNDS: 3
  };

  runtime.activeSession = runtime.activeSession || null;

  runtime.sleep = function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  };

  // 轮询等待时随时响应 stop，避免页面还在 sleep 但 UI 已经点了停止。
  runtime.sleepWhileActive = async function sleepWhileActive(session, ms, step = 250) {
    let elapsed = 0;

    while (elapsed < ms && session.isActive()) {
      const wait = Math.min(step, ms - elapsed);
      await runtime.sleep(wait);
      elapsed += wait;
    }
  };

  runtime.parseItemData = function parseItemData(item) {
    const rawValue = item.getAttribute("data-zop");
    if (!rawValue) {
      return null;
    }

    try {
      return JSON.parse(rawValue);
    } catch (error) {
      console.warn("解析 data-zop 失败:", error, rawValue);
      return null;
    }
  };

  runtime.normalizeZhihuPath = function normalizeZhihuPath(href) {
    return (href || "")
      .replace(/^https?:\/\//, "")
      .replace(/^\/\//, "");
  };

  runtime.parseZhihuCountText = function parseZhihuCountText(text, label = "") {
    const normalized = String(text || "")
      .replace(/,/g, "")
      .replace(/\s+/g, "");

    if (!normalized) {
      return null;
    }

    const searchText =
      label && normalized.includes(label)
        ? normalized.slice(normalized.indexOf(label) + label.length)
        : normalized;
    const match = searchText.match(/(\d+(?:\.\d+)?)(万|亿)?/);

    if (!match) {
      return null;
    }

    const value = Number.parseFloat(match[1]);
    if (Number.isNaN(value)) {
      return null;
    }

    if (match[2] === "万") {
      return Math.round(value * 10000);
    }

    if (match[2] === "亿") {
      return Math.round(value * 100000000);
    }

    return Math.round(value);
  };

  runtime.extractPinIdFromItem = function extractPinIdFromItem(item) {
    const parsed = runtime.parseItemData(item);
    if (parsed?.itemId) {
      return String(parsed.itemId);
    }

    // 想法流里 data-zop 偶尔拿不到完整数据，回退到详情链接兜底。
    const pinLink =
      item.querySelector('a[href*="/pin/"]') ||
      item.querySelector('.ContentItem-time a[href*="/pin/"]');

    if (!pinLink) {
      return null;
    }

    const normalized = runtime.normalizeZhihuPath(pinLink.getAttribute("href"));
    const segments = normalized.split("/").filter(Boolean);
    const lastSegment = segments.pop();

    return lastSegment ? lastSegment.split("?")[0] : null;
  };

  runtime.extractPinTitle = function extractPinTitle(item) {
    const authorElement = item.querySelector(".PinItem-author");
    const timeElement = item.querySelector(".ContentItem-time");
    let title = authorElement ? `${authorElement.innerText}的想法` : "未知作者的想法";

    if (timeElement) {
      title += ` - ${timeElement.innerText}`;
    }

    return title;
  };

  runtime.sanitizeFileName = function sanitizeFileName(fileName) {
    return fileName.replace(/[\\/:*?"<>|]/g, "_");
  };

  runtime.createTimestamp = function createTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, "-");
  };

  runtime.getDocumentScrollHeight = function getDocumentScrollHeight() {
    return Math.max(
      document.body?.scrollHeight || 0,
      document.documentElement?.scrollHeight || 0
    );
  };

  globalThis.ZhihuExportRuntime = runtime;
})();
