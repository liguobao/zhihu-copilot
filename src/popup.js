document.addEventListener('DOMContentLoaded', function() {
    chrome.storage.local.get(['unreadCount', 'msg1', 'msg2', 'msg3'], function(result) {
        const unreadCount = result.unreadCount || '0';
        const msg1 = result.msg1 || '0';
        const msg2 = result.msg2 || '0';
        const msg3 = result.msg3 || '0';
        
        // 更新界面显示
        document.getElementById('unread-count').textContent = unreadCount;
        
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
            
            // 使用消息传递方式与background.js通信
            chrome.runtime.sendMessage({action: "refreshMessages"}, function(response) {
                // 添加超时处理，确保按钮状态恢复
                setTimeout(function() {
                    location.reload();
                }, 2000);
            });
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
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['js/export-manager.js']
                });
            });
        });
    });
}); 