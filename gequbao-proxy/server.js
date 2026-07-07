const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const path = require('path');

const app = express();
const port = 3001;

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '..')));

const KUWO_SEARCH_API = 'http://search.kuwo.cn/r.s';
const KUWO_PLAY_API = 'http://antiserver.kuwo.cn/anti.s';
const GEQUBAO_BASE = 'https://www.gequbao.com';

const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ========== QQ音乐 ==========
const searchQQMusic = async (keyword, page = 1, limit = 30) => {
    try {
        const response = await axios.get('https://c.y.qq.com/soso/fcgi-bin/client_search_cp', {
            params: {
                w: keyword,
                p: page,
                n: limit,
                format: 'json'
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://y.qq.com/'
            },
            timeout: 15000
        });

        const data = response.data;
        const songs = [];
        const list = data.data?.song?.list || [];

        for (const item of list) {
            const singers = item.singer || [];
            const artistName = singers.map(s => s.name).join('&');
            const duration = (item.interval || 0) * 1000;

            if (duration < 30000) continue;

            songs.push({
                id: item.songmid || String(item.songid),
                name: item.songname || '未知歌曲',
                artist: artistName || '未知歌手',
                album: item.albumname || '未知专辑',
                duration: duration,
                source: 'qq'
            });
        }

        return songs;
    } catch (e) {
        console.warn('QQ音乐搜索失败:', e.message);
        return [];
    }
};

const getQQPlayUrl = async (songmid) => {
    try {
        const data = JSON.stringify({
            req: {
                module: 'CDN.SrfCdnDispatchServer',
                method: 'GetCdnDispatch',
                param: { guid: '0', calltype: 0, userip: '' }
            },
            req_0: {
                module: 'vkey.GetVkeyServer',
                method: 'CgiGetVkey',
                param: {
                    guid: '0',
                    songmid: [songmid],
                    songtype: [0],
                    uin: '0',
                    loginflag: 1,
                    platform: '20',
                    h5to: 'speed'
                }
            },
            comm: {
                uin: 0,
                format: 'json',
                ct: 24,
                cv: 0
            }
        });

        const response = await axios.get('https://u.y.qq.com/cgi-bin/musicu.fcg', {
            params: {
                '-': 'getplaysongvkey',
                g_tk: 5381,
                loginUin: 0,
                hostUin: 0,
                format: 'json',
                inCharset: 'utf8',
                outCharset: 'utf-8',
                notice: 0,
                platform: 'yqq.json',
                needNewCode: 0,
                data: data
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://y.qq.com/'
            },
            timeout: 10000
        });

        const result = response.data.req_0?.data;
        if (result && result.midurlinfo && result.midurlinfo.length > 0) {
            const info = result.midurlinfo[0];
            if (info.purl) {
                const sip = result.sip || ['http://dl.stream.qqmusic.qq.com/'];
                return sip[0] + info.purl;
            }
        }
    } catch (e) {
        console.warn('QQ音乐播放链接获取失败:', e.message);
    }
    return null;
};

// ========== 酷狗音乐 ==========
const searchKugouMusic = async (keyword, page = 1, limit = 30) => {
    try {
        const response = await axios.get('https://songsearch.kugou.com/song_search_v2', {
            params: {
                keyword: keyword,
                page: page,
                pagesize: limit,
                format: 'json'
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.kugou.com/'
            },
            timeout: 15000
        });

        const data = response.data;
        const songs = [];
        const list = data.data?.lists || [];

        for (const item of list) {
            const duration = (item.Duration || 0) * 1000;

            if (duration < 30000) continue;

            songs.push({
                id: item.FileHash || String(item.AudioId),
                name: item.SongName || '未知歌曲',
                artist: item.SingerName || '未知歌手',
                album: item.AlbumName || '未知专辑',
                duration: duration,
                source: 'kugou'
            });
        }

        return songs;
    } catch (e) {
        console.warn('酷狗音乐搜索失败:', e.message);
        return [];
    }
};

const getKugouPlayUrl = async (hash) => {
    try {
        const response = await axios.get('https://m.kugou.com/app/i/getSongInfo.php', {
            params: {
                cmd: 'playInfo',
                hash: hash,
                from: 'mkugou'
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
                'Referer': 'https://m.kugou.com/'
            },
            timeout: 10000
        });

        if (response.data.url) {
            return response.data.url;
        }
    } catch (e) {
        console.warn('酷狗音乐播放链接获取失败:', e.message);
    }
    return null;
};

// ========== 网易云音乐（补充数据源）==========

const searchNeteaseMusic = async (keyword) => {
    try {
        const response = await axios.get('https://music.163.com/api/search/get/web', {
            params: {
                s: keyword,
                type: 1,
                limit: 100
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://music.163.com/'
            },
            timeout: 15000
        });

        const data = response.data;
        const songs = [];

        if (data.result && data.result.songs && data.result.songs.length > 0) {
            for (const item of data.result.songs) {
                const artists = item.artists || [];
                const artistName = artists.map(a => a.name).join('&');
                
                songs.push({
                    id: String(item.id),
                    name: item.name || '未知歌曲',
                    artist: artistName || '未知歌手',
                    album: item.album ? item.album.name : '未知专辑',
                    duration: item.duration || 0,
                    source: 'netease'
                });
            }
        }

        return songs;
    } catch (e) {
        console.warn('网易云音乐搜索失败:', e.message);
        return [];
    }
};

// ========== 酷我音乐（无忧音乐网/AAX音乐网数据源）==========

