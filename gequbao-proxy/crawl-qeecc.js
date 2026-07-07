const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

// 目标网站基础URL
const BASE_URL = 'https://www.qeecc.com';

// Cookie配置
const COOKIES = 'PHPSESSID=gbt9ks2uekcd16g5rhjd172prs; _preview_auth=Wvp_BsCF5C_Ojeuo08ZjuKyem4Jpn9CcxRh3qTK1Qc8';

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

// 解析歌曲列表页面
async function parseSongList(html) {
    const $ = cheerio.load(html);
    const songs = [];

    // 尝试多种选择器来匹配歌曲列表
    // 方式1: 标准链接
    $('a[href^="/song/"]').each((index, element) => {
        const $el = $(element);
        const href = $el.attr('href');
        const title = $el.text().trim();
        
        // 过滤掉导航链接
        if (href && href.startsWith('/song/') && !href.includes('javascript') && title) {
            const id = href.replace('/song/', '').replace('.html', '');
            songs.push({
                id: id,
                name: title,
                url: `${BASE_URL}${href}`
            });
        }
    });

    // 去重
    const uniqueSongs = [];
    const seen = new Set();
    for (const song of songs) {
        if (!seen.has(song.id) && song.id && song.id.length > 3) {
            seen.add(song.id);
            uniqueSongs.push(song);
        }
    }

    return uniqueSongs;
}

