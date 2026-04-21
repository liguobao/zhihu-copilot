(() => {
  const runtime = globalThis.ZhihuExportRuntime;
  const { STORAGE_KEYS, parseItemData, extractPinIdFromItem, extractPinTitle } = runtime;

  // 每种导出类型只在这里声明“如何识别、如何读数据、如何落库”。
  // 真正的抓取流程不关心回答/文章/想法的差异，只消费这份配置。
  runtime.TYPE_CONFIGS = {
    answers: {
      listKey: STORAGE_KEYS.ANSWER.LIST,
      idsKey: STORAGE_KEYS.ANSWER.IDS,
      selector: ".AnswerItem",
      itemLabel: "回答",
      profilePath: "/answers",
      tabLabel: "回答",
      contentSelectors: [".RichContent-inner"],
      needsExpand: true,
      buildUrl: (id) => `https://www.zhihu.com/answer/${id}`,
      getItemMeta: (item) => {
        const parsed = parseItemData(item);
        return {
          id: parsed?.itemId ? String(parsed.itemId) : null,
          title: parsed?.title || "未知标题"
        };
      },
      createRecord: ({ title, id, content, url }) => ({
        question_title: title,
        answer_id: id,
        answer_content: content,
        answer_url: url
      }),
      readRecord: (record) => ({
        title: record.question_title,
        id: record.answer_id,
        content: record.answer_content,
        url: record.answer_url
      })
    },
    articles: {
      listKey: STORAGE_KEYS.ARTICLE.LIST,
      idsKey: STORAGE_KEYS.ARTICLE.IDS,
      selector: ".ArticleItem",
      itemLabel: "专栏文章",
      profilePath: "/posts",
      tabLabel: "文章",
      contentSelectors: [".RichContent-inner"],
      needsExpand: true,
      buildUrl: (id) => `https://zhuanlan.zhihu.com/p/${id}`,
      getItemMeta: (item) => {
        const parsed = parseItemData(item);
        return {
          id: parsed?.itemId ? String(parsed.itemId) : null,
          title: parsed?.title || "未知标题"
        };
      },
      createRecord: ({ title, id, content, url }) => ({
        title,
        data_id: id,
        data_content: content,
        data_url: url
      }),
      readRecord: (record) => ({
        title: record.title,
        id: record.data_id,
        content: record.data_content,
        url: record.data_url
      })
    },
    pins: {
      listKey: STORAGE_KEYS.PIN.LIST,
      idsKey: STORAGE_KEYS.PIN.IDS,
      selector: ".PinItem",
      itemLabel: "想法",
      profilePath: "/pins",
      tabLabel: "想法",
      // 想法页存在两种正文容器，按顺序尝试即可兼容新旧结构。
      contentSelectors: [".RichContent-inner", ".RichContent"],
      needsExpand: false,
      buildUrl: (id) => `https://www.zhihu.com/pin/${id}`,
      getItemMeta: (item) => ({
        id: extractPinIdFromItem(item),
        title: extractPinTitle(item)
      }),
      createRecord: ({ title, id, content, url }) => ({
        title,
        pin_id: id,
        pin_content: content,
        pin_url: url
      }),
      readRecord: (record) => ({
        title: record.title,
        id: record.pin_id,
        content: record.pin_content,
        url: record.pin_url
      })
    }
  };
})();