// 酷我音乐搜索
const searchKuwoMusic = async (keyword, page = 1, limit = 100) => {
    try {
        const pn = (page - 1) * limit;
        const response = await axios.get(KUWO_SEARCH_API, {
            params: {
                all: keyword,
                ft: 'music',
                itemset: 'web_2013',
                client: 'kt',
                pn: pn,
                rn: limit,
                rformat: 'json',
                encoding: 'utf8'
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.kuwo.cn/'
            },
            timeout: 15000
        });

        let rawData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        rawData = rawData.replace(/'/g, '"').replace(/&nbsp;/g, ' ').replace(/\\\\u0026/g, '&');

        const data = JSON.parse(rawData);
        const songs = [];

        if (data.abslist && data.abslist.length > 0) {
            for (const item of data.abslist) {
                const musicRid = item.MUSICRID || '';
                const songId = musicRid.replace('MUSIC_', '') || item.DC_TARGETID || '';
                if (!songId) continue;

                songs.push({
                    id: songId,
                    name: (item.SONGNAME || '未知歌曲').replace(/&nbsp;/g, ' ').trim(),
                    artist: (item.ARTIST || '未知歌手').replace(/&nbsp;/g, ' ').trim(),
                    album: (item.ALBUM || '').replace(/&nbsp;/g, ' ').trim() || '未知专辑',
                    duration: parseInt(item.DURATION || 0) * 1000,
                    source: 'kuwo'
                });
            }
        }

        return songs;
    } catch (e) {
        console.warn('酷我音乐搜索失败:', e.message);
        return [];
    }
};

// 搜索所有结果（多页）
const searchAllKuwoMusic = async (keyword) => {
    const allSongs = [];
    const seenIds = new Set();
    const maxPages = 20;
    const pageSize = 30;

    for (let page = 1; page <= maxPages; page++) {
        const songs = await searchKuwoMusic(keyword, page, pageSize);
        if (songs.length === 0) break;

        for (const song of songs) {
            if (!seenIds.has(song.id)) {
                seenIds.add(song.id);
                allSongs.push(song);
            }
        }

        if (songs.length < pageSize) break;

        await delay(200);
    }

    allSongs.sort((a, b) => calculateSongScore(b, keyword) - calculateSongScore(a, keyword));

    return allSongs;
};

const calculateSongScore = (song, keyword) => {
    let score = 0;
    const name = song.name || '';
    const artist = song.artist || '';
    const keywordLower = keyword.toLowerCase();
    const artistLower = artist.toLowerCase();
    const nameLower = name.toLowerCase();

    const isArtistMatch = artistLower === keywordLower ||
                          artistLower.includes(keywordLower) ||
                          keywordLower.includes(artistLower) ||
                          artistLower.replace(/[\.\&\、\,，。\s\/\\]/g, '').includes(keywordLower.replace(/[\.\&\、\,，。\s\/\\]/g, ''));

    if (isArtistMatch) {
        score += 200;
    }

    const keywordParts = keywordLower.split(/[\s\+]+/).filter(p => p.length > 0);
    let titleMatchScore = 0;
    for (const part of keywordParts) {
        if (nameLower.includes(part)) {
            titleMatchScore += 30;
        }
    }
    score += titleMatchScore;

    if (nameLower === keywordLower || keywordLower.includes(nameLower)) {
        score += 50;
    }

    const negativePatterns = [
        { pattern: '伴奏', penalty: 100 },
        { pattern: '纯音乐', penalty: 100 },
        { pattern: '钢琴版', penalty: 80 },
        { pattern: '吉他版', penalty: 80 },
        { pattern: '纯人声版', penalty: 70 },
        { pattern: '演唱会', penalty: 80 },
        { pattern: '现场', penalty: 70 },
        { pattern: 'live', penalty: 70 },
        { pattern: '翻唱', penalty: 120 },
        { pattern: '翻自', penalty: 120 },
        { pattern: 'cover', penalty: 100 },
        { pattern: 'dj', penalty: 80 },
        { pattern: 'remix', penalty: 80 },
        { pattern: '串烧', penalty: 80 },
        { pattern: '片段', penalty: 80 },
        { pattern: '节选', penalty: 80 },
        { pattern: '铃声', penalty: 70 },
        { pattern: '抖音', penalty: 40 },
        { pattern: '快手', penalty: 40 },
        { pattern: '慢摇', penalty: 70 },
        { pattern: '电音', penalty: 70 },
        { pattern: 'ktv', penalty: 70 },
        { pattern: 'demo', penalty: 50 },
        { pattern: '搞笑版', penalty: 60 },
        { pattern: '助眠', penalty: 80 },
        { pattern: '升调', penalty: 50 },
        { pattern: '降调', penalty: 50 },
        { pattern: '加速', penalty: 50 },
        { pattern: '减速', penalty: 50 },
        { pattern: '完整版', penalty: -10 },
        { pattern: '原版', penalty: -20 },
        { pattern: '正式版', penalty: -10 }
    ];

    let negativeScore = 0;
    for (const item of negativePatterns) {
        if (nameLower.includes(item.pattern)) {
            negativeScore += item.penalty;
        }
    }
    score -= negativeScore;

    if (negativeScore === 0) {
        score += 50;
    }

    if (name.match(/[\(\)（）【】\[\]]/)) {
        score -= 15;
    }

    if (song.album && song.album.length > 0 &&
        !song.album.includes('精选') && !song.album.includes('合辑') &&
        !song.album.includes('合集') && !song.album.includes('DJ') &&
        !song.album.includes('翻唱') && !song.album.includes('演唱会') &&
        !song.album.includes('现场')) {
        score += 20;
    }

    if (song.duration && song.duration > 120000) {
        score += 5;
    }

    return score;
};

// 酷我音乐获取播放链接
const getKuwoPlayUrl = async (songId) => {
    try {
        const response = await axios.get(KUWO_PLAY_API, {
            params: {
                type: 'convert_url',
                rid: `MUSIC_${songId}`,
                format: 'mp3',
                response: 'url'
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });

        const url = typeof response.data === 'string' ? response.data.trim() : '';
        if (url && url.startsWith('http')) {
            return url;
        }
    } catch (e) {
        console.warn('酷我antiserver获取失败:', e.message);
    }

    try {
        const response = await axios.get(KUWO_PLAY_API, {
            params: {
                type: 'convert_url',
                rid: `MUSIC_${songId}`,
                format: 'mp3',
                br: '320kmp3',
                response: 'url'
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });

        const url = typeof response.data === 'string' ? response.data.trim() : '';
        if (url && url.startsWith('http')) {
            return url;
        }
    } catch (e) {
        console.warn('酷我320k获取失败:', e.message);
    }

    return null;
};

const getNeteasePlayUrl = async (songId) => {
    try {
        const response = await axios.get('https://music.163.com/api/song/enhance/player/url', {
            params: {
                id: songId,
                ids: `[${songId}]`,
                br: 320000
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://music.163.com/',
                'Cookie': 'appver=1.5.2; os=osx; osver=10.15.7; appversion=2.7.1.16'
            },
            timeout: 10000
        });

        if (response.data.data && response.data.data.length > 0) {
            const song = response.data.data[0];
            if (song.url && song.code === 200) {
                return song.url;
            }
        }
    } catch (e) {
        console.warn('网易云音乐播放链接获取失败:', e.message);
    }
    return null;
};

// ========== CORS 处理 ==========
app.all('*', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
    next();
});

// ========== 首页 ==========
app.get('/', (req, res) => {
    res.json({
        name: '音乐API代理服务器',
        sources: '无忧音乐网(qeecc.com) / AAX音乐网(aax.cx) — 数据源：酷我音乐',
        usage: {
            search: '/kuwo-search?q=关键词',
            play: '/play?id=歌曲ID&source=kuwo'
        }
    });
});

// ========== 酷我音乐搜索（主数据源）==========
const handleKuwoSearch = async (req, res) => {
    const params = req.method === 'POST' ? req.body : req.query;
    let { q, page = 1 } = params;

    if (!q && params.q64) {
        try {
            q = Buffer.from(params.q64, 'base64').toString('utf-8');
        } catch (e) {
            q = '';
        }
    }

    if (!q) {
        return res.json({ code: 400, message: '请提供搜索关键词', data: [], total: 0 });
    }

    try {
        const [kuwoSongs, neteaseSongs, qqSongs, kugouSongs] = await Promise.all([
            searchAllKuwoMusic(q),
            searchNeteaseMusic(q),
            searchQQMusic(q, 1, 30),
            searchKugouMusic(q, 1, 30)
        ]);

        const allSongs = [];
        const seenKeys = new Set();

        const addSongs = (songs) => {
            for (const song of songs) {
                const key = `${song.name}|${song.artist}`;
                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    allSongs.push(song);
                }
            }
        };

        addSongs(qqSongs);
        addSongs(neteaseSongs);
        addSongs(kugouSongs);
        addSongs(kuwoSongs);

        allSongs.sort((a, b) => calculateSongScore(b, q) - calculateSongScore(a, q));

        res.json({
            code: 200,
            message: '搜索成功',
            data: allSongs,
            total: allSongs.length
        });
    } catch (error) {
        console.error('搜索失败:', error.message);
        res.json({ code: 500, message: '搜索失败: ' + error.message, data: [], total: 0 });
    }
};

app.get('/kuwo-search', handleKuwoSearch);
app.post('/kuwo-search', handleKuwoSearch);

// ========== 歌曲宝搜索（备选数据源）==========
const handleGequbaoSearch = async (req, res) => {
    const params = req.method === 'POST' ? req.body : req.query;
    let { q } = params;

    // 支持Base64编码的关键词
    if (!q && params.q64) {
        try {
            q = Buffer.from(params.q64, 'base64').toString('utf-8');
        } catch (e) {
            q = '';
        }
    }

    if (!q) {
        return res.json({ code: 400, message: '请提供搜索关键词', data: [], total: 0 });
    }

    try {
        const response = await axios.get(`${GEQUBAO_BASE}/s/${encodeURIComponent(q)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': GEQUBAO_BASE
            },
            timeout: 30000,
            httpsAgent
        });

        const $ = cheerio.load(response.data);
        const songs = [];
        const seenIds = new Set();

        $('div.row.no-gutters.py-2d5.border-top.align-items-center').each((index, element) => {
            const $row = $(element);
            const $link = $row.find('a[href^="/music/"]').first();

            if ($link.length > 0) {
                const href = $link.attr('href');
                const id = href.replace('/music/', '');

                if (id && id.length < 20 && !seenIds.has(id)) {
                    seenIds.add(id);

                    const fullText = $row.text().replace(/\s+/g, ' ').trim();
                    const parts = fullText.split('-');

                    let title = parts[0] ? parts[0].trim() : '未知歌曲';
                    let artist = '未知歌手';

                    if (parts.length > 1) {
                        artist = parts.slice(1).join('-').replace(/播放&下载/g, '').trim();
                    }

                    title = title.replace(/播放&下载/g, '').trim();

                    songs.push({
                        id: id,
                        name: title,
                        artist: artist,
                        album: '歌曲宝',
                        source: 'gequbao'
                    });
                }
            }
        });

        res.json({
            code: 200,
            message: '搜索成功',
            data: songs,
            total: songs.length
        });

    } catch (error) {
        console.error('歌曲宝搜索失败:', error.message);
        res.json({ code: 500, message: '搜索失败: ' + error.message, data: [], total: 0 });
    }
};

app.get('/search', handleGequbaoSearch);
app.post('/search', handleGequbaoSearch);

// ========== 歌曲宝页面获取（辅助函数）==========
const getCookieString = (cookies) => {
    return cookies.map(c => c.split(';')[0]).join('; ');
};

const fetchHomePage = async () => {
    try {
        const response = await axios.get(`${GEQUBAO_BASE}/`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9'
            },
            timeout: 30000,
            httpsAgent
        });
        const cookies = response.headers['set-cookie'] || [];
        return getCookieString(cookies);
    } catch (e) {
        console.warn('获取首页失败:', e.message);
        return '';
    }
};

const fetchGequbaoPage = async (id, initialCookies = '') => {
    try {
        const response = await axios.get(`${GEQUBAO_BASE}/music/${id}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': GEQUBAO_BASE + '/',
                'Cookie': initialCookies
            },
            timeout: 30000,
            httpsAgent
        });
        const newCookies = response.headers['set-cookie'] || [];
        const allCookies = initialCookies
            ? initialCookies + '; ' + getCookieString(newCookies)
            : getCookieString(newCookies);
        return { html: response.data, cookies: allCookies };
    } catch (e) {
        console.warn('获取歌曲宝页面失败:', e.message);
        return null;
    }
};

