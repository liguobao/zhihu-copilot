(function() {
    // 创建导出控制面板
    var panel = document.createElement('div');
    panel.style.position = 'fixed';
    panel.style.top = '20px';
    panel.style.right = '20px';
    panel.style.width = '300px';
    panel.style.padding = '15px';
    panel.style.backgroundColor = 'white';
    panel.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
    panel.style.borderRadius = '5px';
    panel.style.zIndex = '9999';
    panel.style.fontFamily = 'Microsoft YaHei, sans-serif';
    
    var title = document.createElement('h2');
    title.textContent = '导出专栏文章';
    title.style.margin = '0 0 15px 0';
    title.style.fontSize = '16px';
    title.style.color = '#0084ff';
    panel.appendChild(title);
    
    var status = document.createElement('div');
    status.textContent = '准备导出...';
    status.style.marginBottom = '15px';
    status.style.fontSize = '14px';
    panel.appendChild(status);
    
    var exportBtn = document.createElement('button');
    exportBtn.textContent = '开始导出';
    exportBtn.style.padding = '8px 15px';
    exportBtn.style.backgroundColor = '#0084ff';
    exportBtn.style.color = 'white';
    exportBtn.style.border = 'none';
    exportBtn.style.borderRadius = '3px';
    exportBtn.style.cursor = 'pointer';
    exportBtn.style.marginRight = '10px';
    panel.appendChild(exportBtn);
    
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '关闭';
    closeBtn.style.padding = '8px 15px';
    closeBtn.style.backgroundColor = '#f0f0f0';
    closeBtn.style.border = 'none';
    closeBtn.style.borderRadius = '3px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.onclick = function() {
        document.body.removeChild(panel);
    };
    panel.appendChild(closeBtn);
    
    document.body.appendChild(panel);
    
    // 导出功能
    exportBtn.onclick = function() {
        status.textContent = '正在导出专栏文章...';
        exportBtn.disabled = true;
        
        // 滚动到底部加载所有文章
        scrollToBottom(function() {
            var articles = document.querySelectorAll('.List-item');
            var data = [];
            
            articles.forEach(function(article) {
                try {
                    var title = article.querySelector('.ContentItem-title a').textContent.trim();
                    var content = article.querySelector('.RichContent-inner').textContent.trim();
                    var link = article.querySelector('.ContentItem-title a').href;
                    var time = article.querySelector('.ContentItem-time') ? 
                               article.querySelector('.ContentItem-time').textContent.trim() : '';
                    
                    data.push({
                        title: title,
                        content: content,
                        link: link,
                        time: time,
                        type: '专栏文章'
                    });
                } catch (e) {
                    console.error('解析文章时出错:', e);
                }
            });
            
            downloadData(data, '知乎专栏文章导出');
            status.textContent = `成功导出 ${data.length} 篇专栏文章！`;
            exportBtn.disabled = false;
        });
    };
    
    function scrollToBottom(callback) {
        var lastHeight = document.body.scrollHeight;
        var scrollInterval = setInterval(function() {
            window.scrollTo(0, document.body.scrollHeight);
            
            // 检查是否已经到底部（页面高度不再变化）
            setTimeout(function() {
                var newHeight = document.body.scrollHeight;
                if (newHeight === lastHeight) {
                    clearInterval(scrollInterval);
                    window.scrollTo(0, 0); // 回到顶部
                    callback();
                } else {
                    lastHeight = newHeight;
                }
            }, 1000);
        }, 1500);
    }
    
    function downloadData(data, filename) {
        var format = localStorage.getItem('exportFormat') || 'json';
        var content, type, extension;
        
        switch (format) {
            case 'json':
                content = JSON.stringify(data, null, 2);
                type = 'application/json';
                extension = 'json';
                break;
            case 'txt':
                content = data.map(function(item) {
                    return `标题：${item.title}\n时间：${item.time}\n内容：${item.content}\n链接：${item.link}\n\n`;
                }).join('---\n\n');
                type = 'text/plain';
                extension = 'txt';
                break;
            case 'html':
                content = `<!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>${filename}</title>
                    <style>
                        body { font-family: 'Microsoft YaHei', sans-serif; margin: 20px; }
                        .item { margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 20px; }
                        .title { font-size: 18px; font-weight: bold; color: #0084ff; }
                        .time { color: #999; margin: 5px 0; }
                        .content { margin: 10px 0; line-height: 1.6; }
                        .link { color: #0084ff; }
                    </style>
                </head>
                <body>
                    <h1>${filename}</h1>
                    ${data.map(function(item) {
                        return `<div class="item">
                            <div class="title">${item.title}</div>
                            <div class="time">${item.time}</div>
                            <div class="content">${item.content}</div>
                            <a class="link" href="${item.link}" target="_blank">查看原文</a>
                        </div>`;
                    }).join('')}
                </body>
                </html>`;
                type = 'text/html';
                extension = 'html';
                break;
        }
        
        var blob = new Blob([content], {type: type});
        var url = URL.createObjectURL(blob);
        
        var a = document.createElement('a');
        a.href = url;
        a.download = filename + '.' + extension;
        a.click();
        
        URL.revokeObjectURL(url);
    }
})(); 