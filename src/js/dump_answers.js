// 在文件开头添加进度相关的常量
var ans_list_key = "zhihu_ans_list";
var ans_ids_key = "zhihu_ans_ids";
var EXPORT_STATUS_KEY = "zhihu_export_status";
var EXPORT_PROGRESS_KEY = "zhihu_export_progress";
var isExporting = false;
var current_count = 0;
var max_count = 500;

// 修改存储相关函数，使用 Chrome 存储 API
function include_ans_id(ans_id) {
    return new Promise(resolve => {
        chrome.storage.local.get(ans_ids_key, (result) => {
            const ans_ids = result[ans_ids_key] || [];
            resolve(ans_ids.includes(ans_id));
        });
    });
}

function add_ans_id(ans_id) {
    return new Promise(resolve => {
        chrome.storage.local.get(ans_ids_key, (result) => {
            const ans_ids = result[ans_ids_key] || [];
            ans_ids.push(ans_id);
            chrome.storage.local.set({[ans_ids_key]: ans_ids}, resolve);
        });
    });
}

function add_ans_to_list(ans) {
    return new Promise(resolve => {
        chrome.storage.local.get(ans_list_key, (result) => {
            const ans_list = result[ans_list_key] || [];
            ans_list.push(ans);
            chrome.storage.local.set({[ans_list_key]: ans_list}, resolve);
        });
    });
}

function check_ans_list_empty() {
    var answerItemList = document.querySelectorAll('.AnswerItem');
    if (answerItemList.length == 0) {
        console.log("没有找到回答，跳出");
        return false;
    }
    return true;
}

// 修改 saveAnswers 函数为异步函数，返回保存的数量
async function saveAnswers() {
    let answerItemList = document.querySelectorAll('.AnswerItem');
    let savedCount = 0;
    for (let answerItem of answerItemList) {
        var ansItemLabel = answerItem.querySelector(".RichContent-inner");
        if (!ansItemLabel) {
            console.log(`answerItem:${answerItem} is not a valid answer item, skip`);
            continue;
        }
        var itemData = answerItem.getAttribute("data-zop");
        var ans_id = JSON.parse(itemData)["itemId"];
        if (await include_ans_id(ans_id)) {
            console.log(`answer:${ans_id} 已存在，跳过`);
            continue;
        }
        await add_ans_id(ans_id);
        var question_title = JSON.parse(itemData)["title"];
        
        // 检查是否有"阅读全文"按钮，如果有则点击展开
        const moreButton = answerItem.querySelector('.ContentItem-more');
        if (moreButton) {
            moreButton.click();
            console.log(`点击阅读全文按钮展开内容: ${question_title}`);
            // 等待内容展开
            await sleep(1000);
        } else {
            // 如果没有阅读全文按钮，则点击原来的展开逻辑
            ansItemLabel.click();
            console.log(`question_title:${question_title} 自动点击展开`);
        }

        var answer_id = JSON.parse(itemData)["itemId"];
        var answer_content = answerItem.querySelector('.RichContent-inner').innerText;
        var answer = {
            question_title: question_title,
            answer_id: answer_id,
            answer_content: answer_content,
            answer_url: "https://www.zhihu.com/answer/" + answer_id
        };
        console.log(`answer:${answer_id} 已保存`);
        await add_ans_to_list(answer);
        savedCount++;
    }
    return savedCount;
}

function scroll_to_bottom() {
    if (!check_ans_list_empty()) {
        console.log("没有找到回答，跳出并刷新页面");
        // 保存当前状态，以便页面刷新后继续执行
        saveExportStatus('refreshing');
        saveExportProgress(current_count, max_count);
        window.location.reload();
        return;
    }
    // 滚动到底部以加载更多内容
    window.scrollTo(0, document.body.scrollHeight);
    console.log(`滚动到底部，当前已保存:${current_count}`);
}

// 修改导出函数
async function exportToMarkdown() {
    return new Promise(resolve => {
        chrome.storage.local.get(ans_list_key, async (result) => {
            let stored = result[ans_list_key] || [];

            // 创建新的 JSZip 实例
            const zip = new JSZip();
            
            // 获取当前时间戳
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

            // 为每个回答创建单独的 markdown 文件
            for (let answer of stored) {
                const safeTitle = answer.question_title.replace(/[\\/:*?"<>|]/g, '_');
                const fileName = `${answer.answer_id}_${safeTitle}.md`;

                let content = `# ${answer.question_title}\n\n`;
                content += `> AnswerID: ${answer.answer_id}\n\n`;
                content += `> 链接: ${answer.answer_url}\n\n`;
                content += `${answer.answer_content}\n\n`;

                // 将文件添加到 zip
                zip.file(fileName, content);
            }

            // 生成并下载 zip 文件
            const zipBlob = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `zhihu_answers_${timestamp}.zip`;
            a.click();
            chrome.storage.local.remove([ans_list_key, ans_ids_key]);
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
    chrome.storage.local.get(ans_list_key, (result) => {
        let stored = result[ans_list_key] || [];
        let jsonStr = JSON.stringify(stored);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        
        // 获取当前时间戳
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zhihu_answers_${timestamp}.json`;
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
async function startExport(maxAnswers = 500) {
    isExporting = true;
    current_count = 0;
    max_count = maxAnswers;
    
    // 保存初始状态
    saveExportStatus('exporting');
    saveExportProgress(current_count, max_count);

    await continueExport();
}

// 添加新函数用于继续导出流程
async function continueExport() {
    while (current_count < max_count && isExporting) {
        console.log("current_count:", current_count);
        // 发送进度更新
        chrome.runtime.sendMessage({
            action: "updateProgress",
            current: current_count,
            total: max_count
        });
        
        // 保存当前进度
        saveExportProgress(current_count, max_count);

        // 保存当前可见的回答
        let saved = await saveAnswers();
        current_count += saved;
        
        if (current_count >= max_count) {
            console.log("已达到最大条数，结束导出");
            saveExportStatus('completed');
            break;
        }
        
        // 滚动到底部以加载更多内容
        scroll_to_bottom();
        
        // 等待页面加载新内容
        await sleep(5000);
        
        // 检查是否加载了新内容
        let currentLength = document.querySelectorAll('.AnswerItem').length;
        console.log("当前可见文章数量:", currentLength, "已保存:", current_count);
        
        if (currentLength <= current_count) {
            console.log("没有更多内容加载，结束导出");
            saveExportStatus('completed');
            break;
        }
    }

    if (!isExporting) {
        saveExportStatus('stopped');
        chrome.storage.local.remove([ans_list_key, ans_ids_key]);
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
        current_count = progress.current;
        max_count = progress.total;
        saveExportStatus('exporting');
        
        // 给页面一些时间加载
        await sleep(2000);
        await continueExport();
    }
});

// 修改消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startExport_answers") {
        startExport(request.maxAnswers || 500);
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