const fetchPlayUrl = async (playId, songId, cookies) => {
    try {
        const response = await axios.post(
            `${GEQUBAO_BASE}/member/common-play-url`,
            `id=${encodeURIComponent(playId)}`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': `${GEQUBAO_BASE}/music/${songId}`,
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'Cookie': cookies || ''
                },
                timeout: 15000,
                httpsAgent
            }
        );
        return response.data;
    } catch (e) {
        console.warn('获取播放链接失败:', e.message);
        return null;
    }
};

// ========== 播放链接获取 ==========
const handlePlay = async (req, res) => {
    const params = req.method === 'POST' ? req.body : req.query;
    let { id, title, artist, source } = params;

    const decodeB64 = (str) => {
        if (!str) return str;
        try {
            return Buffer.from(str, 'base64').toString('utf-8');
        } catch (e) {
            return str;
        }
    };

    if (!id && params.id64) id = decodeB64(params.id64);
    if (!title && params.title64) title = decodeB64(params.title64);
    if (!artist && params.artist64) artist = decodeB64(params.artist64);

    if (!id && !title) {
        return res.json({ code: 400, message: '请提供歌曲ID或名称' });
    }

    let playUrl = '';
    let songTitle = title || '';
    let songArtist = artist || '';
    let songDuration = 0;

    try {
        if (source === 'qq' && id) {
            console.log('尝试使用QQ音乐获取播放链接:', id);
            const qqUrl = await getQQPlayUrl(id);
            if (qqUrl) {
                playUrl = qqUrl;
                console.log('QQ音乐播放链接获取成功:', playUrl.substring(0, 80));
            }
        }

        if (!playUrl && source === 'netease' && id) {
            console.log('尝试使用网易云音乐获取播放链接:', id);
            const neteaseUrl = await getNeteasePlayUrl(id);
            if (neteaseUrl) {
                playUrl = neteaseUrl;
                console.log('网易云音乐播放链接获取成功:', playUrl.substring(0, 80));
            }
        }

        if (!playUrl && source === 'kugou' && id) {
            console.log('尝试使用酷狗音乐获取播放链接:', id);
            const kugouUrl = await getKugouPlayUrl(id);
            if (kugouUrl) {
                playUrl = kugouUrl;
                console.log('酷狗音乐播放链接获取成功:', playUrl.substring(0, 80));
            }
        }

        if (!playUrl && (source === 'kuwo' || (!source && id))) {
            console.log('尝试使用酷我音乐获取播放链接:', id);
            const kuwoUrl = await getKuwoPlayUrl(id);
            if (kuwoUrl) {
                playUrl = kuwoUrl;
                console.log('酷我音乐播放链接获取成功:', playUrl.substring(0, 80));
            }
        }

        if (!playUrl && title) {
            console.log('尝试通过歌曲名搜索多平台播放:', title);
            const searchKeyword = title + (artist ? ' ' + artist : '');
            
            const searchFallback = async (searchFunc, getPlayFunc, sourceName) => {
                try {
                    const songs = await searchFunc(searchKeyword, 1, 10);
                    if (songs && songs.length > 0) {
                        let bestMatch = null;
                        let bestScore = 0;

                        for (const song of songs) {
                            const songName = song.name || '';
                            const songArtist = song.artist || '';
                            const cleanName = songName.replace(/\(.*?\)|（.*?）|\[.*?\]|\s/g, '').trim().toLowerCase();
                            const cleanTitle = (title || '').replace(/\s/g, '').toLowerCase();
                            const cleanSongArtist = songArtist.replace(/[\.\&\、\,，。\s\/\\]/g, '').toLowerCase();
                            const cleanArtist = (artist || '').replace(/[\.\&\、\,，。\s\/\\]/g, '').toLowerCase();

                            let score = 0;

                            if (cleanSongArtist === cleanArtist && cleanArtist.length > 0) {
                                score += 50;
                            } else if (cleanSongArtist.includes(cleanArtist) && cleanArtist.length > 0) {
                                score += 30;
                            } else if (cleanArtist.includes(cleanSongArtist) && cleanSongArtist.length > 0) {
                                score += 20;
                            }

                            if (cleanName === cleanTitle) {
                                score += 50;
                            } else if (cleanName.includes(cleanTitle) && cleanTitle.length > 0) {
                                score += 30;
                            } else if (cleanTitle.includes(cleanName) && cleanName.length > 0) {
                                score += 20;
                            }

                            const negativePatterns = [
                                { pattern: '伴奏', penalty: 200 },
                                { pattern: '纯音乐', penalty: 200 },
                                { pattern: '钢琴版', penalty: 150 },
                                { pattern: '吉他版', penalty: 150 },
                                { pattern: '演唱会', penalty: 150 },
                                { pattern: '现场', penalty: 150 },
                                { pattern: 'live', penalty: 150 },
                                { pattern: '翻唱', penalty: 200 },
                                { pattern: '翻自', penalty: 200 },
                                { pattern: 'cover', penalty: 200 },
                                { pattern: 'dj', penalty: 150 },
                                { pattern: 'remix', penalty: 150 },
                                { pattern: '片段', penalty: 200 },
                                { pattern: '节选', penalty: 200 },
                                { pattern: '铃声', penalty: 150 },
                                { pattern: '抖音', penalty: 80 },
                                { pattern: '快手', penalty: 80 },
                                { pattern: 'demo', penalty: 100 },
                                { pattern: '搞笑版', penalty: 200 },
                                { pattern: '搞笑', penalty: 150 },
                                { pattern: '3d', penalty: 100 },
                                { pattern: '环绕', penalty: 100 }
                            ];
                            
                            const nameLower = songName.toLowerCase();
                            let negativeScore = 0;
                            for (const item of negativePatterns) {
                                if (nameLower.includes(item.pattern)) {
                                    negativeScore += item.penalty;
                                }
                            }
                            score -= negativeScore;

                            if (negativeScore === 0) {
                                score += 50;
                            }

                            if (song.duration && song.duration > 120000) {
                                score += 20;
                            }

                            if (score > bestScore) {
                                bestScore = score;
                                bestMatch = song;
                            }
                        }

                        if (bestMatch && bestScore >= 60) {
                            const url = await getPlayFunc(bestMatch.id);
                            if (url) {
                                return { url, song: bestMatch, score: bestScore };
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`${sourceName}回退搜索失败:`, e.message);
                }
                return null;
            };

            const fallbacks = [
                { search: searchQQMusic, play: getQQPlayUrl, name: 'QQ音乐' },
                { search: searchNeteaseMusic, play: getNeteasePlayUrl, name: '网易云音乐' },
                { search: searchKugouMusic, play: getKugouPlayUrl, name: '酷狗音乐' },
                { search: (kw, p, l) => searchKuwoMusic(kw, p, l), play: getKuwoPlayUrl, name: '酷我音乐' }
            ];

            for (const fb of fallbacks) {
                if (source === fb.name.toLowerCase().replace('音乐', '').replace('云', '')) continue;
                const result = await searchFallback(fb.search, fb.play, fb.name);
                if (result) {
                    playUrl = result.url;
                    songTitle = result.song.name || songTitle;
                    songArtist = result.song.artist || songArtist;
                    songDuration = result.song.duration || songDuration;
                    console.log(`通过${fb.name}回退搜索获取播放链接成功 (分数: ${result.score}):`, playUrl.substring(0, 80));
                    break;
                }
            }
        }

        if (!playUrl && source === 'gequbao') {
            console.log('尝试使用歌曲宝获取:', id);
            for (let attempt = 1; attempt <= 2; attempt++) {
                const homeCookies = await fetchHomePage();
                await delay(500);
                const pageResult = await fetchGequbaoPage(id, homeCookies);

                if (pageResult) {
                    const { html, cookies } = pageResult;
                    const appDataMatch = html.match(/window\.appData\s*=\s*JSON\.parse\('([^']+)'\)/);

                    if (appDataMatch) {
                        let jsonStr = '"' + appDataMatch[1] + '"';
                        const decodedStr = JSON.parse(jsonStr);
                        const appData = JSON.parse(decodedStr);

                        songTitle = appData.mp3_title || title;
                        songArtist = appData.mp3_author || artist;
                        songDuration = appData.mp3_duration || 0;

                        if (appData.mp3_url) {
                            playUrl = appData.mp3_url;
                            break;
                        } else if (appData.play_id) {
                            await delay(300);
                            const playResult = await fetchPlayUrl(appData.play_id, id, cookies);
                            if (playResult && playResult.code === 1 && playResult.data && playResult.data.url) {
                                playUrl = playResult.data.url;
                                break;
                            }
                        }
                    }
                }

                if (attempt < 2) {
                    await delay(1000);
                }
            }
        }

        if (!playUrl) {
            return res.json({ code: 404, message: '未找到播放链接' });
        }

        res.json({
            code: 200,
            message: '获取成功',
            url: playUrl,
            title: songTitle,
            artist: songArtist,
            duration: songDuration
        });

    } catch (error) {
        console.error('获取播放链接失败:', error.message);
        res.json({ code: 500, message: '获取播放链接失败: ' + error.message });
    }
};

app.get('/play', handlePlay);
app.post('/play', handlePlay);

// ========== 歌词获取 ==========
const handleLyrics = async (req, res) => {
    const params = req.method === 'POST' ? req.body : req.query;
    let { title, artist, songId, source } = params;
    
    if (!songId && params.id) songId = params.id;

    // 支持Base64编码的参数
    const decodeB64 = (str) => {
        if (!str) return str;
        try {
            return Buffer.from(str, 'base64').toString('utf-8');
        } catch (e) {
            return str;
        }
    };

    if (!title && params.title64) title = decodeB64(params.title64);
    if (!artist && params.artist64) artist = decodeB64(params.artist64);

    if (!title) {
        return res.json({ code: 400, message: '请提供歌曲名称' });
    }

    try {
        // 根据来源优先使用对应平台API获取歌词（ID精确匹配）
        if (source === 'qq' && songId) {
            console.log('尝试QQ音乐歌词(ID匹配):', songId);
            const qqLyrics = await fetchQQLyricsById(songId);
            if (qqLyrics) {
                return res.json({ code: 200, message: '获取成功', lyrics: qqLyrics });
            }
        }

        if (source === 'netease' && songId) {
            console.log('尝试网易云歌词(ID匹配):', songId);
            const neteaseLyrics = await fetchNeteaseLyricsById(songId);
            if (neteaseLyrics) {
                return res.json({ code: 200, message: '获取成功', lyrics: neteaseLyrics });
            }
        }

        if (source === 'kugou' && songId) {
            console.log('尝试酷狗歌词(ID匹配):', songId);
            const kugouLyrics = await fetchKugouLyricsById(songId);
            if (kugouLyrics) {
                return res.json({ code: 200, message: '获取成功', lyrics: kugouLyrics });
            }
        }

        if (source === 'kuwo' && songId) {
            console.log('尝试酷我歌词(ID匹配):', songId);
            const kuwoLyrics = await fetchKuwoLyricsById(songId);
            if (kuwoLyrics) {
                return res.json({ code: 200, message: '获取成功', lyrics: kuwoLyrics });
            }
        }

        // 回退：并行获取多个平台的歌词，提高成功率
        const searchVariants = [
            { title: title, artist: artist },
            { title: title, artist: '' },
            { title: title.replace(/\(.*?\)|（.*?）/g, '').trim(), artist: artist },
            { title: title, artist: artist.replace(/乐团|乐队|组合/g, '').trim() }
        ];

        const lyricTasks = [];
        
        for (const variant of searchVariants) {
            lyricTasks.push(fetchQQLyrics(variant.title, variant.artist));
            lyricTasks.push(fetchNeteaseLyrics(variant.title, variant.artist));
        }
        
        lyricTasks.push(fetchKuwoLyrics(title, artist, songId));
        lyricTasks.push(fetchKugouLyrics(title, artist));

        const results = await Promise.all(lyricTasks);
        
        for (const result of results) {
            if (result) {
                return res.json({ code: 200, message: '获取成功', lyrics: result });
            }
        }

        const lyrics3 = await fetchAnotherLyrics(title, artist);
        if (lyrics3) {
            return res.json({ code: 200, message: '获取成功', lyrics: lyrics3 });
        }

        const lyrics4 = await fetchGeniusLyrics(title, artist);
        if (lyrics4) {
            return res.json({ code: 200, message: '获取成功', lyrics: lyrics4 });
        }

        return res.json({
            code: 404,
            message: '未找到歌词',
            lyrics: ''
        });

    } catch (error) {
        console.error('获取歌词失败:', error.message);
        res.json({ code: 500, message: '获取歌词失败: ' + error.message, lyrics: '' });
    }
};

app.get('/lyrics', handleLyrics);
app.post('/lyrics', handleLyrics);

// 获取酷我音乐歌词
const fetchKuwoLyrics = async (title, artist, songId) => {
    try {
        if (!songId) {
            const response = await axios.get(KUWO_SEARCH_API, {
                params: {
                    all: title + ' ' + artist,
                    ft: 'music',
                    itemset: 'web_2013',
                    client: 'kt',
                    pn: 0,
                    rn: 20,
                    rformat: 'json',
                    encoding: 'utf8'
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://www.kuwo.cn/'
                },
                timeout: 15000
            });

            let rawData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            rawData = rawData.replace(/'/g, '"').replace(/&nbsp;/g, ' ').replace(/\\\\u0026/g, '&');
            const data = JSON.parse(rawData);

            if (data.abslist && data.abslist.length > 0) {
                for (const item of data.abslist) {
                    const songName = item.SONGNAME || '';
                    const songArtist = item.ARTIST || '';
                    
                    if (songArtist === artist && songName === title) {
                        const musicRid = item.MUSICRID || '';
                        songId = musicRid.replace('MUSIC_', '') || item.DC_TARGETID || '';
                        break;
                    }
                }
                
                if (!songId) {
                    for (const item of data.abslist) {
                        const songName = item.SONGNAME || '';
                        const songArtist = item.ARTIST || '';
                        const cleanSongName = songName.replace(/\(.*?\)|（.*?）|\[.*?\]/g, '').trim();
                        
                        if (songArtist === artist && cleanSongName === title) {
                            const musicRid = item.MUSICRID || '';
                            songId = musicRid.replace('MUSIC_', '') || item.DC_TARGETID || '';
                            break;
                        }
                    }
                }
                
                if (!songId) {
                    const item = data.abslist[0];
                    const musicRid = item.MUSICRID || '';
                    songId = musicRid.replace('MUSIC_', '') || item.DC_TARGETID || '';
                }
            }
        }

        if (songId) {
            const response = await axios.get(`https://www.kuwo.cn/api/www/music/lyric?mid=${songId}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://www.kuwo.cn/'
                },
                timeout: 10000
            });

            if (response.data && response.data.data && response.data.data.lyric) {
                return response.data.data.lyric;
            }
        }
    } catch (e) {
        console.warn('酷我歌词获取失败:', e.message);
    }
    return null;
};

// 按ID获取酷我歌词
const fetchKuwoLyricsById = async (songId) => {
    try {
        const response = await axios.get(`https://www.kuwo.cn/api/www/music/lyric?mid=${songId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.kuwo.cn/'
            },
            timeout: 10000
        });
        if (response.data && response.data.data && response.data.data.lyric) {
            return response.data.data.lyric;
        }
    } catch (e) {
        console.warn('酷我歌词(ID)获取失败:', e.message);
    }
    return null;
};

// 按ID获取QQ音乐歌词
const fetchQQLyricsById = async (songmid) => {
    try {
        const lyricResponse = await axios.get('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg', {
            params: {
                songmid: songmid,
                format: 'json',
                nobase64: 0
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://y.qq.com/'
            },
            timeout: 10000
        });

        if (lyricResponse.data.lyric) {
            const decoded = Buffer.from(lyricResponse.data.lyric, 'base64').toString('utf-8');
            if (decoded && decoded.trim().length > 50) {
                return decoded;
            }
        }
    } catch (e) {
        console.warn('QQ音乐歌词(ID)获取失败:', e.message);
    }
    return null;
};

// 按ID获取网易云歌词
const fetchNeteaseLyricsById = async (songId) => {
    try {
        const response = await axios.get(`https://music.163.com/api/song/lyric?id=${songId}&lv=1&kv=1&tv=-1`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://music.163.com/'
            },
            timeout: 10000
        });
        if (response.data && response.data.lrc && response.data.lrc.lyric && response.data.lrc.lyric.trim().length > 50) {
            return response.data.lrc.lyric;
        }
    } catch (e) {
        console.warn('网易云歌词(ID)获取失败:', e.message);
    }
    return null;
};

