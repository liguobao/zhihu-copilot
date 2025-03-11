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
    title.textContent = '导出想法';
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
        status.textContent = '正在导出想法...';
        exportBtn.disabled = true;
        
        // 滚动到底部加载所有想法
        scrollToBottom(function() {
            var ideas = document.querySelectorAll('.PinItem');
            var data = [];
            
            ideas.forEach(function(idea) {
                try {
                    var content = idea.querySelector('.RichContent').textContent.trim();
                    var link = idea.querySelector('.ContentItem-time a') ? 
                              idea.querySelector('.ContentItem-time a').href : '';
                    var time = idea.querySelector('.ContentItem-time') ? 
                               idea.querySelector('.ContentItem-time').textContent.trim() : '';
                    
                    // 检查是否有图片
                    var images = [];
                    var imageElements = idea.querySelectorAll('.PinItem-content img');
                    imageElements.forEach(function(img) {
                        images.push(img.src);
                    });
                    
                    data.push({
                        title: '想法',
                        content: content,
                        link: link,
                        time: time,
                        images: images,
                        type: '想法'
                    });
                } catch (e) {
                    console.error('解析想法时出错:', e);
                }
            });
            
            downloadData(data, '知乎想法导出');
            status.textContent = `成功导出 ${data.length} 条想法！`;
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
                    var imageText = item.images && item.images.length > 0 ? 
                                   '图片：' + item.images.join('\n') + '\n' : '';
                    return `时间：${item.time}\n内容：${item.content}\n${imageText}链接：${item.link}\n\n`;
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
                        .time { color: #999; margin: 5px 0; }
                        .content { margin: 10px 0; line-height: 1.6; }
                        .images { display: flex; flex-wrap: wrap; margin: 10px 0; }
                        .images img { max-width: 200px; margin: 5px; border: 1px solid #eee; }
                        .link { color: #0084ff; }
                    </style>
                </head>
                <body>
                    <h1>${filename}</h1>
                    ${data.map(function(item) {
                        var imagesHtml = item.images && item.images.length > 0 ? 
                                        `<div class="images">
                                            ${item.images.map(function(img) {
                                                return `<img src="${img}" alt="想法图片">`;
                                            }).join('')}
                                        </div>` : '';
                        return `<div class="item">
                            <div class="time">${item.time}</div>
                            <div class="content">${item.content}</div>
                            ${imagesHtml}
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