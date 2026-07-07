const MusicPlayer = (function() {
    const audio = document.getElementById('audio-player');
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const searchResults = document.getElementById('search-results');
    const resultsList = document.getElementById('results-list');
    const resultCount = document.getElementById('result-count');
    const emptyState = document.getElementById('empty-state');
    const themeToggle = document.getElementById('theme-toggle');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const settingsOverlay = document.getElementById('settings-overlay');
    const closeSettingsBtn = document.getElementById('close-settings');
    const apiBaseInput = document.getElementById('api-base-input');
    const saveSettingsBtn = document.getElementById('save-settings');
    const toast = document.getElementById('toast');
    
    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const progressBar = document.getElementById('progress-bar');
    const progressFill = document.getElementById('progress-fill');
    const progressThumb = document.getElementById('progress-thumb');
    const volumeBar = document.getElementById('volume-bar');
    const volumeFill = document.getElementById('volume-fill');
    const volumeToggle = document.getElementById('volume-toggle');
    const currentTime = document.getElementById('current-time');
    const totalTime = document.getElementById('total-time');
    const currentSong = document.getElementById('current-song');
    const currentArtist = document.getElementById('current-artist');
    
    const lyricsPanel = document.getElementById('lyrics-panel');
    const closeLyricsBtn = document.getElementById('close-lyrics');
    const lyricsSong = document.getElementById('lyrics-song');
    const lyricsArtist = document.getElementById('lyrics-artist');
    const lyricsList = document.getElementById('lyrics-list');
    const lyricsScroll = document.getElementById('lyrics-scroll');
    const lyricsDragHandle = document.querySelector('.lyrics-drag-handle');
    
    const downloadPanel = document.getElementById('download-panel');
    const closeDownloadBtn = document.getElementById('close-download');
    const downloadOverlay = document.getElementById('download-overlay');
    const downloadTitle = document.getElementById('download-title');
    const downloadArtist = document.getElementById('download-artist');
    const downloadLinks = document.getElementById('download-links');
    
    const playlistPanel = document.getElementById('playlist-panel');
    const playlistOverlay = document.getElementById('playlist-overlay');
    const closePlaylistBtn = document.getElementById('close-playlist');
    const clearPlaylistBtn = document.getElementById('clear-playlist');
    const playlistList = document.getElementById('playlist-list');
    const playlistCount = document.getElementById('playlist-count');
    const playlistEmpty = document.getElementById('playlist-empty');
    const playlistScroll = document.getElementById('playlist-scroll');
    const playModeBtn = document.getElementById('play-mode-btn');
    const playlistBtn = document.getElementById('playlist-btn');
    
    let songList = [];
    let currentIndex = -1;
    let isDragging = false;
    let isMuted = false;
    let isUserScrolling = false;
    let scrollTimeout = null;
    let previousVolume = 0.7;
    let currentLyrics = [];
    let currentApi = null;
    let playlist = [];
    let playlistCurrentIndex = -1;
    let playMode = 'list'; // list: 列表循环, single: 单曲循环, random: 随机播放
    
    const formatTime = (time) => {
        const seconds = time > 60000 ? time / 1000 : time;
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    
    const showToast = (message, duration = 3000) => {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), duration);
    };
    
    const loadTheme = () => {
        const savedTheme = localStorage.getItem('music-player-theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        themeToggle.querySelector('.material-icons').textContent = savedTheme === 'dark' ? 'light_mode' : 'dark_mode';
    };
    
    const toggleTheme = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('music-player-theme', newTheme);
        themeToggle.querySelector('.material-icons').textContent = newTheme === 'dark' ? 'light_mode' : 'dark_mode';
    };
    
    const CORS_PROXIES = [
        'https://api.allorigins.win/raw?url=',
        'https://cors-anywhere.herokuapp.com/',
        'https://cors-proxy.fringe.zone/',
        'https://corsproxy.io/?url='
    ];
    
    const fetchWithProxy = async (url, proxyIndex = 0) => {
        if (proxyIndex >= CORS_PROXIES.length) {
            throw new Error('All proxies failed');
        }
        
        const proxyUrl = CORS_PROXIES[proxyIndex] + encodeURIComponent(url);
        
        try {
            const response = await fetch(proxyUrl, {
                timeout: 10000,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.warn(`Proxy ${proxyIndex} failed:`, error.message);
            return fetchWithProxy(url, proxyIndex + 1);
        }
    };
    
    const isCapacitor = () => {
        return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    };
    
    const useDirectApi = () => {
        return isCapacitor() || localStorage.getItem('use_direct_api') === 'true';
    };

    const getApiBase = () => {
        const saved = localStorage.getItem('music_api_base');
        if (saved) return saved;
        if (window.MUSIC_API_BASE) return window.MUSIC_API_BASE;
        if (window.location.protocol === 'http:' || window.location.protocol === 'https:') return '';
        return 'http://localhost:3001';
    };

    let GEQUBAO_PROXY = getApiBase();
    
    const postJson = async (url, data) => {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        return response;
    };
    
    const fetchMusic = async (keyword) => {
        if (!keyword.trim()) {
            showToast('请输入搜索关键词');
            return;
        }

        resultsList.innerHTML = '<div class="loading"></div>';
        searchResults.classList.add('show');
        emptyState.style.display = 'none';

        if (useDirectApi() && window.MusicAPI) {
            try {
                const result = await window.MusicAPI.search(keyword);
                if (result && result.code === 200 && result.data && result.data.length > 0) {
                    const uniqueSongs = [];
                    const seenIds = new Set();
                    for (const song of result.data) {
                        const key = `${song.name}|${song.artist}`;
                        if (!seenIds.has(key)) {
                            seenIds.add(key);
                            uniqueSongs.push(song);
                        }
                    }
                    allSongs = uniqueSongs;
                    resultCount.textContent = `${allSongs.length} 首歌曲`;
                    renderSearchResults(allSongs);
                    showToast(`找到 ${allSongs.length} 首歌曲`);
                    return;
                }
            } catch (e) {
                console.warn('直连API搜索失败，回退到代理:', e.message);
            }
        }

        const apis = [
            {
                name: '无忧音乐',
                endpoint: `${GEQUBAO_PROXY}/kuwo-search`,
                parse: (data) => {
                    if (data && data.code === 200 && data.data && data.data.length > 0) {
                        return data.data.map(item => ({
                            id: item.id,
                            name: item.name || '未知歌曲',
                            artist: item.artist || '未知歌手',
                            album: item.album || '未知专辑',
                            duration: item.duration || 0,
                            source: item.source || 'kuwo'
                        }));
                    }
                    return null;
                }
            },
            {
                name: '歌曲宝',
                endpoint: `${GEQUBAO_PROXY}/search`,
                parse: (data) => {
                    if (data && data.code === 200 && data.data && data.data.length > 0) {
                        return data.data.map(item => ({
                            id: item.id,
                            name: item.name || '未知歌曲',
                            artist: item.artist || '未知歌手',
                            album: item.album || '未知专辑',
                            duration: 0,
                            source: 'gequbao'
                        }));
                    }
                    return null;
                }
            }
        ];
        
        let allSongs = [];
        
        for (let i = 0; i < apis.length; i++) {
            try {
                const response = await postJson(apis[i].endpoint, { q: keyword });
                
                if (!response.ok) {
                    console.warn(`API ${apis[i].name} returned status ${response.status}`);
                    continue;
                }
                
                const data = await response.json();
                const parsedData = apis[i].parse(data);
                
                if (parsedData && parsedData.length > 0) {
                    allSongs = allSongs.concat(parsedData);
                }
            } catch (error) {
                console.error(`API ${apis[i].name} failed:`, error);
                continue;
            }
        }
        
        if (allSongs.length > 0) {
            songList = allSongs;
            renderResults();
            showToast(`找到 ${songList.length} 首歌曲`);
        } else {
            const isFileProtocol = window.location.protocol === 'file:';
            const errorMsg = isFileProtocol 
                ? '请通过 http://localhost:3001/index.html 访问页面'
                : '搜索失败，请稍后重试';
            resultsList.innerHTML = `<div class="empty-state" style="height: auto; padding: 40px;"><p>${errorMsg}</p></div>`;
            resultCount.textContent = '0 首';
            showToast(isFileProtocol ? '请使用 http://localhost:3001 访问' : '搜索失败，请检查网络连接');
        }
    };
    
    const getMockSongs = (keyword) => {
        const audioUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
        
        const mockDatabase = [
            { name: '晴天', artist: '周杰伦', album: '叶惠美' },
            { name: '稻香', artist: '周杰伦', album: '魔杰座' },
            { name: '七里香', artist: '周杰伦', album: '七里香' },
            { name: '夜曲', artist: '周杰伦', album: '十一月的萧邦' },
            { name: '告白气球', artist: '周杰伦', album: '周杰伦的床边故事' },
            { name: '青花瓷', artist: '周杰伦', album: '我很忙' },
            { name: '菊花台', artist: '周杰伦', album: '依然范特西' },
            { name: '东风破', artist: '周杰伦', album: '叶惠美' },
            { name: '简单爱', artist: '周杰伦', album: '范特西' },
            { name: '双截棍', artist: '周杰伦', album: '范特西' },
            { name: '发如雪', artist: '周杰伦', album: '十一月的萧邦' },
            { name: '千里之外', artist: '周杰伦/费玉清', album: '依然范特西' },
            { name: '红尘客栈', artist: '周杰伦', album: '十二新作' },
            { name: '烟花易冷', artist: '周杰伦', album: '跨时代' },
            { name: '兰亭序', artist: '周杰伦', album: '魔杰座' },
            { name: '彩虹', artist: '周杰伦', album: '我很忙' },
            { name: '不能说的秘密', artist: '周杰伦', album: '不能说的秘密' },
            { name: '半岛铁盒', artist: '周杰伦', album: '八度空间' },
            { name: '回到过去', artist: '周杰伦', album: '八度空间' },
            { name: '蜗牛', artist: '周杰伦', album: '范特西Plus' },
            { name: '演员', artist: '薛之谦', album: '绅士' },
            { name: '刚刚好', artist: '薛之谦', album: '刚刚好' },
            { name: '丑八怪', artist: '薛之谦', album: '丑八怪' },
            { name: '暧昧', artist: '薛之谦', album: '暧昧' },
            { name: '绅士', artist: '薛之谦', album: '绅士' },
            { name: '一半', artist: '薛之谦', album: '一半' },
            { name: '意外', artist: '薛之谦', album: '意外' },
            { name: '怪咖', artist: '薛之谦', album: '怪咖' },
            { name: '天份', artist: '薛之谦', album: '天份' },
            { name: '笑场', artist: '薛之谦', album: '笑场' },
            { name: '有何不可', artist: '许嵩', album: '自定义' },
            { name: '清明雨上', artist: '许嵩', album: '自定义' },
            { name: '素颜', artist: '许嵩/何曼婷', album: '素颜' },
            { name: '玫瑰花的葬礼', artist: '许嵩', album: 'Vae' },
            { name: '灰色头像', artist: '许嵩', album: '寻雾启示' },
            { name: '断桥残雪', artist: '许嵩', album: '断桥残雪' },
            { name: '城府', artist: '许嵩', album: '自定义' },
            { name: '庐州月', artist: '许嵩', album: '寻雾启示' },
            { name: '幻听', artist: '许嵩', album: '梦游计' },
            { name: '雅俗共赏', artist: '许嵩', album: '青年晚报' },
            { name: '千百度', artist: '许嵩', album: '苏格拉没有底' },
            { name: '半城烟沙', artist: '许嵩', album: '半城烟沙' },
            { name: '叹服', artist: '许嵩', album: '寻雾启示' },
            { name: '多余的解释', artist: '许嵩', album: '自定义' },
            { name: '如果当时', artist: '许嵩', album: '自定义' },
            { name: '成都', artist: '赵雷', album: '无法长大' },
            { name: '南方姑娘', artist: '赵雷', album: '赵小雷' },
            { name: '画', artist: '赵雷', album: '赵小雷' },
            { name: '理想', artist: '赵雷', album: '无法长大' },
            { name: '少年锦时', artist: '赵雷', album: '吉姆餐厅' },
            { name: '平凡之路', artist: '朴树', album: '猎户星座' },
            { name: '那些花儿', artist: '朴树', album: '我去2000年' },
            { name: '生如夏花', artist: '朴树', album: '生如夏花' },
            { name: '白桦林', artist: '朴树', album: '我去2000年' },
            { name: 'New Boy', artist: '朴树', album: '我去2000年' },
            { name: '体面', artist: '于文文', album: '前任3：再见前任' },
            { name: '后来', artist: '刘若英', album: '我等你' },
            { name: '遇见', artist: '孙燕姿', album: 'The Moment' },
            { name: '漂洋过海来看你', artist: '李宗盛', album: '理性与感性 作品音乐会' },
            { name: '小幸运', artist: '田馥甄', album: '我的少女时代' },
            { name: '凉凉', artist: '张碧晨/杨宗纬', album: '三生三世十里桃花' },
            { name: '追光者', artist: '岑宁儿', album: '夏至未至' },
            { name: '刚好遇见你', artist: '李玉刚', album: '刚好遇见你' },
            { name: '红玫瑰', artist: '陈奕迅', album: '认了吧' },
            { name: '浮夸', artist: '陈奕迅', album: 'U87' },
            { name: '十年', artist: '陈奕迅', album: '黑白灰' },
            { name: '好久不见', artist: '陈奕迅', album: '认了吧' },
            { name: '爱情转移', artist: '陈奕迅', album: '认了吧' },
            { name: '孤勇者', artist: '陈奕迅', album: '孤勇者' },
            { name: '富士山下', artist: '陈奕迅', album: 'What\'s Going On...?' },
            { name: '淘汰', artist: '陈奕迅', album: '认了吧' },
            { name: '单车', artist: '陈奕迅', album: 'Shall We Dance?' },
            { name: 'k歌之王', artist: '陈奕迅', album: '打得火热' },
            { name: '李白', artist: '李荣浩', album: '模特' },
            { name: '模特', artist: '李荣浩', album: '模特' },
            { name: '年少有为', artist: '李荣浩', album: '耳朵' },
            { name: '戒烟', artist: '李荣浩', album: '我是歌手' },
            { name: '老街', artist: '李荣浩', album: '小黄歌' },
            { name: '起风了', artist: '买辣椒也用券', album: '起风了' },
            { name: '晴天', artist: '买辣椒也用券', album: '起风了' },
            { name: '漠河舞厅', artist: '柳爽', album: '漠河舞厅' },
            { name: '星辰大海', artist: '黄霄雲', album: '星辰大海' },
            { name: '大风吹', artist: '刘惜君/王赫野', album: '大风吹' },
            { name: '错位时空', artist: '艾辰', album: '错位时空' },
            { name: '四季予你', artist: '程响', album: '四季予你' },
            { name: '白月光与朱砂痣', artist: '大籽', album: '白月光与朱砂痣' },
            { name: '可可托海的牧羊人', artist: '王琪', album: '可可托海的牧羊人' },
            { name: '世界这么大还是遇见你', artist: '程响', album: '世界这么大还是遇见你' },
            { name: '笑纳', artist: '花僮', album: '笑纳' },
            { name: '你的答案', artist: '阿冗', album: '你的答案' },
            { name: '麻雀', artist: '李荣浩', album: '麻雀' },
            { name: '野狼disco', artist: '宝石Gem', album: '野狼disco' },
            { name: '芒种', artist: '音阙诗听/赵方婧', album: '芒种' },
            { name: '下山', artist: '要不要买菜', album: '下山' },
            { name: '火红的萨日朗', artist: '乌兰托娅', album: '火红的萨日朗' },
            { name: '桥边姑娘', artist: '海伦', album: '桥边姑娘' },
            { name: '听我说谢谢你', artist: '李昕融', album: '听我说谢谢你' },
            { name: '少年', artist: '梦然', album: '少年' },
            { name: '海阔天空', artist: 'Beyond', album: '乐与怒' },
            { name: '光辉岁月', artist: 'Beyond', album: '命运派对' },
            { name: '真的爱你', artist: 'Beyond', album: 'Beyond IV' },
            { name: '不再犹豫', artist: 'Beyond', album: '犹豫' },
            { name: '喜欢你', artist: 'Beyond', album: '秘密警察' },
            { name: '冷雨夜', artist: 'Beyond', album: '现代舞台' },
            { name: '大地', artist: 'Beyond', album: '秘密警察' },
            { name: 'amani', artist: 'Beyond', album: '犹豫' },
            { name: '情人', artist: 'Beyond', album: '乐与怒' },
            { name: '灰色轨迹', artist: 'Beyond', album: '命运派对' },
            { name: 'see you again', artist: 'Wiz Khalifa/Charlie Puth', album: 'Furious 7' },
            { name: 'shape of you', artist: 'Ed Sheeran', album: '÷' },
            { name: 'perfect', artist: 'Ed Sheeran', album: '÷' },
            { name: 'photograph', artist: 'Ed Sheeran', album: '×' },
            { name: 'thinking out loud', artist: 'Ed Sheeran', album: '×' },
            { name: 'blinding lights', artist: 'The Weeknd', album: 'After Hours' },
            { name: 'stay', artist: 'The Kid LAROI/Justin Bieber', album: 'stay' },
            { name: 'bad guy', artist: 'Billie Eilish', album: 'When We All Fall Asleep' },
            { name: 'happier', artist: 'Marshmello/Bastille', album: 'happier' },
            { name: 'closer', artist: 'The Chainsmokers/Halsey', album: 'Collage' },
            { name: 'something just like this', artist: 'The Chainsmokers/Coldplay', album: 'Memories...Do Not Open' },
            { name: 'let me down slowly', artist: 'Alec Benjamin', album: 'let me down slowly' },
            { name: 'monsters', artist: 'Katie Sky', album: 'monsters' },
            { name: 'counting stars', artist: 'OneRepublic', album: 'Native' },
            { name: 'apologize', artist: 'OneRepublic', album: 'Dreaming Out Loud' },
            { name: 'love story', artist: 'Taylor Swift', album: 'Fearless' },
            { name: 'you belong with me', artist: 'Taylor Swift', album: 'Fearless' },
            { name: 'shake it off', artist: 'Taylor Swift', album: '1989' },
            { name: 'blank space', artist: 'Taylor Swift', album: '1989' },
            { name: 'look what you made me do', artist: 'Taylor Swift', album: 'reputation' },
            { name: 'cardigan', artist: 'Taylor Swift', album: 'folklore' },
            { name: 'just the way you are', artist: 'Bruno Mars', album: 'Doo-Wops & Hooligans' },
            { name: 'uptown funk', artist: 'Mark Ronson/Bruno Mars', album: 'Uptown Special' },
            { name: '24k magic', artist: 'Bruno Mars', album: '24K Magic' },
            { name: 'that\'s what i like', artist: 'Bruno Mars', album: '24K Magic' },
            { name: 'marry you', artist: 'Bruno Mars', album: 'Doo-Wops & Hooligans' },
            { name: 'faded', artist: 'Alan Walker', album: 'Different World' },
            { name: 'alone', artist: 'Alan Walker', album: 'Different World' },
            { name: 'the spectre', artist: 'Alan Walker', album: 'Different World' },
            { name: 'on my way', artist: 'Alan Walker', album: 'on my way' },
            { name: 'darkside', artist: 'Alan Walker', album: 'Different World' },
            { name: 'believer', artist: 'Imagine Dragons', album: 'Evolve' },
            { name: 'thunder', artist: 'Imagine Dragons', album: 'Evolve' },
            { name: 'demons', artist: 'Imagine Dragons', album: 'Night Visions' },
            { name: 'radioactive', artist: 'Imagine Dragons', album: 'Night Visions' },
            { name: 'natural', artist: 'Imagine Dragons', album: 'Origins' },
            { name: 'chandelier', artist: 'Sia', album: '1000 Forms of Fear' },
            { name: 'elastic heart', artist: 'Sia', album: '1000 Forms of Fear' },
            { name: 'cheap thrills', artist: 'Sia', album: 'This Is Acting' },
            { name: 'the greatest', artist: 'Sia', album: 'This Is Acting' },
            { name: 'alive', artist: 'Sia', album: 'This Is Acting' },
            { name: 'boom clap', artist: 'Charli XCX', album: 'boom clap' },
            { name: 'call me maybe', artist: 'Carly Rae Jepsen', album: 'Kiss' },
            { name: 'i really like you', artist: 'Carly Rae Jepsen', album: 'Emotion' },
            { name: 'run away with me', artist: 'Carly Rae Jepsen', album: 'Emotion' },
            { name: 'cut to the feeling', artist: 'Carly Rae Jepsen', album: 'cut to the feeling' },
            { name: 'despacito', artist: 'Luis Fonsi/Daddy Yankee', album: 'despacito' },
            { name: 'lean on', artist: 'Major Lazer/DJ Snake/MØ', album: 'Peace Is the Mission' },
            { name: 'sorry', artist: 'Justin Bieber', album: 'Purpose' },
            { name: 'what do you mean?', artist: 'Justin Bieber', album: 'Purpose' },
            { name: 'love yourself', artist: 'Justin Bieber', album: 'Purpose' },
            { name: 'baby', artist: 'Justin Bieber', album: 'My World 2.0' },
            { name: 'yummy', artist: 'Justin Bieber', album: 'Changes' },
            { name: 'peaches', artist: 'Justin Bieber', album: 'Justice' },
            { name: 'hold on', artist: 'Justin Bieber', album: 'Justice' },
            { name: 'anyone', artist: 'Justin Bieber', album: 'Justice' },
            { name: 'lonely', artist: 'Justin Bieber/benny blanco', album: 'Justice' },
            { name: 'dynamite', artist: 'BTS', album: 'dynamite' },
            { name: 'butter', artist: 'BTS', album: 'butter' },
            { name: 'boy with luv', artist: 'BTS/Halsey', album: 'Map of the Soul: Persona' },
            { name: 'dna', artist: 'BTS', album: 'Love Yourself: Her' },
            { name: 'fake love', artist: 'BTS', album: 'Love Yourself: Tear' },
            { name: 'idol', artist: 'BTS', album: 'Love Yourself: Answer' },
            { name: 'mic drop', artist: 'BTS', album: 'Love Yourself: Her' },
            { name: 'spring day', artist: 'BTS', album: 'You Never Walk Alone' },
            { name: 'on', artist: 'BTS', album: 'Map of the Soul: 7' },
            { name: 'life goes on', artist: 'BTS', album: 'BE' }
        ].map(song => ({
            ...song,
            duration: 527,
            preview: audioUrl
        }));
        
        const lowerKeyword = keyword.toLowerCase();
        return mockDatabase.filter(song => 
            song.name.toLowerCase().includes(lowerKeyword) || 
            song.artist.toLowerCase().includes(lowerKeyword)
        ).map(song => ({
            id: song.name + song.artist,
            name: song.name,
            artist: song.artist,
            album: song.album,
            duration: song.duration * 1000,
            preview: song.preview
        }));
    };
    
    const renderResults = () => {
        resultsList.innerHTML = songList.map((song, index) => `
            <div class="song-item ${index === currentIndex ? 'active' : ''}" data-index="${index}">
                <button class="song-play-btn" data-index="${index}">
                    <span class="material-icons">${index === currentIndex && !audio.paused ? 'pause' : 'play_arrow'}</span>
                </button>
                <div class="song-info">
                    <div class="song-title">${escapeHtml(song.name)}</div>
                    <div class="song-artist">${escapeHtml(song.artist)}</div>
                </div>
                <div class="song-actions">
                    <button class="song-add-btn" data-index="${index}" title="加入播放列表">
                        <span class="material-icons">playlist_add</span>
                    </button>
                    ${song.source === 'gequbao' ? `<button class="song-download-btn" data-index="${index}" title="下载">
                        <span class="material-icons">download</span>
                    </button>` : ''}
                </div>
                <div class="song-duration">${formatTime(song.duration)}</div>
            </div>
        `).join('');
        
        resultCount.textContent = `${songList.length} 首`;
        
        document.querySelectorAll('.song-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.song-add-btn') || e.target.closest('.song-download-btn') || e.target.closest('.song-play-btn')) return;
                const index = parseInt(e.currentTarget.dataset.index);
                playSong(index);
            });
        });
        
        document.querySelectorAll('.song-play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(e.currentTarget.dataset.index);
                if (index === currentIndex && !audio.paused) {
                    togglePlayPause();
                } else {
                    playSong(index);
                }
            });
        });
        
        document.querySelectorAll('.song-add-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(e.currentTarget.dataset.index);
                addToPlaylist(index);
            });
        });
        
        document.querySelectorAll('.song-download-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(e.currentTarget.dataset.index);
                downloadSong(index);
            });
        });
    };
    
    const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };
    
    const getPlayUrl = async (song) => {
        if (useDirectApi() && window.MusicAPI) {
            try {
                const result = await window.MusicAPI.getPlayUrl(song.id, song.name, song.artist, song.source);
                if (result && result.code === 200 && result.url) {
                    return result.url;
                }
            } catch (e) {
                console.warn('直连API获取播放链接失败，回退到代理:', e.message);
            }
        }

        try {
            const response = await postJson(`${GEQUBAO_PROXY}/play`, {
                id: song.id,
                title: song.name,
                artist: song.artist,
                source: song.source
            });
            const data = await response.json();
            
            if (data && data.code === 200 && data.url) {
                return data.url;
            }
        } catch (error) {
            console.error('获取播放链接失败:', error);
        }
        
        return null;
    };
    
    const playSong = async (index, fromPlaylist = false) => {
        const list = fromPlaylist ? playlist : songList;
        if (index < 0 || index >= list.length) return;
        
        currentIndex = fromPlaylist ? -1 : index;
        playlistCurrentIndex = fromPlaylist ? index : -1;
        const song = list[index];
        
        try {
            const playUrl = await getPlayUrl(song);
            
            if (!playUrl) {
                showToast('无法播放此歌曲，请选择其他歌曲');
                return;
            }
            
            audio.src = playUrl;
            audio.load();
            audio.play().catch(() => {});
            
            currentSong.textContent = song.name;
            currentArtist.textContent = song.artist;
            
            await loadLyrics(song.name, song.artist, song.id);
            
            updateActiveSong();
            updatePlaylistActive();
        } catch (error) {
            console.error('播放失败:', error);
            showToast('播放失败，请尝试其他歌曲');
        }
    };
    
    const loadLyrics = async (songName, artistName, songId) => {
        lyricsSong.textContent = songName;
        lyricsArtist.textContent = artistName;
        
        const lyrics = await fetchLyrics(songName, artistName, songId);
        currentLyrics = parseLyrics(lyrics);
        renderLyrics();
    };
    
    const fetchLyrics = async (songName, artistName, songId) => {
        let source = '';
        if (playlistCurrentIndex >= 0 && playlist[playlistCurrentIndex]) {
            source = playlist[playlistCurrentIndex].source || '';
        } else if (currentIndex >= 0 && songList[currentIndex]) {
            source = songList[currentIndex].source || '';
        }

        if (useDirectApi() && window.MusicAPI) {
            try {
                const result = await window.MusicAPI.getLyrics(songName, artistName, songId, source);
                if (result && result.code === 200 && result.lyrics) {
                    return result.lyrics;
                }
            } catch (e) {
                console.warn('直连API获取歌词失败，回退到代理:', e.message);
            }
        }

        try {
            const response = await postJson(`${GEQUBAO_PROXY}/lyrics`, {
                title: songName,
                artist: artistName,
                id: songId,
                source: source
            });
            const data = await response.json();
            
            if (data && data.code === 200 && data.lyrics) {
                return data.lyrics;
            }
        } catch (error) {
            console.error('获取歌词失败:', error);
        }
        
        return getMockLyrics(songName);
    };
    
    const getMockLyrics = (songName) => {
        const lyricsMap = {
            '晴天': `[00:00.00]晴天
[00:04.00]词曲：周杰伦
[00:08.00]故事的小黄花
[00:11.00]从出生那年就飘着
[00:14.00]童年的荡秋千
[00:17.00]随记忆一直晃到现在
[00:20.00]Re So So Si Do Si La
[00:23.00]So La Si Si Si Si La Si La So
[00:26.00]吹着前奏望着天空
[00:29.00]我想起花瓣试着掉落
[00:32.00]为你翘课的那一天
[00:35.00]花落的那一天
[00:38.00]教室的那一间
[00:41.00]我怎么看不见
[00:44.00]消失的下雨天
[00:47.00]我好想再淋一遍
[00:50.00]没想到失去的勇气我还留着
[00:55.00]好想再问一遍
[00:58.00]你会等待还是离开
[01:04.00]刮风这天我试过握着你手
[01:10.00]但偏偏雨渐渐大到我看你不见
[01:16.00]还要多久我才能在你身边
[01:22.00]等到放晴的那天也许我会比较好一点
[01:28.00]从前从前有个人爱你很久
[01:34.00]偏偏风渐渐把距离吹得好远
[01:40.00]好不容易又能再多爱一天
[01:46.00]但故事的最后你好像还是说了拜拜
[01:52.00]为你翘课的那一天
[01:55.00]花落的那一天
[01:58.00]教室的那一间
[02:01.00]我怎么看不见
[02:04.00]消失的下雨天
[02:07.00]我好想再淋一遍
[02:10.00]没想到失去的勇气我还留着
[02:15.00]好想再问一遍
[02:18.00]你会等待还是离开
[02:24.00]刮风这天我试过握着你手
[02:30.00]但偏偏雨渐渐大到我看你不见
[02:36.00]还要多久我才能在你身边
[02:42.00]等到放晴的那天也许我会比较好一点
[02:48.00]从前从前有个人爱你很久
[02:54.00]偏偏风渐渐把距离吹得好远
[03:00.00]好不容易又能再多爱一天
[03:06.00]但故事的最后你好像还是说了拜拜
[03:12.00]刮风这天我试过握着你手
[03:18.00]但偏偏雨渐渐大到我看你不见
[03:24.00]还要多久我才能在你身边
[03:30.00]等到放晴的那天也许我会比较好一点
[03:36.00]从前从前有个人爱你很久
[03:42.00]偏偏风渐渐把距离吹得好远
[03:48.00]好不容易又能再多爱一天
[03:54.00]但故事的最后你好像还是说了拜拜`,
            '演员': `[00:00.00]演员
[00:05.00]简单点 说话的方式简单点
[00:11.00]递进的情绪请省略
[00:17.00]你又不是个演员
[00:20.00]别设计那些情节
[00:26.00]没意见 我只想看看你怎么圆
[00:32.00]你难过的太表面 像没天赋的演员
[00:38.00]观众一眼能看见
[00:44.00]该配合你演出的我演视而不见
[00:50.00]在逼一个最爱你的人即兴表演
[00:56.00]什么时候我们开始收起了底线
[01:02.00]顺应时代的改变看那些拙劣的表演
[01:08.00]可你曾经那么爱我干嘛演出细节
[01:14.00]我该变成什么样子才能延缓厌倦
[01:20.00]原来当爱放下防备后的这些那些
[01:26.00]才是考验`,
            '体面': `[00:00.00]体面
[00:05.00]别堆砌怀念让剧情 变得狗血
[00:11.00]深爱了多年又何必 毁了经典
[00:17.00]都已成年不拖不欠
[00:23.00]浪费时间是我情愿
[00:29.00]像谢幕的演员
[00:32.00]眼看着灯光熄灭
[00:38.00]来不及再轰轰烈烈
[00:44.00]就保留告别的尊严
[00:50.00]我爱你不后悔
[00:53.00]也尊重故事结尾
[00:59.00]分手应该体面
[01:02.00]谁都不要说抱歉
[01:08.00]何来亏欠
[01:11.00]我敢给就敢心碎
[01:17.00]镜头前面是从前的我们
[01:23.00]在喝彩 流着泪声嘶力竭`,
            '后来': `[00:00.00]后来
[00:05.00]后来 我总算学会了如何去爱
[00:11.00]可惜你早已远去 消失在人海
[00:17.00]后来 终于在眼泪中明白
[00:23.00]有些人一旦错过就不再
[00:30.00]栀子花 白花瓣
[00:36.00]落在我蓝色百褶裙上
[00:42.00]爱你 你轻声说
[00:48.00]我低下头 闻见一阵芬芳
[00:54.00]那个永恒的夜晚
[01:00.00]十七岁仲夏
[01:06.00]你吻我的那个夜晚
[01:12.00]让我往后的时光
[01:18.00]每当有感叹
[01:24.00]总想起当天的星光`,
            '成都': `[00:00.00]成都
[00:05.00]让我掉下眼泪的 不止昨夜的酒
[00:11.00]让我依依不舍的 不止你的温柔
[00:17.00]余路还要走多久 你攥着我的手
[00:23.00]让我感到为难的 是挣扎的自由
[00:29.00]分别总是在九月 回忆是思念的愁
[00:35.00]深秋嫩绿的垂柳 亲吻着我额头
[00:41.00]在那座阴雨的小城里 我从未忘记你
[00:47.00]成都 带不走的 只有你
[00:53.00]和我在成都的街头走一走 直到所有的灯都熄灭了也不停留
[01:05.00]你会挽着我的衣袖 我会把手揣进裤兜
[01:17.00]走到玉林路的尽头 坐在小酒馆的门口`,
            '平凡之路': `[00:00.00]平凡之路
[00:05.00]我曾经跨过山和大海
[00:11.00]也穿过人山人海
[00:17.00]我曾经拥有着一切
[00:23.00]转眼都飘散如烟
[00:29.00]我曾经失落失望失掉所有方向
[00:35.00]直到看见平凡才是唯一的答案
[00:41.00]我曾经毁了我的一切
[00:47.00]只想永远地离开
[00:53.00]我曾经堕入无边黑暗
[00:59.00]想挣扎无法自拔
[01:05.00]我曾经像你像他像那野草野花
[01:11.00]绝望着 也渴望着 也哭也笑平凡着`,
            '有何不可': `[00:00.00]有何不可
[00:05.00]为你唱这首歌 没有什么风格
[00:11.00]它仅仅代表着 我想给你快乐
[00:17.00]为你解冻冰河 为你做一只扑火的飞蛾
[00:23.00]没有什么事情是不值得
[00:29.00]为你唱这首歌 没有什么风格
[00:35.00]它仅仅代表着 我希望你快乐
[00:41.00]为你辗转反侧 为你放弃世界有何不可
[00:47.00]夏末秋凉里带一点温热 有换季的颜色`,
            '素颜': `[00:00.00]素颜
[00:05.00]又是一个安静的晚上
[00:11.00]一个人窝在摇椅里乘凉
[00:17.00]我承认这样真的很安详
[00:23.00]和楼下老爷爷一样
[00:29.00]听说你还在搞什么原创
[00:35.00]搞来搞去好像也就这样
[00:41.00]不如花点时间想想
[00:47.00]琢磨一下模样
[00:53.00]今夜化了美美的妆
[00:59.00]我相信是很美美的装
[01:05.00]我摇晃在舞池中央
[01:11.00]那种体态可以想象`,
            '清明雨上': `[00:00.00]清明雨上
[00:05.00]窗透初晓 日照西桥 云自摇
[00:11.00]想你当年荷风微摆的衣角
[00:17.00]木雕流金 岁月涟漪 七年前封笔
[00:23.00]因为我今生挥毫只为你
[00:29.00]雨打湿了眼眶 年年倚井盼归堂
[00:35.00]最怕不觉泪已拆两行
[00:41.00]我在人间彷徨 寻不到你的天堂
[00:47.00]东瓶西镜放 恨不能遗忘
[00:53.00]又是清明雨上 折菊寄到你身旁
[00:59.00]把你最爱的歌来轻轻唱`,
            '城府': `[00:00.00]城府
[00:05.00]你走之后 一个夏季熬成一个秋
[00:11.00]我的书上你的正楷眉清目秀
[00:17.00]一字一字宣告我们和平分手
[00:23.00]好委婉的交流 还带一点征求
[00:29.00]你已成风 幻化雨下错了季候
[00:35.00]明媚的眼眸里温柔化为了乌有
[00:41.00]一层一层院墙把你的心困守
[00:47.00]如果没法回头 这样也没不妥`,
            '玫瑰花的葬礼': `[00:00.00]玫瑰花的葬礼
[00:05.00]离开你一百个星期
[00:11.00]我回到了这里
[00:17.00]寻找我们爱过的证据
[00:23.00]没有人愿意提起
[00:29.00]玫瑰花它的过去
[00:35.00]今天这里的主题
[00:41.00]我把它叫作回忆
[00:47.00]我知道 爱情这东西
[00:53.00]它没什么道理
[00:59.00]过去我和你在一起
[01:05.00]是我太叛逆
[01:11.00]现在只剩我自己
[01:17.00]偷偷的想你`,
            '灰色头像': `[00:00.00]灰色头像
[00:05.00]昨夜做了一个梦
[00:11.00]梦里我们回到手牵着手
[00:17.00]醒来的失落 无法言说
[00:23.00]打开了OICQ
[00:29.00]聊天记录停步去年的深秋
[00:35.00]最后的挽留 没有说出口
[00:41.00]我们还是朋友
[00:47.00]是那种最遥远的朋友
[00:53.00]你给过的温柔
[00:59.00]在记录之中 全部都保有`,
            '断桥残雪': `[00:00.00]断桥残雪
[00:05.00]寻不到花的折翼枯叶蝶
[00:11.00]永远也看不见凋谢
[00:17.00]江南夜色下的小桥屋檐
[00:23.00]读不懂塞北的荒野
[00:29.00]梅开时节因寂寞而缠绵
[00:35.00]春归后又很快湮灭
[00:41.00]独留我赏烟花飞满天
[00:47.00]摇曳后就随风飘远`,
            '稻香': `[00:00.00]稻香
[00:05.00]对这个世界如果你有太多的抱怨
[00:11.00]跌倒了就不敢继续往前走
[00:17.00]为什么人要这么的脆弱 堕落
[00:23.00]请你打开电视看看
[00:29.00]多少人为生命在努力勇敢的走下去
[00:35.00]我们是不是该知足
[00:41.00]珍惜一切 就算没有拥有
[00:47.00]还记得你说家是唯一的城堡
[00:53.00]随着稻香河流继续奔跑
[00:59.00]微微笑 小时候的梦我知道`,
            '七里香': `[00:00.00]七里香
[00:05.00]窗外的麻雀在电线杆上多嘴
[00:11.00]你说这一句很有夏天的感觉
[00:17.00]手中的铅笔在纸上来来回回
[00:23.00]我用几行字形容你是我的谁
[00:29.00]秋刀鱼的滋味猫跟你都想了解
[00:35.00]初恋的香味就这样被我们寻回
[00:41.00]那温暖的阳光像刚摘的鲜艳草莓
[00:47.00]你说你舍不得吃掉这一种感觉
[00:53.00]雨下整夜 我的爱溢出就像雨水
[00:59.00]院子落叶 跟我的思念厚厚一叠
[01:05.00]几句是非 也无法将我的热情冷却
[01:11.00]你出现在我诗的每一页
[01:17.00]雨下整夜 我的爱溢出就像雨水
[01:23.00]窗台蝴蝶 像诗里纷飞的美丽章节
[01:29.00]我接着写 把永远爱你写进诗的结尾
[01:35.00]你是我唯一想要的了解
[01:41.00]那饱满的稻穗 幸福了这个季节
[01:47.00]而你的脸颊像田里熟透的蕃茄
[01:53.00]你突然对我说 七里香的名字很美
[01:59.00]我此刻却只想亲吻你倔强的嘴
[02:05.00]雨下整夜 我的爱溢出就像雨水
[02:11.00]院子落叶 跟我的思念厚厚一叠
[02:17.00]几句是非 也无法将我的热情冷却
[02:23.00]你出现在我诗的每一页
[02:29.00]整夜 我的爱溢出就像雨水
[02:35.00]窗台蝴蝶 像诗里纷飞的美丽章节
[02:41.00]我接着写 把永远爱你写进诗的结尾
[02:47.00]你是我唯一想要的了解`,
            '夜曲': `[00:00.00]夜曲
[00:04.00]词曲：周杰伦
[00:08.00]一群嗜血的蚂蚁 被腐肉所吸引
[00:13.00]我面无表情 看孤独的风景
[00:18.00]失去你 爱恨开始分明
[00:23.00]失去你 还有什么事好关心
[00:28.00]当鸽子不再象征和平
[00:33.00]我终于被提醒 广场上喂食的是秃鹰
[00:38.00]我用漂亮的押韵 形容被掠夺一空的爱情
[00:46.00]啊 乌云开始遮蔽 夜色不干净
[00:51.00]公园里 葬礼的回音 在漫天飞行
[00:56.00]送你的白色玫瑰 在纯黑的环境凋零
[01:01.00]乌鸦在树枝上诡异的很安静
[01:06.00]静静听 我黑色的大衣
[01:10.00]想温暖你日渐冰冷的回忆
[01:14.00]走过的走过的生命
[01:17.00]啊 四周弥漫雾气
[01:20.00]我在空旷的墓地
[01:23.00]老去后还爱你
[01:28.00]为你弹奏肖邦的夜曲
[01:33.00]纪念我死去的爱情
[01:38.00]跟夜风一样的声音
[01:42.00]心碎的很好听
[01:47.00]手在键盘敲很轻
[01:51.00]我给的思念很小心
[01:56.00]你埋葬的地方叫幽冥
[02:01.00]为你弹奏肖邦的夜曲
[02:06.00]纪念我死去的爱情
[02:11.00]而我为你隐姓埋名
[02:15.00]在月光下弹琴
[02:20.00]对你心跳的感应
[02:24.00]还是如此温热亲近
[02:29.00]怀念你那鲜红的唇印`,
            '青花瓷': `[00:00.00]青花瓷
[00:04.00]词曲：周杰伦
[00:08.00]素胚勾勒出青花笔锋浓转淡
[00:13.00]瓶身描绘的牡丹一如你初妆
[00:18.00]冉冉檀香透过窗心事我了然
[00:23.00]宣纸上 走笔至此搁一半
[00:28.00]釉色渲染仕女图韵味被私藏
[00:33.00]而你嫣然的一笑如含苞待放
[00:38.00]你的美一缕飘散
[00:42.00]去到我去不了的地方
[00:47.00]天青色等烟雨 而我在等你
[00:53.00]炊烟袅袅升起 隔江千万里
[00:59.00]在瓶底书汉隶仿前朝的飘逸
[01:05.00]就当我为遇见你伏笔
[01:10.00]天青色等烟雨 而我在等你
[01:16.00]月色被打捞起 晕开了结局
[01:22.00]如传世的青花瓷自顾自美丽
[01:28.00]你眼带笑意
[01:33.00]色白花青的锦鲤跃然于碗底
[01:38.00]临摹宋体落款时却惦记着你
[01:43.00]你隐藏在窑烧里千年的秘密
[01:48.00]极细腻 犹如绣花针落地
[01:53.00]帘外芭蕉惹骤雨门环惹铜绿
[01:58.00]而我路过那江南小镇惹了你
[02:03.00]在泼墨山水画里
[02:07.00]你从墨色深处被隐去
[02:12.00]天青色等烟雨 而我在等你
[02:18.00]炊烟袅袅升起 隔江千万里
[02:24.00]在瓶底书汉隶仿前朝的飘逸
[02:30.00]就当我为遇见你伏笔
[02:35.00]天青色等烟雨 而我在等你
[02:41.00]月色被打捞起 晕开了结局
[02:47.00]如传世的青花瓷自顾自美丽
[02:53.00]你眼带笑意`,
            '告白气球': `[00:00.00]告白气球
[00:04.00]词：方文山 曲：周杰伦
[00:08.00]塞纳河畔 左岸的咖啡
[00:12.00]我手一杯 品尝你的美
[00:16.00]留下唇印的嘴
[00:20.00]花店玫瑰 名字写错谁
[00:24.00]告白气球 风吹到对街
[00:28.00]微笑在天上飞
[00:32.00]你说你有点难追
[00:35.00]想让我知难而退
[00:39.00]礼物不需挑最贵
[00:42.00]只要香榭的落叶
[00:46.00]喔 营造浪漫的约会
[00:49.00]不害怕搞砸一切
[00:53.00]拥有你就拥有 全世界
[00:58.00]亲爱的 爱上你 从那天起
[01:03.00]甜蜜的很轻易
[01:07.00]亲爱的 别任性 你的眼睛
[01:12.00]在说我愿意
[01:16.00]塞纳河畔 左岸的咖啡
[01:20.00]我手一杯 品尝你的美
[01:24.00]留下唇印的嘴
[01:28.00]花店玫瑰 名字写错谁
[01:32.00]告白气球 风吹到对街
[01:36.00]微笑在天上飞
[01:40.00]你说你有点难追
[01:43.00]想让我知难而退
[01:47.00]礼物不需挑最贵
[01:50.00]只要香榭的落叶
[01:54.00]喔 营造浪漫的约会
[01:57.00]不害怕搞砸一切
[02:01.00]拥有你就拥有 全世界
[02:06.00]亲爱的 爱上你 从那天起
[02:11.00]甜蜜的很轻易
[02:15.00]亲爱的 别任性 你的眼睛
[02:20.00]在说我愿意
[02:24.00]亲爱的 爱上你 恋爱日记
[02:29.00]飘香水的回忆
[02:33.00]一整瓶 的梦境 全都有你
[02:38.00]搅拌在一起
[02:42.00]亲爱的别任性 你的眼睛
[02:47.00]在说我愿意`,
            '有何不可': `[00:00.00]有何不可
[00:03.00]词曲：许嵩
[00:06.00]天空好想下雨
[00:09.00]我好想住你隔壁
[00:12.00]傻站在你家楼下
[00:15.00]抬起头 数乌云
[00:18.00]如果场景里出现一架钢琴
[00:22.00]我会唱歌给你听
[00:25.00]哪怕好多盆水往下淋
[00:30.00]夏天快要过去
[00:33.00]请你少买冰淇淋
[00:36.00]天凉就别穿短裙
[00:39.00]别再那么淘气
[00:42.00]如果有时不那么开心
[00:46.00]我愿意将格洛米借给你
[00:49.00]你其实明白我心意
[00:54.00]为你唱这首歌 没有什么风格
[01:00.00]它仅仅代表着 我想给你快乐
[01:06.00]为你解冻冰河 为你做一只扑火的飞蛾
[01:12.00]没有什么事情是不值得
[01:18.00]为你唱这首歌 没有什么风格
[01:24.00]它仅仅代表着 我希望你快乐
[01:30.00]为你辗转反侧 为你放弃世界有何不可
[01:36.00]夏末秋凉里带一点温热 有换季的颜色
[01:42.00]天空好想下雨
[01:45.00]我好想住你隔壁
[01:48.00]傻站在你家楼下
[01:51.00]抬起头 数乌云
[01:54.00]如果场景里出现一架钢琴
[01:58.00]我会唱歌给你听
[02:01.00]哪怕好多盆水往下淋
[02:06.00]夏天快要过去
[02:09.00]请你少买冰淇淋
[02:12.00]天凉就别穿短裙
[02:15.00]别再那么淘气
[02:18.00]如果有时不那么开心
[02:22.00]我愿意将格洛米借给你
[02:25.00]你其实明白我心意
[02:30.00]为你唱这首歌 没有什么风格
[02:36.00]它仅仅代表着 我想给你快乐
[02:42.00]为你解冻冰河 为你做一只扑火的飞蛾
[02:48.00]没有什么事情是不值得
[02:54.00]为你唱这首歌 没有什么风格
[03:00.00]它仅仅代表着 我希望你快乐
[03:06.00]为你辗转反侧 为你放弃世界有何不可
[03:12.00]夏末秋凉里带一点温热 有换季的颜色
[03:18.00]为你唱这首歌 没有什么风格
[03:24.00]它仅仅代表着 我想给你快乐
[03:30.00]为你解冻冰河 为你做一只扑火的飞蛾
[03:36.00]没有什么事情是不值得
[03:42.00]为你唱这首歌 没有什么风格
[03:48.00]它仅仅代表着 我希望你快乐
[03:54.00]为你辗转反侧 为你放弃世界有何不可
[04:00.00]夏末秋凉里带一点温热 有换季的颜色`,
            '清明雨上': `[00:00.00]清明雨上
[00:03.00]词曲：许嵩
[00:06.00]窗透初晓 日照西桥 云自摇
[00:11.00]想你当年荷风微摆的衣角
[00:16.00]木雕流金 岁月涟漪 七年前封笔
[00:22.00]因为我今生挥毫只为你
[00:27.00]雨打湿了眼眶 年年倚井盼归堂
[00:32.00]最怕不觉泪已拆两行
[00:37.00]我在人间彷徨 寻不到你的天堂
[00:43.00]东瓶西镜放 恨不能遗忘
[00:49.00]又是清明雨上 折菊寄到你身旁
[00:55.00]把你最爱的歌来轻轻唱
[01:00.00]想你 在每个夜晚
[01:06.00]想你 会成为习惯
[01:12.00]想你 你是否也想我
[01:18.00]在远方
[01:23.00]窗透初晓 日照西桥 云自摇
[01:29.00]想你当年荷风微摆的衣角
[01:34.00]木雕流金 岁月涟漪 七年前封笔
[01:40.00]因为我今生挥毫只为你
[01:45.00]雨打湿了眼眶 年年倚井盼归堂
[01:50.00]最怕不觉泪已拆两行
[01:55.00]我在人间彷徨 寻不到你的天堂
[02:01.00]东瓶西镜放 恨不能遗忘
[02:07.00]又是清明雨上 折菊寄到你身旁
[02:13.00]把你最爱的歌来轻轻唱
[02:18.00]我在人间彷徨 寻不到你的天堂
[02:24.00]东瓶西镜放 恨不能遗忘
[02:30.00]又是清明雨上 折菊寄到你身旁
[02:36.00]把你最爱的歌来轻轻唱
[02:42.00]远方有琴 愀然空灵 声声催天雨
[02:48.00]涓涓心事说给自己听
[02:53.00]月影憧憧 烟火几重 烛花红
[02:59.00]红尘旧梦 梦断都成空
[03:04.00]雨打湿了眼眶 年年倚井盼归堂
[03:10.00]最怕不觉泪已拆两行
[03:15.00]我在人间彷徨 寻不到你的天堂
[03:21.00]东瓶西镜放 恨不能遗忘
[03:27.00]又是清明雨上 折菊寄到你身旁
[03:33.00]把你最爱的歌来轻轻唱
[03:38.00]我在人间彷徨 寻不到你的天堂
[03:44.00]东瓶西镜放 恨不能遗忘
[03:50.00]又是清明雨上 折菊寄到你身旁
[03:56.00]把你最爱的歌来轻轻唱`,
            '成都': `[00:00.00]成都
[00:04.00]词曲：赵雷
[00:08.00]让我掉下眼泪的 不止昨夜的酒
[00:13.00]让我依依不舍的 不止你的温柔
[00:18.00]余路还要走多久 你攥着我的手
[00:23.00]让我感到为难的 是挣扎的自由
[00:28.00]分别总是在九月 回忆是思念的愁
[00:33.00]深秋嫩绿的垂柳 亲吻着我额头
[00:38.00]在那座阴雨的小城里 我从未忘记你
[00:44.00]成都 带不走的 只有你
[00:49.00]和我在成都的街头走一走 喔…
[00:55.00]直到所有的灯都熄灭了也不停留
[01:01.00]你会挽着我的衣袖 我会把手揣进裤兜
[01:07.00]走到玉林路的尽头 坐在小酒馆的门口
[01:13.00]分别总是在九月 回忆是思念的愁
[01:18.00]深秋嫩绿的垂柳 亲吻着我额头
[01:23.00]在那座阴雨的小城里 我从未忘记你
[01:29.00]成都 带不走的 只有你
[01:34.00]和我在成都的街头走一走 喔…
[01:40.00]直到所有的灯都熄灭了也不停留
[01:46.00]你会挽着我的衣袖 我会把手揣进裤兜
[01:52.00]走到玉林路的尽头 坐在小酒馆的门口
[01:58.00]和我在成都的街头走一走 喔…
[02:04.00]直到所有的灯都熄灭了也不停留
[02:10.00]和我在成都的街头走一走 喔…
[02:16.00]直到所有的灯都熄灭了也不停留
[02:22.00]你会挽着我的衣袖 我会把手揣进裤兜
[02:28.00]走到玉林路的尽头 坐在小酒馆的门口
[02:34.00]和我在成都的街头走一走 喔…
[02:40.00]直到所有的灯都熄灭了也不停留`,
            '平凡之路': `[00:00.00]平凡之路
[00:04.00]词曲：朴树
[00:08.00]徘徊着的 在路上的
[00:12.00]你要走吗 via via
[00:16.00]易碎的 骄傲着
[00:20.00]那也曾是我的模样
[00:24.00]沸腾着的 不安着的
[00:28.00]你要去哪 via via
[00:32.00]谜一样的 沉默着的
[00:36.00]故事你真的在听吗
[00:41.00]我曾经跨过山和大海
[00:45.00]也穿过人山人海
[00:49.00]我曾经拥有着的一切
[00:53.00]转眼都飘散如烟
[00:57.00]我曾经失落失望失掉所有方向
[01:02.00]直到看见平凡才是唯一的答案
[01:08.00]当你仍然 还在幻想
[01:12.00]你的明天 via via
[01:16.00]她会好吗 还是更烂
[01:20.00]对我而言是另一天
[01:25.00]我曾经毁了我的一切
[01:29.00]只想永远地离开
[01:33.00]我曾经堕入无边黑暗
[01:37.00]想挣扎无法自拔
[01:41.00]我曾经像你像他像那野草野花
[01:46.00]绝望着 也渴望着 也哭也笑平凡着
[01:52.00]向前走 就这么走
[01:54.00]就算你被给过什么
[01:56.00]向前走 就这么走
[01:58.00]就算你被夺走什么
[02:00.00]向前走 就这么走
[02:02.00]就算会错过什么
[02:04.00]向前走 就这么走
[02:06.00]就算会
[02:09.00]我曾经跨过山和大海
[02:13.00]也穿过人山人海
[02:17.00]我曾经拥有着的一切
[02:21.00]转眼都飘散如烟
[02:25.00]我曾经失落失望失掉所有方向
[02:30.00]直到看见平凡才是唯一的答案
[02:36.00]我曾经跨过山和大海
[02:40.00]也穿过人山人海
[02:44.00]我曾经问遍整个世界
[02:48.00]从来没得到答案
[02:52.00]我不过像你像他像那野草野花
[02:57.00]冥冥中这是我 唯一要走的路啊
[03:03.00]时间无言 如此这般
[03:07.00]明天已在 hia hia
[03:11.00]风吹过的 路依然远
[03:15.00]你的故事讲到了哪`,
            '演员': `[00:00.00]演员
[00:04.00]词曲：薛之谦
[00:08.00]简单点 说话的方式简单点
[00:13.00]递进的情绪请省略
[00:17.00]你又不是个演员
[00:20.00]别设计那些情节
[00:25.00]没意见 我只想看看你怎么圆
[00:30.00]你难过的太表面 像没天赋的演员
[00:35.00]观众一眼能看见
[00:40.00]该配合你演出的我演视而不见
[00:45.00]在逼一个最爱你的人即兴表演
[00:50.00]什么时候我们开始收起了底线
[00:55.00]顺应时代的改变看那些拙劣的表演
[01:00.00]可你曾经那么爱我干嘛演出细节
[01:05.00]我该变成什么样子才能延缓厌倦
[01:10.00]原来当爱放下防备后的这些那些
[01:15.00]才是考验
[01:20.00]没意见 你想怎样我都随便
[01:25.00]你演技也有限
[01:28.00]又不用说感言
[01:31.00]分开就平淡些
[01:35.00]该配合你演出的我演视而不见
[01:40.00]别逼一个最爱你的人即兴表演
[01:45.00]什么时候我们开始没有了底线
[01:50.00]顺着别人的谎言被动就不显得可怜
[01:55.00]可你曾经那么爱我干嘛演出细节
[02:00.00]我该变成什么样子才能配合出演
[02:05.00]原来当爱放下防备后的这些那些
[02:10.00]都有个期限
[02:15.00]其实台下的观众就我一个
[02:20.00]其实我也看出你有点不舍
[02:25.00]场景也习惯我们来回拉扯
[02:30.00]还计较着什么
[02:35.00]其实说分不开的也不见得
[02:40.00]其实感情最怕的就是拖着
[02:45.00]越演到重场戏越哭不出了
[02:50.00]是否还值得
[02:55.00]该配合你演出的我尽力在表演
[03:00.00]像情感节目里的嘉宾任人挑选
[03:05.00]如果还能看出我有爱你的那面
[03:10.00]请剪掉那些情节让我看上去体面
[03:15.00]可你曾经那么爱我干嘛演出细节
[03:20.00]不在意的样子是我最后的表演
[03:25.00]是因为爱你我才选择表演
[03:30.00]这种成全`
        };
        
        return lyricsMap[songName] || `[00:00.00]暂无歌词
[00:05.00]感谢使用纯净音乐播放器
[00:10.00]支持搜索歌手和歌曲`;
    };
    
    const parseLyrics = (lyricsText) => {
        const lines = lyricsText.split('\n');
        const parsed = [];
        const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
        
        lines.forEach(line => {
            const match = line.match(timeRegex);
            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const milliseconds = parseInt(match[3]) * (match[3].length === 2 ? 10 : 1);
                const time = minutes * 60 + seconds + milliseconds / 1000;
                const text = line.replace(timeRegex, '').trim();
                if (text) {
                    parsed.push({ time, text });
                }
            } else {
                if (parsed.length > 0) {
                    parsed[parsed.length - 1].text += '\n' + line.trim();
                }
            }
        });
        
        return parsed;
    };
    
    const renderLyrics = () => {
        lyricsList.innerHTML = currentLyrics.map((lyric, index) => {
            const words = lyric.text.split('').map((word, i) => {
                return `<span class="lyric-word" data-word-index="${i}">${word}</span>`;
            }).join('');
            
            return `
                <div class="lyric-line" data-index="${index}" data-time="${lyric.time}">
                    <span class="lyric-text">${words}</span>
                    <button class="lyric-play-btn" title="跳转到此处播放">
                        <span class="material-icons">play_arrow</span>
                    </button>
                </div>
            `;
        }).join('');
        
        document.querySelectorAll('.lyric-line .lyric-play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const line = e.currentTarget.closest('.lyric-line');
                const time = parseFloat(line.dataset.time);
                audio.currentTime = time;
                isUserScrolling = false;
            });
        });
    };
    
    const updateLyrics = () => {
        if (currentLyrics.length === 0) return;
        
        const currentTime = audio.currentTime;
        let activeIndex = -1;
        
        for (let i = 0; i < currentLyrics.length; i++) {
            if (currentTime >= currentLyrics[i].time) {
                activeIndex = i;
            } else {
                break;
            }
        }
        
        document.querySelectorAll('.lyric-line').forEach((line, index) => {
            line.classList.remove('active', 'prev', 'next');
            
            if (index === activeIndex) {
                line.classList.add('active');
            } else if (index === activeIndex - 1) {
                line.classList.add('prev');
            } else if (index === activeIndex + 1) {
                line.classList.add('next');
            }
        });
        
        if (activeIndex >= 0) {
            const activeLine = document.querySelector('.lyric-line.active');
            if (activeLine) {
                if (!isUserScrolling) {
                    const lineHeight = activeLine.offsetHeight;
                    const containerHeight = lyricsScroll.offsetHeight;
                    const scrollTop = activeLine.offsetTop - containerHeight / 2 + lineHeight / 2;
                    
                    lyricsScroll.scrollTo({
                        top: Math.max(0, scrollTop),
                        behavior: 'smooth'
                    });
                }
                
                highlightCurrentWord(activeIndex, currentTime);
            }
        }
    };
    
    const handleLyricsScroll = () => {
        isUserScrolling = true;
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }
        scrollTimeout = setTimeout(() => {
            isUserScrolling = false;
        }, 3000);
    };
    
    const highlightCurrentWord = (lineIndex, currentTime) => {
        const currentLine = currentLyrics[lineIndex];
        const nextLine = currentLyrics[lineIndex + 1];
        
        if (!currentLine) return;
        
        const lineStartTime = currentLine.time;
        const lineEndTime = nextLine ? nextLine.time : lineStartTime + 10;
        const lineDuration = lineEndTime - lineStartTime;
        
        const timeInLine = currentTime - lineStartTime;
        const progressInLine = Math.min(1, Math.max(0, timeInLine / lineDuration));
        
        const words = document.querySelectorAll(`.lyric-line[data-index="${lineIndex}"] .lyric-word`);
        const totalWords = words.length;
        const highlightedCount = Math.floor(progressInLine * totalWords);
        
        words.forEach((word, index) => {
            word.classList.toggle('highlighted', index < highlightedCount);
        });
    };
    
    const toggleLyrics = () => {
        const list = playlistCurrentIndex >= 0 ? playlist : songList;
        const idx = playlistCurrentIndex >= 0 ? playlistCurrentIndex : currentIndex;
        if (idx < 0 || idx >= list.length) {
            showToast('请先播放一首歌曲');
            return;
        }
        
        const song = list[idx];
        lyricsSong.textContent = song.name;
        lyricsArtist.textContent = song.artist;
        
        if (currentLyrics.length === 0) {
            loadLyrics(song.name, song.artist, song.id);
        }
        
        lyricsPanel.classList.toggle('show');
        document.getElementById('lyrics-overlay').classList.toggle('show');
        
        if (lyricsPanel.classList.contains('show')) {
            lyricsScroll.scrollTop = 0;
        }
    };
    
    const downloadSong = async (index) => {
        if (index < 0 || index >= songList.length) return;
        
        const song = songList[index];
        
        if (song.source !== 'gequbao') {
            showToast('该歌曲不支持下载');
            return;
        }
        
        downloadTitle.textContent = song.name;
        downloadArtist.textContent = song.artist;
        downloadLinks.innerHTML = '<div class="loading"></div>';
        
        downloadPanel.classList.add('show');
        downloadOverlay.classList.add('show');
        
        try {
            const response = await fetch(`${GEQUBAO_PROXY}/download?id=${song.id}`);
            const data = await response.json();
            
            if (data && data.code === 200 && data.downloadUrls && data.downloadUrls.length > 0) {
                downloadLinks.innerHTML = data.downloadUrls.map(url => `
                    <a href="${url.url}" target="_blank" class="download-link" style="border-color: ${url.color}; color: ${url.color}">
                        <span class="material-icons">cloud_download</span>
                        <span>${url.type}</span>
                    </a>
                `).join('');
            } else {
                downloadLinks.innerHTML = '<div class="empty-state" style="height: auto; padding: 20px;"><p>暂无下载链接</p></div>';
            }
        } catch (error) {
            console.error('获取下载链接失败:', error);
            downloadLinks.innerHTML = '<div class="empty-state" style="height: auto; padding: 20px;"><p>获取下载链接失败</p></div>';
        }
    };
    
    const toggleDownload = () => {
        downloadPanel.classList.remove('show');
        downloadOverlay.classList.remove('show');
    };
    
    const addToPlaylist = (index) => {
        if (index < 0 || index >= songList.length) return;
        const song = songList[index];
        const key = `${song.name}|${song.artist}`;
        if (playlist.some(s => `${s.name}|${s.artist}` === key)) {
            showToast('该歌曲已在播放列表中');
            return;
        }
        playlist.push({ ...song });
        renderPlaylist();
        savePlaylist();
        showToast(`已添加：${song.name}`);
        
        const addBtn = document.querySelector(`.song-add-btn[data-index="${index}"]`);
        if (addBtn) {
            addBtn.classList.add('added');
            const icon = addBtn.querySelector('.material-icons');
            icon.textContent = 'check';
            setTimeout(() => {
                addBtn.classList.remove('added');
                icon.textContent = 'playlist_add';
            }, 1500);
        }
    };
    
    const removeFromPlaylist = (index) => {
        if (index < 0 || index >= playlist.length) return;
        const wasCurrent = index === playlistCurrentIndex;
        playlist.splice(index, 1);
        
        if (wasCurrent) {
            playlistCurrentIndex = -1;
            audio.pause();
            audio.src = '';
            currentSong.textContent = '暂无播放';
            currentArtist.textContent = '';
            currentLyrics = [];
            renderLyrics();
        } else if (index < playlistCurrentIndex) {
            playlistCurrentIndex--;
        }
        
        renderPlaylist();
        updatePlaylistActive();
        savePlaylist();
    };
    
    const clearPlaylist = () => {
        if (playlist.length === 0) return;
        playlist = [];
        playlistCurrentIndex = -1;
        audio.pause();
        audio.src = '';
        currentSong.textContent = '暂无播放';
        currentArtist.textContent = '';
        currentLyrics = [];
        renderLyrics();
        renderPlaylist();
        savePlaylist();
        showToast('播放列表已清空');
    };
    
    const renderPlaylist = () => {
        playlistCount.textContent = `${playlist.length} 首`;
        
        if (playlist.length === 0) {
            playlistList.innerHTML = '';
            playlistEmpty.style.display = 'flex';
            return;
        }
        
        playlistEmpty.style.display = 'none';
        playlistList.innerHTML = playlist.map((song, index) => {
            const isActive = index === playlistCurrentIndex;
            const isPlaying = isActive && !audio.paused;
            return `
                <div class="playlist-item ${isActive ? 'active' : ''} ${isPlaying ? 'playing' : ''}" data-index="${index}">
                    <div class="playlist-item-index">
                        ${isPlaying ? '<span class="material-icons">graphic_eq</span>' : (index + 1)}
                    </div>
                    <div class="playlist-item-info">
                        <div class="playlist-item-name">${escapeHtml(song.name)}</div>
                        <div class="playlist-item-artist">${escapeHtml(song.artist)}</div>
                    </div>
                    <div class="playlist-item-duration">${formatTime(song.duration)}</div>
                    <button class="playlist-item-remove" data-index="${index}" title="移除">
                        <span class="material-icons" style="font-size: 16px;">close</span>
                    </button>
                </div>
            `;
        }).join('');
        
        document.querySelectorAll('.playlist-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.playlist-item-remove')) return;
                const index = parseInt(e.currentTarget.dataset.index);
                if (index === playlistCurrentIndex && !audio.paused) {
                    togglePlayPause();
                } else {
                    playSong(index, true);
                }
            });
        });
        
        document.querySelectorAll('.playlist-item-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(e.currentTarget.dataset.index);
                removeFromPlaylist(index);
            });
        });
    };
    
    const updatePlaylistActive = () => {
        document.querySelectorAll('.playlist-item').forEach((item, index) => {
            const isActive = index === playlistCurrentIndex;
            const isPlaying = isActive && !audio.paused;
            item.classList.toggle('active', isActive);
            item.classList.toggle('playing', isPlaying);
            const indexEl = item.querySelector('.playlist-item-index');
            if (indexEl) {
                indexEl.innerHTML = isPlaying 
                    ? '<span class="material-icons">graphic_eq</span>' 
                    : (index + 1);
            }
        });
        
        if (playlistCurrentIndex >= 0 && playlistPanel.classList.contains('show')) {
            const activeItem = document.querySelector('.playlist-item.active');
            if (activeItem) {
                const itemTop = activeItem.offsetTop;
                const itemHeight = activeItem.offsetHeight;
                const scrollTop = playlistScroll.scrollTop;
                const containerHeight = playlistScroll.clientHeight;
                if (itemTop < scrollTop || itemTop + itemHeight > scrollTop + containerHeight) {
                    playlistScroll.scrollTo({ top: itemTop - containerHeight / 2 + itemHeight / 2, behavior: 'smooth' });
                }
            }
        }
    };
    
    const togglePlaylist = () => {
        playlistPanel.classList.toggle('show');
        playlistOverlay.classList.toggle('show');
    };
    
    const cyclePlayMode = () => {
        const modes = [
            { mode: 'list', icon: 'repeat', label: '列表循环' },
            { mode: 'single', icon: 'repeat_one', label: '单曲循环' },
            { mode: 'random', icon: 'shuffle', label: '随机播放' }
        ];
        const currentIdx = modes.findIndex(m => m.mode === playMode);
        const nextMode = modes[(currentIdx + 1) % modes.length];
        playMode = nextMode.mode;
        
        const icon = playModeBtn.querySelector('.material-icons');
        icon.textContent = nextMode.icon;
        playModeBtn.title = nextMode.label;
        playModeBtn.classList.toggle('active', playMode !== 'list');
        
        showToast(nextMode.label);
        savePlaylist();
    };
    
    const savePlaylist = () => {
        try {
            localStorage.setItem('music_playlist', JSON.stringify(playlist));
            localStorage.setItem('music_play_mode', playMode);
        } catch (e) {
            console.warn('保存播放列表失败:', e);
        }
    };
    
    const loadPlaylist = () => {
        try {
            const saved = localStorage.getItem('music_playlist');
            if (saved) {
                playlist = JSON.parse(saved);
            }
            const savedMode = localStorage.getItem('music_play_mode');
            if (savedMode) {
                playMode = savedMode;
                const modes = {
                    list: { icon: 'repeat', label: '列表循环' },
                    single: { icon: 'repeat_one', label: '单曲循环' },
                    random: { icon: 'shuffle', label: '随机播放' }
                };
                const modeInfo = modes[playMode] || modes.list;
                const icon = playModeBtn.querySelector('.material-icons');
                icon.textContent = modeInfo.icon;
                playModeBtn.title = modeInfo.label;
                playModeBtn.classList.toggle('active', playMode !== 'list');
            }
        } catch (e) {
            console.warn('加载播放列表失败:', e);
        }
    };
    
    const updateActiveSong = () => {
        document.querySelectorAll('.song-item').forEach((item, index) => {
            item.classList.toggle('active', index === currentIndex);
            const btn = item.querySelector('.song-play-btn');
            const icon = btn.querySelector('.material-icons');
            icon.textContent = index === currentIndex && !audio.paused ? 'pause' : 'play_arrow';
            btn.classList.toggle('playing', index === currentIndex && !audio.paused);
        });
    };
    
    const togglePlayPause = () => {
        if (audio.paused) {
            audio.play().catch(() => showToast('播放失败'));
        } else {
            audio.pause();
        }
    };
    
    const playPrev = () => {
        const list = playlistCurrentIndex >= 0 ? playlist : songList;
        if (list.length === 0) return;
        
        if (playlistCurrentIndex >= 0) {
            const newIndex = playlistCurrentIndex <= 0 ? playlist.length - 1 : playlistCurrentIndex - 1;
            playSong(newIndex, true);
        } else {
            const newIndex = currentIndex <= 0 ? songList.length - 1 : currentIndex - 1;
            playSong(newIndex);
        }
    };
    
    const playNext = () => {
        const list = playlistCurrentIndex >= 0 ? playlist : songList;
        if (list.length === 0) return;
        
        if (playlistCurrentIndex >= 0) {
            if (playMode === 'random' && playlist.length > 1) {
                let newIndex;
                do {
                    newIndex = Math.floor(Math.random() * playlist.length);
                } while (newIndex === playlistCurrentIndex);
                playSong(newIndex, true);
            } else {
                const newIndex = playlistCurrentIndex >= playlist.length - 1 ? 0 : playlistCurrentIndex + 1;
                playSong(newIndex, true);
            }
        } else {
            if (playMode === 'random' && songList.length > 1) {
                let newIndex;
                do {
                    newIndex = Math.floor(Math.random() * songList.length);
                } while (newIndex === currentIndex);
                playSong(newIndex);
            } else {
                const newIndex = currentIndex >= songList.length - 1 ? 0 : currentIndex + 1;
                playSong(newIndex);
            }
        }
    };
    
    const updateProgress = () => {
        if (isDragging) return;
        
        const progress = audio.currentTime / audio.duration;
        progressFill.style.width = `${progress * 100}%`;
        progressThumb.style.left = `${progress * 100}%`;
        currentTime.textContent = formatTime(audio.currentTime);
    };
    
    const updateDuration = () => {
        totalTime.textContent = formatTime(audio.duration);
        
        if (currentIndex >= 0 && currentIndex < songList.length) {
            songList[currentIndex].duration = audio.duration * 1000;
            const songItem = document.querySelector(`.song-item[data-index="${currentIndex}"]`);
            if (songItem) {
                const durationEl = songItem.querySelector('.song-duration');
                if (durationEl) {
                    durationEl.textContent = formatTime(audio.duration);
                }
            }
        }
    };
    
    const seekTo = (e) => {
        const rect = progressBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const time = percent * audio.duration;
        audio.currentTime = Math.max(0, Math.min(time, audio.duration));
    };
    
    const handleProgressMouseDown = (e) => {
        isDragging = true;
        seekTo(e);
        document.addEventListener('mousemove', handleProgressMouseMove);
        document.addEventListener('mouseup', handleProgressMouseUp);
    };
    
    const handleProgressMouseMove = (e) => {
        if (!isDragging) return;
        seekTo(e);
    };
    
    const handleProgressMouseUp = () => {
        isDragging = false;
        document.removeEventListener('mousemove', handleProgressMouseMove);
        document.removeEventListener('mouseup', handleProgressMouseUp);
    };
    
    const updateVolume = (percent) => {
        audio.volume = percent;
        volumeFill.style.width = `${percent * 100}%`;
        
        const icon = volumeToggle.querySelector('.material-icons');
        if (percent === 0 || isMuted) {
            icon.textContent = 'volume_off';
        } else if (percent < 0.5) {
            icon.textContent = 'volume_down';
        } else {
            icon.textContent = 'volume_up';
        }
    };
    
    const toggleMute = () => {
        isMuted = !isMuted;
        
        if (isMuted) {
            previousVolume = audio.volume;
            updateVolume(0);
        } else {
            updateVolume(previousVolume);
        }
    };
    
    const handleVolumeClick = (e) => {
        const rect = volumeBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        isMuted = false;
        updateVolume(Math.max(0, Math.min(percent, 1)));
    };
    
    const handlePlayPauseIcon = () => {
        const icon = playPauseBtn.querySelector('.material-icons');
        icon.textContent = audio.paused ? 'play_arrow' : 'pause';
        updateActiveSong();
        updatePlaylistActive();
    };
    
    const handleAudioError = () => {
        showToast('音频加载失败，自动播放下一曲');
        playNext();
    };
    
    const handleAudioEnded = () => {
        if (playMode === 'single') {
            audio.currentTime = 0;
            audio.play().catch(() => {});
            return;
        }
        playNext();
    };
    
    const startLyricsDrag = (e) => {
        e.preventDefault();
        const startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        const startHeight = lyricsPanel.offsetHeight;
        
        const handleMouseMove = (e) => {
            e.preventDefault();
            const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
            const deltaY = startY - clientY;
            const newHeight = Math.max(200, Math.min(window.innerHeight - 80, startHeight + deltaY));
            lyricsPanel.style.height = newHeight + 'px';
        };
        
        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('touchmove', handleMouseMove);
            document.removeEventListener('touchend', handleMouseUp);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('touchmove', handleMouseMove, { passive: false });
        document.addEventListener('touchend', handleMouseUp);
    };
    
    const handleKeydown = (e) => {
        if (e.target === searchInput) return;
        
        switch (e.code) {
            case 'Space':
                e.preventDefault();
                togglePlayPause();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                audio.currentTime = Math.max(0, audio.currentTime - 10);
                break;
            case 'ArrowRight':
                e.preventDefault();
                audio.currentTime = Math.min(audio.duration, audio.currentTime + 10);
                break;
            case 'ArrowUp':
                e.preventDefault();
                updateVolume(Math.min(1, audio.volume + 0.1));
                break;
            case 'ArrowDown':
                e.preventDefault();
                updateVolume(Math.max(0, audio.volume - 0.1));
                break;
        }
    };
    
    const init = () => {
        loadTheme();
        
        if (window.location.protocol === 'file:') {
            setTimeout(() => {
                showToast('请通过 http://localhost:3001/index.html 访问', 5000);
            }, 500);
        }
        
        searchBtn.addEventListener('click', () => fetchMusic(searchInput.value));
        searchInput.addEventListener('keyup', (e) => {
            if (e.code === 'Enter') {
                fetchMusic(searchInput.value);
            }
        });
        
        themeToggle.addEventListener('click', toggleTheme);
        
        const openSettings = () => {
            apiBaseInput.value = localStorage.getItem('music_api_base') || '';
            settingsPanel.classList.add('show');
            settingsOverlay.classList.add('show');
        };
        
        const closeSettings = () => {
            settingsPanel.classList.remove('show');
            settingsOverlay.classList.remove('show');
        };
        
        const saveSettings = () => {
            const apiBase = apiBaseInput.value.trim();
            if (apiBase) {
                localStorage.setItem('music_api_base', apiBase);
                GEQUBAO_PROXY = apiBase;
                showToast('API地址已保存');
            } else {
                localStorage.removeItem('music_api_base');
                GEQUBAO_PROXY = getApiBase();
                showToast('已恢复默认设置');
            }
            closeSettings();
        };
        
        settingsBtn.addEventListener('click', openSettings);
        closeSettingsBtn.addEventListener('click', closeSettings);
        settingsOverlay.addEventListener('click', closeSettings);
        saveSettingsBtn.addEventListener('click', saveSettings);
        
        playPauseBtn.addEventListener('click', togglePlayPause);
        prevBtn.addEventListener('click', playPrev);
        nextBtn.addEventListener('click', playNext);
        
        const lyricsBtn = document.getElementById('lyrics-btn');
        lyricsBtn.addEventListener('click', toggleLyrics);
        closeLyricsBtn.addEventListener('click', toggleLyrics);
        
        const lyricsOverlay = document.getElementById('lyrics-overlay');
        lyricsOverlay.addEventListener('click', toggleLyrics);
        
        lyricsDragHandle.addEventListener('mousedown', startLyricsDrag);
        lyricsDragHandle.addEventListener('touchstart', startLyricsDrag, { passive: false });
        
        const lyricsResizeHandle = document.querySelector('.lyrics-resize-handle');
        if (lyricsResizeHandle) {
            lyricsResizeHandle.addEventListener('mousedown', startLyricsDrag);
            lyricsResizeHandle.addEventListener('touchstart', startLyricsDrag, { passive: false });
        }
        
        const lyricsHeader = document.querySelector('.lyrics-header');
        if (lyricsHeader) {
            lyricsHeader.addEventListener('mousedown', startLyricsDrag);
            lyricsHeader.addEventListener('touchstart', startLyricsDrag, { passive: false });
        }
        
        lyricsScroll.addEventListener('scroll', handleLyricsScroll);
        
        closeDownloadBtn.addEventListener('click', toggleDownload);
        downloadOverlay.addEventListener('click', toggleDownload);
        
        playlistBtn.addEventListener('click', togglePlaylist);
        closePlaylistBtn.addEventListener('click', togglePlaylist);
        playlistOverlay.addEventListener('click', togglePlaylist);
        clearPlaylistBtn.addEventListener('click', clearPlaylist);
        playModeBtn.addEventListener('click', cyclePlayMode);
        
        loadPlaylist();
        renderPlaylist();
        
        progressBar.addEventListener('mousedown', handleProgressMouseDown);
        progressBar.addEventListener('click', seekTo);
        
        volumeToggle.addEventListener('click', toggleMute);
        volumeBar.addEventListener('click', handleVolumeClick);
        
        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('timeupdate', updateLyrics);
        audio.addEventListener('loadedmetadata', updateDuration);
        audio.addEventListener('pause', handlePlayPauseIcon);
        audio.addEventListener('play', handlePlayPauseIcon);
        audio.addEventListener('error', handleAudioError);
        audio.addEventListener('ended', handleAudioEnded);
        
        document.addEventListener('keydown', handleKeydown);
        
        audio.volume = 0.7;
    };
    
    return {
        init
    };
})();

document.addEventListener('DOMContentLoaded', MusicPlayer.init);