// 按ID获取酷狗歌词
const fetchKugouLyricsById = async (hash) => {
    try {
        // 先获取歌曲hash对应的信息
        const infoResponse = await axios.get(`https://m.kugou.com/app/i/getSongInfo.php`, {
            params: { cmd: 'playInfo', hash: hash },
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_0 like Mac OS X)',
                'Referer': 'https://m.kugou.com/'
            },
            timeout: 10000
        });

        const albumId = infoResponse.data?.album_id;
        
        if (albumId) {
            const lyricResponse = await axios.get(`https://api.kugou.com/php/index.php`, {
                params: {
                    r: 'lr2/get',
                    hash: hash,
                    album_id: albumId,
                    fmt: 'lrc'
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_0 like Mac OS X)',
                    'Referer': 'https://m.kugou.com/'
                },
                timeout: 10000
            });

            if (lyricResponse.data && lyricResponse.data.content) {
                const decoded = Buffer.from(lyricResponse.data.content, 'base64').toString('utf-8');
                if (decoded && decoded.trim().length > 50) {
                    return decoded;
                }
            }
        }

        // 备选：直接搜索歌词
        const searchLyricResponse = await axios.get(`https://krcs.kugou.com/search`, {
            params: {
                ver: 1,
                man: 'yes',
                client: 'mobi',
                hash: hash,
                fmt: 'lrc'
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_0 like Mac OS X)',
                'Referer': 'https://m.kugou.com/'
            },
            timeout: 10000
        });

        if (searchLyricResponse.data && searchLyricResponse.data.candidates && searchLyricResponse.data.candidates.length > 0) {
            const candidate = searchLyricResponse.data.candidates[0];
            const id = candidate.id;
            const accesskey = candidate.accesskey;
            
            const downloadResponse = await axios.get(`https://lyrics.kugou.com/download`, {
                params: {
                    ver: 1,
                    client: 'pc',
                    id: id,
                    accesskey: accesskey,
                    fmt: 'lrc',
                    charset: 'utf8'
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_0 like Mac OS X)',
                    'Referer': 'https://m.kugou.com/'
                },
                timeout: 10000
            });

            if (downloadResponse.data && downloadResponse.data.content) {
                const decoded = Buffer.from(downloadResponse.data.content, 'base64').toString('utf-8');
                if (decoded && decoded.trim().length > 50) {
                    return decoded;
                }
            }
        }
    } catch (e) {
        console.warn('酷狗歌词(ID)获取失败:', e.message);
    }
    return null;
};

