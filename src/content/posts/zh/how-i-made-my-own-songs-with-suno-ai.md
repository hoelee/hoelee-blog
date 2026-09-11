---
title: "我用 Suno AI 做出自己的歌"
description: "自己写词、调风格提示词，用 Suno AI 做出七首原创歌曲——民谣、儿歌、动漫风心经。完整工作流 + 可直接播放的成品。"
pubDate: 2026-09-11
category: case-studies
tags: [suno, ai-music, music, lyrics, prompting, ai]
ogImage: /og/how-i-made-my-own-songs-with-suno-ai.png
banner: /banners/how-i-made-my-own-songs-with-suno-ai.png
---

我做自己的歌。不是靠弹奏乐器——而是写歌词、打磨风格提示词，让 Suno AI
负责唱腔、编曲和混音。这篇是完整工作流：当前模型家族怎么用、我实际往
提示框里打什么，以及七首可以直接播放的成品。

## 为什么用 AI 做自己的音乐？

两个理由，一个私人，一个实际。

**私人方面：** 我喜欢拿生成式 AI 做实验。一首歌是紧凑、自包含的项目——
歌词、风格、结构、演唱——练的是和搭 bot、接管道一模一样的提示词功力。
而且成品比配置文件容易分享得多。

**实际方面：** 这已经是一项能接单的技能。中小企业需要广告歌、视频背景
音乐、活动配乐、品牌音频——但不一定有录音室预算。如果我凭一页简报就能
交付一首可用的曲子，那是服务，不是魔术。Suno 现在的 **v6** 系列模型
（2026-09-09 发布）比我 2024 年 4 月刚开始用的 V3 时代可控太多。

## 当前标准：2026 年 Suno 模型长什么样

网上旧教程引用的模型早就没了，先把版本理清楚：

| 模型 | 时间 | 谁可用 |
|---|---|---|
| **v6 / v6-wild** | 2026-09-09 | 付费（旗舰 + 实验版） |
| **v6-mini** | 2026-09-09 | 人人可用——快、省，适合打草稿 |
| **v5.5** | 2026-03-26 | 付费——新增 Voices、Custom Models、My Taste |
| **v4.5-all** | 2025-10-21 | 免费版（无商用权，须署名） |
| V4 / V4.5 / V5 | 2024–2026 | 付费，已被取代 |

v6 家族新增的控制功能，直接改变了我做事的方式：

- **自然语言段落编辑**——「把副歌改成福音合唱团唱」只改一段，不重刷整首。
- **单句歌词替换**——「把 love 改成 light」只动一行。
- **Mashup 混搭**——一首歌的人声 + 另一首的鼓 + 新歌词，一次请求搞定。
- **采样→分离→重建**——取 0:45 的 riff，分离吉他，围绕它做鼓点。
- **多模态输入**——可以从文字、音频、图片甚至视频起步。

下面我自己的曲子是更早的 V4 时代工作流（2025 年 4 月）做的。底层逻辑——
风格字段、歌词元标签、迭代——没变过，v6 能省哪几步我也会注明。

## 我的工作流：先词后风格

顺序比多数人以为的重要得多。新手通常打开 Suno，在 Simple Mode 里贴个
类型，得到一首千篇一律的歌。我反过来：

1. **先把歌当文档写出来**——标题、结构、歌词。情感和故事来自我，
   Suno 负责表演。
2. **打磨风格提示词**——类型 + 情绪 + 年代 + 乐器 + 人声人设 + 制作，
   往往 200+ 字符，描述的是歌曲的*旅程*，不只是类型。
3. **给歌词加元标签**——`[Verse]`、`[Chorus]`、`[Bridge]`、`[Whispered]`、
   `[Belted]`。没有这些，Suno 默认输出平淡的主歌-副歌-主歌，没有情绪弧线。
4. **每首生成 3–5 个 take** 留最好的。用 Extend/Reuse Prompt 修补，
   每次扩展都要重述类型——风格会漂移。
5. **纠正发音**——AI 歌手是按读音读词的，所以要改写拼写
   （"through" → "thru"、生僻字加连字符），生僻词先用短片段测。

下面这个完整例子展示这一切长什么样。

## 成品歌曲

