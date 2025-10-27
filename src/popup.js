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

    const EXPORT_TYPE_LABELS = {
        answers: '回答',
        articles: '专栏文章',
        pins: '想法'
    };

    const EXPORT_STORAGE_KEYS = {
        STATUS: 'zhihu_export_status',
        PROGRESS: 'zhihu_export_progress'
    };
    const LEGACY_EXPORT_STORAGE_KEYS = ['exportStatus', 'exportProgress'];

    function clearExportStorage() {
        chrome.storage.local.remove([
            EXPORT_STORAGE_KEYS.STATUS,
            EXPORT_STORAGE_KEYS.PROGRESS,
            ...LEGACY_EXPORT_STORAGE_KEYS
        ]);
    }

    const exportSummary = {
        type: null,
        typeLabel: '',
        total: 0,
        current: 0,
        count: 0,
        fileType: ''
    };

    function resetExportSummary() {
        exportSummary.type = null;
        exportSummary.typeLabel = '';
        exportSummary.total = 0;
        exportSummary.current = 0;
        exportSummary.count = 0;
        exportSummary.fileType = '';
    }

    function setProgressText(message) {
        const progressText = document.getElementById('progress-text');
        if (!progressText) {
            return null;
        }
        if (message && message.length > 0) {
            progressText.textContent = message;
            progressText.style.display = 'block';
        } else {
            progressText.textContent = '';
            progressText.style.display = 'none';
        }
        return progressText;
    }

    const closeProgressBtn = document.getElementById('close-progress');
    if (closeProgressBtn) {
        closeProgressBtn.addEventListener('click', function() {
            const progressDiv = document.getElementById('export-progress');
            const progressBar = document.getElementById('progress-inner');
            const stopButton = document.getElementById('stop-export');
            const startButton = document.getElementById('start-export');
            if (progressDiv) progressDiv.style.display = 'none';
            if (progressBar) progressBar.style.width = '0%';
            setProgressText('');
            if (stopButton) {
                stopButton.style.display = 'none';
                stopButton.disabled = false;
            }
            if (startButton) startButton.disabled = false;
            resetExportSummary();
            clearExportStorage();
            closeProgressBtn.style.display = 'none';
        });
    }

    // 初始化时更新消息数量
    updateMessageCount();

    // 刷新按钮点击事件 - 修改为打开知乎
    const refreshBtn = document.getElementById('refresh-messages');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            chrome.tabs.create({url: 'https://www.zhihu.com'});
        });
    }
    
    // 前往消息中心
    const inboxBtn = document.getElementById('go-to-inbox');
    if (inboxBtn) {
        inboxBtn.addEventListener('click', function() {
            chrome.tabs.create({url: 'https://www.zhihu.com/notifications'});
        });
    }
    
    // 开始写专栏
    const writeBtn = document.getElementById('write-article');
    if (writeBtn) {
        writeBtn.addEventListener('click', function() {
            chrome.tabs.create({url: 'https://zhuanlan.zhihu.com/write'});
        });
    }
    
    // 创作中心
    const creatorBtn = document.getElementById('creator-center');
    if (creatorBtn) {
        creatorBtn.addEventListener('click', function() {
            chrome.tabs.create({url: 'https://www.zhihu.com/creator'});
        });
    }
    
    // 导出功能
    const startExportBtn = document.getElementById('start-export');
    if (startExportBtn) {
        startExportBtn.addEventListener('click', async function() {
            // 清空之前的缓存
            clearExportStorage();
            
            const progressDiv = document.getElementById('export-progress');
            const progressBar = document.getElementById('progress-inner');
            const stopButton = document.getElementById('stop-export');
            const exportButton = document.getElementById('start-export'); // 获取按钮的引用
            
            if (progressDiv) progressDiv.style.display = 'flex'; // 改为flex布局
            if (exportButton) exportButton.disabled = true; // 使用引用来禁用按钮，而不是this
            if (stopButton) {
                stopButton.style.display = 'block'; // 显示停止按钮
                stopButton.disabled = false;
            }
            if (closeProgressBtn) closeProgressBtn.style.display = 'none';
            if (progressBar) progressBar.style.width = '0%';
            setProgressText('准备导出...');
        
            // 检查当前标签页是否是知乎用户页面
            const tabs = await chrome.tabs.query({active: true, currentWindow: true});
            const tab = tabs[0];
            
            if (!tab.url.includes('zhihu.com/people/')) {
                setProgressText('请在知乎用户主页使用此功能');
                if (exportButton) exportButton.disabled = false; // 使用引用来启用按钮
                if (stopButton) stopButton.style.display = 'none';
                return;
            }

            // 获取用户选择的导出类型
            const exportType = document.querySelector('input[name="export-type"]:checked').value;
            resetExportSummary();
            exportSummary.type = exportType;
            exportSummary.typeLabel = EXPORT_TYPE_LABELS[exportType] || '内容';
        
            // 获取用户输入的导出数量
            let maxAnswers = parseInt(document.getElementById('export-count').value);
            if (isNaN(maxAnswers) || maxAnswers < 1) {
                maxAnswers = 50; // 默认至少导出50条
            }
            exportSummary.total = maxAnswers;
        
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
        } else if (exportType === 'pins') {
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
        
        // 开始导出
        chrome.tabs.sendMessage(tab.id, {
            action: "startExport_"+ exportType,
            maxAnswers: maxAnswers,
            exportType: exportType
        }, function(response) {
            if (chrome.runtime.lastError) {
                console.error('发送消息失败:', chrome.runtime.lastError.message);
                setProgressText('导出失败：无法连接到页面，请刷新页面后重试');
                if (exportButton) exportButton.disabled = false;
                if (stopButton) stopButton.style.display = 'none';
                return;
            }
        });
    })};
    
    // 监听来自 content script 的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "updateProgress") {
            const progressBar = document.getElementById('progress-inner');
            
            const percent = (request.current / request.total) * 100;
            if (progressBar) progressBar.style.width = `${percent}%`;
            setProgressText(`正在导出 ${request.current}/${request.total} 条`);
            exportSummary.current = request.current;
            exportSummary.total = request.total;
            if (closeProgressBtn) closeProgressBtn.style.display = 'none';
        }
        else if (request.action === "exportError") {
            setProgressText(`导出失败: ${request.error}`);
            document.getElementById('start-export').disabled = false; // 恢复开始导出按钮
            document.getElementById('stop-export').style.display = 'none';
            if (closeProgressBtn) closeProgressBtn.style.display = 'block';
        }
        else if (request.action === "exportComplete" || request.action === "exportCompleted") {
            const progressDiv = document.getElementById('export-progress');
            const progressBar = document.getElementById('progress-inner');
            const startButton = document.getElementById('start-export');
            const stopButton = document.getElementById('stop-export');
            const typeLabel = exportSummary.typeLabel || '内容';
            const exportedCount = exportSummary.count || exportSummary.current || 0;
            const total = exportSummary.total || 0;
            const fileTypeLabel = exportSummary.fileType ? `（${exportSummary.fileType}）` : '';

            let countText = exportedCount.toString();
            if (total && exportedCount && exportedCount !== total) {
                countText = `${exportedCount}/${total}`;
            } else if (!exportedCount && total) {
                countText = `${total}`;
            }

            if (progressDiv) progressDiv.style.display = 'flex';
            setProgressText(`导出完成：共导出 ${countText} 条${typeLabel}${fileTypeLabel}`);
            if (progressBar) progressBar.style.width = '100%';
            if (startButton) startButton.disabled = false; // 恢复开始导出按钮
            if (stopButton) {
                stopButton.style.display = 'none';
                stopButton.disabled = false;
            }
            if (closeProgressBtn) closeProgressBtn.style.display = 'block';

            clearExportStorage();
        }
        else if (request.action === "exportFileCompleted") {
            // 处理文件下载完成的消息
            const progressDiv = document.getElementById('export-progress');
            const progressBar = document.getElementById('progress-inner');
            const startButton = document.getElementById('start-export');
            const stopButton = document.getElementById('stop-export');
            const typeLabel = exportSummary.typeLabel || '内容';
            const total = exportSummary.total || 0;
            const fileType =
                typeof request.fileType === 'string' && request.fileType.length > 0
                    ? request.fileType.charAt(0).toUpperCase() + request.fileType.slice(1)
                    : '';

            exportSummary.count = request.count || exportSummary.current || 0;
            exportSummary.fileType = fileType;

            let countText = exportSummary.count.toString();
            if (total && exportSummary.count && exportSummary.count !== total) {
                countText = `${exportSummary.count}/${total}`;
            }

            if (progressDiv) progressDiv.style.display = 'flex';
            setProgressText(`导出完成：共导出 ${countText} 条${typeLabel}${fileType ? `（${fileType}）` : ''}`);
            if (progressBar) progressBar.style.width = '100%';
            if (startButton) startButton.disabled = false; // 恢复开始导出按钮
            if (stopButton) {
                stopButton.style.display = 'none';
                stopButton.disabled = false;
            }
            if (closeProgressBtn) closeProgressBtn.style.display = 'block';

            // 清理缓存
            clearExportStorage();
        }
        else if (request.action === "exportStopped") {
            // 处理导出被停止的消息
            setProgressText('导出已停止');
            const startBtn = document.getElementById('start-export');
            const stopBtnEl = document.getElementById('stop-export');
            if (startBtn) startBtn.disabled = false; // 恢复开始导出按钮
            if (stopBtnEl) {
                stopBtnEl.style.display = 'none';
                stopBtnEl.disabled = false;
            }
            if (closeProgressBtn) closeProgressBtn.style.display = 'none';
            clearExportStorage();
            
            // 延迟隐藏进度条
            const progressDiv = document.getElementById('export-progress');
            setTimeout(() => {
                if (progressDiv) progressDiv.style.display = 'none';
                setProgressText('');
                resetExportSummary();
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
    const stopExportBtn = document.getElementById('stop-export');
    if (stopExportBtn) {
        stopExportBtn.addEventListener('click', async function() {
            const tabs = await chrome.tabs.query({active: true, currentWindow: true});
            const tab = tabs && tabs.length ? tabs[0] : null;
            const stopButton = this;

            if (!tab || !tab.id) {
                console.error('未找到用于停止导出的标签页');
                setProgressText('停止失败：未找到导出页面');
                stopButton.disabled = false;
                if (closeProgressBtn) closeProgressBtn.style.display = 'block';
                return;
            }

            stopButton.disabled = true;
            setProgressText('正在停止导出...');
            if (closeProgressBtn) closeProgressBtn.style.display = 'none';

            chrome.tabs.sendMessage(tab.id, { action: "stopExport" }, function(response) {
                if (chrome.runtime.lastError) {
                    console.error('发送停止消息失败:', chrome.runtime.lastError.message);
                    setProgressText(`停止失败：${chrome.runtime.lastError.message}`);
                    stopButton.disabled = false;
                    if (closeProgressBtn) closeProgressBtn.style.display = 'block';
                    const exportButton = document.getElementById('start-export');
                    if (exportButton) exportButton.disabled = false;
                    return;
                }

                if (!response || response.success !== true) {
                    console.error('页面未响应停止请求');
                    setProgressText('停止失败：页面未响应，请刷新后重试');
                    stopButton.disabled = false;
                    if (closeProgressBtn) closeProgressBtn.style.display = 'block';
                    const exportButton = document.getElementById('start-export');
                    if (exportButton) exportButton.disabled = false;
                    return;
                }

                // 成功发送停止指令后等待 exportStopped 消息接管界面更新
            });
        });
    }
    
    // 修改状态恢复函数，移除按钮文本修改的处理
    async function restoreExportStatus() {
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        const tab = tabs[0];
        
        if (!tab.url.includes('zhihu.com/people/')) {
            return;
        }

        // 获取导出状态
        chrome.tabs.sendMessage(tab.id, { action: "getExportStatus" }, function(response) {
            if (chrome.runtime.lastError) {
                console.error('获取导出状态失败:', chrome.runtime.lastError.message);
                return;
            }
            const progressDiv = document.getElementById('export-progress');
            const progressBar = document.getElementById('progress-inner');
            const exportButton = document.getElementById('start-export');
            const stopButton = document.getElementById('stop-export');

            if (response && response.status) {
                if (response.status === 'exporting') {
                    if (progressDiv) progressDiv.style.display = 'flex';
                    if (exportButton) exportButton.disabled = true;
                    if (stopButton) {
                        stopButton.style.display = 'block';
                        stopButton.disabled = false;
                    }
                    const percent = response.progress.total ? (response.progress.current / response.progress.total) * 100 : 0;
                    if (progressBar) progressBar.style.width = `${percent}%`;
                    setProgressText(`正在导出 ${response.progress.current}/${response.progress.total} 条`);
                    exportSummary.type = response.type;
                    exportSummary.typeLabel = EXPORT_TYPE_LABELS[response.type] || '内容';
                    exportSummary.total = response.progress.total || 0;
                    exportSummary.current = response.progress.current || 0;
                    exportSummary.count = 0;
                    exportSummary.fileType = '';
                    if (closeProgressBtn) closeProgressBtn.style.display = 'none';
                } else if (response.status === 'completed') {
                    const typeLabel = EXPORT_TYPE_LABELS[response.type] || '内容';
                    const exportedCount = response.progress.current || response.progress.total || 0;
                    const total = response.progress.total || 0;
                    let countText = exportedCount.toString();
                    if (total && exportedCount && exportedCount !== total) {
                        countText = `${exportedCount}/${total}`;
                    }

                    if (progressDiv) progressDiv.style.display = 'flex';
                    if (progressBar) progressBar.style.width = '100%';
                    setProgressText(`导出完成：共导出 ${countText} 条${typeLabel}`);
                    if (exportButton) exportButton.disabled = false;
                    if (stopButton) {
                        stopButton.style.display = 'none';
                        stopButton.disabled = false;
                    }
                    exportSummary.type = response.type;
                    exportSummary.typeLabel = typeLabel;
                    exportSummary.total = total;
                    exportSummary.current = exportedCount;
                    exportSummary.count = exportedCount;
                    exportSummary.fileType = '';
                    if (closeProgressBtn) closeProgressBtn.style.display = 'block';
                    clearExportStorage();
                } else {
                    if (progressDiv) progressDiv.style.display = 'none';
                    if (progressBar) progressBar.style.width = '0%';
                    if (exportButton) exportButton.disabled = false;
                    if (stopButton) {
                        stopButton.style.display = 'none';
                        stopButton.disabled = false;
                    }
                    setProgressText('');
                    resetExportSummary();
                    if (closeProgressBtn) closeProgressBtn.style.display = 'none';
                    clearExportStorage();
                }
            } else {
                if (progressDiv) progressDiv.style.display = 'none';
                if (progressBar) progressBar.style.width = '0%';
                if (exportButton) exportButton.disabled = false;
                if (stopButton) {
                    stopButton.style.display = 'none';
                    stopButton.disabled = false;
                }
                setProgressText('');
                resetExportSummary();
                if (closeProgressBtn) closeProgressBtn.style.display = 'none';
                clearExportStorage();
            }
        });
    }

    // 初始化时恢复导出状态
    restoreExportStatus();

    // 里程碑点击事件
    const milestoneBtn = document.getElementById('milestone');
    if (milestoneBtn) {
        milestoneBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            const milestoneUrl = this.href;
            
            // 查询所有打开的知乎标签页
        const tabs = await chrome.tabs.query({ url: 'https://*.zhihu.com/*' });
        
        if (tabs.length > 0) {
            // 如果已经有知乎标签页，在新标签页打开
            chrome.tabs.create({ url: milestoneUrl });
        } else {
            // 如果没有知乎标签页，创建新窗口
            chrome.windows.create({
                url: milestoneUrl,
                type: 'normal',
                width: 800,
                height: 600,
                left: Math.round((screen.width - 800) / 2),
                top: Math.round((screen.height - 600) / 2),
                focused: true
            });
        }
    });

    // 关闭 iframe 按钮点击事件
    const closeMilestoneBtn = document.getElementById('close-milestone');
    if (closeMilestoneBtn) {
        closeMilestoneBtn.addEventListener('click', function() {
            const iframeContainer = document.getElementById('milestone-iframe');
            const milestoneFrame = document.getElementById('milestone-frame');
            if (iframeContainer) iframeContainer.style.display = 'none';
            if (milestoneFrame) milestoneFrame.src = ''; // 清空 iframe 内容
        });
    }

    // 点击遮罩层关闭 iframe
    const milestoneIframe = document.getElementById('milestone-iframe');
    if (milestoneIframe) {
        milestoneIframe.addEventListener('click', function(e) {
            if (e.target === this) {
                const milestoneFrame = document.getElementById('milestone-frame');
                this.style.display = 'none';
                if (milestoneFrame) milestoneFrame.src = ''; // 清空 iframe 内容
            }
        });
    }
}
});