const fetchKugouLyrics = async (title, artist) => {
    try {
        const searchResponse = await axios.get('https://api.kugou.com/v3/search/lyric', {
            params: {
                keyword: title + ' ' + artist,
                page: 1,
                pagesize: 5,
                format: 'json'
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_0 like Mac OS X)',
                'Referer': 'https://m.kugou.com/'
            },
            timeout: 10000
        });

        const list = searchResponse.data?.data?.lists || [];
        if (list.length === 0) return null;

        let bestMatch = null;
        let bestScore = 0;

        const cleanStr = (s) => (s || '').replace(/[\.\&\、\,，。\s\/\\\-]/g, '').toLowerCase();
        const cleanTitle = cleanStr(title);
        const cleanArtist = cleanStr(artist);

        for (const item of list) {
            const songName = item.songname || '';
            const singerName = item.singername || '';
            const cleanName = cleanStr(songName.replace(/\(.*?\)|（.*?）|\[.*?\]/g, ''));
            const cleanSinger = cleanStr(singerName);

            let score = 0;

            if (cleanSinger === cleanArtist && cleanArtist.length > 0) {
                score += 20;
            } else if (cleanSinger.includes(cleanArtist) && cleanArtist.length > 0) {
                score += 15;
            }

            if (cleanName === cleanTitle) {
                score += 20;
            } else if (cleanName.includes(cleanTitle) && cleanTitle.length > 0) {
                score += 15;
            }

            const negativePatterns = ['伴奏', '纯音乐', '翻唱', 'cover', 'dj', 'remix'];
            const nameLower = songName.toLowerCase();
            for (const p of negativePatterns) {
                if (nameLower.includes(p)) score -= 30;
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = item;
            }
        }

        if (!bestMatch || bestScore < 10) return null;

        const lyricResponse = await axios.get(`https://api.kugou.com/v3/lyric/single`, {
            params: {
                id: bestMatch.id,
                format: 'json'
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_0 like Mac OS X)',
                'Referer': 'https://m.kugou.com/'
            },
            timeout: 10000
        });

        if (lyricResponse.data && lyricResponse.data.data && lyricResponse.data.data.content) {
            const decoded = Buffer.from(lyricResponse.data.data.content, 'base64').toString('utf-8');
            if (decoded && decoded.trim().length > 50) {
                return decoded;
            }
        }
    } catch (e) {
        console.warn('酷狗歌词搜索失败:', e.message);
    }
    return null;
};

