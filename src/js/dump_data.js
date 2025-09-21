// 存储相关的常量
const STORAGE_KEYS = {
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


// 全局变量
let isExporting = false;
let current_count = 0;
let max_count = 500;
let exportType = ""; // "answers" 或 "articles" 或 "pins"

// 使用映射替代条件判断
const TYPE_KEYS = {
  answers: {
    LIST: STORAGE_KEYS.ANSWER.LIST,
    IDS: STORAGE_KEYS.ANSWER.IDS,
    SELECTOR: '.AnswerItem',
    ITEM_TYPE: "回答",
    URL_PREFIX: "https://www.zhihu.com/answer/",
    CONTENT_SELECTOR: ".RichContent-inner",
    ID_EXTRACTOR: (item) => {
      const itemData = item.getAttribute("data-zop");
      return itemData ? JSON.parse(itemData)["itemId"] : null;
    },
    TITLE_EXTRACTOR: (item) => {
      const itemData = item.getAttribute("data-zop");
      return itemData ? JSON.parse(itemData)["title"] : "未知标题";
    },
    ITEM_CREATOR: (title, id, content, url) => ({
      question_title: title,
      answer_id: id,
      answer_content: content,
      answer_url: url
    }),
    NEED_EXPAND: true
  },
  articles: {
    LIST: STORAGE_KEYS.ARTICLE.LIST,
    IDS: STORAGE_KEYS.ARTICLE.IDS,
    SELECTOR: '.ArticleItem',
    ITEM_TYPE: "专栏文章",
    URL_PREFIX: "https://zhuanlan.zhihu.com/p/",
    CONTENT_SELECTOR: ".RichContent-inner",
    ID_EXTRACTOR: (item) => {
      const itemData = item.getAttribute("data-zop");
      return itemData ? JSON.parse(itemData)["itemId"] : null;
    },
    TITLE_EXTRACTOR: (item) => {
      const itemData = item.getAttribute("data-zop");
      return itemData ? JSON.parse(itemData)["title"] : "未知标题";
    },
    ITEM_CREATOR: (title, id, content, url) => ({
      title: title,
      data_id: id,
      data_content: content,
      data_url: url
    }),
    NEED_EXPAND: true
  },
  pins: {
    LIST: STORAGE_KEYS.PIN.LIST,
    IDS: STORAGE_KEYS.PIN.IDS,
    SELECTOR: '.PinItem',
    ITEM_TYPE: "想法",
    URL_PREFIX: "https://www.zhihu.com/pin/",
    CONTENT_SELECTOR: ".RichContent",
    ID_EXTRACTOR: (item) => {
      const pinLink = item.querySelector("a[data-za-detail-view-id]");
      return pinLink ? pinLink.getAttribute("href").split("/").pop() : null;
    },
    TITLE_EXTRACTOR: (item) => {
      const authorElement = item.querySelector(".PinItem-author");
      const timeElement = item.querySelector(".ContentItem-time");
      let title = authorElement ? authorElement.innerText + "的想法" : "未知作者的想法";
      if (timeElement) {
        title += " - " + timeElement.innerText;
      }
      return title;
    },
    ITEM_CREATOR: (title, id, content, url) => ({
      title: title,
      pin_id: id,
      pin_content: content,
      pin_url: url
    }),
    NEED_EXPAND: false
  }
};

// 通用存储函数
function includeId(id, type) {
  const key = TYPE_KEYS[type].IDS;
  return new Promise(resolve => {
    chrome.storage.local.get(key, (result) => {
      const ids = result[key] || [];
      resolve(ids.includes(id));
    });
  });
}

function addId(id, type) {
  const key = TYPE_KEYS[type].IDS;
  return new Promise(resolve => {
    chrome.storage.local.get(key, (result) => {
      const ids = result[key] || [];
      ids.push(id);
      chrome.storage.local.set({ [key]: ids }, resolve);
    });
  });
}

function addItemToList(item, type) {
  const key = TYPE_KEYS[type].LIST;
  return new Promise(resolve => {
    chrome.storage.local.get(key, (result) => {
      const list = result[key] || [];
      list.push(item);
      chrome.storage.local.set({ [key]: list }, resolve);
    });
  });
}

function checkItemListEmpty(type) {
  const selector = TYPE_KEYS[type].SELECTOR;
  const items = document.querySelectorAll(selector);
  if (items.length === 0) {
    console.log(`没有找到${TYPE_KEYS[type].ITEM_TYPE}，跳出`);
    return false;
  }
  return true;
}

// 保存回答或文章或想法，返回保存的数量
async function saveItems() {
  const typeConfig = TYPE_KEYS[exportType];
  const selector = typeConfig.SELECTOR;
  const items = document.querySelectorAll(selector);
  let savedCount = 0;

  for (let item of items) {
    // 检查是否已达到最大数量
    if (current_count >= max_count) {
      console.log("已达到最大导出数量，停止保存");
      break;
    }

    // 使用配置中的内容选择器
    const contentLabel = item.querySelector(typeConfig.CONTENT_SELECTOR);

    if (!contentLabel) {
      console.log(`${item} 不是有效的${typeConfig.ITEM_TYPE}，跳过`);
      continue;
    }

    // 使用配置中的ID提取器和标题提取器
    const itemId = typeConfig.ID_EXTRACTOR(item);
    if (!itemId) {
      console.log(`无法获取${typeConfig.ITEM_TYPE}ID，跳过`);
      continue;
    }

    const title = typeConfig.TITLE_EXTRACTOR(item);

    if (await includeId(itemId, exportType)) {
      console.log(`${typeConfig.ITEM_TYPE}:${itemId} 已存在，跳过`);
      continue;
    }

    await addId(itemId, exportType);

    // 检查是否有“阅读全文”按钮，如果有则点击展开
    const moreButton = item.querySelector('.ContentItem-more');
    if (moreButton) {
      moreButton.click();
      console.log(`点击阅读全文按钮展开内容: ${title}`);
      // 等待内容展开
      await sleep(1000);
    } else {
      // 如果没有阅读全文按钮，则点击原来的展开逻辑
      if (typeConfig.NEED_EXPAND) {
        contentLabel.click();
        console.log(`${title} 自动点击展开`);
      }
    }
    var contentLabelMore = item.querySelector(typeConfig.CONTENT_SELECTOR);
    const content = contentLabelMore?.innerText;
    //console.log(`正在保存 ${typeConfig.ITEM_TYPE}:${itemId} - ${title} - ${content}`);
    const url = `${typeConfig.URL_PREFIX}${itemId}`;

    // 使用配置中的项目创建器
    const dataItem = typeConfig.ITEM_CREATOR(title, itemId, content, url);

    console.log(`${typeConfig.ITEM_TYPE}:${itemId} 已保存`);
    await addItemToList(dataItem, exportType);
    savedCount++;
    
    // 每次保存项目后更新进度
    current_count++;
    chrome.runtime.sendMessage({
      action: "updateProgress",
      current: Math.min(current_count, max_count),
      total: max_count
    });
  }

  return savedCount;
}

function scrollToBottom() {
  if (!checkItemListEmpty(exportType)) {
    console.log("没有找到内容，跳出并刷新页面");
    saveExportStatus('refreshing');
    saveExportProgress(current_count, max_count);
    window.location.reload();
    return;
  }

  // 滚动到底部以加载更多内容
  window.scrollTo(0, document.body.scrollHeight);
  console.log(`滚动到底部，当前已保存:${current_count}`);
}

// 导出函数
async function exportToMarkdown() {
  const typeConfig = TYPE_KEYS[exportType];
  const key = typeConfig.LIST;
  const idsKey = typeConfig.IDS;

  return new Promise(resolve => {
    chrome.storage.local.get(key, async (result) => {
      const stored = result[key] || [];

      // 创建新的 JSZip 实例
      const zip = new JSZip();

      // 获取当前时间戳
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      // 为每个项目创建单独的 markdown 文件
      for (let item of stored) {
        // 使用映射定义字段提取器
        const fieldExtractors = {
          answers: {
            title: item => item.question_title,
            id: item => item.answer_id,
            content: item => item.answer_content,
            url: item => item.answer_url
          },
          articles: {
            title: item => item.title,
            id: item => item.data_id,
            content: item => item.data_content,
            url: item => item.data_url
          },
          pins: {
            title: item => item.title,
            id: item => item.pin_id,
            content: item => item.pin_content,
            url: item => item.pin_url
          }
        };

        const extractor = fieldExtractors[exportType];
        const title = extractor.title(item);
        const id = extractor.id(item);
        const content = extractor.content(item);
        const url = extractor.url(item);

        const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_');
        const fileName = `${id}_${safeTitle}.md`;

        let fileContent = `# ${title}\n\n`;
        fileContent += `> ${typeConfig.ITEM_TYPE}ID: ${id}\n\n`;
        fileContent += `> 链接: ${url}\n\n`;
        fileContent += `${content}\n\n`;

        // 将文件添加到 zip
        zip.file(fileName, fileContent);
      }

      // 生成并下载 zip 文件
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zhihu_${exportType}_${timestamp}.zip`;
      a.click();
      chrome.storage.local.remove([key, idsKey]);
      URL.revokeObjectURL(url);

      // 发送导出文件完成的消息
      chrome.runtime.sendMessage({
        action: "exportFileCompleted",
        fileType: "markdown",
        count: stored.length
      });

      resolve();
    });
  });
}

function exportToJSON() {
  const key = TYPE_KEYS[exportType].LIST;

  chrome.storage.local.get(key, (result) => {
    const stored = result[key] || [];
    const jsonStr = JSON.stringify(stored);
    const blob = new Blob([jsonStr], { type: 'application/json' });

    // 获取当前时间戳
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zhihu_${exportType}_${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // 发送导出文件完成的消息
    chrome.runtime.sendMessage({
      action: "exportFileCompleted",
      fileType: "json",
      count: stored.length
    });
  });
}

// 工具函数
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 进度保存相关函数
function saveExportStatus(status) {
  chrome.storage.local.set({
    [STORAGE_KEYS.EXPORT_STATUS]: {
      status: status,
      type: exportType,
      timestamp: new Date().getTime()
    }
  });
}

function saveExportProgress(current, total) {
  chrome.storage.local.set({
    [STORAGE_KEYS.EXPORT_PROGRESS]: {
      current: current,
      total: total,
      timestamp: new Date().getTime()
    }
  });
}

function getExportStatus() {
  return new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEYS.EXPORT_STATUS, (result) => {
      resolve(result[STORAGE_KEYS.EXPORT_STATUS] || { "status": "idle", "type": "" });
    });
  });
}

function getExportProgress() {
  return new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEYS.EXPORT_PROGRESS, (result) => {
      resolve(result[STORAGE_KEYS.EXPORT_PROGRESS] || { "current": 0, "total": 0 });
    });
  });
}

// 导出流程控制
async function startExport(type, maxAnswers = 500) {
  isExporting = true;
  exportType = type;
  current_count = 0;
  max_count = maxAnswers;

  // 保存初始状态
  saveExportStatus('exporting');
  saveExportProgress(current_count, max_count);

  await continueExport();
}

async function continueExport() {
  while (current_count < max_count && isExporting) {
    console.log("current_count:", current_count);

    // 保存当前进度
    saveExportProgress(current_count, max_count);

    // 保存当前可见的内容
    await saveItems();

    if (current_count >= max_count) {
      console.log("已达到最大条数，结束导出");
      saveExportStatus('completed');
      break;
    }

    // 滚动到底部以加载更多内容
    scrollToBottom();

    // 等待页面加载新内容
    await sleep(5000);

    // 检查是否加载了新内容
    const typeConfig = TYPE_KEYS[exportType];
    const selector = typeConfig.SELECTOR;
    const currentLength = document.querySelectorAll(selector).length;
    console.log(`当前可见${typeConfig.ITEM_TYPE}数量:`, currentLength, "已保存:", current_count);

    if (currentLength <= current_count) {
      console.log("没有更多内容加载，结束导出");
      saveExportStatus('completed');
      break;
    }
  }

  if (!isExporting) {
    saveExportStatus('stopped');
    const typeConfig = TYPE_KEYS[exportType];
    chrome.storage.local.remove([
      typeConfig.LIST,
      typeConfig.IDS,
      STORAGE_KEYS.EXPORT_STATUS,
      STORAGE_KEYS.EXPORT_PROGRESS
    ]);

    // 发送导出停止的消息
    chrome.runtime.sendMessage({
      action: "exportStopped"
    });
  } else {
    await exportToMarkdown();
    saveExportStatus('completed');

    // 发送导出完成的消息
    chrome.runtime.sendMessage({
      action: "exportCompleted"
    });
  }
  isExporting = false;
}

// 页面加载时检查是否需要继续导出
// 在content script中，页面已经加载完成，直接检查
if (typeof document !== 'undefined' && document) {
  (async () => {
    try {
      const status = await getExportStatus();
      const progress = await getExportProgress();

      if (status.status === 'refreshing') {
        console.log("检测到页面刷新，继续执行导出操作");
        isExporting = true;
        exportType = status.type;
        current_count = progress.current;
        max_count = progress.total;
        saveExportStatus('exporting');

        // 给页面一些时间加载
        await sleep(2000);
        await continueExport();
      }
    } catch (error) {
      console.error('导出恢复过程中出错:', error);
    }
  })();
}

// 消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const messageHandlers = {
    "startExport_answers": () => {
      startExport("answers", request.maxAnswers || 500);
      sendResponse({ success: true });
    },
    "startExport_articles": () => {
      startExport("articles", request.maxAnswers || 500);
      sendResponse({ success: true });
    },
    "startExport_pins": () => {
      startExport("pins", request.maxAnswers || 500);
      sendResponse({ success: true });
    },
    "stopExport": () => {
      isExporting = false;
      if (exportType && TYPE_KEYS[exportType]) {
        const typeConfig = TYPE_KEYS[exportType];
        chrome.storage.local.remove([
          typeConfig.LIST,
          typeConfig.IDS,
          STORAGE_KEYS.EXPORT_STATUS,
          STORAGE_KEYS.EXPORT_PROGRESS
        ]);
      } else {
        // 如果没有有效的exportType，清理所有可能的存储
        chrome.storage.local.remove([
          STORAGE_KEYS.ANSWER.LIST,
          STORAGE_KEYS.ANSWER.IDS,
          STORAGE_KEYS.ARTICLE.LIST,
          STORAGE_KEYS.ARTICLE.IDS,
          STORAGE_KEYS.PIN.LIST,
          STORAGE_KEYS.PIN.IDS,
          STORAGE_KEYS.EXPORT_STATUS,
          STORAGE_KEYS.EXPORT_PROGRESS
        ]);
      }
      sendResponse({ success: true });
    },
    "getExportStatus": () => {
      // 使用 Promise 处理异步获取状态
      Promise.all([getExportStatus(), getExportProgress()]).then(([status, progress]) => {
        sendResponse({
          status: status.status,
          type: status.type,
          progress: progress
        });
      });
      return true; // 保持消息通道开放以进行异步响应
    },
    "getTotalPages": () => {
      console.log("正在获取总页数...");
      sleep(1000).then(() => {
        // 获取分页信息
        const pagination = document.querySelector('.Pagination');
        let totalPages = 5; // 默认值
        if (pagination) {
          console.log("找到分页元素:", pagination);
          const buttons = pagination.querySelectorAll('button');
          console.log("分页按钮数量:", buttons.length);

          if (buttons.length >= 2) {
            const totalPage = parseInt(buttons[buttons.length - 2].textContent);
            console.log("解析到的总页数:", totalPage);
            if (!isNaN(totalPage)) {
              totalPages = totalPage;
            }
          }
        } else {
          console.log("未找到分页元素");
        }

        console.log("返回总页数:", totalPages);
        sendResponse({ totalPages: totalPages });
      });
    }
  };

  const handler = messageHandlers[request.action];
  if (handler) {
    return handler() || true;
  }

  return true; // 保持消息通道开放以进行异步响应
});