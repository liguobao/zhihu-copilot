document.addEventListener('DOMContentLoaded', function() {
    // 获取未读消息数
    var unreadCount = localStorage.getItem('unreadCount') || '0';
    document.getElementById('unread-count').textContent = unreadCount;
    
    // 获取各类消息数量
    var msg1 = localStorage.getItem('msg1') || '0'; // 默认消息
    var msg2 = localStorage.getItem('msg2') || '0'; // 关注消息
    var msg3 = localStorage.getItem('msg3') || '0'; // 赞同感谢消息
    
    // 如果没有未读消息，更新提示文本
    if (unreadCount === '0') {
        document.getElementById('notification-text').textContent = '您没有未读消息';
    } else {
        // 构建详细的消息提示
        var detailText = '';
        if (msg1 !== '0') {
            detailText += msg1 + '条默认消息 ';
        }
        if (msg2 !== '0') {
            detailText += msg2 + '条关注消息 ';
        }
        if (msg3 !== '0') {
            detailText += msg3 + '条赞同感谢消息';
        }
        
        // 添加详细消息提示
        var detailElement = document.createElement('div');
        detailElement.className = 'notification-detail';
        detailElement.textContent = detailText;
        detailElement.style.fontSize = '11px';
        detailElement.style.marginTop = '5px';
        detailElement.style.color = '#666';
        document.getElementById('notification-text').appendChild(detailElement);
    }
    
    // 刷新消息数量
    document.getElementById('refresh-messages').addEventListener('click', function() {
        // 显示加载中状态
        this.textContent = '刷新中...';
        this.disabled = true;
        
        // 调用background.js中的startRequest函数刷新消息
        chrome.extension.getBackgroundPage().startRequest({
            scheduleRequest: false,
            showLoadingAnimation: true
        });
        
        // 2秒后更新界面
        setTimeout(function() {
            location.reload();
        }, 2000);
    });
    
    // 前往消息中心
    document.getElementById('go-to-inbox').addEventListener('click', function() {
        chrome.tabs.create({url: 'https://www.zhihu.com/notifications'});
    });
    
    // 开始写专栏
    document.getElementById('write-article').addEventListener('click', function() {
        chrome.tabs.create({url: 'https://zhuanlan.zhihu.com/write'});
    });
    
    // 创作中心
    document.getElementById('creator-center').addEventListener('click', function() {
        chrome.tabs.create({url: 'https://www.zhihu.com/creator'});
    });
    
    // 导出功能
    document.getElementById('start-export').addEventListener('click', function() {
        var exportAnswers = document.getElementById('export-answers-check').checked;
        var exportArticles = document.getElementById('export-articles-check').checked;
        var exportIdeas = document.getElementById('export-ideas-check').checked;
        
        if (!exportAnswers && !exportArticles && !exportIdeas) {
            alert('请至少选择一项要导出的内容');
            return;
        }
        
        // 保存导出选项到localStorage
        localStorage.setItem('exportAnswers', exportAnswers);
        localStorage.setItem('exportArticles', exportArticles);
        localStorage.setItem('exportIdeas', exportIdeas);
        
        // 创建导出页面
        chrome.tabs.create({url: 'https://www.zhihu.com'}, function(tab) {
            chrome.tabs.executeScript(tab.id, {file: 'js/export-manager.js'});
        });
    });
}); 