七首歌，托管在我自己的媒体子域名（`content.hoelee.com`，走 Publitio），
用原生 HTML5 audio 内嵌，点播放即可：

<style>
.suno-track{margin:2.2rem 0}
.suno-track audio{width:100%;max-width:560px}
.suno-box{max-height:190px;overflow-y:auto;border:1px solid var(--border,#3a3f47);border-radius:8px;padding:.7rem 1rem;margin-top:.6rem;font-size:.95em;line-height:1.6}
.suno-box p{margin:.18rem 0;opacity:.55}
.suno-box p.on{opacity:1;font-weight:600;color:var(--accent,#22c55e)}
</style>

### 1. 轮回的渡船

古风民谣。忘川的摆渡人、冷掉又添的孟婆汤、一个拒绝再入轮回的灵魂。
写成跨越轮回选择一个人的神话式爱情故事：稀疏弦乐里低声起，副歌推满、
撕心裂肺。

<figure class="suno-track">
  <audio controls preload="metadata" oncontextmenu="return false;" controlslist="nodownload" data-lrc="lrc-samsara" src="https://content.hoelee.com/file/hoelee/music/%E8%BD%AE%E5%9B%9E%E7%9A%84%E6%B8%A1%E8%88%B9.mp3"></audio>
  <pre id="lrc-samsara" hidden>[00:12]河岸的雾漫过第三千个秋
[00:18]我的桨声碎在无人渡口
[00:26]忘川水打湿褪色的袖
[00:30]你背影是前世未燃尽的篝火
[00:33]佛说众生如萍聚散无由
[00:39]我却数遍每一颗星斗
[00:46]等残月照亮你回眸——
[00:53]偏偏人间雪，落满我舟头
[01:04]我摇着轮回的船，载不动红尘重如山
[01:10]孟婆的汤冷了又添，你宁化涟漪不成全
[01:20]若执念是穿心的箭，刺透因果的链
[01:27]我愿在彼岸花凋谢前 再为你搁浅
[01:34]那夜你魂在风里轻轻叹
[01:40]掌心符咒烫穿我掌纹的茧
[01:46]奈何桥断成半截诗篇
[01:53]我偷改命簿只换你半句谎言
[02:00]你吻过的铜铃锈在桅杆
[02:07]风一吹响了三生冬夏
[02:14]余生的河灯，照不亮对岸
[02:20]我摇着轮回的船，渡不完哀愁的深浅
[02:27]你眼泪凝成琥珀的盐，埋进我骨骼作谶言
[02:33]若爱是焚不尽的经卷，灰烬里写永远
[02:41]我跪在忘川最痛的流域，求一次擦肩
[03:00]梵音绕啊绕啊绕不过执念
[03:06]佛珠断啊断啊断在你眉间
[03:14]船沉时，天地裂开一道缝
[03:20]来世你为青山，我为雪
[03:27]轮回的渡船，碎成烟
[03:34]你是我 永世不靠岸的劫</pre>
</figure>

### 2. Happy Way to School

英文儿歌——原始提示词要的是「橘子汽水般冒泡的 indie folk」：木吉他、
俏皮口哨、明亮童声。把上学路上的仪式写成小颂歌：跳动的马尾辫、咖啡店
的猫、步调一致的伙伴。

<figure class="suno-track">
  <audio controls preload="metadata" oncontextmenu="return false;" controlslist="nodownload" data-lrc="lrc-school" src="https://content.hoelee.com/file/hoelee/music/Happy-Way-to-School.mp3"></audio>
  <pre id="lrc-school" hidden>[00:07.00]A little girl with a heart so bright,
[00:12.00]Skips down the street in morning light,
[00:16.00]Her smile's like sunshine in the air,
[00:20.00]A joyful moment everywhere.
[00:24.00]The café's window's full of cheer,
[00:28.00]Curious kittens drawing near,
[00:32.00]Their eyes meet hers, a happy sight,
[00:35.00]They wave her off in pure delight.
[00:39.00]Hand in hand with friends so sweet,
[00:43.00]They skip along the lively street,
[00:47.00]Ponytails bounce with every move,
[00:51.00]The world feels warm, a groove to prove.
[00:55.00]School is waiting, full of dreams,
[00:59.00]A place where friendship always beams,
[01:02.00]With every step, they laugh and play,
[01:08.00]The start of a beautiful day.
[01:17.00]Together they walk, hearts in sync,
[01:21.00]The world so bright, as if they think,
[01:25.00]No better way to face the day,
[01:28.00]In friendship's glow, they'll always stay.
[01:32.00]A happy way to school they go,
[01:35.00]Through the morning's gentle glow,
[01:38.00]With every step, the bond is clear,
[01:43.00]They'll cherish this moment year by year.</pre>
</figure>

### 3. 新靓 —— 心经·冥想律动

般若波罗蜜多心经，配上节拍感十足的冥想编曲——简报就一句「冥想深度 +
律动活力」。观自在菩萨开场，完整「色不異空」段落，收在揭諦揭諦。试着
让千年经文真的能跟着动起来。

<figure class="suno-track">
  <audio controls preload="metadata" oncontextmenu="return false;" controlslist="nodownload" data-lrc="lrc-xinliang" src="https://content.hoelee.com/file/hoelee/music/%E6%96%B0%E9%9D%93.mp3"></audio>
  <pre id="lrc-xinliang" hidden>[00:00.00]拥凝练韵文引导心灵净化，
[00:06.43]在跃动节拍与禅意氛围间形成张力，
[00:12.87]达成冥想深度与律动活力的独特平衡随至…
[00:19.31]如梦如幻… 心境无常…
[00:25.74]众生皆空，见空即见真！
[00:32.18]觀自在菩薩，行深般若波羅密多時，
[00:38.62]照見五蘊皆空度一切苦厄，
[00:45.06]色不異空，空不異色，
[00:51.49]即是空，空即是色，
[00:57.93]受想行識亦復如是。
[01:04.37]色不異空，空不異色，
[01:10.80]受想行識亦復如是，
[01:17.24]般若波羅密多，無所畏懼，
[01:23.68]心無罣礙，涅槃即是此。
[01:30.12]舍利子，諸法空相，
[01:36.55]不生不滅，不垢不淨，
[01:42.99]無增無減，無老死，
[01:49.43]無苦集滅道，無智亦無得。
[01:55.87]色不異空，空不異色，
[02:02.30]受想行識亦復如是，
[02:08.74]般若波羅密多，無所畏懼，
[02:15.18]心無罣礙，涅槃即是此。
[02:21.61]三世諸佛，依般若波羅密多，
[02:28.05]得阿耨多羅三藐三菩提，
[02:34.49]般若波羅密多！
[02:40.93]是大神咒，是真實不虛！
[02:47.36]揭諦揭諦，波羅揭諦，
[02:53.80]波羅僧揭諦，菩提薩婆訶，
[03:00.24]心無罣礙，遠離顛倒夢想！</pre>
</figure>

### 4. 新劲 —— 新鲜能量

新靓的硬朗姊妹篇——同样的冥想血统，更重的打击驱动。这首没留歌词稿，
当氛围作品存在。

<figure class="suno-track">
  <audio controls preload="metadata" oncontextmenu="return false;" controlslist="nodownload" src="https://content.hoelee.com/file/hoelee/music/%E6%96%B0%E5%8A%B2.mp3"></audio>
</figure>

### 5. 泡泡星球漫游记

童趣 indie folk，也是文档最全的一首——原始简报、风格提示词、歌词稿全在
下面的完整例子里。泡泡星球、糖果喷泉、银河游乐场。

<figure class="suno-track">
  <audio controls preload="metadata" oncontextmenu="return false;" controlslist="nodownload" data-lrc="lrc-bubble" src="https://content.hoelee.com/file/hoelee/music/%E6%B3%A1%E6%B3%A1%E6%98%9F%E7%90%83%E6%BC%AB%E6%B8%B8%E8%AE%B0.mp3"></audio>
  <pre id="lrc-bubble" hidden>[00:09.00]彩云兜着阳光转圈圈
[00:15.00]贝壳装满彩虹的碎片
[00:19.00]跳进橘子汽水的夏天
[00:24.00]海鸥掠过浪花的琴键
[00:48.00]泡泡载着梦飞向屋檐 (飞呀飞呀)
[00:53.00]尾巴挂着星星的秋千 (晃呀晃呀)
[00:57.00]鲸鱼喷出糖果的喷泉 (甜到脚尖)
[01:02.00]魔法地图画满冒险线 (转个圈圈)
[01:08.00]橡皮艇划开银河水面
[01:12.00]萤火虫点亮薄荷月圆
[01:17.00]棉花糖云朵蓬松柔软
[01:20.00]流星滑梯通向我窗前
[01:27.00]泡泡载着梦飞向屋檐 (飞呀飞呀)
[01:31.00]尾巴挂着星星的秋千 (晃呀晃呀)
[01:35.00]鲸鱼喷出糖果的喷泉 (甜到脚尖)
[01:40.00]魔法地图画满冒险线 (转个圈圈)
[02:05.00]水晶风筝追着蝴蝶结
[02:11.00]跳跳糖在舌尖开派对
[02:14.00]彩虹滑板穿过梧桐叶
[02:20.00]月亮船摇着光的湖水
[02:24.00]每个气泡都是新世界
[02:29.00]装得下所有奇妙遇见
[02:34.00]在泡泡星球蹦跳向前
[02:38.00]明天又是崭新的乐园</pre>
</figure>

### 6. 日漫心经 —— 心经·动漫风

同一部经文，换成动漫感十足的音色：大副歌能量、戏剧性转调，当代
J-pop 片头曲的情感语法。

<figure class="suno-track">
  <audio controls preload="metadata" oncontextmenu="return false;" controlslist="nodownload" src="https://content.hoelee.com/file/hoelee/music/%E6%97%A5%E6%BC%AB%E5%BF%83%E7%BB%8F.mp3"></audio>
</figure>

### 7. 未接来电 Unread Heartbeats (v2)

一首关于那通未接来电的中文流行情歌：把忙音当心跳，已读不回。v2 是
最终母带——编曲更紧凑、人声混音更干净。（旧版留在我的档案里。）

<figure class="suno-track">
  <audio controls preload="metadata" oncontextmenu="return false;" controlslist="nodownload" src="https://content.hoelee.com/file/hoelee/music/%E6%9C%AA%E6%8E%A5%E6%9D%A5%E7%94%B5-Unread-Heartbeats-v2.mp3"></audio>
</figure>

<script>
// suno-track: sync LRC lyrics with <audio> playback (no dependencies)
document.querySelectorAll('audio[data-lrc]').forEach((audio) => {
  const raw = document.getElementById(audio.dataset.lrc).textContent;
  const lines = raw.split('\n').map((l) => {
    const m = l.match(/\[(\d+):(\d+)(?:\.(\d+))?\](.*)/);
    return m ? { t: +m[1] * 60 + +m[2] + (+(m[3] || '0')) / 100, txt: m[4] } : null;
  }).filter(Boolean);
  const box = document.createElement('div');
  box.className = 'suno-box';
  lines.forEach((l) => { const p = document.createElement('p'); p.textContent = l.txt; box.appendChild(p); });
  audio.parentNode.insertBefore(box, audio.nextSibling);
  let cur = -1;
  audio.addEventListener('timeupdate', () => {
    const now = audio.currentTime;
    let i = lines.findIndex((l) => l.t > now) - 1;
    if (i < 0) i = lines.length - 1;
    if (i !== cur) {
      if (cur >= 0) box.children[cur].classList.remove('on');
      cur = i;
      if (cur >= 0) { box.children[cur].classList.add('on'); box.children[cur].scrollIntoView({ block: 'nearest' }); }
    }
  });
});
</script>

## 完整例子：泡泡星球漫游记，从简报到最后成品

下面是泡泡星球漫游记的完整链条——唯一一份我保留了全部纸面记录的。
它把上面的工作流具体化了。

**第一步——概念简报（我的笔记，中文）：**

> 独立民谣（Indie Folk）：木吉他+口哨声组合，适合突出童趣感
> 人声选择「精灵少女」音色库，自带俏皮气声
> 打击乐：玻璃瓶敲击音效呼应「橘子汽水」意象
> 副歌加入反向混响（reverse reverb）增强魔法感

**第二步——英文风格提示词（实际打进 Suno 的内容）：**

```text
Indie folk vibe with acoustic guitar and playful whistles, fizzy like
orange soda, featuring sprite-girl vocals and clinking glass bottle
beats, reverse reverb brings dreamlike magic
```

一行里压缩四个决定：*乐器*（木吉他 + 口哨）、*感觉*（橘子汽水般冒泡）、
*人声*（精灵少女 + 气声）、*制作技巧*（副歌反向混响造魔法感）。

**第三步——带元标签的歌词稿：**

```text
[Intro][Whistling][Indie][Girl]
彩云兜着阳光转圈圈
贝壳装满彩虹的碎片
跳进橘子汽水的夏天
海鸥掠过浪花的琴键

[Chorus][Indie Folk][Reverse Reverb][Whistling]
泡泡载着梦飞向屋檐(飞呀飞呀)
尾巴挂着星星的秋千(晃呀晃呀)
鲸鱼喷出糖果的喷泉(甜到脚尖)
魔法地图画满冒险线(转个圈圈)

[Verse][Indie][Girl]
橡皮艇划开银河水面
萤火虫点亮薄荷月圆
棉花糖云朵蓬松柔软
流星滑梯通向我窗前

[Chorus]… (repeat)

[Interlude]

[Bridge][Fantasy Pop][Giggles]
水晶风筝追着蝴蝶结
跳跳糖在舌尖开派对
彩虹滑板穿过梧桐叶
月亮船摇着光的湖水

[Outro][Indie Folk][Girl]
每个气泡都是新世界
装得下所有奇妙遇见
在泡泡星球蹦跳向前
明天又是崭新的乐园

[Fade to End]
```

注意元标签比裸歌词稿多约束了什么：段落*标签*（`[Bridge]`、`[Outro]`）、
*演唱方式*（`[Whistling]`、`[Giggles]`）、歌曲中间换*制作风格*
（`[Reverse Reverb]` 只在副歌）、桥段转风格（`[Fantasy Pop]`）。
每句后面的填充语气词——飞呀飞呀、晃呀晃呀——告诉歌手怎么装饰每一行。

**第四步——生成、听、重复。** 每段 3–5 个 take，留最好的，扩展最顺的
副歌。最终成品在上面可播放。

## 换成 v6 我会怎么改

如果今天做这些歌，有四件事会不一样：

1. **段落编辑替代整首重来。** 轮回的渡船的桥段磨了六次生成才满意。
   换成 v6，直接说「桥段放慢、变稀疏，只留人声和拨弦古筝」，其余保留。
2. **单句歌词替换。** 忘川那两句改了四版措辞；v6 只改一行，不重建整首。
3. **Voices / 自定义模型。** v5.5 的 Voices 能让七首歌用同一个歌手，
   而不是七个不同的 AI 声线。
4. **分轨和 Studio。** Premier 的 Studio（带多轨 + MIDI 导出的浏览器
   DAW）可以直接修一个人声瑕疵，不用围着它重新生成。

工艺层——像样的歌词、情绪弧线、诚实的元标签——跨模型版本一直成立。
模型越来越可控；写歌这件事还是人的活。

## 结果

七首原创歌曲，用 Suno AI 写词编曲完成，托管在自己的基础设施上
（`content.hoelee.com`），用原生 HTML5 audio 内嵌、歌词同步——没有录音室
预算、不用约歌手、不用乐手。整个曲库就躺在我 NAS 的一个文件夹里，
跟任何项目一样做版本管理。

想试试 AI 音乐的话，从自己的歌词和一句诚实的风格描述开始——类型、感觉、
人声、一个制作技巧——然后迭代，直到某个 take 让你意外。这就是全部手艺。

---

## 想要原创音乐——或任何 AI 加持的业务方案？

我做网站、Telegram/WhatsApp bot 和自托管基础设施，也为品牌制作原创
AI 辅助音乐：广告歌、背景音乐、活动音频，不需要录音室预算。没有乐手
要预约、没有授权迷宫——你拿到的是真的能用的原创曲目。如果这有用，
欢迎聊聊：

- 📱 **WhatsApp:** [+60 12-797 2969](https://wa.me/60127972969)
- 📧 **Email:** [me@hoelee.com](mailto:me@hoelee.com?subject=Music%20for%20my%20business)
- 🌐 **Website:** [hoelee.com](https://hoelee.com)