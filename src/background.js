// Copyright (c) 2013 http://bigC.at. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// 基本配置
const pollIntervalMin = 1;  // 1 分钟
const pollIntervalMax = 60;  // 1 小时
const requestTimeout = 1000 * 2;  // 2 秒
let permission = 7; // options 1 2 4

// 存储状态
let responseArray = [0, 0, 0];
let unreadCount = 0;

// 初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('onInit');
  chrome.storage.local.set({ requestFailureCount: 0 });
  startRequest({ scheduleRequest: true, showLoadingAnimation: true });
  chrome.alarms.create('watchdog', { periodInMinutes: 5 });
});

// URL 相关函数
// 删除这些不再使用的 URL 相关函数
function getZhihuUrl() {
  return "https://www.zhihu.com";
}

function isZhihuUrl(url) {
  return url.indexOf(getZhihuUrl()) == 0;
}


// 加载动画 - 使用徽章文本代替
function LoadingAnimation() {
  this.timerId_ = 0;
  this.maxCount_ = 8;  // 动画总状态数
  this.current_ = 0;   // 当前状态
  this.maxDot_ = 4;    // 动画中的最大点数
}

LoadingAnimation.prototype.paintFrame = function() {
  let text = "";
  for (let i = 0; i < this.maxDot_; i++) {
    text += (i == this.current_) ? "." : " ";
  }
  if (this.current_ >= this.maxDot_)
    text += "";

  chrome.action.setBadgeText({ text: text });
  this.current_++;
  if (this.current_ == this.maxCount_)
    this.current_ = 0;
};

LoadingAnimation.prototype.start = function() {
  if (this.timerId_)
    return;

  const self = this;
  this.timerId_ = setInterval(function() {
    self.paintFrame();
  }, 100);
};

LoadingAnimation.prototype.stop = function() {
  if (!this.timerId_)
    return;

  clearInterval(this.timerId_);
  this.timerId_ = 0;
};

const loadingAnimation = new LoadingAnimation();

// 更新图标
function updateIcon() {
  chrome.storage.local.get(['unreadCount'], (result) => {
    const count = result.unreadCount || 0;
    
    if (permission == 0) {
      chrome.action.setIcon({ path: "img/zhihu_logged_in.png" });
      chrome.action.setBadgeBackgroundColor({ color: [190, 190, 190, 230] });
      chrome.action.setBadgeText({ text: "" });
      return;
    }
    
    if (count === undefined) {
      chrome.action.setIcon({ path: "img/zhihu_not_logged_in.png" });
      chrome.action.setBadgeBackgroundColor({ color: [190, 190, 190, 230] });
      chrome.action.setBadgeText({ text: "?" });
    } else if (count == 0) {
      chrome.action.setIcon({ path: "img/zhihu_not_logged_in.png" });
      chrome.action.setBadgeBackgroundColor({ color: [190, 190, 190, 230] });
      chrome.action.setBadgeText({ text: "" });
    } else {
      chrome.action.setIcon({ path: "img/zhihu_logged_in.png" });
      chrome.action.setBadgeBackgroundColor({ color: [208, 0, 24, 255] });
      chrome.action.setBadgeText({ text: count.toString() });
    }
  });
}

// 安排请求
function scheduleRequest() {
  console.log('scheduleRequest');
  
  chrome.storage.local.get(['requestFailureCount'], (result) => {
    const requestFailureCount = result.requestFailureCount || 0;
    const randomness = Math.random() * 2;
    const exponent = Math.pow(2, requestFailureCount);
    const multiplier = Math.max(randomness * exponent, 1);
    const delay = Math.min(multiplier * pollIntervalMin, pollIntervalMax);
    const roundedDelay = Math.round(delay);
    
    console.log('Scheduling for: ' + roundedDelay);
    chrome.alarms.create('refresh', { periodInMinutes: roundedDelay });
  });
}

