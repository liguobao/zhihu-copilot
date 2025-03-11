document.addEventListener('DOMContentLoaded', function() {
    // 加载设置
    var options = getOptions();
    
    document.getElementById('notify-default').checked = options[0] == 1;
    document.getElementById('notify-follow').checked = options[1] == 1;
    document.getElementById('notify-vote').checked = options[2] == 1;
    document.getElementById('show-desktop-notification').checked = options[3] == 1;
    
    var timeout = localStorage.getItem('notificationCloseTimeout') || 10;
    document.getElementById('notification-timeout').value = timeout;
    
    var pollInterval = localStorage.getItem('pollIntervalMin') || 1;
    document.getElementById('poll-interval').value = pollInterval;
    
    var exportFormat = localStorage.getItem('exportFormat') || 'json';
    document.getElementById('export-format').value = exportFormat;
    
    // 保存设置
    document.getElementById('save-settings').addEventListener('click', function() {
        var notifyDefault = document.getElementById('notify-default').checked ? 1 : 0;
        var notifyFollow = document.getElementById('notify-follow').checked ? 1 : 0;
        var notifyVote = document.getElementById('notify-vote').checked ? 1 : 0;
        var showDesktopNotification = document.getElementById('show-desktop-notification').checked ? 1 : 0;
        
        localStorage.setItem('options', [notifyDefault, notifyFollow, notifyVote, showDesktopNotification].join(','));
        
        var timeout = document.getElementById('notification-timeout').value;
        localStorage.setItem('notificationCloseTimeout', timeout);
        
        var pollInterval = document.getElementById('poll-interval').value;
        localStorage.setItem('pollIntervalMin', pollInterval);
        
        var exportFormat = document.getElementById('export-format').value;
        localStorage.setItem('exportFormat', exportFormat);
        
        // 显示保存成功
        var status = document.getElementById('status');
        status.style.display = 'block';
        setTimeout(function() {
            status.style.display = 'none';
        }, 2000);
        
        // 重新加载后台页面以应用新设置
        chrome.extension.getBackgroundPage().location.reload();
    });
    
    function getOptions() {
        if (!localStorage.hasOwnProperty('options')) {
            localStorage["options"] = '1,1,1,1';
            return [1, 1, 1, 1];
        } else {
            return localStorage.options.split(',');
        }
    }
}); 