(() => {
  const runtime = globalThis.ZhihuExportRuntime;
  const {
    TYPE_CONFIGS,
    EXPORT_LOOP_SETTINGS,
    getDocumentScrollHeight,
    normalizeZhihuPath,
    parseZhihuCountText,
    sleepWhileActive
  } = runtime;

  class ZhihuPageCollector {
    constructor(type, session) {
      this.type = type;
      this.session =
        session ||
        {
          isActive: () => true,
          currentCount: 0
        };
      this.config = TYPE_CONFIGS[type];
    }

    getVisibleItems() {
      return Array.from(document.querySelectorAll(this.config.selector));
    }

    getVisibleCount() {
      return this.getVisibleItems().length;
    }

    readCountFromNode(node) {
      if (!node) {
        return null;
      }

      return parseZhihuCountText(node.innerText, this.config.tabLabel);
    }

    getTotalCountFromProfileTabs() {
      const routeSuffix = this.config.profilePath;
      if (!routeSuffix) {
        return null;
      }

      // 个人主页 tab 上展示的是服务端统计总数，比无限滚动过程中
      // 当前已挂载到 DOM 的可见条目更适合作为 popup 进度条总量。
      const linkCandidates = Array.from(
        document.querySelectorAll(`a[href*="${routeSuffix}"]`)
      );

      for (const link of linkCandidates) {
        const normalizedHref = normalizeZhihuPath(link.getAttribute("href"))
          .split(/[?#]/)[0]
          .replace(/\/$/, "");

        if (!normalizedHref.endsWith(routeSuffix)) {
          continue;
        }

        const count = this.readCountFromNode(link)
          ?? this.readCountFromNode(link.parentElement)
          ?? this.readCountFromNode(link.closest("li"))
          ?? this.readCountFromNode(link.closest('[role="tab"]'));

        if (Number.isFinite(count)) {
          return count;
        }
      }

      return null;
    }

    getTotalCount() {
      const countFromTabs = this.getTotalCountFromProfileTabs();
      if (Number.isFinite(countFromTabs)) {
        return countFromTabs;
      }

      return null;
    }

    getContentElement(item) {
      for (const selector of this.config.contentSelectors) {
        const contentElement = item.querySelector(selector);
        if (contentElement) {
          return contentElement;
        }
      }

      return null;
    }

    getPageMetrics() {
      return {
        visibleCount: this.getVisibleCount(),
        scrollY: window.scrollY,
        viewportHeight: window.innerHeight,
        scrollHeight: getDocumentScrollHeight()
      };
    }

    async waitForVisibleItems(timeoutMs = EXPORT_LOOP_SETTINGS.INITIAL_LOAD_TIMEOUT_MS) {
      // 无限滚动页首屏经常是异步挂载，先等到出现可见条目再进入正式导出循环。
      const startedAt = Date.now();

      while (Date.now() - startedAt < timeoutMs && this.session.isActive()) {
        const visibleCount = this.getVisibleCount();
        if (visibleCount > 0) {
          return visibleCount;
        }

        await sleepWhileActive(
          this.session,
          EXPORT_LOOP_SETTINGS.INITIAL_LOAD_POLL_MS,
          EXPORT_LOOP_SETTINGS.LOAD_WAIT_STEP_MS
        );
      }

      return this.getVisibleCount();
    }

    extractVisibleItem(item) {
      const contentElement = this.getContentElement(item);
      if (!contentElement) {
        return null;
      }

      const meta = this.config.getItemMeta(item);
      if (!meta?.id) {
        return null;
      }

      return {
        id: String(meta.id),
        title: meta.title || "未知标题",
        contentElement
      };
    }

    async expandItem(item, title) {
      // 优先点“阅读全文”，因为这是知乎当前最稳定的展开入口。
      const moreButton = item.querySelector(".ContentItem-more");
      if (moreButton) {
        moreButton.click();
        console.log(`点击阅读全文按钮展开内容: ${title}`);
        await sleepWhileActive(
          this.session,
          EXPORT_LOOP_SETTINGS.EXPAND_WAIT_MS,
          EXPORT_LOOP_SETTINGS.LOAD_WAIT_STEP_MS
        );
        return;
      }

      if (!this.config.needsExpand) {
        return;
      }

      const contentElement = this.getContentElement(item);
      if (!contentElement) {
        return;
      }

      contentElement.click();
      console.log(`${title} 自动点击展开`);
      await sleepWhileActive(
        this.session,
        EXPORT_LOOP_SETTINGS.CLICK_EXPAND_WAIT_MS,
        EXPORT_LOOP_SETTINGS.LOAD_WAIT_STEP_MS
      );
    }

    async scrollForMore() {
      if (!this.session.isActive()) {
        return null;
      }

      // 用滚动前后的页面指标作为“是否还在继续加载”的信号，
      // 不再依赖传统分页或固定 DOM 条数。
      const beforeMetrics = this.getPageMetrics();
      window.scrollTo(0, beforeMetrics.scrollHeight);
      console.log(
        `滚动到底部，当前已保存:${this.session.currentCount}，可见条目:${beforeMetrics.visibleCount}`
      );

      await sleepWhileActive(
        this.session,
        EXPORT_LOOP_SETTINGS.LOAD_WAIT_MS,
        EXPORT_LOOP_SETTINGS.LOAD_WAIT_STEP_MS
      );

      const afterMetrics = this.getPageMetrics();

      return {
        beforeMetrics,
        afterMetrics,
        hasVisibleGrowth: afterMetrics.visibleCount > beforeMetrics.visibleCount,
        hasPageGrowth: afterMetrics.scrollHeight > beforeMetrics.scrollHeight,
        hasScrollShift: afterMetrics.scrollY > beforeMetrics.scrollY
      };
    }
  }

  runtime.ZhihuPageCollector = ZhihuPageCollector;
})();
