(() => {
  if (globalThis.ZhihuCopilotMindMapInitialized) {
    if (globalThis.ZhihuCopilotMindMap?.refreshTrigger) {
      globalThis.ZhihuCopilotMindMap.refreshTrigger();
    }
    return;
  }

  globalThis.ZhihuCopilotMindMapInitialized = true;

  const BUTTON_ID = "zhc-mindmap-trigger";
  const PANEL_ID = "zhc-mindmap-panel";
  const STYLE_ID = "zhc-mindmap-style";
  const MIN_CONTENT_LENGTH = 120;
  const MAX_RENDER_TEXT_LENGTH = 60;
  const BRANCH_COLORS = [
    "#2f80ed",
    "#27ae60",
    "#d9822b",
    "#8e6bbf",
    "#c44d74",
    "#239a9a",
    "#9b8f24",
    "#6f7f8f"
  ];

  let currentMindMapData = null;
  let currentSource = null;
  let isGenerating = false;
  let lastHref = location.href;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID} {
        position: fixed;
        right: 22px;
        top: 152px;
        z-index: 2147483646;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 88px;
        height: 34px;
        padding: 0 12px;
        border: 1px solid #d7e7ff;
        border-radius: 6px;
        background: #ffffff;
        color: #0066d6;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        font: 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
        cursor: pointer;
      }

      #${BUTTON_ID}:hover {
        background: #f2f8ff;
        border-color: #9cc9ff;
      }

      #${PANEL_ID} {
        position: fixed;
        inset: 36px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: #ffffff;
        border: 1px solid #dce3ea;
        border-radius: 8px;
        box-shadow: 0 18px 64px rgba(15, 23, 42, 0.22);
        color: #222;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      }

      .zhc-mm-toolbar {
        flex: 0 0 46px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 0 12px 0 16px;
        border-bottom: 1px solid #edf0f3;
        background: #fbfcfd;
      }

      .zhc-mm-title {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 14px;
        font-weight: 600;
        color: #1f2933;
      }

      .zhc-mm-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 0 0 auto;
      }

      .zhc-mm-action {
        min-width: 30px;
        height: 30px;
        padding: 0 8px;
        border: 1px solid #dde5ee;
        border-radius: 6px;
        background: #ffffff;
        color: #3b4652;
        font-size: 12px;
        line-height: 1;
        cursor: pointer;
      }

      .zhc-mm-action:hover {
        background: #f4f7fb;
      }

      .zhc-mm-action:disabled {
        cursor: not-allowed;
        color: #a0a8b2;
        background: #f7f8fa;
      }

      .zhc-mm-close {
        width: 30px;
        padding: 0;
        font-size: 18px;
      }

      .zhc-mm-body {
        position: relative;
        flex: 1 1 auto;
        overflow: auto;
        background: #ffffff;
      }

      .zhc-mm-message {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: min(520px, calc(100% - 48px));
        color: #4b5563;
        font-size: 14px;
        line-height: 1.7;
        text-align: center;
      }

      .zhc-mm-spinner {
        width: 26px;
        height: 26px;
        margin: 0 auto 12px;
        border: 3px solid #e6eef8;
        border-top-color: #0084ff;
        border-radius: 50%;
        animation: zhc-mm-spin 0.9s linear infinite;
      }

      @keyframes zhc-mm-spin {
        to { transform: rotate(360deg); }
      }

      .zhc-mm-svg {
        display: block;
        min-width: 100%;
        min-height: 100%;
        background: #ffffff;
      }

      .zhc-mm-link {
        fill: none;
        stroke-width: 1.65;
        stroke-linecap: round;
      }

      .zhc-mm-dot {
        fill: #ffffff;
        stroke-width: 1.8;
      }

      .zhc-mm-text {
        fill: #2e343b;
        font-size: 14px;
        dominant-baseline: middle;
        white-space: pre;
      }

      .zhc-mm-root {
        font-weight: 600;
        font-size: 15px;
      }

      .zhc-mm-underline {
        stroke-width: 1.35;
        stroke-linecap: round;
      }

      @media (max-width: 720px) {
        #${PANEL_ID} {
          inset: 12px;
        }

        #${BUTTON_ID} {
          right: 12px;
          top: auto;
          bottom: 78px;
        }
      }
    `;

    document.documentElement.appendChild(style);
  }

  function isSupportedMindMapPage(url = location.href) {
    return /https:\/\/www\.zhihu\.com\/question\/\d+\/answer\/\d+/.test(url) ||
      /https:\/\/zhuanlan\.zhihu\.com\/p\/\d+/.test(url) ||
      /https:\/\/www\.zhihu\.com\/p\/\d+/.test(url);
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function readText(element) {
    if (!element) {
      return "";
    }

    const clone = element.cloneNode(true);
    clone.querySelectorAll("script, style, noscript, svg, button, input, textarea").forEach(node => {
      node.remove();
    });

    return normalizeText(clone.innerText || clone.textContent || "");
  }

  function pickTextBySelectors(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const text = normalizeText(element?.innerText || element?.textContent || "");
      if (text) {
        return text;
      }
    }

    return "";
  }

  function getPageTitle() {
    const title = pickTextBySelectors([
      ".QuestionHeader-title",
      ".Post-Title",
      "h1.Post-Title",
      "h1",
      "title"
    ]);

    return normalizeText(title || document.title)
      .replace(/\s*-\s*知乎.*$/, "")
      .replace(/\s*-\s*知乎专栏.*$/, "")
      .slice(0, 80);
  }

  function getPageType() {
    if (/\/answer\/\d+/.test(location.href)) {
      return "answer";
    }

    if (/\/p\/\d+/.test(location.href)) {
      return "article";
    }

    return "unknown";
  }

  async function expandReadableContent() {
    const buttons = Array.from(document.querySelectorAll(".ContentItem-more, button"));
    const expandButtons = buttons.filter(button => {
      const text = normalizeText(button.innerText || button.textContent || "");
      return button.classList.contains("ContentItem-more") || text.includes("阅读全文");
    });

    for (const button of expandButtons.slice(0, 3)) {
      try {
        button.click();
      } catch (error) {
        console.warn("展开知乎正文失败:", error);
      }
    }

    if (expandButtons.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  function pickContentElement() {
    const selectors = [
      ".AnswerItem .RichContent-inner",
      ".QuestionAnswer-content .RichContent-inner",
      ".AnswerCard .RichContent-inner",
      ".Post-RichText",
      ".RichText.ztext",
      "article",
      "main"
    ];

    let bestElement = null;
    let bestLength = 0;

    for (const selector of selectors) {
      const candidates = Array.from(document.querySelectorAll(selector));
      for (const candidate of candidates) {
        const textLength = readText(candidate).length;
        if (textLength > bestLength) {
          bestElement = candidate;
          bestLength = textLength;
        }
      }
    }

    return bestElement;
  }

  async function extractCurrentPageContent() {
    await expandReadableContent();

    const contentElement = pickContentElement();
    const content = readText(contentElement || document.body);

    return {
      title: getPageTitle(),
      content,
      url: location.href,
      pageType: getPageType()
    };
  }

  function ensureTrigger() {
    ensureStyle();

    const existingButton = document.getElementById(BUTTON_ID);
    if (!isSupportedMindMapPage()) {
      if (existingButton) {
        existingButton.remove();
      }
      return;
    }

    if (existingButton) {
      return;
    }

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.title = "生成当前回答或文章的思维导图";
    button.textContent = "思维导图";
    button.addEventListener("click", () => {
      void openPanelAndGenerate();
    });
    document.documentElement.appendChild(button);
  }

  function getPanelElements() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) {
      return {};
    }

    return {
      panel,
      title: panel.querySelector(".zhc-mm-title"),
      body: panel.querySelector(".zhc-mm-body"),
      regenerate: panel.querySelector("[data-mm-action='regenerate']"),
      saveSvg: panel.querySelector("[data-mm-action='save-svg']"),
      saveJson: panel.querySelector("[data-mm-action='save-json']")
    };
  }

  function ensurePanel() {
    ensureStyle();

    let panel = document.getElementById(PANEL_ID);
    if (panel) {
      return getPanelElements();
    }

    panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "知乎思维导图");
    panel.innerHTML = `
      <div class="zhc-mm-toolbar">
        <div class="zhc-mm-title">思维导图</div>
        <div class="zhc-mm-actions">
          <button type="button" class="zhc-mm-action" data-mm-action="regenerate" title="重新生成">↻</button>
          <button type="button" class="zhc-mm-action" data-mm-action="save-svg" title="保存 SVG">SVG</button>
          <button type="button" class="zhc-mm-action" data-mm-action="save-json" title="保存 JSON">JSON</button>
          <button type="button" class="zhc-mm-action zhc-mm-close" data-mm-action="close" title="关闭">×</button>
        </div>
      </div>
      <div class="zhc-mm-body"></div>
    `;

    panel.querySelector("[data-mm-action='close']").addEventListener("click", () => {
      panel.remove();
    });

    panel.querySelector("[data-mm-action='regenerate']").addEventListener("click", () => {
      void generateMindMap(true);
    });

    panel.querySelector("[data-mm-action='save-svg']").addEventListener("click", () => {
      downloadCurrentSvg();
    });

    panel.querySelector("[data-mm-action='save-json']").addEventListener("click", () => {
      downloadCurrentJson();
    });

    document.documentElement.appendChild(panel);

    return getPanelElements();
  }

  function setPanelMessage(message, loading = false) {
    const { body, saveSvg, saveJson } = getPanelElements();
    if (!body) {
      return;
    }

    body.innerHTML = `
      <div class="zhc-mm-message">
        ${loading ? '<div class="zhc-mm-spinner"></div>' : ""}
        <div>${escapeHtml(message)}</div>
      </div>
    `;

    if (saveSvg) {
      saveSvg.disabled = true;
    }

    if (saveJson) {
      saveJson.disabled = true;
    }
  }

  function setActionDisabled(disabled) {
    const { regenerate, saveSvg, saveJson } = getPanelElements();
    if (regenerate) {
      regenerate.disabled = disabled;
    }
    if (saveSvg) {
      saveSvg.disabled = disabled || !currentMindMapData;
    }
    if (saveJson) {
      saveJson.disabled = disabled || !currentMindMapData;
    }
  }

  async function openPanelAndGenerate() {
    ensurePanel();

    if (currentMindMapData && currentSource?.url === location.href) {
      renderCurrentMindMap();
      return;
    }

    await generateMindMap(false);
  }

  async function generateMindMap(force) {
    if (isGenerating) {
      return;
    }

    const { title } = ensurePanel();
    isGenerating = true;
    currentMindMapData = force ? null : currentMindMapData;
    setActionDisabled(true);
    setPanelMessage("正在读取页面内容并生成思维导图...", true);

    try {
      const source = await extractCurrentPageContent();
      if (title) {
        title.textContent = `思维导图：${source.title || "当前页面"}`;
      }

      if (!source.content || source.content.length < MIN_CONTENT_LENGTH) {
        throw new Error("当前页面没有读取到足够的正文内容，请确认已打开回答详情页或专栏文章页");
      }

      const response = await sendRuntimeMessage({
        action: "generateMindMap",
        source
      });

      if (!response?.success) {
        throw new Error(response?.error || "思维导图生成失败");
      }

      currentSource = source;
      currentMindMapData = response.mindMap;
      renderCurrentMindMap();
    } catch (error) {
      console.error("生成思维导图失败:", error);
      currentMindMapData = null;
      setPanelMessage(error?.message || "思维导图生成失败");
    } finally {
      isGenerating = false;
      setActionDisabled(false);
    }
  }

  function sendRuntimeMessage(message) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          resolve({
            success: false,
            error: chrome.runtime.lastError.message
          });
          return;
        }

        resolve(response);
      });
    });
  }

  function renderCurrentMindMap() {
    const { body, saveSvg, saveJson } = getPanelElements();
    if (!body || !currentMindMapData) {
      return;
    }

    body.innerHTML = "";
    renderMindMap(body, currentMindMapData);

    if (saveSvg) {
      saveSvg.disabled = false;
    }
    if (saveJson) {
      saveJson.disabled = false;
    }
  }

  function renderMindMap(container, data) {
    const root = normalizeRenderNode(data?.root || data, "root");
    const levelWidths = [];
    collectLevelWidths(root, 0, levelWidths);

    const xByDepth = [];
    let currentX = 58;
    for (let depth = 0; depth < levelWidths.length; depth += 1) {
      xByDepth[depth] = currentX;
      currentX += levelWidths[depth] + (depth === 0 ? 84 : 76);
    }

    const nodes = [];
    const links = [];
    let leafIndex = 0;
    const leafGap = 35;
    const paddingY = 54;

    function layout(node, depth, parent, branchIndex) {
      const children = Array.isArray(node.children) ? node.children : [];
      const startLeaf = leafIndex;
      const nodeBranch = depth === 0 ? 0 : branchIndex;

      if (children.length === 0) {
        node._y = leafIndex * leafGap + paddingY;
        leafIndex += 1;
      } else {
        children.forEach((child, index) => {
          layout(child, depth + 1, node, depth === 0 ? index : nodeBranch);
        });
        const endLeaf = Math.max(startLeaf, leafIndex - 1);
        node._y = ((startLeaf + endLeaf) / 2) * leafGap + paddingY;
      }

      node._x = xByDepth[depth] || currentX;
      node._depth = depth;
      node._branch = nodeBranch;
      node._width = estimateTextWidth(node.text, depth === 0);
      nodes.push(node);

      if (parent) {
        links.push({
          source: parent,
          target: node,
          branch: nodeBranch
        });
      }
    }

    layout(root, 0, null, 0);

    const width = Math.max(860, Math.max(...nodes.map(node => node._x + node._width)) + 80);
    const height = Math.max(500, Math.max(...nodes.map(node => node._y)) + paddingY);
    const svg = createSvg("svg", {
      class: "zhc-mm-svg",
      width,
      height,
      viewBox: `0 0 ${width} ${height}`
    });

    links.forEach(link => {
      const color = BRANCH_COLORS[link.branch % BRANCH_COLORS.length];
      const sourceX = link.source._x + link.source._width + 12;
      const sourceY = link.source._y;
      const targetX = link.target._x - 18;
      const targetY = link.target._y;
      const midX = sourceX + Math.max(42, (targetX - sourceX) * 0.52);

      svg.appendChild(createSvg("path", {
        class: "zhc-mm-link",
        d: `M ${sourceX} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}`,
        stroke: color
      }));
    });

    nodes.forEach(node => {
      const color = BRANCH_COLORS[node._branch % BRANCH_COLORS.length];

      if (node._depth > 0 && Array.isArray(node.children) && node.children.length > 0) {
        svg.appendChild(createSvg("circle", {
          class: "zhc-mm-dot",
          cx: node._x - 18,
          cy: node._y,
          r: 6,
          stroke: color
        }));
      }

      const text = createSvg("text", {
        class: node._depth === 0 ? "zhc-mm-text zhc-mm-root" : "zhc-mm-text",
        x: node._x,
        y: node._y
      });
      text.textContent = node.text;
      svg.appendChild(text);

      if (node._depth > 0 && (!node.children || node.children.length === 0)) {
        svg.appendChild(createSvg("line", {
          class: "zhc-mm-underline",
          x1: node._x,
          y1: node._y + 13,
          x2: node._x + node._width,
          y2: node._y + 13,
          stroke: color
        }));
      }
    });

    container.appendChild(svg);
  }

  function normalizeRenderNode(node, fallbackId, depth = 0) {
    const text = trimRenderText(node?.text || node?.title || fallbackId);
    const children = Array.isArray(node?.children)
      ? node.children
        .map((child, index) => normalizeRenderNode(child, `${fallbackId}-${index + 1}`, depth + 1))
        .filter(child => child.text)
      : [];

    return {
      id: String(node?.id || fallbackId),
      text,
      children
    };
  }

  function trimRenderText(text) {
    const normalized = normalizeText(text).replace(/\n/g, " ");
    const chars = Array.from(normalized);
    if (chars.length <= MAX_RENDER_TEXT_LENGTH) {
      return normalized;
    }

    return `${chars.slice(0, MAX_RENDER_TEXT_LENGTH - 1).join("")}…`;
  }

  function collectLevelWidths(node, depth, widths) {
    widths[depth] = Math.max(widths[depth] || 0, estimateTextWidth(node.text, depth === 0));
    (node.children || []).forEach(child => collectLevelWidths(child, depth + 1, widths));
  }

  function estimateTextWidth(text, isRoot = false) {
    const base = isRoot ? 16 : 14;
    return Array.from(String(text || "")).reduce((sum, char) => {
      return sum + (char.charCodeAt(0) > 255 ? base : Math.ceil(base * 0.58));
    }, 0);
  }

  function createSvg(tag, attrs) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([key, value]) => {
      element.setAttribute(key, String(value));
    });
    return element;
  }

  function downloadCurrentSvg() {
    const svg = document.querySelector(`#${PANEL_ID} svg`);
    if (!svg) {
      return;
    }

    const serializer = new XMLSerializer();
    const content = serializer.serializeToString(svg);
    downloadText(`${buildDownloadName()}.svg`, content, "image/svg+xml;charset=utf-8");
  }

  function downloadCurrentJson() {
    if (!currentMindMapData) {
      return;
    }

    downloadText(
      `${buildDownloadName()}.json`,
      JSON.stringify(currentMindMapData, null, 2),
      "application/json;charset=utf-8"
    );
  }

  function buildDownloadName() {
    const title = currentMindMapData?.title || currentMindMapData?.root?.text || "zhihu-mindmap";
    return normalizeText(title)
      .replace(/[\\/:*?"<>|]/g, "_")
      .slice(0, 60) || "zhihu-mindmap";
  }

  function downloadText(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.documentElement.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function refreshTrigger() {
    ensureTrigger();
  }

  function watchUrlChanges() {
    setInterval(() => {
      if (location.href === lastHref) {
        return;
      }

      lastHref = location.href;
      currentMindMapData = null;
      currentSource = null;
      document.getElementById(PANEL_ID)?.remove();
      refreshTrigger();
    }, 800);
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "openMindMap") {
      void openPanelAndGenerate();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === "getMindMapPageStatus") {
      sendResponse({
        success: true,
        supported: isSupportedMindMapPage(),
        title: getPageTitle()
      });
      return true;
    }

    return false;
  });

  globalThis.ZhihuCopilotMindMap = {
    refreshTrigger,
    open: openPanelAndGenerate
  };

  refreshTrigger();
  watchUrlChanges();
})();