// 获取Genius歌词
const fetchGeniusLyrics = async (title, artist) => {
    try {
        const searchUrl = `https://api.genius.com/search?q=${encodeURIComponent(title + ' ' + artist)}`;
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Authorization': 'Bearer '
            },
            timeout: 15000
        });

        if (response.data && response.data.response && response.data.response.hits && response.data.response.hits.length > 0) {
            const hit = response.data.response.hits[0];
            const songUrl = hit.result.url;
            
            const pageResponse = await axios.get(songUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 15000
            });

            const $ = cheerio.load(pageResponse.data);
            const lyricsDiv = $('div[data-lyrics-container="true"]');
            const lyrics = lyricsDiv.text().trim();
            
            if (lyrics && lyrics.length > 50) {
                return lyrics;
            }
        }
    } catch (e) {
        console.warn('Genius歌词获取失败:', e.message);
    }
    return null;
};

// 获取网易云音乐歌词
const fetchNeteaseLyrics = async (title, artist) => {
    try {
        const searchKeywords = [
            title + ' ' + artist,
            title
        ];

        for (const keyword of searchKeywords) {
            try {
                const response = await axios.get('https://music.163.com/api/search/get/web', {
                    params: {
                        s: keyword,
                        type: 1,
                        limit: 50
                    },
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://music.163.com/'
                    },
                    timeout: 10000
                });

                if (response.data && response.data.result && response.data.result.songs && response.data.result.songs.length > 0) {
                    const songs = response.data.result.songs;
                    
                    let bestMatch = null;
                    let bestScore = 0;
                    
                    for (const song of songs) {
                        const songName = song.name || '';
                        const songArtists = song.artists || [];
                        const artistNames = songArtists.map(a => a.name).join('');
                        const albumName = song.album ? song.album.name : '';
                        
                        let score = 0;
                        
                        if (artistNames === artist) {
                            score += 10;
                        } else if (artistNames.includes(artist) && !artistNames.match(/[-\.\,、，。]/)) {
                            score += 5;
                        } else if (artistNames.includes(artist)) {
                            score += 3;
                        }
                        
                        if (songName === title) {
                            score += 10;
                        } else if (songName.replace(/\(.*?\)|（.*?）|\[.*?\]/g, '').trim() === title) {
                            score += 8;
                        } else if (songName.includes(title)) {
                            score += 5;
                        }
                        
                        if (!albumName.match(/[-\.\,、，。]/) && albumName.length > 0) {
                            score += 2;
                        }
                        
                        if (songArtists.length === 1) {
                            score += 2;
                        }
                        
                        if (score > bestScore) {
                            bestScore = score;
                            bestMatch = song;
                        }
                    }
                    
                    if (bestMatch && bestScore >= 10) {
                        const songId = bestMatch.id;
                        const lyricResponse = await axios.get(`https://music.163.com/api/song/lyric?id=${songId}&lv=1&kv=1&tv=-1`, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                'Referer': 'https://music.163.com/'
                            },
                            timeout: 10000
                        });

                        const data = lyricResponse.data;
                        if (data.lrc && data.lrc.lyric && data.lrc.lyric.trim().length > 50) {
                            return data.lrc.lyric;
                        }
                        
                        const candidateSongs = songs.filter(song => {
                            const songName = song.name || '';
                            const songArtists = song.artists || [];
                            const artistNames = songArtists.map(a => a.name).join('');
                            const cleanName = songName.replace(/\(.*?\)|（.*?）|\[.*?\]/g, '').trim();
                            return (songName === title || cleanName === title) && 
                                   (artistNames === artist || artistNames.includes(artist));
                        });
                        
                        for (const song of candidateSongs.slice(0, 10)) {
                            if (song.id === songId) continue;
                            try {
                                const lr = await axios.get(`https://music.163.com/api/song/lyric?id=${song.id}&lv=1&kv=1&tv=-1`, {
                                    headers: {
                                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                        'Referer': 'https://music.163.com/'
                                    },
                                    timeout: 8000
                                });
                                if (lr.data.lrc && lr.data.lrc.lyric && lr.data.lrc.lyric.trim().length > 50) {
                                    return lr.data.lrc.lyric;
                                }
                            } catch (e) {}
                        }
                    }
                }
            } catch (e) {
                console.warn(`网易云搜索失败 (${keyword}):`, e.message);
            }
        }
    } catch (e) {
        console.warn('网易云歌词获取失败:', e.message);
    }
    return null;
};

