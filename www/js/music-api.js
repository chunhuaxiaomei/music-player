/**
 * 音乐API直连模块 - 用于Capacitor APP直接调用第三方音乐平台API
 * 利用Capacitor HTTP绕过浏览器CORS限制
 */

const MusicAPI = (function() {
    'use strict';

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const base64Decode = (str) => {
        try {
            return decodeURIComponent(escape(atob(str)));
        } catch (e) {
            return '';
        }
    };

    let capacitorHttpInstance = null;
    let capacitorInitialized = false;

    const initCapacitorHttp = async () => {
        if (capacitorInitialized) return;
        
        try {
            if (typeof window !== 'undefined' && window.Capacitor) {
                // Try custom CORS plugin first
                if (window.Capacitor.Plugins && window.Capacitor.Plugins.CorsPlugin) {
                    capacitorHttpInstance = window.Capacitor.Plugins.CorsPlugin;
                    console.log('[MusicAPI] Custom CORS plugin found: window.Capacitor.Plugins.CorsPlugin');
                } else if (window.Capacitor.Plugins && window.Capacitor.Plugins.Http) {
                    capacitorHttpInstance = window.Capacitor.Plugins.Http;
                    console.log('[MusicAPI] Capacitor HTTP found: window.Capacitor.Plugins.Http');
                } else if (window.Capacitor.HTTP) {
                    capacitorHttpInstance = window.Capacitor.HTTP;
                    console.log('[MusicAPI] Capacitor HTTP found: window.Capacitor.HTTP');
                } else {
                    console.log('[MusicAPI] Capacitor HTTP not found, checking after delay...');
                    await delay(200);
                    initCapacitorHttp();
                    return;
                }
            }
        } catch (e) {
            console.error('[MusicAPI] Capacitor HTTP init error:', e.message);
        }
        capacitorInitialized = true;
    };

    initCapacitorHttp();

    const isCapacitorEnv = () => {
        return capacitorHttpInstance !== null;
    };

    const getCapacitorHttp = () => {
        return capacitorHttpInstance;
    };

    const CORS_PROXIES = [
        'https://cors-anywhere.herokuapp.com/',
        'https://api.allorigins.win/raw?url=',
        'https://corsproxy.io/?url='
    ];

    const fetchWithProxy = async (url, options = {}, proxyIndex = 0) => {
        if (proxyIndex >= CORS_PROXIES.length) {
            throw new Error('All proxies failed');
        }

        const proxy = CORS_PROXIES[proxyIndex];
        const proxyUrl = proxy.includes('url=') ? proxy + encodeURIComponent(url) : proxy + url;

        try {
            console.log('[MusicAPI] Using proxy', proxyIndex, 'for:', url);
            const response = await fetch(proxyUrl, {
                ...options,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    ...(options.headers || {})
                },
                timeout: 15000
            });

            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }

            return response;
        } catch (e) {
            console.warn('[MusicAPI] Proxy', proxyIndex, 'failed:', e.message);
            return fetchWithProxy(url, options, proxyIndex + 1);
        }
    };

    const fetchJson = async (url, options = {}) => {
        const defaultHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            ...(options.headers || {})
        };

        const capacitorHttp = getCapacitorHttp();
        if (capacitorHttp) {
            try {
                console.log('[MusicAPI] Using Capacitor HTTP for:', url);
                const response = await capacitorHttp.request({
                    url: url,
                    method: options.method || 'GET',
                    headers: defaultHeaders,
                    data: options.body ? JSON.parse(options.body) : undefined
                });
                const result = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
                console.log('[MusicAPI] Capacitor HTTP success:', url, 'status:', response.status);
                return result;
            } catch (e) {
                console.error('[MusicAPI] Capacitor HTTP failed:', url, e.message);
                // Don't fall through, throw so caller knows the real error
                throw new Error(`Capacitor HTTP failed: ${e.message}`);
            }
        }

        try {
            console.log('[MusicAPI] Trying native fetch for:', url);
            const response = await fetch(url, {
                ...options,
                headers: defaultHeaders,
                timeout: 10000
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            
            return response.json();
        } catch (e) {
            console.warn('[MusicAPI] Native fetch failed, trying CORS proxy:', e.message);
            const response = await fetchWithProxy(url, options);
            return response.json();
        }
    };

    const fetchText = async (url, options = {}) => {
        const defaultHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            ...(options.headers || {})
        };

        const capacitorHttp = getCapacitorHttp();
        if (capacitorHttp) {
            try {
                console.log('[MusicAPI] Using Capacitor HTTP (text) for:', url);
                const response = await capacitorHttp.request({
                    url: url,
                    method: options.method || 'GET',
                    headers: defaultHeaders,
                    data: options.body ? JSON.parse(options.body) : undefined,
                    responseType: 'text'
                });
                const result = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
                console.log('[MusicAPI] Capacitor HTTP (text) success:', url);
                return result;
            } catch (e) {
                console.error('[MusicAPI] Capacitor HTTP (text) failed:', url, e.message);
            }
        }

        try {
            console.log('[MusicAPI] Trying native fetch (text) for:', url);
            const response = await fetch(url, {
                ...options,
                headers: defaultHeaders,
                timeout: 10000
            });

            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }

            return response.text();
        } catch (e) {
            console.warn('[MusicAPI] Native fetch (text) failed, trying CORS proxy:', e.message);
            const response = await fetchWithProxy(url, options);
            return response.text();
        }
    };

    // ========== 歌曲评分 ==========
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

        if (isArtistMatch) score += 200;

        const keywordParts = keywordLower.split(/[\s\+]+/).filter(p => p.length > 0);
        let titleMatchScore = 0;
        for (const part of keywordParts) {
            if (nameLower.includes(part)) titleMatchScore += 30;
        }
        score += titleMatchScore;

        if (nameLower === keywordLower || keywordLower.includes(nameLower)) score += 50;

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
            if (nameLower.includes(item.pattern)) negativeScore += item.penalty;
        }
        score -= negativeScore;
        if (negativeScore === 0) score += 50;

        if (name.match(/[\(\)（）【】\[\]]/)) score -= 15;

        if (song.album && song.album.length > 0 &&
            !song.album.includes('精选') && !song.album.includes('合辑') &&
            !song.album.includes('合集') && !song.album.includes('DJ') &&
            !song.album.includes('翻唱') && !song.album.includes('演唱会') &&
            !song.album.includes('现场')) {
            score += 20;
        }

        if (song.duration && song.duration > 120000) score += 5;

        return score;
    };

    // ========== QQ音乐 ==========
    const searchQQMusic = async (keyword, page = 1, limit = 30) => {
        try {
            const data = await fetchJson(
                `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${encodeURIComponent(keyword)}&p=${page}&n=${limit}&format=json`,
                { headers: { 'Referer': 'https://y.qq.com/' } }
            );

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
                req: { module: 'CDN.SrfCdnDispatchServer', method: 'GetCdnDispatch', param: { guid: '0', calltype: 0, userip: '' } },
                req_0: { module: 'vkey.GetVkeyServer', method: 'CgiGetVkey', param: { guid: '0', songmid: [songmid], songtype: [0], uin: '0', loginflag: 1, platform: '20', h5to: 'speed' } },
                comm: { uin: 0, format: 'json', ct: 24, cv: 0 }
            });

            const result = await fetchJson(
                `https://u.y.qq.com/cgi-bin/musicu.fcg?-=getplaysongvkey&g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0&data=${encodeURIComponent(data)}`,
                { headers: { 'Referer': 'https://y.qq.com/' } }
            );

            const info = result.req_0?.data;
            if (info && info.midurlinfo && info.midurlinfo.length > 0) {
                const item = info.midurlinfo[0];
                if (item.purl) {
                    const sip = info.sip || ['http://dl.stream.qqmusic.qq.com/'];
                    return sip[0] + item.purl;
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
            const data = await fetchJson(
                `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=${limit}&format=json`,
                { headers: { 'Referer': 'https://www.kugou.com/' } }
            );

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
            const data = await fetchJson(
                `https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=${hash}&from=mkugou`,
                { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)', 'Referer': 'https://m.kugou.com/' } }
            );
            if (data.url) return data.url;
        } catch (e) {
            console.warn('酷狗音乐播放链接获取失败:', e.message);
        }
        return null;
    };

    // ========== 网易云音乐 ==========
    const searchNeteaseMusic = async (keyword) => {
        try {
            const data = await fetchJson(
                `https://music.163.com/api/search/get/web?s=${encodeURIComponent(keyword)}&type=1&limit=100`,
                { headers: { 'Referer': 'https://music.163.com/' } }
            );

            const songs = [];
            if (data.result && data.result.songs) {
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

    const getNeteasePlayUrl = async (songId) => {
        try {
            const data = await fetchJson(
                `https://music.163.com/api/song/enhance/player/url?id=${songId}&ids=[${songId}]&br=320000`,
                { headers: { 'Referer': 'https://music.163.com/', 'Cookie': 'appver=1.5.2; os=osx; osver=10.15.7; appversion=2.7.1.16' } }
            );
            if (data.data && data.data.length > 0 && data.data[0].url && data.data[0].code === 200) {
                return data.data[0].url;
            }
        } catch (e) {
            console.warn('网易云音乐播放链接获取失败:', e.message);
        }
        return null;
    };

    // ========== 酷我音乐 ==========
    const KUWO_SEARCH_API = 'http://search.kuwo.cn/r.s';
    const KUWO_PLAY_API = 'http://antiserver.kuwo.cn/anti.s';

    const searchKuwoMusic = async (keyword, page = 1, limit = 100) => {
        try {
            const pn = (page - 1) * limit;
            const text = await fetchText(
                `${KUWO_SEARCH_API}?all=${encodeURIComponent(keyword)}&ft=music&itemset=web_2013&client=kt&pn=${pn}&rn=${limit}&rformat=json&encoding=utf8`,
                { headers: { 'Referer': 'https://www.kuwo.cn/' } }
            );

            let rawData = text.replace(/'/g, '"').replace(/&nbsp;/g, ' ').replace(/\\\\u0026/g, '&');
            const data = JSON.parse(rawData);
            const songs = [];

            if (data.abslist) {
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

    const getKuwoPlayUrl = async (songId) => {
        try {
            const url = await fetchText(
                `${KUWO_PLAY_API}?type=convert_url&rid=MUSIC_${songId}&format=mp3&response=url`,
                { headers: { 'Referer': 'https://www.kuwo.cn/' } }
            );
            if (url && url.trim().startsWith('http')) return url.trim();
        } catch (e) {
            console.warn('酷我antiserver获取失败:', e.message);
        }

        try {
            const url = await fetchText(
                `${KUWO_PLAY_API}?type=convert_url&rid=MUSIC_${songId}&format=mp3&br=320kmp3&response=url`,
                { headers: { 'Referer': 'https://www.kuwo.cn/' } }
            );
            if (url && url.trim().startsWith('http')) return url.trim();
        } catch (e) {
            console.warn('酷我320k获取失败:', e.message);
        }
        return null;
    };

    // ========== 搜索整合 ==========
    const search = async (keyword) => {
        const [kuwoSongs, neteaseSongs, qqSongs, kugouSongs] = await Promise.all([
            searchAllKuwoMusic(keyword),
            searchNeteaseMusic(keyword),
            searchQQMusic(keyword, 1, 30),
            searchKugouMusic(keyword, 1, 30)
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

        allSongs.sort((a, b) => calculateSongScore(b, keyword) - calculateSongScore(a, keyword));

        return {
            code: 200,
            message: '搜索成功',
            data: allSongs,
            total: allSongs.length
        };
    };

    // ========== 播放链接获取 ==========
    const getPlayUrl = async (id, title, artist, source) => {
        let playUrl = '';

        if (source === 'qq' && id) {
            playUrl = await getQQPlayUrl(id);
        }
        if (!playUrl && source === 'netease' && id) {
            playUrl = await getNeteasePlayUrl(id);
        }
        if (!playUrl && source === 'kugou' && id) {
            playUrl = await getKugouPlayUrl(id);
        }
        if (!playUrl && (source === 'kuwo' || !source)) {
            playUrl = await getKuwoPlayUrl(id);
        }

        if (!playUrl && title) {
            const searchKeyword = title + (artist ? ' ' + artist : '');
            const fallbacks = [
                { search: searchQQMusic, play: getQQPlayUrl, name: 'qq' },
                { search: searchNeteaseMusic, play: getNeteasePlayUrl, name: 'netease' },
                { search: searchKugouMusic, play: getKugouPlayUrl, name: 'kugou' },
                { search: (kw, p, l) => searchKuwoMusic(kw, p, l), play: getKuwoPlayUrl, name: 'kuwo' }
            ];

            for (const fb of fallbacks) {
                if (source === fb.name) continue;
                try {
                    const songs = await fb.search(searchKeyword, 1, 10);
                    if (songs && songs.length > 0) {
                        const url = await fb.play(songs[0].id);
                        if (url) {
                            playUrl = url;
                            break;
                        }
                    }
                } catch (e) {}
            }
        }

        if (!playUrl) {
            return { code: 404, message: '未找到播放链接' };
        }

        return {
            code: 200,
            message: '获取成功',
            url: playUrl,
            title: title,
            artist: artist,
            duration: 0
        };
    };

    // ========== 歌词获取 ==========
    const fetchQQLyrics = async (title, artist) => {
        try {
            const searchData = await fetchJson(
                `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${encodeURIComponent(title + ' ' + artist)}&p=1&n=20&format=json`,
                { headers: { 'Referer': 'https://y.qq.com/' } }
            );

            const list = searchData.data?.song?.list || [];
            if (list.length === 0) return null;

            const cleanStr = (s) => (s || '').replace(/[\.\&\、\,，。\s\/\\\-]/g, '').toLowerCase();
            const cleanTitle = cleanStr(title);
            const cleanArtist = cleanStr(artist);

            let bestMatch = null;
            let bestScore = 0;

            for (const song of list) {
                const songName = song.songname || '';
                const singerNames = song.singer.map(s => s.name).join('');
                const cleanName = cleanStr(songName.replace(/\(.*?\)|（.*?）|\[.*?\]/g, ''));
                const cleanSinger = cleanStr(singerNames);

                let score = 0;
                if (cleanSinger === cleanArtist && cleanArtist.length > 0) score += 20;
                else if (cleanSinger.includes(cleanArtist) && cleanArtist.length > 0) score += 15;

                if (cleanName === cleanTitle) score += 20;
                else if (cleanName.includes(cleanTitle) && cleanTitle.length > 0) score += 15;

                const negativePatterns = ['伴奏', '纯音乐', '翻唱', 'cover', 'dj', 'remix', '现场', 'live', '演唱会'];
                const nameLower = songName.toLowerCase();
                for (const p of negativePatterns) {
                    if (nameLower.includes(p)) score -= 30;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = song;
                }
            }

            if (!bestMatch || bestScore < 15) return null;

            const lyricData = await fetchJson(
                `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${bestMatch.songmid}&format=json&nobase64=0`,
                { headers: { 'Referer': 'https://y.qq.com/' } }
            );

            if (lyricData.lyric) {
                const decoded = base64Decode(lyricData.lyric);
                if (decoded && decoded.trim().length > 50 && !decoded.includes('暂无歌词')) {
                    return decoded;
                }
            }
        } catch (e) {
            console.warn('QQ音乐歌词获取失败:', e.message);
        }
        return null;
    };

    const fetchQQLyricsById = async (songmid) => {
        try {
            const lyricData = await fetchJson(
                `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${songmid}&format=json&nobase64=0`,
                { headers: { 'Referer': 'https://y.qq.com/' } }
            );
            if (lyricData.lyric) {
                const decoded = base64Decode(lyricData.lyric);
                if (decoded && decoded.trim().length > 50) return decoded;
            }
        } catch (e) {
            console.warn('QQ音乐歌词(ID)获取失败:', e.message);
        }
        return null;
    };

    const fetchNeteaseLyrics = async (title, artist) => {
        try {
            const searchKeywords = [title + ' ' + artist, title];
            for (const keyword of searchKeywords) {
                const data = await fetchJson(
                    `https://music.163.com/api/search/get/web?s=${encodeURIComponent(keyword)}&type=1&limit=50`,
                    { headers: { 'Referer': 'https://music.163.com/' } }
                );

                if (data.result && data.result.songs && data.result.songs.length > 0) {
                    const song = data.result.songs[0];
                    const lyricData = await fetchJson(
                        `https://music.163.com/api/song/lyric?id=${song.id}&lv=1&kv=1&tv=-1`,
                        { headers: { 'Referer': 'https://music.163.com/' } }
                    );
                    if (lyricData.lrc && lyricData.lrc.lyric && lyricData.lrc.lyric.trim().length > 50) {
                        return lyricData.lrc.lyric;
                    }
                }
            }
        } catch (e) {
            console.warn('网易云歌词获取失败:', e.message);
        }
        return null;
    };

    const fetchNeteaseLyricsById = async (songId) => {
        try {
            const data = await fetchJson(
                `https://music.163.com/api/song/lyric?id=${songId}&lv=1&kv=1&tv=-1`,
                { headers: { 'Referer': 'https://music.163.com/' } }
            );
            if (data.lrc && data.lrc.lyric && data.lrc.lyric.trim().length > 50) {
                return data.lrc.lyric;
            }
        } catch (e) {
            console.warn('网易云歌词(ID)获取失败:', e.message);
        }
        return null;
    };

    const fetchKuwoLyrics = async (title, artist, songId) => {
        try {
            if (!songId) {
                const text = await fetchText(
                    `${KUWO_SEARCH_API}?all=${encodeURIComponent(title + ' ' + artist)}&ft=music&itemset=web_2013&client=kt&pn=0&rn=20&rformat=json&encoding=utf8`,
                    { headers: { 'Referer': 'https://www.kuwo.cn/' } }
                );
                let rawData = text.replace(/'/g, '"').replace(/&nbsp;/g, ' ').replace(/\\\\u0026/g, '&');
                const data = JSON.parse(rawData);

                if (data.abslist && data.abslist.length > 0) {
                    const item = data.abslist[0];
                    const musicRid = item.MUSICRID || '';
                    songId = musicRid.replace('MUSIC_', '') || item.DC_TARGETID || '';
                }
            }

            if (songId) {
                const data = await fetchJson(
                    `https://www.kuwo.cn/api/www/music/lyric?mid=${songId}`,
                    { headers: { 'Referer': 'https://www.kuwo.cn/' } }
                );
                if (data.data && data.data.lyric) {
                    return data.data.lyric;
                }
            }
        } catch (e) {
            console.warn('酷我歌词获取失败:', e.message);
        }
        return null;
    };

    const fetchKuwoLyricsById = async (songId) => {
        try {
            const data = await fetchJson(
                `https://www.kuwo.cn/api/www/music/lyric?mid=${songId}`,
                { headers: { 'Referer': 'https://www.kuwo.cn/' } }
            );
            if (data.data && data.data.lyric) return data.data.lyric;
        } catch (e) {
            console.warn('酷我歌词(ID)获取失败:', e.message);
        }
        return null;
    };

    const fetchKugouLyrics = async (title, artist) => {
        try {
            const searchData = await fetchJson(
                `https://api.kugou.com/v3/search/lyric?keyword=${encodeURIComponent(title + ' ' + artist)}&page=1&pagesize=5&format=json`,
                { headers: { 'Referer': 'https://m.kugou.com/' } }
            );

            const list = searchData.data?.lists || [];
            if (list.length === 0) return null;

            const item = list[0];
            const lyricData = await fetchJson(
                `https://api.kugou.com/v3/lyric/single?id=${item.id}&format=json`,
                { headers: { 'Referer': 'https://m.kugou.com/' } }
            );

            if (lyricData.data && lyricData.data.content) {
                const decoded = base64Decode(lyricData.data.content);
                if (decoded && decoded.trim().length > 50) return decoded;
            }
        } catch (e) {
            console.warn('酷狗歌词搜索失败:', e.message);
        }
        return null;
    };

    const fetchKugouLyricsById = async (hash) => {
        try {
            const infoData = await fetchJson(
                `https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=${hash}`,
                { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_0 like Mac OS X)', 'Referer': 'https://m.kugou.com/' } }
            );

            const albumId = infoData?.album_id;
            if (albumId) {
                const lyricData = await fetchJson(
                    `https://api.kugou.com/php/index.php?r=lr2/get&hash=${hash}&album_id=${albumId}&fmt=lrc`,
                    { headers: { 'Referer': 'https://m.kugou.com/' } }
                );
                if (lyricData.content) {
                    const decoded = base64Decode(lyricData.content);
                    if (decoded && decoded.trim().length > 50) return decoded;
                }
            }
        } catch (e) {
            console.warn('酷狗歌词(ID)获取失败:', e.message);
        }
        return null;
    };

    const fetchAnotherLyrics = async (title, artist) => {
        try {
            const data = await fetchJson(
                `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
                {}
            );
            if (data.lyrics) return data.lyrics;
        } catch (e) {
            console.warn('lyrics.ovh歌词获取失败:', e.message);
        }
        return null;
    };

    const getLyrics = async (title, artist, songId, source) => {
        if (source === 'qq' && songId) {
            const lyrics = await fetchQQLyricsById(songId);
            if (lyrics) return { code: 200, message: '获取成功', lyrics };
        }
        if (source === 'netease' && songId) {
            const lyrics = await fetchNeteaseLyricsById(songId);
            if (lyrics) return { code: 200, message: '获取成功', lyrics };
        }
        if (source === 'kugou' && songId) {
            const lyrics = await fetchKugouLyricsById(songId);
            if (lyrics) return { code: 200, message: '获取成功', lyrics };
        }
        if (source === 'kuwo' && songId) {
            const lyrics = await fetchKuwoLyricsById(songId);
            if (lyrics) return { code: 200, message: '获取成功', lyrics };
        }

        const searchVariants = [
            { title, artist },
            { title, artist: '' },
            { title: title.replace(/\(.*?\)|（.*?）/g, '').trim(), artist },
            { title, artist: artist.replace(/乐团|乐队|组合/g, '').trim() }
        ];

        for (const variant of searchVariants) {
            const qqLyrics = await fetchQQLyrics(variant.title, variant.artist);
            if (qqLyrics) return { code: 200, message: '获取成功', lyrics: qqLyrics };

            const neteaseLyrics = await fetchNeteaseLyrics(variant.title, variant.artist);
            if (neteaseLyrics) return { code: 200, message: '获取成功', lyrics: neteaseLyrics };
        }

        const kuwoLyrics = await fetchKuwoLyrics(title, artist, songId);
        if (kuwoLyrics) return { code: 200, message: '获取成功', lyrics: kuwoLyrics };

        const kugouLyrics = await fetchKugouLyrics(title, artist);
        if (kugouLyrics) return { code: 200, message: '获取成功', lyrics: kugouLyrics };

        const anotherLyrics = await fetchAnotherLyrics(title, artist);
        if (anotherLyrics) return { code: 200, message: '获取成功', lyrics: anotherLyrics };

        return { code: 404, message: '未找到歌词', lyrics: '' };
    };

    // ========== 对外暴露 ==========
    return {
        search,
        getPlayUrl,
        getLyrics,
        calculateSongScore
    };
})();

// 全局暴露
window.MusicAPI = MusicAPI;
