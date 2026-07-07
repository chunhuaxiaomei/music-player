const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

// 目标网站基础URL
const BASE_URL = 'https://www.qeecc.com';

// Cookie配置（从浏览器获取）
const COOKIES = 'PHPSESSID=6a3jpntai3rtdnfe3jd981k7ie; Hm_tf_6rdiytabw7z=1782614973; Hm_lvt_6rdiytabw7z=1782614973; Hm_lpvt_6rdiytabw7z=1782615185';

// 请求头
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': BASE_URL,
    'Cookie': COOKIES
};

// 存储所有歌曲
const allSongs = [];

// 延时函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 发送请求
async function fetchPage(url) {
    try {
        const response = await axios.get(url, {
            headers: HEADERS,
            timeout: 15000
        });
        return response.data;
    } catch (error) {
        console.error(`请求失败: ${url}`, error.message);
        return null;
    }
}

// 从页面HTML中提取歌曲详情
function parseSongDetailFromHtml(html, songUrl) {
    const $ = cheerio.load(html);
    
    // 跳过验证页面
    if ($('title').text().includes('安全验证')) {
        return null;
    }
    
    // 获取歌曲ID
    const idMatch = songUrl.match(/\/song\/([^.]+)\.html/);
    const id = idMatch ? idMatch[1] : '';
    
    // 获取歌曲标题
    let name = '';
    const heading = $('h1').first().text().trim() || 
                   $('[class*="title"]').first().text().trim() ||
                   $('title').first().text().split('[')[0].trim();
    if (heading) {
        // 去掉《》和演唱者信息
        name = heading.replace(/《.*?》/g, '').replace(/\u0000/g, '').trim();
    }
    
    // 获取歌手名
    let artist = '';
    $('a[href^="/singer/"]').each((i, el) => {
        const text = $(el).text().trim();
        if (text && text !== '歌手' && text !== '查看') {
            if (i > 0 && artist) artist += ', ';
            artist += text;
        }
    });
    
    // 如果没有找到歌手，从标题中提取
    if (!artist) {
        const titleMatch = $('title').text().match(/《([^》]+)》/);
        if (titleMatch) {
            const parts = titleMatch[1].split(/[《》\[\]【】]/);
            if (parts.length > 1) {
                artist = parts[0].trim();
            }
        }
    }
    
    // 获取专辑
    let album = '';
    $('a[href^="/album/"]').each((i, el) => {
        const text = $(el).text().trim();
        if (text && text !== '专辑') {
            if (i > 0 && album) album += ', ';
            album += text;
        }
    });
    
    // 获取网盘下载链接
    const panLinks = [];
    $('a[href*="pan.quark.cn"]').each((i, el) => {
        const href = $(el).attr('href');
        if (href) panLinks.push(href);
    });
    $('a[href*="pan.baidu.com"]').each((i, el) => {
        const href = $(el).attr('href');
        if (href) panLinks.push(href);
    });
    
    // 获取时长
    let duration = 0;
    const timeMatch = $('body').text().match(/(\d{1,2}):(\d{2})(?!\d)/);
    if (timeMatch) {
        duration = parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]);
    }
    
    // 获取更新时间
    let updateTime = '';
    const timeText = $('body').text();
    const updateMatch = timeText.match(/更新时间[：:]*(\d{4}-\d{2}-\d{2})/);
    if (updateMatch) {
        updateTime = updateMatch[1];
    }
    
    return {
        id: id,
        name: name || '未知歌曲',
        artist: artist || '未知歌手',
        album: album || '未知专辑',
        duration: duration,
        updateTime: updateTime,
        downloadUrls: panLinks,
        source: 'qeecc',
        sourceUrl: songUrl
    };
}

// 从页面中提取歌曲列表链接
function extractSongLinks(html, baseUrl) {
    const $ = cheerio.load(html);
    const links = new Set();
    
    // 从歌曲详情页提取推荐歌曲
    $('a[href^="/song/"]').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.endsWith('.html') && !href.includes('verify')) {
            links.add(baseUrl + href);
        }
    });
    
    return Array.from(links);
}

// 爬取歌曲详情
async function crawlSongDetail(url) {
    const html = await fetchPage(url);
    if (!html) return null;
    
    const songInfo = parseSongDetailFromHtml(html, url);
    if (!songInfo) return null;
    
    // 从页面中提取更多歌曲链接
    const moreLinks = extractSongLinks(html, BASE_URL);
    
    return { song: songInfo, moreLinks };
}

// 主函数
async function main() {
    console.log('开始爬取无忧音乐网数据...\n');
    
    // 从首页开始爬取
    const startUrls = [
        'https://www.qeecc.com/song/d25uaWlkc2k.html',  // Allegro Vivace
        'https://www.qeecc.com/song/ZHNzc2N4.html',     // 丢了幸福的猪
    ];
    
    // 搜索关键词
    const searchKeywords = ['周杰伦', '林俊杰', '陈奕迅', '张学友', '王菲', '刘德华', '邓紫棋', '五月天'];
    
    // 需要访问的URL集合
    const toVisit = new Set(startUrls);
    const visited = new Set();
    
    // 爬取队列中的歌曲
    const queue = [...startUrls];
    let count = 0;
    const maxCount = 100; // 最多爬取100首歌曲
    
    while (queue.length > 0 && count < maxCount) {
        const url = queue.shift();
        
        if (visited.has(url)) continue;
        visited.add(url);
        
        console.log(`\n正在爬取 (${count + 1}/${maxCount}): ${url}`);
        
        const result = await crawlSongDetail(url);
        
        if (result && result.song && result.song.name !== '未知歌曲') {
            // 检查是否已存在
            if (!allSongs.find(s => s.id === result.song.id)) {
                allSongs.push(result.song);
                count++;
                console.log(`✅ 成功: ${result.song.name} - ${result.song.artist}`);
                
                // 添加更多链接到队列
                for (const link of result.moreLinks) {
                    if (!visited.has(link)) {
                        queue.push(link);
                    }
                }
            }
        } else {
            console.log(`❌ 跳过（验证页面或无效）`);
        }
        
        await sleep(1000); // 延时1秒
    }
    
    // 保存数据
    const dataDir = path.join(__dirname, '..', 'data');
    await fs.mkdir(dataDir, { recursive: true });
    
    const filePath = path.join(dataDir, 'qeecc_songs.json');
    await fs.writeFile(filePath, JSON.stringify(allSongs, null, 2), 'utf-8');
    
    console.log(`\n✅ 数据已保存到 ${filePath}`);
    console.log(`共爬取 ${allSongs.length} 首歌曲`);
    
    // 输出统计信息
    const artistStats = {};
    allSongs.forEach(song => {
        const artists = song.artist.split(',');
        artists.forEach(artist => {
            artist = artist.trim();
            artistStats[artist] = (artistStats[artist] || 0) + 1;
        });
    });
    
    console.log('\n歌手统计：');
    Object.entries(artistStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([artist, count]) => {
            console.log(`  ${artist}: ${count} 首`);
        });
}

// 运行
main().catch(console.error);