// 使用另一个歌词API作为备选
const fetchAnotherLyrics = async (title, artist) => {
    try {
        const response = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });

        if (response.data && response.data.lyrics) {
            return response.data.lyrics;
        }
    } catch (e) {
        console.warn('lyrics.ovh歌词获取失败:', e.message);
    }
    return null;
};

const fetchQQLyrics = async (title, artist) => {
    try {
        const searchResponse = await axios.get('https://c.y.qq.com/soso/fcgi-bin/client_search_cp', {
            params: {
                w: title + ' ' + artist,
                p: 1,
                n: 20,
                format: 'json'
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://y.qq.com/'
            },
            timeout: 10000
        });

        const list = searchResponse.data.data?.song?.list || [];
        if (list.length === 0) return null;

        let bestMatch = null;
        let bestScore = 0;

        const cleanStr = (s) => (s || '').replace(/[\.\&\、\,，。\s\/\\\-]/g, '').toLowerCase();
        const cleanTitle = cleanStr(title);
        const cleanArtist = cleanStr(artist);

        for (const song of list) {
            const songName = song.songname || '';
            const singerNames = song.singer.map(s => s.name).join('');
            const cleanName = cleanStr(songName.replace(/\(.*?\)|（.*?）|\[.*?\]/g, ''));
            const cleanSinger = cleanStr(singerNames);

            let score = 0;

            if (cleanSinger === cleanArtist && cleanArtist.length > 0) {
                score += 20;
            } else if (cleanSinger.includes(cleanArtist) && cleanArtist.length > 0) {
                score += 15;
            } else if (cleanArtist.includes(cleanSinger) && cleanSinger.length > 0) {
                score += 10;
            }

            if (cleanName === cleanTitle) {
                score += 20;
            } else if (cleanName.includes(cleanTitle) && cleanTitle.length > 0) {
                score += 15;
            } else if (cleanTitle.includes(cleanName) && cleanName.length > 0) {
                score += 10;
            }

            const negativePatterns = ['伴奏', '纯音乐', '翻唱', 'cover', 'dj', 'remix', '现场', 'live', '演唱会'];
            const nameLower = songName.toLowerCase();
            let negativeScore = 0;
            for (const p of negativePatterns) {
                if (nameLower.includes(p)) negativeScore += 30;
            }
            score -= negativeScore;

            if (score > bestScore) {
                bestScore = score;
                bestMatch = song;
            }
        }

        if (!bestMatch || bestScore < 15) return null;

        const songmid = bestMatch.songmid;
        const lyricResponse = await axios.get('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg', {
            params: {
                songmid: songmid,
                format: 'json',
                nobase64: 0
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://y.qq.com/'
            },
            timeout: 10000
        });

        if (lyricResponse.data.lyric) {
            const decoded = Buffer.from(lyricResponse.data.lyric, 'base64').toString('utf-8');
            if (decoded && decoded.trim().length > 50 && !decoded.includes('暂无歌词')) {
                return decoded;
            }
        }
    } catch (e) {
        console.warn('QQ音乐歌词获取失败:', e.message);
    }
    return null;
};

app.listen(port, () => {
    console.log(`音乐API代理服务器运行在 http://localhost:${port}`);
    console.log(`数据源: 无忧音乐网(qeecc.com) / AAX音乐网(aax.cx) -> 酷我音乐`);
});
