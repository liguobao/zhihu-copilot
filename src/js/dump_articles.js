// 在文件开头添加进度相关的常量
var article_list_key = "zhihu_article_list";
var article_ids_key = "zhihu_article_ids";

// 修改存储相关函数，使用 Chrome 存储 API
function include_id(article_id) {
    return new Promise(resolve => {
        chrome.storage.local.get(article_ids_key, (result) => {
            const article_ids = result[article_ids_key] || [];
            resolve(article_ids.includes(article_id));
        });
    });
}

function add_id(article_id) {
    return new Promise(resolve => {
        chrome.storage.local.get(article_ids_key, (result) => {
            const article_ids = result[article_ids_key] || [];
            article_ids.push(article_id);
            chrome.storage.local.set({[article_ids_key]: article_ids}, resolve);
        });
    });
}

function add_article_to_list(article) {
    return new Promise(resolve => {
        chrome.storage.local.get(article_list_key, (result) => {
            const article_list = result[article_list_key] || [];
            article_list.push(article);
            chrome.storage.local.set({[article_list_key]: article_list}, resolve);
        });
    });
}

function check_article_list_empty() {
    var articleItemList = document.querySelectorAll('.ArticleItem');
    if (articleItemList.length == 0) {
        console.log("没有找到专栏文章，跳出");
        return false;
    }
    return true;
}

// 修改 saveAnswers 函数为异步函数
async function saveAnswers() {
    let articleItemList = document.querySelectorAll('.ArticleItem');
    for (let articleItem of articleItemList) {
        var zhuanlanLabel = articleItem.querySelector(".RichContent-inner");
        if (!zhuanlanLabel) {
            console.log(`articleItem:${articleItem} is not a valid article item, skip`);
            continue;
        }
        var itemData = articleItem.getAttribute("data-zop");
        var article_id = JSON.parse(itemData)["itemId"];
        if (await include_id(article_id)) {
            console.log(`article:${article_id} 已存在，跳过`);
            continue;
        }
        await add_id(article_id);
        var title = JSON.parse(itemData)["title"];
        zhuanlanLabel.click();
        console.log(`title:${title} 自动点击展开`);

        var zhuanlan_id = JSON.parse(itemData)["itemId"];
        var article_content = articleItem.querySelector('.RichContent-inner').innerText;
        var article = {
            title: title,
            data_id: zhuanlan_id,
            data_content: article_content,
            data_url: "https://zhuanlan.zhihu.com/p/" + zhuanlan_id
        };
        console.log(`zhuanlan:${zhuanlan_id} 已保存`);
        await add_article_to_list(article);
    }
}

function click_next_page() {
    if (!check_article_list_empty()) {
        console.log("没有找到文章，跳出并刷新页面");
        // 保存当前状态，以便页面刷新后继续执行
        saveExportStatus('refreshing');
        saveExportProgress(current_page, max_page);
        window.location.reload();
        return;
    }
    var next_page = document.querySelector(".PaginationButton-next");
    if (next_page) {
        next_page.click();
        console.log(`点击下一页，当前页码:${current_page}`);
        current_page++;
    }
}

