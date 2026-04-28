document.addEventListener("DOMContentLoaded", () => {
    const EXPORT_TYPE_LABELS = {
        answers: "回答",
        articles: "专栏文章",
        pins: "想法"
    };

    const EXPORT_TARGET_PATHS = {
        answers: "/answers",
        articles: "/posts",
        pins: "/pins"
    };

    const EXPORT_STORAGE_KEYS = {
        STATUS: "zhihu_export_status",
        PROGRESS: "zhihu_export_progress",
        TASK: "zhihu_export_task",
        PREFERENCES: "zhihu_export_preferences"
    };

    const EXPORT_STATUS = {
        PREPARING: "preparing",
        EXPORTING: "exporting",
        REFRESHING: "refreshing",
        COMPLETED: "completed"
    };

    const LEGACY_EXPORT_STORAGE_KEYS = ["exportStatus", "exportProgress"];

    const ZHIHU_URLS = {
        HOME: "https://www.zhihu.com",
        NOTIFICATIONS: "https://www.zhihu.com/notifications",
        WRITE: "https://zhuanlan.zhihu.com/write",
        CREATOR: "https://www.zhihu.com/creator",
        MILESTONE: "https://www.zhihu.com/appview/creator/milestone"
    };

    const exportSummary = {
        type: null,
        typeLabel: "",
        total: 0,
        current: 0,
        count: 0,
        fileType: ""
    };

    const elements = {
        unreadCount: document.getElementById("unread-count"),
        defaultMessage: document.getElementById("default-msg"),
        defaultCount: document.getElementById("default-count"),
        followMessage: document.getElementById("follow-msg"),
        followCount: document.getElementById("follow-count"),
        voteMessage: document.getElementById("vote-msg"),
        voteCount: document.getElementById("vote-count"),
        notificationEntry: document.getElementById("go-to-inbox"),
        refreshButton: document.getElementById("refresh-messages"),
        writeArticle: document.getElementById("write-article"),
        creatorCenter: document.getElementById("creator-center"),
        milestone: document.getElementById("milestone"),
        exportCountAll: document.getElementById("export-count-all"),
        exportCountCustomMode: document.getElementById("export-count-custom-mode"),
        exportCount: document.getElementById("export-count"),
        startExport: document.getElementById("start-export"),
        stopExport: document.getElementById("stop-export"),
        closeProgress: document.getElementById("close-progress"),
        exportProgress: document.getElementById("export-progress"),
        progressInner: document.getElementById("progress-inner"),
        progressLabel: document.getElementById("progress-label")
    };

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function storageGet(keys) {
        return new Promise(resolve => {
            chrome.storage.local.get(keys, resolve);
        });
    }

    function storageSet(values) {
        return new Promise(resolve => {
            chrome.storage.local.set(values, resolve);
        });
    }

    function storageRemove(keys) {
        return new Promise(resolve => {
            chrome.storage.local.remove(keys, resolve);
        });
    }

    function clearExportStorage() {
        return storageRemove([
            EXPORT_STORAGE_KEYS.STATUS,
            EXPORT_STORAGE_KEYS.PROGRESS,
            EXPORT_STORAGE_KEYS.TASK,
            ...LEGACY_EXPORT_STORAGE_KEYS
        ]);
    }

    function resetExportSummary() {
        exportSummary.type = null;
        exportSummary.typeLabel = "";
        exportSummary.total = 0;
        exportSummary.current = 0;
        exportSummary.count = 0;
        exportSummary.fileType = "";
    }

    function setProgressVisible(visible) {
        if (elements.exportProgress) {
            elements.exportProgress.style.display = visible ? "flex" : "none";
        }
    }

    function setProgressPercent(percent) {
        if (!elements.progressInner) {
            return;
        }

        const normalized = Math.max(0, Math.min(100, percent || 0));
        elements.progressInner.style.width = `${normalized}%`;
    }

    function setProgressText(message, percent) {
        if (!elements.progressLabel) {
            return;
        }

        if (message) {
            elements.progressLabel.textContent = message;
            elements.progressLabel.style.display = "block";
        } else {
            elements.progressLabel.textContent = "";
            elements.progressLabel.style.display = "none";
        }

        const normalized = Math.max(0, Math.min(100, percent || 0));
        elements.progressLabel.style.color = normalized >= 60 ? "#fff" : "#666";
    }

    function setExportButtons(isExporting) {
        if (elements.startExport) {
            elements.startExport.disabled = isExporting;
        }

        if (!elements.stopExport) {
            return;
        }

        elements.stopExport.style.display = isExporting ? "block" : "none";
        elements.stopExport.disabled = false;
    }

    function showCloseProgressButton(visible) {
        if (elements.closeProgress) {
            elements.closeProgress.style.display = visible ? "block" : "none";
        }
    }

    function openTab(url) {
        chrome.tabs.create({ url });
    }

    function bindPopupLink(element, url, handler) {
        if (!element) {
            return;
        }

        element.addEventListener("click", async event => {
            event.preventDefault();

            if (typeof handler === "function") {
                await handler();
                return;
            }

            openTab(url);
        });
    }

    async function queryActiveTab() {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        return tabs && tabs.length ? tabs[0] : null;
    }

    function isZhihuProfilePage(url) {
        return /^https:\/\/(?:[^/]+\.)?zhihu\.com\/people\//.test(url || "");
    }

    function normalizeProfileBaseUrl(url) {
        return String(url || "")
            .split(/[?#]/)[0]
            .replace(/\/$/, "")
            .replace(/\/(?:answers|posts|pins)$/, "");
    }

    function buildTargetUrl(url, exportType) {
        const targetPath = EXPORT_TARGET_PATHS[exportType];
        if (!targetPath) {
            return "";
        }

        return `${normalizeProfileBaseUrl(url)}${targetPath}`;
    }

    function waitForTabComplete(tabId, timeoutMs = 15000) {
        return new Promise((resolve, reject) => {
            let timeoutId = null;

            const cleanup = () => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                chrome.tabs.onUpdated.removeListener(listener);
            };

            const listener = (updatedTabId, changeInfo) => {
                if (updatedTabId !== tabId || changeInfo.status !== "complete") {
                    return;
                }

                cleanup();
                resolve();
            };

            timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error("页面加载超时，请刷新后重试"));
            }, timeoutMs);

            chrome.tabs.onUpdated.addListener(listener);
        });
    }

    function sendTabMessage(tabId, message) {
        return new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tabId, message, response => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                resolve(response);
            });
        });
    }

    async function sendTabMessageWithRetry(tabId, message, retries = 2) {
        let lastError = null;

        for (let attempt = 0; attempt <= retries; attempt += 1) {
            try {
                return await sendTabMessage(tabId, message);
            } catch (error) {
                lastError = error;
                if (attempt === retries) {
                    break;
                }
                await sleep(600);
            }
        }

        throw lastError || new Error("页面消息发送失败");
    }

    function clampProgress(current, total) {
        if (!total) {
            return 0;
        }

        return Math.max(0, Math.min(100, (current / total) * 100));
    }

    function formatExportCount(count, total) {
        if (!total) {
            return String(count || 0);
        }

        if (!count) {
            return String(total);
        }

        return count === total ? String(count) : `${count}/${total}`;
    }

    function updateProgressBar(current, total) {
        const hasTotal = Number.isFinite(total) && total > 0;
        const percent = hasTotal ? clampProgress(current, total) : 0;
        setProgressPercent(percent);
        setProgressText(
            hasTotal ? `正在导出 ${current}/${total} 条` : `正在导出 ${current} 条`,
            percent
        );
        exportSummary.current = current;
        exportSummary.total = hasTotal ? total : 0;
        showCloseProgressButton(false);
    }

    function resetProgressUi() {
        setProgressVisible(false);
        setProgressPercent(0);
        setProgressText("");
        setExportButtons(false);
        showCloseProgressButton(false);
        resetExportSummary();
    }

    function updateMessageCount() {
        chrome.storage.local.get(["msg1", "msg2", "msg3", "unreadCount"], result => {
            const defaultCount = result.msg1 || 0;
            const followCount = result.msg2 || 0;
            const voteCount = result.msg3 || 0;
            const totalCount = result.unreadCount || 0;

            if (elements.unreadCount) {
                elements.unreadCount.textContent = totalCount;
            }

            if (elements.defaultMessage && elements.defaultCount) {
                elements.defaultMessage.style.display = defaultCount > 0 ? "block" : "none";
                elements.defaultCount.textContent = defaultCount;
            }

            if (elements.followMessage && elements.followCount) {
                elements.followMessage.style.display = followCount > 0 ? "block" : "none";
                elements.followCount.textContent = followCount;
            }

            if (elements.voteMessage && elements.voteCount) {
                elements.voteMessage.style.display = voteCount > 0 ? "block" : "none";
                elements.voteCount.textContent = voteCount;
            }
        });
    }

    function getSelectedExportType() {
        return document.querySelector('input[name="export-type"]:checked')?.value || "answers";
    }

    function setSelectedExportType(exportType) {
        const targetInput = document.querySelector(`input[name="export-type"][value="${exportType}"]`);
        if (targetInput) {
            targetInput.checked = true;
        }
    }

    function isExportAllSelected() {
        return Boolean(elements.exportCountAll?.checked);
    }

    function updateExportCountInputState() {
        if (!elements.exportCount) {
            return;
        }

        elements.exportCount.disabled = isExportAllSelected();
    }

    function getRequestedExportCount() {
        const rawValue = Number.parseInt(elements.exportCount?.value, 10);
        return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : 10;
    }

    function getExportPreferences() {
        return {
            type: getSelectedExportType(),
            countMode: isExportAllSelected() ? "all" : "custom",
            count: getRequestedExportCount()
        };
    }

    function applyExportPreferences(preferences = {}) {
        if (preferences.type) {
            setSelectedExportType(preferences.type);
        }

        if (preferences.countMode === "all" && elements.exportCountAll) {
            elements.exportCountAll.checked = true;
        } else if (elements.exportCountCustomMode) {
            elements.exportCountCustomMode.checked = true;
        }

        if (Number.isFinite(preferences.count) && preferences.count > 0 && elements.exportCount) {
            elements.exportCount.value = String(preferences.count);
        }

        updateExportCountInputState();
    }

    async function saveExportPreferences() {
        await storageSet({
            [EXPORT_STORAGE_KEYS.PREFERENCES]: getExportPreferences()
        });
    }

    async function restoreExportPreferences() {
        const result = await storageGet(EXPORT_STORAGE_KEYS.PREFERENCES);
        applyExportPreferences(result[EXPORT_STORAGE_KEYS.PREFERENCES] || {});
    }

    async function savePendingExportTask(task) {
        await storageSet({
            [EXPORT_STORAGE_KEYS.TASK]: {
                ...task,
                status: EXPORT_STATUS.PREPARING,
                updatedAt: Date.now()
            },
            [EXPORT_STORAGE_KEYS.STATUS]: {
                status: EXPORT_STATUS.PREPARING,
                type: task.type,
                timestamp: Date.now()
            },
            [EXPORT_STORAGE_KEYS.PROGRESS]: {
                current: 0,
                total: Number.isFinite(task.maxItems) ? task.maxItems : 0,
                timestamp: Date.now()
            }
        });
    }

    async function prepareExportTab(tab, exportType) {
        const targetUrl = buildTargetUrl(tab.url, exportType);
        const currentUrl = String(tab.url || "").split(/[?#]/)[0].replace(/\/$/, "");

        if (currentUrl !== targetUrl) {
            await chrome.tabs.update(tab.id, { url: targetUrl });
            await waitForTabComplete(tab.id);
            await sleep(1000);
        }

        return targetUrl;
    }

    async function detectExportTotal(tabId, exportType, requestedCount, exportAll) {
        try {
            // 先读取主页 tab 上的真实总数，再把“本次上限”裁到用户输入范围内，
            // 这样进度条展示的是实际可导出的数量，而不是固定按输入值盲算。
            const response = await sendTabMessageWithRetry(tabId, {
                action: "getExportSummary",
                exportType
            });

            const totalCount = Number(response?.totalCount);
            if (!Number.isFinite(totalCount)) {
                return {
                    totalCount: null,
                    effectiveTotal: exportAll ? null : requestedCount,
                    isUnlimited: exportAll
                };
            }

            return {
                totalCount: Math.max(0, totalCount),
                effectiveTotal: exportAll
                    ? Math.max(0, totalCount)
                    : Math.min(requestedCount, Math.max(0, totalCount)),
                isUnlimited: false
            };
        } catch (error) {
            console.warn("获取导出总数失败，回退到用户输入数量:", error);
            return {
                totalCount: null,
                effectiveTotal: exportAll ? null : requestedCount,
                isUnlimited: exportAll
            };
        }
    }

    async function startExport() {
        await saveExportPreferences();
        await clearExportStorage();
        setProgressVisible(true);
        setProgressPercent(0);
        setProgressText("准备导出...");
        setExportButtons(true);
        showCloseProgressButton(false);
        resetExportSummary();

        const tab = await queryActiveTab();
        if (!tab?.id || !isZhihuProfilePage(tab.url)) {
            setProgressText("请在知乎用户主页使用此功能");
            setExportButtons(false);
            showCloseProgressButton(true);
            return;
        }

        const exportType = getSelectedExportType();
        const exportAll = isExportAllSelected();
        const requestedCount = exportAll ? null : getRequestedExportCount();
        const targetUrl = buildTargetUrl(tab.url, exportType);

        exportSummary.type = exportType;
        exportSummary.typeLabel = EXPORT_TYPE_LABELS[exportType] || "内容";
        exportSummary.total = requestedCount || 0;

        try {
            await savePendingExportTask({
                type: exportType,
                exportAll,
                maxItems: requestedCount,
                targetUrl
            });

            await prepareExportTab(tab, exportType);

            const { totalCount, effectiveTotal, isUnlimited } = await detectExportTotal(
                tab.id,
                exportType,
                requestedCount,
                exportAll
            );

            if (totalCount === 0) {
                await clearExportStorage();
                setProgressText(`当前页暂无可导出的${exportSummary.typeLabel}`);
                setExportButtons(false);
                showCloseProgressButton(true);
                return;
            }

            exportSummary.total = Number.isFinite(effectiveTotal) ? effectiveTotal : 0;
            await savePendingExportTask({
                type: exportType,
                exportAll,
                maxItems: effectiveTotal,
                targetUrl
            });

            if (Number.isFinite(totalCount)) {
                const progressMessage = exportAll
                    ? `检测到共 ${totalCount} 条${exportSummary.typeLabel}，准备全部导出...`
                    : totalCount > effectiveTotal
                        ? `检测到共 ${totalCount} 条${exportSummary.typeLabel}，本次将导出前 ${effectiveTotal} 条`
                        : `检测到共 ${totalCount} 条${exportSummary.typeLabel}，准备导出...`;
                setProgressText(progressMessage);
            } else if (isUnlimited) {
                setProgressText(`未能读取总数，将持续导出全部${exportSummary.typeLabel}`);
            }

            const response = await sendTabMessageWithRetry(tab.id, {
                action: `startExport_${exportType}`,
                maxItems: effectiveTotal,
                exportAll,
                exportType
            });

            if (response && response.success === false) {
                throw new Error(response.error || "页面未能启动导出");
            }
        } catch (error) {
            console.error("启动导出失败:", error);
            await clearExportStorage();
            setProgressText(`导出失败：${error.message || "无法连接到页面，请刷新后重试"}`);
            setExportButtons(false);
            showCloseProgressButton(true);
        }
    }

    async function stopExport() {
        const tab = await queryActiveTab();
        if (!tab?.id) {
            setProgressText("停止失败：未找到导出页面");
            showCloseProgressButton(true);
            return;
        }

        if (elements.stopExport) {
            elements.stopExport.disabled = true;
        }

        setProgressText("正在停止导出...");
        showCloseProgressButton(false);

        try {
            const response = await sendTabMessage(tab.id, { action: "stopExport" });
            if (!response || response.success !== true) {
                throw new Error("页面未响应，请刷新后重试");
            }
            await clearExportStorage();
            setProgressText("导出已停止");
            setExportButtons(false);
            showCloseProgressButton(false);

            setTimeout(() => {
                resetProgressUi();
            }, 1500);
        } catch (error) {
            console.error("发送停止消息失败:", error);
            await clearExportStorage();
            setProgressText(`停止失败：${error.message}`);
            if (elements.stopExport) {
                elements.stopExport.disabled = false;
            }
            if (elements.startExport) {
                elements.startExport.disabled = false;
            }
            showCloseProgressButton(true);
        }
    }

    function handleExportCompleted(fileType) {
        const exportedCount = exportSummary.count || exportSummary.current || 0;
        const countText = formatExportCount(exportedCount, exportSummary.total || 0);
        const fileTypeLabel = fileType ? `（${fileType}）` : "";

        setProgressVisible(true);
        setProgressPercent(100);
        setProgressText(
            `导出完成：共导出 ${countText} 条${exportSummary.typeLabel || "内容"}${fileTypeLabel}`,
            100
        );
        setExportButtons(false);
        showCloseProgressButton(true);
        clearExportStorage();
    }

    async function getStoredExportSnapshot() {
        const result = await storageGet([
            EXPORT_STORAGE_KEYS.STATUS,
            EXPORT_STORAGE_KEYS.PROGRESS,
            EXPORT_STORAGE_KEYS.TASK
        ]);
        const storedStatus = result[EXPORT_STORAGE_KEYS.STATUS];
        const storedProgress = result[EXPORT_STORAGE_KEYS.PROGRESS];
        const storedTask = result[EXPORT_STORAGE_KEYS.TASK];

        if (storedStatus?.status) {
            return {
                status: storedStatus.status,
                type: storedStatus.type,
                progress: storedProgress || {
                    current: 0,
                    total: storedTask?.maxItems || 0
                }
            };
        }

        if (storedTask?.type) {
            return {
                status: EXPORT_STATUS.PREPARING,
                type: storedTask.type,
                progress: {
                    current: 0,
                    total: storedTask.maxItems || 0
                }
            };
        }

        return null;
    }

    function applyExportSnapshot(snapshot) {
        if (!snapshot?.status) {
            return false;
        }

        const snapshotType = snapshot.type || getSelectedExportType();
        exportSummary.type = snapshotType;
        exportSummary.typeLabel = EXPORT_TYPE_LABELS[snapshotType] || "内容";
        exportSummary.total = snapshot.progress?.total || 0;
        exportSummary.current = snapshot.progress?.current || 0;
        exportSummary.count = 0;
        exportSummary.fileType = "";
        setSelectedExportType(snapshotType);

        if (snapshot.status === EXPORT_STATUS.PREPARING) {
            setProgressVisible(true);
            setExportButtons(true);
            setProgressPercent(0);
            setProgressText(`正在切换页面并准备导出${exportSummary.typeLabel}...`);
            showCloseProgressButton(false);
            return true;
        }

        if (
            snapshot.status === EXPORT_STATUS.EXPORTING ||
            snapshot.status === EXPORT_STATUS.REFRESHING
        ) {
            setProgressVisible(true);
            setExportButtons(true);
            updateProgressBar(exportSummary.current, exportSummary.total);
            return true;
        }

        if (snapshot.status === EXPORT_STATUS.COMPLETED) {
            exportSummary.count = exportSummary.current || exportSummary.total || 0;
            handleExportCompleted("");
            return true;
        }

        return false;
    }

    async function restoreExportStatus() {
        const tab = await queryActiveTab();

        if (tab?.id && isZhihuProfilePage(tab.url)) {
            try {
                const response = await sendTabMessage(tab.id, { action: "getExportStatus" });
                if (
                    response?.status === EXPORT_STATUS.EXPORTING ||
                    response?.status === EXPORT_STATUS.REFRESHING ||
                    response?.status === EXPORT_STATUS.COMPLETED
                ) {
                    if (applyExportSnapshot(response)) {
                        return;
                    }
                }
            } catch (error) {
                console.error("获取页面导出状态失败，尝试从本地状态恢复:", error);
            }
        }

        try {
            const storedSnapshot = await getStoredExportSnapshot();
            if (applyExportSnapshot(storedSnapshot)) {
                return;
            }

            resetProgressUi();
        } catch (error) {
            console.error("恢复导出状态失败:", error);
        }
    }

    if (elements.closeProgress) {
        elements.closeProgress.addEventListener("click", () => {
            resetProgressUi();
            clearExportStorage();
        });
    }

    if (elements.refreshButton) {
        elements.refreshButton.addEventListener("click", () => {
            openTab(ZHIHU_URLS.HOME);
        });
    }

    if (elements.notificationEntry) {
        elements.notificationEntry.addEventListener("click", () => {
            openTab(ZHIHU_URLS.NOTIFICATIONS);
        });
    }

    bindPopupLink(elements.writeArticle, ZHIHU_URLS.WRITE);
    bindPopupLink(elements.creatorCenter, ZHIHU_URLS.CREATOR);
    bindPopupLink(elements.milestone, ZHIHU_URLS.MILESTONE, async () => {
        const tabs = await chrome.tabs.query({ url: "https://*.zhihu.com/*" });

        if (tabs.length > 0) {
            openTab(ZHIHU_URLS.MILESTONE);
            return;
        }

        chrome.windows.create({
            url: ZHIHU_URLS.MILESTONE,
            type: "normal",
            width: 800,
            height: 600,
            left: Math.round((screen.width - 800) / 2),
            top: Math.round((screen.height - 600) / 2),
            focused: true
        });
    });

    if (elements.startExport) {
        elements.startExport.addEventListener("click", () => {
            void startExport();
        });
    }

    document.querySelectorAll('input[name="export-type"]').forEach(input => {
        input.addEventListener("change", () => {
            void saveExportPreferences();
        });
    });

    if (elements.exportCountAll) {
        elements.exportCountAll.addEventListener("change", () => {
            updateExportCountInputState();
            void saveExportPreferences();
        });
    }

    if (elements.exportCountCustomMode) {
        elements.exportCountCustomMode.addEventListener("change", () => {
            updateExportCountInputState();
            void saveExportPreferences();
        });
    }

    if (elements.exportCount) {
        elements.exportCount.addEventListener("change", () => {
            void saveExportPreferences();
        });
        elements.exportCount.addEventListener("input", () => {
            void saveExportPreferences();
        });
    }

    if (elements.stopExport) {
        elements.stopExport.addEventListener("click", () => {
            void stopExport();
        });
    }

    chrome.runtime.onMessage.addListener(request => {
        if (request.action === "updateProgress") {
            updateProgressBar(request.current || 0, request.total || 0);
            return;
        }

        if (request.action === "exportError") {
            setProgressText(`导出失败: ${request.error}`);
            setExportButtons(false);
            showCloseProgressButton(true);
            return;
        }

        if (request.action === "exportFileCompleted") {
            exportSummary.count = request.count || exportSummary.current || 0;
            exportSummary.fileType =
                typeof request.fileType === "string" && request.fileType.length > 0
                    ? request.fileType.charAt(0).toUpperCase() + request.fileType.slice(1)
                    : "";
            handleExportCompleted(exportSummary.fileType);
            return;
        }

        if (request.action === "exportComplete" || request.action === "exportCompleted") {
            handleExportCompleted(exportSummary.fileType);
            return;
        }

        if (request.action === "exportStopped") {
            setProgressText("导出已停止");
            setExportButtons(false);
            showCloseProgressButton(false);
            clearExportStorage();

            setTimeout(() => {
                resetProgressUi();
            }, 1500);
        }
    });

    async function initializePopup() {
        updateMessageCount();
        await restoreExportPreferences();
        updateExportCountInputState();
        await restoreExportStatus();
    }

    void initializePopup();
});
