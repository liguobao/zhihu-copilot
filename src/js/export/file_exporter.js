(() => {
  const runtime = globalThis.ZhihuExportRuntime;
  const {
    TYPE_CONFIGS,
    createImagePlaceholder,
    createTimestamp,
    extractProfileUserIdFromUrl,
    normalizeMarkdownContent,
    sanitizeFileName
  } = runtime;

  runtime.fileExporter = {
    sendRuntimeMessage(message) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          resolve(response);
        });
      });
    },

    async fetchImageAsset(url) {
      if (!url) {
        return null;
      }

      try {
        const response = await this.sendRuntimeMessage({
          action: "fetchImageAsset",
          url
        });

        if (response?.success && response.base64Data) {
          return response;
        }
      } catch (error) {
        console.warn("通过后台抓取图片失败，尝试页面直接抓取:", error, url);
      }

      try {
        const directResponse = await fetch(url, {
          credentials: "omit"
        });

        if (!directResponse.ok) {
          throw new Error(`HTTP ${directResponse.status}`);
        }

        const blob = await directResponse.blob();
        const base64Data = await this.blobToBase64(blob);

        return {
          success: true,
          base64Data,
          contentType: blob.type,
          finalUrl: directResponse.url || url
        };
      } catch (error) {
        console.warn("页面直接抓取图片失败，已跳过:", error, url);
        return null;
      }
    },

    blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || "");
          resolve(result.includes(",") ? result.split(",")[1] : result);
        };
        reader.onerror = () => {
          reject(reader.error || new Error("读取图片 Blob 失败"));
        };
        reader.readAsDataURL(blob);
      });
    },

    resolveImageExtension(contentType, imageUrl) {
      const mimeType = String(contentType || "").split(";")[0].trim().toLowerCase();
      const mimeMap = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/svg+xml": "svg",
        "image/avif": "avif"
      };

      if (mimeMap[mimeType]) {
        return mimeMap[mimeType];
      }

      try {
        const pathname = new URL(imageUrl, window.location.href).pathname;
        const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
        if (match?.[1]) {
          return match[1].toLowerCase();
        }
      } catch (error) {
        console.warn("从图片地址推断扩展名失败:", error, imageUrl);
      }

      return "jpg";
    },

    formatMarkdownImage(image, fallbackAlt) {
      const altText = String(image?.alt || fallbackAlt || "图片")
        .replace(/[\r\n]+/g, " ")
        .replace(/\]/g, "\\]");
      const imagePath = String(image?.relativePath || image?.url || "");

      if (!imagePath) {
        return "";
      }

      return `![${altText}](${imagePath})`;
    },

    replaceImagePlaceholders(content, exportedImages) {
      let output = content || "";

      for (const [index, image] of exportedImages.entries()) {
        const markdownImage = this.formatMarkdownImage(image, `图片${index + 1}`);
        output = output.split(createImagePlaceholder(index)).join(markdownImage);
      }

      return normalizeMarkdownContent(output);
    },

    async appendImagesToZip(zip, id, images) {
      const exportedImages = [];

      if (!Array.isArray(images) || images.length === 0) {
        return exportedImages;
      }

      const imageFolder = zip.folder("images");

      for (const [index, image] of images.entries()) {
        const imageAsset = await this.fetchImageAsset(image?.url);
        if (!imageAsset?.base64Data) {
          exportedImages.push({
            alt: image?.alt || `图片${index + 1}`,
            url: image?.url || ""
          });
          continue;
        }

        const extension = this.resolveImageExtension(
          imageAsset.contentType,
          imageAsset.finalUrl || image?.url
        );
        const imageFileName = `${id}_${index + 1}.${extension}`;
        imageFolder.file(imageFileName, imageAsset.base64Data, {
          base64: true
        });

        exportedImages.push({
          alt: image?.alt || `图片${index + 1}`,
          relativePath: `images/${imageFileName}`
        });
      }

      return exportedImages;
    },

    buildExportFileName(type, extension) {
      const timestamp = createTimestamp();
      const userId = sanitizeFileName(extractProfileUserIdFromUrl() || "unknown_user");

      return `${userId}_${type}_${timestamp}.${extension}`;
    },

    async exportMarkdown(type, items) {
      // 每条内容导出为单独 markdown，再整体打 zip，方便后续检索和增量处理。
      const config = TYPE_CONFIGS[type];
      const zip = new JSZip();

      for (const item of items) {
        const { title, id, content, url, images } = config.readRecord(item);
        const fileName = `${id}_${sanitizeFileName(title)}.md`;
        const exportedImages = await this.appendImagesToZip(zip, id, images);
        const inlineImageIndexes = new Set();
        exportedImages.forEach((image, index) => {
          if (String(content || "").includes(createImagePlaceholder(index))) {
            inlineImageIndexes.add(index);
          }
        });
        const bodyContent = this.replaceImagePlaceholders(content, exportedImages);
        const lines = [
          `# ${title}`,
          "",
          `> ${config.itemLabel}ID: ${id}`,
          "",
          `> 链接: ${url}`,
          "",
          bodyContent,
          ""
        ];

        const appendixImages = exportedImages.filter((image, index) => !inlineImageIndexes.has(index));
        if (appendixImages.length > 0) {
          lines.push("## 图片", "");

          for (const [index, image] of appendixImages.entries()) {
            lines.push(this.formatMarkdownImage(image, `图片${index + 1}`), "");
          }
        }

        zip.file(fileName, lines.join("\n"));
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      this.downloadBlob(zipBlob, this.buildExportFileName(type, "zip"));

      chrome.runtime.sendMessage({
        action: "exportFileCompleted",
        fileType: "markdown",
        count: items.length
      });
    },

    exportJSON(type, items) {
      const blob = new Blob([JSON.stringify(items)], {
        type: "application/json"
      });

      this.downloadBlob(blob, this.buildExportFileName(type, "json"));

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