// 修改导出函数
async function exportToMarkdown() {
    return new Promise(resolve => {
        chrome.storage.local.get(article_list_key, async (result) => {
            let stored = result[article_list_key] || [];

            // 创建新的 JSZip 实例
            const zip = new JSZip();
            
            // 获取当前时间戳
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

            // 为每个文章创建单独的 markdown 文件
            for (let dataItem of stored) {
                const safeTitle = dataItem.title.replace(/[\\/:*?"<>|]/g, '_');
                const fileName = `${dataItem.data_id}_${safeTitle}.md`;

                let content = `# ${dataItem.title}\n\n`;
                content += `> ArticleID: ${dataItem.data_id}\n\n`;
                content += `> 链接: ${dataItem.data_url}\n\n`;
                content += `${dataItem.data_content}\n\n`;

                // 将文件添加到 zip
                zip.file(fileName, content);
            }

            // 生成并下载 zip 文件
            const zipBlob = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `zhihu_articles_${timestamp}.zip`;
            a.click();
            chrome.storage.local.remove([article_list_key, article_ids_key]);
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

// 修改 JSON 导出函数
function exportToJSON() {
    chrome.storage.local.get(article_list_key, (result) => {
        let stored = result[article_list_key] || [];
        let jsonStr = JSON.stringify(stored);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        
        // 获取当前时间戳
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zhihu_articles_${timestamp}.json`;
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

// 添加延时函数
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 修改进度保存相关函数
function saveExportStatus(status) {
    chrome.storage.local.set({
        [EXPORT_STATUS_KEY]: {
            status: status,
            timestamp: new Date().getTime()
        }
    });
}

function saveExportProgress(current, total) {
    chrome.storage.local.set({
        [EXPORT_PROGRESS_KEY]: {
            current: current,
            total: total,
            timestamp: new Date().getTime()
        }
    });
}

function getExportStatus() {
    return new Promise(resolve => {
        chrome.storage.local.get(EXPORT_STATUS_KEY, (result) => {
            resolve(result[EXPORT_STATUS_KEY] || {"status": "idle"});
        });
    });
}

function getExportProgress() {
    return new Promise(resolve => {
        chrome.storage.local.get(EXPORT_PROGRESS_KEY, (result) => {
            resolve(result[EXPORT_PROGRESS_KEY] || {"current": 0, "total": 0});
        });
    });
}

// 修改 startExport 函数
async function startExport(maxPages) {
    isExporting = true;
    current_page = 1;
    max_page = maxPages;
    
    // 保存初始状态
    saveExportStatus('exporting');
    saveExportProgress(current_page, max_page);

    await continueExport();
}

// 添加新函数用于继续导出流程
async function continueExport() {
    while (current_page <= max_page && isExporting) {
        console.log("current_page:", current_page);
        // 发送进度更新
        chrome.runtime.sendMessage({
            action: "updateProgress",
            current: current_page,
            total: max_page
        });
        
        // 保存当前进度
        saveExportProgress(current_page, max_page);

        // 保存当前页的回答
        await saveAnswers();
        
        // 等待内容加载
        await sleep(2000);
        
        // 点击下一页
        click_next_page();
        
        // 等待页面加载
        await sleep(5000);
        
        // 检查URL中的页码参数是否已达到最大页数
        const urlParams = new URLSearchParams(window.location.search);
        const pageParam = parseInt(urlParams.get('page') || '1');
        console.log("当前URL页码参数:", pageParam, "最大页数:", max_page);
        
        if (pageParam >= max_page) {
            console.log("已达到最大页数，结束导出");
            saveExportStatus('completed');
            break;
        }
        
        // 检查是否还有下一页按钮
        const nextButton = document.querySelector(".PaginationButton-next");
        if (!nextButton || nextButton.disabled) {
            console.log("没有下一页按钮或按钮已禁用，结束导出");
            saveExportStatus('completed');
            break;
        }
    }

    if (!isExporting) {
        saveExportStatus('stopped');
        chrome.storage.local.remove([article_list_key, article_ids_key]);
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

// 添加页面加载时的检查，以便在刷新后继续执行
document.addEventListener('DOMContentLoaded', async () => {
    const status = await getExportStatus();
    const progress = await getExportProgress();
    
    if (status.status === 'refreshing') {
        console.log("检测到页面刷新，继续执行导出操作");
        isExporting = true;
        current_page = progress.current;
        max_page = progress.total;
        saveExportStatus('exporting');
        
        // 给页面一些时间加载
        await sleep(2000);
        await continueExport();
    }
});

// 修改消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startExport_articles") {
        startExport(request.maxPage);
        sendResponse({success: true});
    } else if (request.action === "stopExport") {
        isExporting = false;
        chrome.storage.local.remove([
            article_list_key, 
            article_ids_key, 
            EXPORT_STATUS_KEY, 
            EXPORT_PROGRESS_KEY
        ]);
        sendResponse({success: true});
    } else if (request.action === "getExportStatus") {
        // 使用 Promise 处理异步获取状态
        Promise.all([getExportStatus(), getExportProgress()]).then(([status, progress]) => {
            sendResponse({
                status: status.status,
                progress: progress
            });
        });
        return true; // 保持消息通道开放以进行异步响应
    }
    else if (request.action === "getTotalPages") {
        console.log("正在获取总页数...");
        debugger;
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
        return true; // 保持消息通道开放以进行异步响应
    }
    return true;
});

