
// 在文件开头添加进度相关的常量
var ans_list_key = "zhihu_ans_list";
var ans_ids_key = "zhihu_ans_ids";
const EXPORT_STATUS_KEY = 'zhihu_export_status';
const EXPORT_PROGRESS_KEY = 'zhihu_export_progress';
// 默认翻页到20页
var max_page = 20;
var current_page = 1;
function include_ans_id(ans_id) {
    var ans_ids = JSON.parse(localStorage.getItem(ans_ids_key) || '[]');
    return ans_ids.includes(ans_id);
}
function add_ans_id(ans_id) {
    var ans_ids = JSON.parse(localStorage.getItem(ans_ids_key) || '[]');
    ans_ids.push(ans_id);
    localStorage.setItem(ans_ids_key, JSON.stringify(ans_ids));
}

function add_ans_to_list(ans) {
    var ans_list = JSON.parse(localStorage.getItem(ans_list_key) || '[]');
    ans_list.push(ans);
    localStorage.setItem(ans_list_key, JSON.stringify(ans_list));
}

function check_ans_list_empty() {
    var answerItemList = document.querySelectorAll('.AnswerItem');
    if (answerItemList.length == 0) {
        console.log("没有找到回答，跳出");
        return false;
    }
    return true;
}

function saveAnswers() {
    let answerItemList = document.querySelectorAll('.AnswerItem');
    for (let answerItem of answerItemList) {
        var ansItemLabel = answerItem.querySelector(".RichContent-inner");
        if (!ansItemLabel) {
            console.log(`answerItem:${answerItem} is not a valid answer item, skip`);
            continue;
        }
        var itemData = answerItem.getAttribute("data-zop");
        var ans_id = JSON.parse(itemData)["itemId"];
        if (include_ans_id(ans_id)) {
            console.log(`answer:${ans_id} 已存在，跳过`);
            continue;
        }
        add_ans_id(ans_id);
        var question_title = JSON.parse(itemData)["title"];
        ansItemLabel.click();
        console.log(`question_title:${question_title} 自动点击展开`);

        var answer_id = JSON.parse(itemData)["itemId"];
        var answer_content = answerItem.querySelector('.RichContent-inner').innerText;
        var answer = {
            question_title: question_title,
            answer_id: answer_id,
            answer_content: answer_content,
            answer_url: "https://www.zhihu.com/answer/" + answer_id
        };
        console.log(`answer:${answer_id} 已保存`);
        add_ans_to_list(answer);
    }
}

function click_next_page() {
    if (!check_ans_list_empty()) {
        console.log("没有找到回答，跳出");
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

// 导出所有回答
async function exportToMarkdown() {
    let stored = JSON.parse(localStorage.getItem(ans_list_key) || '[]');

    // 创建新的 JSZip 实例
    const zip = new JSZip();

    // 为每个回答创建单独的 markdown 文件
    for (let answer of stored) {
        const safeTitle = answer.question_title.replace(/[\\/:*?"<>|]/g, '_');
        const fileName = `${answer.answer_id}_${safeTitle}.md`;

        let content = `# ${answer.question_title}\n\n`;
        content += `> 回答ID: ${answer.answer_id}\n\n`;
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
    a.download = "zhihu_answers.zip";
    a.click();
    localStorage.removeItem(ans_list_key);
    localStorage.removeItem(ans_ids_key);
    URL.revokeObjectURL(url);
}

// 导出为JSON文件
function exportToJSON() {
    let stored = localStorage.getItem(ans_list_key) || '[]';
    const blob = new Blob([stored], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "zhihu_answers.json";
    a.click();
    URL.revokeObjectURL(url);
}

// 添加延时函数
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 添加进度保存相关函数
function saveExportStatus(status) {
    localStorage.setItem(EXPORT_STATUS_KEY, JSON.stringify({
        status: status,
        timestamp: new Date().getTime()
    }));
}

function saveExportProgress(current, total) {
    localStorage.setItem(EXPORT_PROGRESS_KEY, JSON.stringify({
        current: current,
        total: total,
        timestamp: new Date().getTime()
    }));
}

function getExportStatus() {
    return JSON.parse(localStorage.getItem(EXPORT_STATUS_KEY) || '{"status": "idle"}');
}

function getExportProgress() {
    return JSON.parse(localStorage.getItem(EXPORT_PROGRESS_KEY) || '{"current": 0, "total": 0}');
}



// 修改 startExport 函数
async function startExport(maxPages) {
    isExporting = true;
    current_page = 1;
    max_page = maxPages;
    
    // 保存初始状态
    saveExportStatus('exporting');
    saveExportProgress(current_page, max_page);

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
        saveAnswers();
        
        // 等待内容加载
        await sleep(2000);
        
        // 点击下一页
        click_next_page();
        
        // 等待页面加载
        await sleep(3000);
        
        // 检查是否还有下一页
        const nextButton = document.querySelector(".PaginationButton-next");
        if (!nextButton || nextButton.disabled) {
            saveExportStatus('completed');
            break;
        }
    }

    if (!isExporting) {
        saveExportStatus('stopped');
        localStorage.removeItem(ans_list_key);
        localStorage.removeItem(ans_ids_key);
    } else {
        await exportToMarkdown();
        saveExportStatus('completed');
    }
    isExporting = false;
}

// 在消息监听器中添加停止处理
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "startExport") {
        startExport(request.maxPage);
        sendResponse({success: true});
    } else if (request.action === "stopExport") {
        isExporting = false;
        localStorage.removeItem(ans_list_key);
        localStorage.removeItem(ans_ids_key);
        localStorage.removeItem(EXPORT_STATUS_KEY);
        localStorage.removeItem(EXPORT_PROGRESS_KEY);
        sendResponse({success: true});
    } else if (request.action === "getExportStatus") {
        const status = getExportStatus();
        const progress = getExportProgress();
        sendResponse({
            status: status.status,
            progress: progress
        });
    }
    return true;
});