// 解析歌曲详情
async function parseSongDetail(html, songInfo) {
    const $ = cheerio.load(html);
    
    // 获取歌曲标题
    let name = songInfo.name;
    const titleEl = $('h1, .title, .song-title, [class*="title"]').first();
    if (titleEl.length) {
        const text = titleEl.text().trim();
        if (text) name = text;
    }

    // 获取歌手名
    let artist = '';
    $('a[href^="/singer/"]').each((i, el) => {
        if (i > 0) artist += ', ';
        artist += $(el).text().trim();
    });
    if (!artist) {
        const singerEl = $('[class*="singer"], [class*="artist"], [class*="author"]').first();
        if (singerEl.length) {
            artist = singerEl.text().trim();
        }
    }

    // 获取专辑
    let album = '';
    $('a[href^="/album/"]').each((i, el) => {
        if (i > 0) album += ', ';
        album += $(el).text().trim();
    });

    // 获取时长
    let duration = 0;
    const durationMatch = html.match(/(\d{1,2}):(\d{2})/g);
    if (durationMatch) {
        for (const d of durationMatch) {
            const parts = d.split(':');
            if (parts.length === 2) {
                const mins = parseInt(parts[0]);
                const secs = parseInt(parts[1]);
                if (mins < 60 && secs < 60) {
                    duration = mins * 60 + secs;
                    break;
                }
            }
        }
    }

    // 获取下载链接
    let downloadUrl = '';
    const downloadMatch = html.match(/['"]([^'"]*\.mp3[^'"]*)['"]/);
    if (downloadMatch) {
        downloadUrl = downloadMatch[1];
    }

    // 查找网盘链接
    const panLinks = [];
    $('a[href*="pan."]').each((i, el) => {
        panLinks.push($(el).attr('href'));
    });

    return {
        id: songInfo.id,
        name: name,
        artist: artist || '未知歌手',
        album: album || '未知专辑',
        duration: duration,
        downloadUrl: downloadUrl,
        panLinks: panLinks,
        source: 'qeecc'
    };
}

// 爬取热门榜单
async function crawlTopList() {
    console.log('正在爬取热门榜单...');
    
    const lists = [
        { name: '新歌榜', url: '/toplist/xinge.html' },
        { name: '热歌榜', url: '/toplist/remen.html' },
        { name: 'DJ舞曲榜', url: '/toplist/dj.html' }
    ];

    for (const list of lists) {
        console.log(`\n爬取 ${list.name}...`);
        const html = await fetchPage(`${BASE_URL}${list.url}`);
        
        if (html) {
            const songs = await parseSongList(html);
            console.log(`找到 ${songs.length} 首歌曲`);
            
            // 获取详情
            for (let i = 0; i < Math.min(songs.length, 20); i++) {
                console.log(`获取详情 ${i + 1}/${Math.min(songs.length, 20)}: ${songs[i].name}`);
                const detailHtml = await fetchPage(songs[i].url);
                
                if (detailHtml) {
                    const detail = await parseSongDetail(detailHtml, songs[i]);
                    allSongs.push(detail);
                }
                
                await sleep(500);
            }
        }
    }
}

// 爬取歌手列表和歌曲
async function crawlSingers() {
    console.log('\n正在爬取歌手列表...');
    
    const html = await fetchPage(BASE_URL);
    if (!html) return;

    const $ = cheerio.load(html);
    const singerUrls = [];

    // 从首页提取歌手链接
    $('a[href^="/singer/"]').each((index, element) => {
        const href = $(element).attr('href');
        if (href && !singerUrls.includes(href)) {
            singerUrls.push(href);
        }
    });

    console.log(`找到 ${singerUrls.length} 个歌手`);

    // 爬取前30个歌手的歌曲
    const limit = Math.min(singerUrls.length, 30);
    for (let i = 0; i < limit; i++) {
        console.log(`\n爬取歌手 ${i + 1}/${limit}: ${singerUrls[i]}`);
        
        const singerHtml = await fetchPage(`${BASE_URL}${singerUrls[i]}`);
        if (singerHtml) {
            const songs = await parseSongList(singerHtml);
            console.log(`该歌手有 ${songs.length} 首歌曲`);
            
            // 获取前10首歌曲的详情
            for (let j = 0; j < Math.min(songs.length, 10); j++) {
                console.log(`  获取详情 ${j + 1}/${Math.min(songs.length, 10)}: ${songs[j].name}`);
                const detailHtml = await fetchPage(songs[j].url);
                
                if (detailHtml) {
                    const detail = await parseSongDetail(detailHtml, songs[j]);
                    if (!allSongs.find(s => s.id === detail.id)) {
                        allSongs.push(detail);
                    }
                }
                
                await sleep(500);
            }
        }
        
        await sleep(1000);
    }
}

// 爬取搜索结果
async function crawlSearch(keywords) {
    console.log('\n正在爬取搜索结果...');
    
    for (const keyword of keywords) {
        console.log(`\n搜索关键词: ${keyword}`);
        
        const searchUrl = `${BASE_URL}/search/song/index/${encodeURIComponent(keyword)}/index/index/index/index.html`;
        const html = await fetchPage(searchUrl);
        
        if (html) {
            const songs = await parseSongList(html);
            console.log(`找到 ${songs.length} 首歌曲`);
            
            // 获取前10首歌曲的详情
            for (let i = 0; i < Math.min(songs.length, 10); i++) {
                console.log(`  获取详情 ${i + 1}/${Math.min(songs.length, 10)}: ${songs[i].name}`);
                const detailHtml = await fetchPage(songs[i].url);
                
                if (detailHtml) {
                    const detail = await parseSongDetail(detailHtml, songs[i]);
                    if (!allSongs.find(s => s.id === detail.id)) {
                        allSongs.push(detail);
                    }
                }
                
                await sleep(500);
            }
        }
        
        await sleep(1000);
    }
}

// 保存数据到文件
async function saveData() {
    const dataDir = path.join(__dirname, '..', 'data');
    await fs.mkdir(dataDir, { recursive: true });
    
    const filePath = path.join(dataDir, 'qeecc_songs.json');
    await fs.writeFile(filePath, JSON.stringify(allSongs, null, 2), 'utf-8');
    
    console.log(`\n✅ 数据已保存到 ${filePath}`);
    console.log(`共爬取 ${allSongs.length} 首歌曲`);
}

// 主函数
async function main() {
    console.log('开始爬取无忧音乐网数据...\n');
    
    // 1. 爬取热门榜单
    await crawlTopList();
    
    // 2. 爬取歌手歌曲
    await crawlSingers();
    
    // 3. 爬取搜索结果（热门歌手）
    const keywords = ['周杰伦', '林俊杰', '陈奕迅', '邓紫棋', '张学友', '王菲', '刘德华', '五月天'];
    await crawlSearch(keywords);
    
    // 4. 保存数据
    await saveData();
    
    console.log('\n爬取完成！');
}

// 运行
main().catch(console.error);