// 开始请求
function startRequest(params) {
  if (params && params.scheduleRequest) scheduleRequest();

  function stopLoadingAnimation() {
    if (params && params.showLoadingAnimation) loadingAnimation.stop();
  }

  getInboxCount(
    function(count) {
      stopLoadingAnimation();
      updateUnreadCount(count);
    },
    function() {
      stopLoadingAnimation();
      chrome.storage.local.remove('unreadCount');
      updateIcon();
    }
  );
}

// 获取选项
function getOptions() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['options'], (result) => {
      if (!result.options) {
        chrome.storage.local.set({ options: '1,1,1' });
        resolve([1, 1, 1]);
      } else {
        resolve(result.options.split(','));
      }
    });
  });
}

// 获取收件箱计数
function getInboxCount(onSuccess, onError) {
  responseArray = [0, 0, 0];
  
  fetch('https://www.zhihu.com/api/v4/me?include=ad_type,available_message_types,default_notifications_count,follow_notifications_count,vote_thank_notifications_count,messages_count', {
    credentials: 'include',
    headers: {
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    }
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    // 更新消息数组
    responseArray[0] = data.default_notifications_count || 0;
    responseArray[1] = data.follow_notifications_count || 0;
    responseArray[2] = data.vote_thank_notifications_count || 0;
    
    // 私信数量单独处理
    const messagesCount = data.messages_count || 0;
    if (messagesCount > 0) {
      responseArray[0] += messagesCount;
    }
    
    fillLocalStorage();
  })
  .catch(error => {
    console.error('Fetch error:', error);
    handleError();
  });

  function handleError() {
    chrome.storage.local.get(['requestFailureCount'], (result) => {
      const newCount = (result.requestFailureCount || 0) + 1;
      chrome.storage.local.set({ requestFailureCount: newCount });
      if (onError) onError();
    });
  }
}

function fillLocalStorage() {
  chrome.storage.local.get(['lastResponseArray'], (result) => {
    const lastResponseArray = result.lastResponseArray || '';
    if (lastResponseArray == responseArray.toString()) {
      console.log('nothing changed, break my heart;');
      chrome.storage.local.set({ hasChanged: false });
    } else {
      chrome.storage.local.set({
        lastResponseArray: responseArray.toString(),
        hasChanged: true,
        msg1: responseArray[0],
        msg2: responseArray[1],
        msg3: responseArray[2]
      });
    }
    
    getOptions().then(currentOptions => {
      if (currentOptions[0] == 0) {
        permission = permission - 1;
      }
      if (currentOptions[1] == 0) {
        permission = permission - 2;
      }
      if (currentOptions[2] == 0) {
        permission = permission - 4;
      }
      switch (permission) {
        case 7:
          updateUnreadCount(responseArray[0] + responseArray[1] + responseArray[2]);
          updateTitle(responseArray[0], responseArray[1], responseArray[2]);
          break;
        case 6:
          updateUnreadCount(responseArray[1] + responseArray[2]);
          updateTitle(0, responseArray[1], responseArray[2]);
          break;
        case 5:
          updateUnreadCount(responseArray[0] + responseArray[2]);
          updateTitle(responseArray[0], 0, responseArray[2]);
          break;
        case 4:
          updateUnreadCount(responseArray[2]);
          updateTitle(0, 0, responseArray[2]);
          break;
        case 3:
          updateUnreadCount(responseArray[0] + responseArray[1]);
          updateTitle(responseArray[0], responseArray[1], 0);
          break;
        case 2:
          updateUnreadCount(responseArray[1]);
          updateTitle(0, responseArray[1], 0);
          break;
        case 1:
          updateUnreadCount(responseArray[0]);
          updateTitle(responseArray[0], 0, 0);
          break;
        case 0:
          updateUnreadCount(0);
          updateTitle(0);
          break;
      }
    });
  });
}

// 更新未读计数
function updateUnreadCount(count) {
  chrome.storage.local.get(['unreadCount'], (result) => {
    const changed = result.unreadCount != count;
    chrome.storage.local.set({ unreadCount: count });
    updateIcon();
  });
}

