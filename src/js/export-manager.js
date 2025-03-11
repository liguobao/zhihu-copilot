(function() {
    // 获取导出选项
    var exportAnswers = localStorage.getItem('exportAnswers') === 'true';
    var exportArticles = localStorage.getItem('exportArticles') === 'true';
    var exportIdeas = localStorage.getItem('exportIdeas') === 'true';
    
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
    title.textContent = '知乎内容导出';
    title.style.margin = '0 0 15px 0';
    title.style.fontSize = '16px';
    title.style.color = '#0084ff';
    panel.appendChild(title);
    
    var status = document.createElement('div');
    status.textContent = '准备导出...';
    status.style.marginBottom = '15px';
    status.style.fontSize = '14px';
    panel.appendChild(status);
    
    var progress = document.createElement('div');
    progress.style.width = '100%';
    progress.style.height = '10px';
    progress.style.backgroundColor = '#f0f0f0';
    progress.style.borderRadius = '5px';
    progress.style.overflow = 'hidden';
    progress.style.marginBottom = '15px';
    panel.appendChild(progress);
    
    var progressBar = document.createElement('div');
    progressBar.style.width = '0%';
    progressBar.style.height = '100%';
    progressBar.style.backgroundColor = '#0084ff';
    progressBar.style.transition = 'width 0.3s';
    progress.appendChild(progressBar);
    
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '关闭';
    closeBtn.style.padding = '5px 10px';
    closeBtn.style.backgroundColor = '#f0f0f0';
    closeBtn.style.border = 'none';
    closeBtn.style.borderRadius = '3px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.float = 'right';
    closeBtn.onclick = function() {
        document.body.removeChild(panel);
    };
    panel.appendChild(closeBtn);
    
    document.body.appendChild(panel);
    
    // 开始导出流程
    startExport();
    
    function startExport() {
        var tasks = [];
        
        if (exportAnswers) {
            tasks.push({
                name: '回答',
                url: 'https://www.zhihu.com/people/self/answers',
                handler: exportAnswersHandler
            });
        }
        
        if (exportArticles) {
            tasks.push({
                name: '专栏文章',
                url: 'https://www.zhihu.com/people/self/posts',
                handler: exportArticlesHandler
            });
        }
        
        if (exportIdeas) {
            tasks.push({
                name: '想法',
                url: 'https://www.zhihu.com/people/self/pins',
                handler: exportIdeasHandler
            });
        }
        
        executeTasksSequentially(tasks, 0);
    }
    
    function executeTasksSequentially(tasks, index) {
        if (index >= tasks.length) {
            status.textContent = '所有内容导出完成！';
            progressBar.style.width = '100%';
            return;
        }
        
        var task = tasks[index];
        status.textContent = `正在导出${task.name}...`;
        progressBar.style.width = `${(index / tasks.length) * 100}%`;
        
        // 导航到相应页面
        window.location.href = task.url;
        
        // 等待页面加载完成
        setTimeout(function() {
            task.handler(function() {
                // 任务完成后执行下一个任务
                executeTasksSequentially(tasks, index + 1);
            });
        }, 2000);
    }
    
    function exportAnswersHandler(callback) {
        // 这里实现回答导出逻辑
        var answers = document.querySelectorAll('.List-item');
        var data = [];
        
        answers.forEach(function(answer) {
            var title = answer.querySelector('.ContentItem-title a').textContent.trim();
            var content = answer.querySelector('.RichContent-inner').textContent.trim();
            var link = answer.querySelector('.ContentItem-title a').href;
            
            data.push({
                title: title,
                content: content,
                link: link,
                type: '回答'
            });
        });
        
        downloadData(data, '知乎回答导出');
        callback();
    }
    
    function exportArticlesHandler(callback) {
        // 这里实现文章导出逻辑
        var articles = document.querySelectorAll('.List-item');
        var data = [];
        
        articles.forEach(function(article) {
            var title = article.querySelector('.ContentItem-title a').textContent.trim();
            var content = article.querySelector('.RichContent-inner').textContent.trim();
            var link = article.querySelector('.ContentItem-title a').href;
            
            data.push({
                title: title,
                content: content,
                link: link,
                type: '文章'
            });
        });
        
        downloadData(data, '知乎文章导出');
        callback();
    }
    
    function exportIdeasHandler(callback) {
        // 这里实现想法导出逻辑
        var ideas = document.querySelectorAll('.PinItem');
        var data = [];
        
        ideas.forEach(function(idea) {
            var content = idea.querySelector('.RichContent').textContent.trim();
            var link = idea.querySelector('.ContentItem-time a').href;
            
            data.push({
                title: '想法',
                content: content,
                link: link,
                type: '想法'
            });
        });
        
        downloadData(data, '知乎想法导出');
        callback();
    }
    
    function downloadData(data, filename) {
        var json = JSON.stringify(data, null, 2);
        var blob = new Blob([json], {type: 'application/json'});
        var url = URL.createObjectURL(blob);
        
        var a = document.createElement('a');
        a.href = url;
        a.download = filename + '.json';
        a.click();
        
        URL.revokeObjectURL(url);
    }
})(); 