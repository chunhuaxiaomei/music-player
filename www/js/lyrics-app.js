const LyricsPlayer = (function() {
    const audio = document.getElementById('audio-player');
    const backBtn = document.getElementById('back-btn');
    const themeToggle = document.getElementById('theme-toggle');
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
    
    const lyricsScroll = document.getElementById('lyrics-scroll');
    const lyricsList = document.getElementById('lyrics-list');
    
    let songList = [];
    let currentIndex = -1;
    let currentLyrics = [];
    let isDragging = false;
    let isMuted = false;
    let previousVolume = 0.7;
    
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
        const savedTheme = localStorage.getItem('music-player-theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme === 'dark' ? '' : 'light');
        themeToggle.querySelector('.material-icons').textContent = savedTheme === 'dark' ? 'light_mode' : 'dark_mode';
    };
    
    const toggleTheme = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme === 'dark' ? '' : 'light');
        localStorage.setItem('music-player-theme', newTheme);
        themeToggle.querySelector('.material-icons').textContent = newTheme === 'dark' ? 'light_mode' : 'dark_mode';
    };
    
    const getMockSongs = () => {
        return [
            { name: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
            { name: '演员', artist: '薛之谦', album: '绅士', duration: 279, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3' },
            { name: '体面', artist: '于文文', album: '前任3：再见前任', duration: 286, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
            { name: '后来', artist: '刘若英', album: '我等你', duration: 330, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3' },
            { name: '成都', artist: '赵雷', album: '无法长大', duration: 273, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
            { name: '平凡之路', artist: '朴树', album: '猎户星座', duration: 296, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3' },
            { name: '有何不可', artist: '许嵩', album: '自定义', duration: 223, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3' },
            { name: '素颜', artist: '许嵩/何曼婷', album: '素颜', duration: 258, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3' },
            { name: '清明雨上', artist: '许嵩', album: '自定义', duration: 247, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3' },
            { name: '稻香', artist: '周杰伦', album: '魔杰座', duration: 223, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' }
        ];
    };
    
    const getMockLyrics = (songName) => {
        const lyricsMap = {
            '晴天': `[00:00.00]晴天
[00:05.00]故事的小黄花
[00:08.00]从出生那年就飘着
[00:11.00]童年的荡秋千
[00:14.00]随记忆一直晃到现在
[00:17.00]Re So So Si Do Si La
[00:20.00]So La Si Si Si Si La Si La So
[00:23.00]吹着前奏望着天空
[00:26.00]我想起花瓣试着掉落
[00:30.00]为你翘课的那一天
[00:33.00]花落的那一天
[00:36.00]教室的那一间
[00:39.00]我怎么看不见
[00:42.00]消失的下雨天
[00:45.00]我好想再淋一遍
[00:49.00]没想到失去的勇气我还留着
[00:55.00]好想再问一遍
[00:58.00]你会等待还是离开
[01:04.00]刮风这天我试过握着你手
[01:10.00]但偏偏雨渐渐大到我看你不见
[01:16.00]还要多久我才能在你身边
[01:22.00]等到放晴的那天也许我会比较好一点
[01:28.00]从前从前有个人爱你很久
[01:34.00]偏偏风渐渐把距离吹得好远
[01:40.00]好不容易又能再多爱一天
[01:46.00]但故事的最后你好像还是说了拜拜`,
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
[00:59.00]微微笑 小时候的梦我知道`
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
                    ${words}
                </div>
            `;
        }).join('');
        
        document.querySelectorAll('.lyric-line').forEach(line => {
            line.addEventListener('click', (e) => {
                const time = parseFloat(e.currentTarget.dataset.time);
                audio.currentTime = time;
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
                const lineHeight = activeLine.offsetHeight;
                const containerHeight = lyricsScroll.offsetHeight;
                const scrollTop = activeLine.offsetTop - containerHeight / 2 + lineHeight / 2;
                
                lyricsScroll.scrollTo({
                    top: Math.max(0, scrollTop),
                    behavior: 'smooth'
                });
                
                highlightCurrentWord(activeIndex, currentTime);
            }
        }
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
    
    const loadLyrics = (songName) => {
        const lyrics = getMockLyrics(songName);
        currentLyrics = parseLyrics(lyrics);
        renderLyrics();
    };
    
    const playSong = (index) => {
        if (index < 0 || index >= songList.length) return;
        
        currentIndex = index;
        const song = songList[index];
        
        try {
            audio.src = song.url;
            audio.load();
            audio.play().catch(() => {});
            
            currentSong.textContent = song.name;
            currentArtist.textContent = song.artist;
            
            loadLyrics(song.name);
        } catch (error) {
            console.error('播放失败:', error);
            showToast('播放失败，请尝试其他歌曲');
        }
    };
    
    const togglePlayPause = () => {
        if (audio.paused) {
            audio.play().catch(() => showToast('播放失败'));
        } else {
            audio.pause();
        }
    };
    
    const playPrev = () => {
        if (songList.length === 0) return;
        const newIndex = currentIndex <= 0 ? songList.length - 1 : currentIndex - 1;
        playSong(newIndex);
    };
    
    const playNext = () => {
        if (songList.length === 0) return;
        const newIndex = currentIndex >= songList.length - 1 ? 0 : currentIndex + 1;
        playSong(newIndex);
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
    };
    
    const handleAudioError = () => {
        showToast('音频加载失败，请尝试其他歌曲');
        if (currentIndex < songList.length - 1) {
            playNext();
        }
    };
    
    const handleAudioEnded = () => {
        if (currentIndex < songList.length - 1) {
            playNext();
        }
    };
    
    const handleKeydown = (e) => {
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
        
        songList = getMockSongs();
        
        if (songList.length > 0) {
            playSong(0);
        }
        
        backBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
        
        themeToggle.addEventListener('click', toggleTheme);
        
        playPauseBtn.addEventListener('click', togglePlayPause);
        prevBtn.addEventListener('click', playPrev);
        nextBtn.addEventListener('click', playNext);
        
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

document.addEventListener('DOMContentLoaded', LyricsPlayer.init);