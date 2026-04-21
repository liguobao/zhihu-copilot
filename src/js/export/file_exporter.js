(() => {
  const runtime = globalThis.ZhihuExportRuntime;
  const { TYPE_CONFIGS, createTimestamp, sanitizeFileName } = runtime;

  runtime.fileExporter = {
    async exportMarkdown(type, items) {
      // 每条内容导出为单独 markdown，再整体打 zip，方便后续检索和增量处理。
      const config = TYPE_CONFIGS[type];
      const zip = new JSZip();
      const timestamp = createTimestamp();

      for (const item of items) {
        const { title, id, content, url } = config.readRecord(item);
        const fileName = `${id}_${sanitizeFileName(title)}.md`;
        let fileContent = `# ${title}\n\n`;
        fileContent += `> ${config.itemLabel}ID: ${id}\n\n`;
        fileContent += `> 链接: ${url}\n\n`;
        fileContent += `${content}\n\n`;
        zip.file(fileName, fileContent);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      this.downloadBlob(zipBlob, `zhihu_${type}_${timestamp}.zip`);

      chrome.runtime.sendMessage({
        action: "exportFileCompleted",
        fileType: "markdown",
        count: items.length
      });
    },

    exportJSON(type, items) {
      const timestamp = createTimestamp();
      const blob = new Blob([JSON.stringify(items)], {
        type: "application/json"
      });

      this.downloadBlob(blob, `zhihu_${type}_${timestamp}.json`);

      chrome.runtime.sendMessage({
        action: "exportFileCompleted",
        fileType: "json",
        count: items.length
      });
    },

    downloadBlob(blob, fileName) {
      // 内容脚本里只能通过临时 a 标签触发下载。
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 0);
    }
  };
})();
