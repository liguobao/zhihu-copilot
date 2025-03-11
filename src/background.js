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
function getZhihuUrl() {
  return "https://www.zhihu.com";
}

function getMsgUrl() {
  return getZhihuUrl() + '/api/v4/notifications/v2/vote_thank?limit=100';
}

function getVoteThankUrl() {
  const timeStamp = +new Date();
  return getZhihuUrl() + '/api/v4/notifications/v2/vote_thank?limit=100&offset=' + timeStamp;
}

function getDefaultUrl() {
  return getZhihuUrl() + '/api/v4/notifications/v2/default?limit=100';
}

function getFollowUrl() {
  return getZhihuUrl() + '/api/v4/notifications/v2/follow?limit=100';
}

function isZhihuUrl(url) {
  // 判断 URL 是否以知乎前缀开头
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
  
  // 添加计数器来跟踪完成的请求
  let completedRequests = 0;
  let hasError = false;
  
  // 设置总体超时
  const timeoutId = setTimeout(() => {
    if (completedRequests < 3) {
      hasError = true;
      handleError();
    }
  }, requestTimeout);
  
  function handleError() {
    if (hasError) return;
    hasError = true;
    
    chrome.storage.local.get(['requestFailureCount'], (result) => {
      const newCount = (result.requestFailureCount || 0) + 1;
      chrome.storage.local.set({ requestFailureCount: newCount });
      clearTimeout(timeoutId);
      if (onError) onError();
    });
  }

  function fillUnReadMsgCount(remoteURL, msgIndex) {
    const maxRetries = 3;
    let retryCount = 0;

    function tryFetch() {
      fetch(remoteURL, {
        credentials: 'include',  // 添加凭证
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'  // 添加XHR标识
        }
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then(responseJSON => {
        const responseData = responseJSON["data"];
        const unReadMsgCount = responseData.filter(item => !item.is_read).length;
        responseArray[msgIndex] = unReadMsgCount;
        
        completedRequests++;
        if (completedRequests === 3) {
          clearTimeout(timeoutId);
          fillLocalStorage();
        }
      })
      .catch(error => {
        console.error('Fetch error:', error);
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`Retrying... Attempt ${retryCount} of ${maxRetries}`);
          setTimeout(tryFetch, 1000 * retryCount); // 递增重试延迟
        } else {
          handleError();
        }
      });
    }

    tryFetch();
  }

  // 发起三个请求
  fillUnReadMsgCount(getDefaultUrl(), 0);
  fillUnReadMsgCount(getFollowUrl(), 1);
  fillUnReadMsgCount(getVoteThankUrl(), 2);
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
    }
    return true; // 保持消息通道开放以进行异步响应
});

// 初始化时更新图标
updateIcon();

// 创建优化的 Canvas 上下文
function createOptimizedCanvasContext(canvas) {
  return canvas.getContext('2d', { willReadFrequently: true });
}