// 更新标题和通知
function updateTitle(msg1, msg2, msg3, hasChanged) {
  let contents = "";
  const content1 = chrome.i18n.getMessage("zhihumsg_content1", [msg1]);
  const content2 = chrome.i18n.getMessage("zhihumsg_content2", [msg2]);
  const content3 = chrome.i18n.getMessage("zhihumsg_content3", [msg3]);
  const title = chrome.i18n.getMessage("zhihumsg_title");

  if (msg1 != 0 && msg1 != undefined) {
    contents += ' ' + content1;
  } else {
    msg1 = 0;
  }
  if (msg2 != 0 && msg2 != undefined) {
    contents += ' ' + content2;
  } else {
    msg2 = 0;
  }
  if (msg3 != 0 && msg3 != undefined) {
    contents += ' ' + content3;
  } else {
    msg3 = 0;
  }
  
  chrome.action.setTitle({ title: contents });
  
  getOptions().then(currentOptions => {
    console.log('currentOptions[3] == 1', currentOptions[3] == 1, 'msg1 + msg2 + msg3', (msg1 + msg2 + msg3) != 0, 'hasChanged', hasChanged);
    
    if (currentOptions[3] == 1 && (msg1 + msg2 + msg3) != 0 && hasChanged) {
      // 创建通知
      chrome.notifications.create('zhihu-notification', {
        type: 'basic',
        iconUrl: 'img/zhihu-logo_48.png',
        title: title,
        message: contents,
        priority: 2
      });
      
      
      console.log("start notification");
    }
  });
}

// 前往收件箱
function goToInbox() {
  console.log('Going to inbox...');
  chrome.tabs.query({}, (tabs) => {
    for (let i = 0, tab; tab = tabs[i]; i++) {
      if (tab.url && isZhihuUrl(tab.url)) {
        console.log('Found Zhihu tab: ' + tab.url + '. Focusing and refreshing count...');
        chrome.tabs.update(tab.id, { active: true });
        startRequest({ scheduleRequest: false, showLoadingAnimation: false });
        activeInbox(tab.id);
        return;
      }
    }
    console.log('Could not find Zhihu tab. Creating one...');
    chrome.tabs.create({ url: getZhihuUrl() });
  });
}

// 激活收件箱
function activeInbox(tabId) {
  chrome.storage.local.get(['unreadCount'], (result) => {
    if (result.unreadCount != 0) {
      // 使用 chrome.scripting API 替代已弃用的 executeScript
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          const element = document.getElementById('zh-top-nav-count-wrap');
          if (element) element.click();
        }
      }).catch(err => console.error('执行脚本错误:', err));
    }
  });
}

// 监听 alarm 事件
chrome.alarms.onAlarm.addListener((alarm) => {
  console.log('Got alarm', alarm);
  if (alarm && alarm.name == 'watchdog') {
    onWatchdog();
  } else {
    startRequest({ scheduleRequest: true, showLoadingAnimation: false });
  }
});


