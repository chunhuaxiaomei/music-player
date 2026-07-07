const axios = require('axios');

// 测试直接获取播放链接（从网页中提取）
axios.get('https://www.gequbao.com/music/39466', {
    headers: {
        'User-Agent': 'Mozilla/5.0'
    }
}).then(response => {
    const html = response.data;
    
    // 提取 window.appData
    const appDataMatch = html.match(/window\.appData\s*=\s*JSON\.parse\('([^']+)'\)/);
    
    if (appDataMatch) {
        let jsonStr = '"' + appDataMatch[1] + '"';
        const decodedStr = JSON.parse(jsonStr);
        const appData = JSON.parse(decodedStr);
        
        console.log('歌曲:', appData.mp3_title, '-', appData.mp3_author);
        console.log('mp3_extra_urls:', appData.mp3_extra_urls);
        
        // 检查是否有网盘链接
        if (appData.mp3_extra_urls && appData.mp3_extra_urls.length > 0) {
            console.log('\n网盘链接:');
            appData.mp3_extra_urls.forEach(url => {
                // share_link 是base64编码的
                const decodedUrl = Buffer.from(url.share_link, 'base64').toString('utf-8');
                console.log(url.type + ':', decodedUrl);
            });
        }
    }
}).catch(err => {
    console.error('错误:', err.message);
});