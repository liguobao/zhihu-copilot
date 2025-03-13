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

    // 刷新按钮点击事件 - 修改为打开知乎
    document.getElementById('refresh-messages').addEventListener('click', function() {
        chrome.tabs.create({url: 'https://www.zhihu.com'});
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
        const exportButton = document.getElementById('start-export'); // 获取按钮的引用
        
        progressDiv.style.display = 'flex'; // 改为flex布局
        exportButton.disabled = true; // 使用引用来禁用按钮，而不是this
        stopButton.style.display = 'block'; // 显示停止按钮
    
        // 检查当前标签页是否是知乎用户页面
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        const tab = tabs[0];
        
        if (!tab.url.includes('zhihu.com/people/')) {
            progressText.textContent = '请在知乎用户主页使用此功能';
            exportButton.disabled = false; // 使用引用来启用按钮
            stopButton.style.display = 'none';
            return;
        }

        // 获取用户选择的导出类型
        const exportType = document.querySelector('input[name="export-type"]:checked').value;
        
        // 获取用户选择的导出页数设置
        const exportPagesType = document.querySelector('input[name="export-pages"]:checked').value;
        let maxPage = 0; // 0 表示全部导出
        
        if (exportPagesType === 'custom') {
            maxPage = parseInt(document.getElementById('custom-pages-count').value);
            if (isNaN(maxPage) || maxPage < 1) {
                maxPage = 1; // 默认至少导出1页
            }
        }
        
        // 根据用户选择的导出类型，切换到相应的标签页
        let targetUrl;
        if (exportType === 'answers') {
            // 构建回答标签页的URL
            const baseUrl = tab.url.split('?')[0].replace(/\/pins$|\/answers$|\/posts$/, '');
            targetUrl = baseUrl + '/answers';
        } else if (exportType === 'articles') {
            // 构建文章标签页的URL
            const baseUrl = tab.url.split('?')[0].replace(/\/pins$|\/answers$|\/posts$/, '');
            targetUrl = baseUrl + '/posts';
        }else if (exportType === 'pins') {
            // 构建收藏夹标签页的URL
            const baseUrl = tab.url.split('?')[0].replace(/\/pins$|\/answers$|\/posts$/, '');
            targetUrl = baseUrl + '/pins';
        }
        
        // 如果当前不在目标标签页，则切换到目标标签页
        if (tab.url !== targetUrl) {
            await chrome.tabs.update(tab.id, { url: targetUrl });
            
            // 等待页面加载完成
            await new Promise(resolve => {
                const listener = function(tabId, changeInfo) {
                    if (tabId === tab.id && changeInfo.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve();
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);
            });
            
            // 给页面一些时间加载内容
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // 从内容脚本获取总页数
        chrome.tabs.sendMessage(tab.id, { 
            action: "getTotalPages",
            exportType: exportType
        }, function(response) {
            let totalPage = 5; // 默认值
            
            if (response && response.totalPages) {
                totalPage = response.totalPages;
            }
            
            console.log("totalPage:", totalPage);
            
            // 如果用户选择了自定义页数，并且指定的页数小于总页数，则使用指定的页数
            // 否则使用总页数（即全部导出）
            const pagesToExport = (maxPage > 0 && maxPage < totalPage) ? maxPage : totalPage;
            
            // 开始导出
            chrome.tabs.sendMessage(tab.id, {
                action: "startExport_"+ exportType,
                maxPage: pagesToExport,
                exportType: exportType
            });
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
            document.getElementById('start-export').disabled = false; // 恢复开始导出按钮
            document.getElementById('stop-export').style.display = 'none';
        }
        else if (request.action === "exportComplete") {
            document.getElementById('progress-text').textContent = '导出完成';
            document.getElementById('progress-inner').style.width = '100%';
            document.getElementById('start-export').disabled = false; // 恢复开始导出按钮
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
            document.getElementById('start-export').disabled = false; // 恢复开始导出按钮
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
            document.getElementById('start-export').disabled = false; // 恢复开始导出按钮
            document.getElementById('stop-export').style.display = 'none';
            
            // 延迟隐藏进度条
            setTimeout(() => {
                document.getElementById('export-progress').style.display = 'none';
            }, 1500);
        }
        else if (request.action === "getTotalPages") {
            const pagination = document.querySelector('.Pagination');
            let totalPages = 5; // 默认值
            
            if (pagination) {
                const buttons = pagination.querySelectorAll('button');
                if (buttons.length >= 2) {
                    const totalPage = parseInt(buttons[buttons.length - 2].textContent);
                    if (!isNaN(totalPage)) {
                        totalPages = totalPage;
                    }
                }
            }
            
            sendResponse({ totalPages: totalPages });
            return true; // 保持消息通道开放以进行异步响应
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
        progressText.textContent = '已停止导出';
        // 延迟隐藏进度条，让用户能看到停止状态
        setTimeout(() => {
            progressDiv.style.display = 'none'; // 隐藏进度信息
        }, 1500);
        
        exportButton.disabled = false; // 恢复开始导出按钮
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

    // 处理自定义页数输入框的启用/禁用状态
    const customPagesRadio = document.getElementById('export-custom-pages');
    const customPagesCount = document.getElementById('custom-pages-count');
    
    function updateCustomPagesState() {
        customPagesCount.disabled = !customPagesRadio.checked;
    }
    
    // 初始状态设置
    updateCustomPagesState();
    
    // 添加事件监听器
    document.querySelectorAll('input[name="export-pages"]').forEach(radio => {
        radio.addEventListener('change', updateCustomPagesState);
    });
});