// 监听导航事件
chrome.webNavigation.onDOMContentLoaded.addListener((details) => {
  if (details.url && isZhihuUrl(details.url)) {
    console.log('Recognized Zhihu navigation to: ' + details.url + '. Refreshing count...');
    startRequest({ scheduleRequest: false, showLoadingAnimation: false });
  }
}, {
  url: [{ urlContains: getZhihuUrl().replace(/^https?\:\/\//, '') }]
});

chrome.webNavigation.onReferenceFragmentUpdated.addListener((details) => {
  if (details.url && isZhihuUrl(details.url)) {
    console.log('Recognized Zhihu navigation to: ' + details.url + '. Refreshing count...');
    startRequest({ scheduleRequest: false, showLoadingAnimation: false });
  }
}, {
  url: [{ urlContains: getZhihuUrl().replace(/^https?\:\/\//, '') }]
});

// 监听扩展图标点击事件
chrome.action.onClicked.addListener(goToInbox);

// 监听启动事件
chrome.runtime.onStartup.addListener(() => {
  console.log('Starting browser... updating icon.');
  startRequest({ scheduleRequest: false, showLoadingAnimation: false });
  updateIcon();
});

// 看门狗函数
function onWatchdog() {
  chrome.alarms.get('refresh', (alarm) => {
    if (alarm) {
      console.log('Refresh alarm exists. Yay.');
    } else {
      console.log('Refresh alarm doesn\'t exist!? Refreshing now and rescheduling.');
      startRequest({ scheduleRequest: true, showLoadingAnimation: false });
    }
  });
}

// 在background.js中添加
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "refreshMessages") {
        // 调用原来的startRequest函数
        startRequest({
            scheduleRequest: false,
            showLoadingAnimation: true
        });
        sendResponse({success: true});
        return true;
    }
    return false;
});

// 初始化时更新图标
updateIcon();

const MINDMAP_STORAGE_KEY = "zhihu_mindmap_config";
const DEFAULT_MINDMAP_CONFIG = {
  apiUrl: "https://zc.r2049.cn/v1",
  apiKey: "",
  appType: "auto",
  maxContentChars: 18000
};
const DIFY_REQUEST_TIMEOUT_MS = 110000;

class DifyRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "DifyRequestError";
    this.status = status;
  }
}

function getStorageValue(key) {
  return new Promise(resolve => {
    chrome.storage.local.get(key, result => {
      resolve(result[key]);
    });
  });
}

async function getMindMapConfig() {
  const storedConfig = await getStorageValue(MINDMAP_STORAGE_KEY);
  const mergedConfig = {
    ...DEFAULT_MINDMAP_CONFIG,
    ...(storedConfig || {})
  };

  return {
    apiUrl: normalizeDifyBaseUrl(mergedConfig.apiUrl),
    apiKey: String(mergedConfig.apiKey || "").trim(),
    appType: ["auto", "chat", "completion", "workflow"].includes(mergedConfig.appType)
      ? mergedConfig.appType
      : "auto",
    maxContentChars: normalizeMaxContentChars(mergedConfig.maxContentChars)
  };
}

function normalizeMaxContentChars(value) {
  const parsedValue = Number.parseInt(value, 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 2000) {
    return DEFAULT_MINDMAP_CONFIG.maxContentChars;
  }

  return Math.min(parsedValue, 50000);
}

function normalizeDifyBaseUrl(url) {
  const normalizedUrl = String(url || DEFAULT_MINDMAP_CONFIG.apiUrl).trim().replace(/\/+$/, "");
  return normalizedUrl.endsWith("/v1") ? normalizedUrl : `${normalizedUrl}/v1`;
}

function normalizePromptText(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateContent(content, maxContentChars) {
  const normalizedContent = normalizePromptText(content);
  if (normalizedContent.length <= maxContentChars) {
    return normalizedContent;
  }

  return `${normalizedContent.slice(0, maxContentChars)}\n\n[正文过长，后续内容已截断]`;
}

function buildMindMapPrompt(source, maxContentChars) {
  const title = normalizePromptText(source.title || "知乎内容");
  const content = truncateContent(source.content || "", maxContentChars);

  return `你是一个中文长文思维导图结构化助手。

你的任务：
根据用户提供的知乎回答或文章内容，提炼出适合思维导图展示的层级结构。

要求：
1. 只输出合法 JSON，不要输出 Markdown，不要使用代码块。
2. 不要编造原文没有的信息。
3. root.text 使用文章标题或最核心的问题，控制在 24 个中文字符以内。
4. 第一层节点控制在 5 到 9 个，表示文章的主要部分或核心论点。
5. 每个第一层节点下最多 4 个子节点。
6. 总深度最多 3 层：root -> 一级主题 -> 二级要点。
7. 每个节点 text 尽量短，控制在 6 到 18 个中文字符。
8. 合并重复观点，删除无意义修饰。
9. 如果原文包含书单、方法、步骤、结论、案例，应保留为独立分支。
10. 输出必须符合下面结构：

{
  "version": "1.0",
  "title": "页面标题",
  "root": {
    "id": "root",
    "text": "中心主题",
    "children": [
      {
        "id": "n1",
        "text": "一级主题",
        "children": [
          {
            "id": "n1-1",
            "text": "二级要点"
          }
        ]
      }
    ]
  }
}

用户输入：
标题：${title}
页面类型：${source.pageType || "unknown"}
正文：
${content}`;
}

function getDifyEndpointTypes(appType) {
  if (appType === "chat") {
    return ["chat"];
  }

  if (appType === "completion") {
    return ["completion"];
  }

  if (appType === "workflow") {
    return ["workflow"];
  }

  return ["chat", "completion", "workflow"];
}

async function generateMindMapFromDify(source) {
  const config = await getMindMapConfig();
  if (!config.apiKey) {
    throw new Error("请先在扩展设置中填写 Dify API Key");
  }

  const prompt = buildMindMapPrompt(source, config.maxContentChars);
  const endpointTypes = getDifyEndpointTypes(config.appType);
  let lastError = null;

  for (const endpointType of endpointTypes) {
    try {
      const difyResponse = await callDifyEndpoint(config, endpointType, prompt, source);
      const rawMindMap = extractMindMapPayload(difyResponse);
      return normalizeMindMap(parseMindMapPayload(rawMindMap), source);
    } catch (error) {
      lastError = error;
      if (config.appType === "auto" && error instanceof DifyRequestError && [400, 404, 405].includes(error.status)) {
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error("Dify 未返回可用的思维导图数据");
}

async function callDifyEndpoint(config, endpointType, prompt, source) {
  const endpointPath = {
    chat: "chat-messages",
    completion: "completion-messages",
    workflow: "workflows/run"
  }[endpointType];
  const url = `${config.apiUrl}/${endpointPath}`;
  const user = `zhihu-copilot-${chrome.runtime.id || "local"}`;
  const baseInputs = {
    title: normalizePromptText(source.title || ""),
    content: truncateContent(source.content || "", config.maxContentChars),
    url: source.url || "",
    pageType: source.pageType || "unknown"
  };
  const requestBody = endpointType === "workflow"
    ? {
        inputs: {
          ...baseInputs,
          query: prompt,
          prompt
        },
        response_mode: "blocking",
        user
      }
    : {
        inputs: baseInputs,
        query: prompt,
        response_mode: "blocking",
        user
      };

  return fetchDifyJson(url, requestBody, config.apiKey);
}

async function fetchDifyJson(url, body, apiKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DIFY_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const responseText = await response.text();
    const responseData = parseMaybeJson(responseText);

    if (!response.ok) {
      const message = typeof responseData === "object"
        ? responseData.message || responseData.error || JSON.stringify(responseData)
        : responseText;
      throw new DifyRequestError(`Dify 请求失败（HTTP ${response.status}）：${message || "未知错误"}`, response.status);
    }

    if (!responseData || typeof responseData !== "object") {
      throw new Error("Dify 返回内容不是 JSON");
    }

    return responseData;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Dify 请求超时，请稍后重试或缩短正文");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseMaybeJson(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

function extractMindMapPayload(responseData) {
  if (responseData?.root) {
    return responseData;
  }

  if (typeof responseData?.answer === "string") {
    return responseData.answer;
  }

  if (responseData?.data?.outputs) {
    const outputs = responseData.data.outputs;
    if (outputs.root) {
      return outputs;
    }

    const preferredKeys = ["mindmap", "mindMap", "result", "answer", "text", "output"];
    for (const key of preferredKeys) {
      if (outputs[key]) {
        return outputs[key];
      }
    }

    for (const value of Object.values(outputs)) {
      if (typeof value === "string" || value?.root) {
        return value;
      }
    }
  }

  if (typeof responseData?.data === "string" || responseData?.data?.root) {
    return responseData.data;
  }

  throw new Error("Dify 响应中没有找到 answer 或 workflow outputs");
}

function parseMindMapPayload(payload) {
  if (payload && typeof payload === "object") {
    return payload;
  }

  const rawText = String(payload || "").trim();
  const fencedMatch = rawText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const text = fencedMatch ? fencedMatch[1].trim() : rawText;
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  const jsonText = firstBrace >= 0 && lastBrace > firstBrace
    ? text.slice(firstBrace, lastBrace + 1)
    : text;

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error("Dify 输出不是合法 JSON，请检查应用提示词");
  }
}

function normalizeMindMap(parsedData, source) {
  const rootCandidate = parsedData?.root || parsedData;
  if (!rootCandidate || typeof rootCandidate !== "object") {
    throw new Error("思维导图 JSON 缺少 root 节点");
  }

  const fallbackTitle = sanitizeMindMapText(parsedData?.title || source.title || "知乎内容", 40);
  const root = normalizeMindMapNode(rootCandidate, "root", fallbackTitle, 0);
  if (!root.text) {
    root.text = fallbackTitle;
  }

  if (!Array.isArray(root.children) || root.children.length === 0) {
    throw new Error("思维导图 JSON 至少需要一个一级节点");
  }

  return {
    version: "1.0",
    title: sanitizeMindMapText(parsedData?.title || root.text || fallbackTitle, 60),
    root
  };
}

function normalizeMindMapNode(node, fallbackId, fallbackText, depth) {
  const text = sanitizeMindMapText(node?.text || node?.title || fallbackText || "", depth === 0 ? 32 : 48);
  const normalizedNode = {
    id: sanitizeMindMapId(node?.id || fallbackId),
    text
  };

  if (depth < 2 && Array.isArray(node?.children)) {
    const maxChildren = depth === 0 ? 12 : 8;
    const children = node.children
      .slice(0, maxChildren)
      .map((child, index) => normalizeMindMapNode(child, `${normalizedNode.id}-${index + 1}`, "", depth + 1))
      .filter(child => child.text);

    if (children.length > 0) {
      normalizedNode.children = children;
    }
  }

  return normalizedNode;
}

function sanitizeMindMapText(text, maxLength) {
  const normalizedText = normalizePromptText(text).replace(/\n/g, " ");
  const chars = Array.from(normalizedText);
  if (chars.length <= maxLength) {
    return normalizedText;
  }

  return `${chars.slice(0, maxLength - 1).join("")}…`;
}

function sanitizeMindMapId(id) {
  return String(id || "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || `n-${Date.now()}`;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== "generateMindMap") {
    return false;
  }

  generateMindMapFromDify(request.source || {})
    .then(mindMap => {
      sendResponse({
        success: true,
        mindMap
      });
    })
    .catch(error => {
      console.error("生成思维导图失败:", error);
      sendResponse({
        success: false,
        error: error?.message || "未知错误"
      });
    });

  return true;
});

// 创建优化的 Canvas 上下文
function createOptimizedCanvasContext(canvas) {
  return canvas.getContext('2d', { willReadFrequently: true });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function fetchImageAsset(url) {
  const response = await fetch(url, {
    credentials: 'omit'
  });

  if (!response.ok) {
    throw new Error(`图片抓取失败: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();

  return {
    base64Data: arrayBufferToBase64(arrayBuffer),
    contentType: response.headers.get('content-type') || '',
    finalUrl: response.url || url
  };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'fetchImageAsset') {
    return false;
  }

  fetchImageAsset(request.url)
    .then(result => {
      sendResponse({
        success: true,
        ...result
      });
    })
    .catch(error => {
      console.error('抓取导出图片失败:', error);
      sendResponse({
        success: false,
        error: error?.message || '未知错误'
      });
    });

  return true;
});
