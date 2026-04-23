document.addEventListener('DOMContentLoaded', function() {
    var MINDMAP_STORAGE_KEY = 'zhihu_mindmap_config';
    var DEFAULT_MINDMAP_CONFIG = {
        apiUrl: 'https://zc.r2049.cn/v1',
        apiKey: '',
        appType: 'auto',
        maxContentChars: 18000
    };

    // 加载设置
    var options = getOptions();
    
    document.getElementById('notify-default').checked = options[0] == 1;
    document.getElementById('notify-follow').checked = options[1] == 1;
    document.getElementById('notify-vote').checked = options[2] == 1;
    document.getElementById('show-desktop-notification').checked = options[3] == 1;
    
    var timeout = localStorage.getItem('notificationCloseTimeout') || 10;
    document.getElementById('notification-timeout').value = timeout;
    
    var pollInterval = localStorage.getItem('pollIntervalMin') || 1;
    document.getElementById('poll-interval').value = pollInterval;

    loadMindMapConfig();
    
    // 保存设置
    document.getElementById('save-settings').addEventListener('click', async function() {
        var notifyDefault = document.getElementById('notify-default').checked ? 1 : 0;
        var notifyFollow = document.getElementById('notify-follow').checked ? 1 : 0;
        var notifyVote = document.getElementById('notify-vote').checked ? 1 : 0;
        var showDesktopNotification = document.getElementById('show-desktop-notification').checked ? 1 : 0;
        var optionsValue = [notifyDefault, notifyFollow, notifyVote, showDesktopNotification].join(',');
        
        localStorage.setItem('options', optionsValue);
        chrome.storage.local.set({ options: optionsValue });
        
        var timeout = document.getElementById('notification-timeout').value;
        localStorage.setItem('notificationCloseTimeout', timeout);
        
        var pollInterval = document.getElementById('poll-interval').value;
        localStorage.setItem('pollIntervalMin', pollInterval);

        await saveMindMapConfig();
        
        // 显示保存成功
        var status = document.getElementById('status');
        status.style.display = 'block';
        setTimeout(function() {
            status.style.display = 'none';
        }, 2000);
    });

    function storageGet(key) {
        return new Promise(function(resolve) {
            chrome.storage.local.get(key, function(result) {
                resolve(result[key]);
            });
        });
    }

    function storageSet(values) {
        return new Promise(function(resolve) {
            chrome.storage.local.set(values, resolve);
        });
    }

    async function loadMindMapConfig() {
        var storedConfig = await storageGet(MINDMAP_STORAGE_KEY);
        var config = Object.assign({}, DEFAULT_MINDMAP_CONFIG, storedConfig || {});

        document.getElementById('mindmap-api-url').value = config.apiUrl || DEFAULT_MINDMAP_CONFIG.apiUrl;
        document.getElementById('mindmap-api-key').value = config.apiKey || '';
        document.getElementById('mindmap-app-type').value = config.appType || DEFAULT_MINDMAP_CONFIG.appType;
        document.getElementById('mindmap-max-content-chars').value = config.maxContentChars || DEFAULT_MINDMAP_CONFIG.maxContentChars;
    }

    async function saveMindMapConfig() {
        var maxContentChars = parseInt(document.getElementById('mindmap-max-content-chars').value, 10);
        if (!Number.isFinite(maxContentChars) || maxContentChars < 2000) {
            maxContentChars = DEFAULT_MINDMAP_CONFIG.maxContentChars;
        }

        await storageSet({
            [MINDMAP_STORAGE_KEY]: {
                apiUrl: document.getElementById('mindmap-api-url').value.trim() || DEFAULT_MINDMAP_CONFIG.apiUrl,
                apiKey: document.getElementById('mindmap-api-key').value.trim(),
                appType: document.getElementById('mindmap-app-type').value || DEFAULT_MINDMAP_CONFIG.appType,
                maxContentChars: Math.min(maxContentChars, 50000)
            }
        });
    }
    
    function getOptions() {
        if (!localStorage.hasOwnProperty('options')) {
            localStorage["options"] = '1,1,1,1';
            return [1, 1, 1, 1];
        } else {
            return localStorage.options.split(',');
        }
    }
}); 
