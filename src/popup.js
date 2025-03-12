document.addEventListener('DOMContentLoaded', function() {
    // 更新消息数量显示
    function updateMessageCount() {
        chrome.storage.local.get(['msg1', 'msg2', 'msg3', 'unreadCount'], function(result) {
            const defaultCount = result.msg1 || 0;
            const followCount = result.msg2 || 0;
            const voteCount = result.msg3 || 0;
            const totalCount = result.unreadCount || 0;

            // 更新总数
            document.getElementById('unread-count').textContent = totalCount;

            // 更新各类型消息数量
            if (defaultCount > 0) {
                document.getElementById('default-msg').style.display = 'block';
                document.getElementById('default-count').textContent = defaultCount;
            }
            if (followCount > 0) {
                document.getElementById('follow-msg').style.display = 'block';
                document.getElementById('follow-count').textContent = followCount;
            }
            if (voteCount > 0) {
                document.getElementById('vote-msg').style.display = 'block';
                document.getElementById('vote-count').textContent = voteCount;
            }
        });
    }

    // 初始化时更新消息数量
    updateMessageCount();

    // 刷新按钮点击事件
    document.getElementById('refresh-messages').addEventListener('click', function() {
        chrome.runtime.sendMessage({action: "refreshMessages"}, function(response) {
            if (response && response.success) {
                setTimeout(updateMessageCount, 1000); // 等待后台更新完成后刷新显示
            }
        });
    });
    
    // 前往消息中心
    document.getElementById('go-to-inbox').addEventListener('click', function() {
        chrome.tabs.create({url: 'https://www.zhihu.com/notifications'});
    });
    
    // 开始写专栏
    document.getElementById('write-article').addEventListener('click', function() {
        chrome.tabs.create({url: 'https://zhuanlan.zhihu.com/write'});
    });
    
    // 创作中心
    document.getElementById('creator-center').addEventListener('click', function() {
        chrome.tabs.create({url: 'https://www.zhihu.com/creator'});
    });
    
    // 导出功能
    document.getElementById('start-export').addEventListener('click', async function() {
        const progressDiv = document.getElementById('export-progress');
        const progressBar = document.getElementById('progress-inner');
        const progressText = document.getElementById('progress-text');
        const stopButton = document.getElementById('stop-export');
        
        progressDiv.style.display = 'flex'; // 改为flex布局
        this.disabled = true;
        stopButton.style.display = 'block'; // 显示停止按钮
    
        // 检查当前标签页是否是知乎用户页面
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        const tab = tabs[0];
        
        if (!tab.url.includes('zhihu.com/people/')) {
            progressText.textContent = '请在知乎用户主页使用此功能';
            this.disabled = false;
            stopButton.style.display = 'none';
            return;
        }

        // 添加主控制函数
        // 获取总页数
        function getTotalPages() {
            const pagination = document.querySelector('.Pagination');
            if (!pagination) return 5; // 默认20页
            const buttons = pagination.querySelectorAll('button');
            if (buttons.length >= 2) {
                const totalPage = parseInt(buttons[buttons.length - 2].textContent);
                return isNaN(totalPage) ? 5 : totalPage;
            }
            return 5;
        }
        var totalPage = getTotalPages();
        console.log("totalPage:", totalPage);
        chrome.tabs.sendMessage(tab.id, {
            action: "startExport",
            maxPage: totalPage
        });
    });
    
    // 监听来自 content script 的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "updateProgress") {
            const progressBar = document.getElementById('progress-inner');
            const progressText = document.getElementById('progress-text');
            
            const percent = (request.current / request.total) * 100;
            progressBar.style.width = `${percent}%`;
            progressText.textContent = `正在导出第 ${request.current}/${request.total} 页`;
        }
        else if (request.action === "exportError") {
            document.getElementById('progress-text').textContent = `导出失败: ${request.error}`;
            document.getElementById('start-export').disabled = false;
            document.getElementById('stop-export').style.display = 'none';
        }
        else if (request.action === "exportComplete") {
            document.getElementById('progress-text').textContent = '导出完成';
            document.getElementById('progress-inner').style.width = '100%';
            document.getElementById('start-export').disabled = false;
            document.getElementById('stop-export').style.display = 'none';
            
            // 添加清理缓存的代码
            chrome.storage.local.remove(['exportStatus', 'exportProgress']);
            
            // 导出完成后延迟隐藏进度条
            setTimeout(() => {
                document.getElementById('export-progress').style.display = 'none';
            }, 1500); // 1.5秒后隐藏，让用户能看到完成状态
        }
        else if (request.action === "exportFileCompleted") {
            // 处理文件下载完成的消息
            document.getElementById('progress-text').textContent = `已导出 ${request.count} 条回答为 ${request.fileType} 文件`;
            document.getElementById('progress-inner').style.width = '100%';
            document.getElementById('start-export').disabled = false;
            document.getElementById('stop-export').style.display = 'none';
            
            // 清理缓存
            chrome.storage.local.remove(['exportStatus', 'exportProgress']);
            
            // 延迟隐藏进度条
            setTimeout(() => {
                document.getElementById('export-progress').style.display = 'none';
            }, 2000); // 2秒后隐藏，让用户能看到完成状态
        }
        else if (request.action === "exportStopped") {
            // 处理导出被停止的消息
            document.getElementById('progress-text').textContent = '导出已停止';
            document.getElementById('start-export').disabled = false;
            document.getElementById('stop-export').style.display = 'none';
            
            // 延迟隐藏进度条
            setTimeout(() => {
                document.getElementById('export-progress').style.display = 'none';
            }, 1500);
        }
    });
    
    // 添加停止按钮事件
    document.getElementById('stop-export').addEventListener('click', async function() {
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        const tab = tabs[0];
        
        // 发送停止消息给 content script
        chrome.tabs.sendMessage(tab.id, { action: "stopExport" });
        
        // 重置界面状态
        const progressDiv = document.getElementById('export-progress');
        const progressBar = document.getElementById('progress-inner');
        const progressText = document.getElementById('progress-text');
        const exportButton = document.getElementById('start-export');
        
        progressBar.style.width = '0%';
        //progressText.textContent = '已停止导出';
        progressDiv.style.display = 'none'; // 隐藏进度信息
        exportButton.disabled = false;
        this.style.display = 'none';
        
        // 清除缓存
        chrome.storage.local.remove(['exportStatus', 'exportProgress']);

    });
    
    // 修改状态恢复函数，移除按钮文本修改的处理
    async function restoreExportStatus() {
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        const tab = tabs[0];
        
        if (!tab.url.includes('zhihu.com/people/')) {
            return;
        }

        // 获取导出状态
        chrome.tabs.sendMessage(tab.id, { action: "getExportStatus" }, function(response) {
            if (response && response.status) {
                const progressDiv = document.getElementById('export-progress');
                const progressBar = document.getElementById('progress-inner');
                const progressText = document.getElementById('progress-text');
                const exportButton = document.getElementById('start-export');
                const stopButton = document.getElementById('stop-export');

                if (response.status === 'exporting') {
                    progressDiv.style.display = 'block';
                    exportButton.disabled = true;
                    stopButton.style.display = 'block';
                    const percent = (response.progress.current / response.progress.total) * 100;
                    progressBar.style.width = `${percent}%`;
                    progressText.textContent = `正在导出第 ${response.progress.current}/${response.progress.total} 页`;
                } else if (response.status === 'completed') {
                    progressDiv.style.display = 'block';
                    progressBar.style.width = '100%';
                    progressText.textContent = '导出完成';
                    exportButton.disabled = false;
                    stopButton.style.display = 'none';
                }
            }
        });
    }

    // 初始化时恢复导出状态
    restoreExportStatus();
});