---
title: "How I Made My Own Songs with Suno AI"
description: "I wrote the lyrics, tuned the prompts, and shipped seven songs with Suno AI — folk ballads, a kids' tune, an anime-style Heart Sutra. Full workflow + the tracks."
pubDate: 2026-09-11
category: case-studies
tags: [suno, ai-music, music, lyrics, prompting, ai]
ogImage: /og/how-i-made-my-own-songs-with-suno-ai.png
banner: /banners/how-i-made-my-own-songs-with-suno-ai.png
---

I make my own songs. Not by playing an instrument — by writing lyrics,
crafting style prompts, and letting Suno AI produce the voice, the
arrangement, and the mix. This post is the full workflow: how the current
model family works, what I actually type into the prompt boxes, and seven
finished tracks you can play right here.

## Why make your own music with AI?

Two reasons, one personal and one practical.

**Personally:** I like experimenting with creative AI. A song is a tight,
self-contained project — lyrics, style, structure, performance — that
exercises the same prompt-crafting muscles as building a bot or wiring a
pipeline. And the output is shareable in a way a config file never is.

**Practically:** this is now a client skill. Small businesses need jingles,
background music for videos, event music, and branded audio — without a
studio budget. If I can deliver a usable track from a one-page brief,
that's a service, not a party trick. Suno's current **v6** models (released
Sep 9, 2026) made this dramatically more controllable than the V3-era
version I started with in April 2024.

## The current standard: what Suno's models look like in 2026

Version confusion is the first thing to clear up, because old guides
online reference models that don't exist anymore:

| Model | When | Who gets it |
|---|---|---|
| **v6 / v6-wild** | Sep 9, 2026 | Paid plans (flagship + experimental) |
| **v6-mini** | Sep 9, 2026 | Everyone — fast, efficient, great for drafts |
| **v5.5** | Mar 26, 2026 | Paid — added Voices, Custom Models, My Taste |
| **v4.5-all** | Oct 21, 2025 | Free plan (no commercial rights, attribution required) |
| V4 / V4.5 / V5 | 2024–2026 | Paid plans, superseded |

The v6 family added the control features that changed how I work:

- **Plain-language section edits** — "change the chorus so it's sung by a
  gospel choir" edits one section without regenerating the song.
- **Single lyric swaps** — "change 'love' to 'light'" updates one line.
- **Mashups** — combine vocals from one song, drums from another, new
  lyrics, in one request.
- **Sample → isolate → rebuild** — pull a riff at 0:45, isolate the
  guitar, build a beat around it.
- **Multimodal input** — start from text, audio, an image, or even a video.

My own tracks below were made with the earlier V4-era workflow (April
2025). The fundamentals — style field, lyric metatags, iteration — are
unchanged, and I note where v6 would have saved me steps.

## My workflow: lyrics first, style second

The order matters more than people think. Most beginners open Suno, paste
a genre into Simple Mode, and get a generic song. I do the opposite:

1. **Write the song as a document first** — title, structure, lyrics. The
   emotion and the story come from me; Suno supplies the performance.
2. **Craft the style prompt** — genre + mood + era + instruments + vocal
   persona + production, often 200+ characters, describing the *journey*
   of the song, not just its genre.
3. **Add metatags to the lyrics** — `[Verse]`, `[Chorus]`, `[Bridge]`,
   `[Whispered]`, `[Belted]`. Without these, Suno defaults to a flat
   verse-chorus-verse with no emotional arc.
4. **Generate 3–5 takes** per song and keep the best. Repair via
   Extend/Reuse Prompt, and restate the genre in every extension because
   style drifts.
5. **Iterate on pronunciation** — AI singers read phonetically, so I
   respell ("through" → "thru", hyphenate unusual syllables) and always
   test proper nouns in a short clip first.

The worked example below shows exactly what this looks like.

## The songs

Seven tracks, hosted on my own media subdomain (`content.hoelee.com` via
Publitio) and embedded with plain HTML5 audio. Press play:

<style>
.suno-track{margin:2.2rem 0}
.suno-track audio{width:100%;max-width:560px}
.suno-box{max-height:190px;overflow-y:auto;border:1px solid var(--border,#3a3f47);border-radius:8px;padding:.7rem 1rem;margin-top:.6rem;font-size:.95em;line-height:1.6}
.suno-box p{margin:.18rem 0;opacity:.55}
.suno-box p.on{opacity:1;font-weight:600;color:var(--accent,#22c55e)}
</style>

### 1. 轮回的渡船 — The Ferry of Reincarnation

Chinese folk ballad (古风民谣). The ferryman of the River of Forgetfulness,
Meng Po's soup gone cold, a soul that refuses to reboard the wheel of
rebirth. Written as a mythic love story about choosing someone across
lifetimes. Starts hushed over sparse strings and builds to a full,
anguished chorus.

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

English children's song — the original prompt called for a "fizzy,
orange-soda indie folk" sound: acoustic guitar, playful whistling, and
bright kid-friendly vocals. It's the walk-to-school ritual turned into a
tiny anthem: ponytails bouncing, kittens at the café, friends in step.

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

### 3. 新靓 — Heart Sutra, Meditative Beats

The 般若波罗蜜多心经 (Heart Sutra) chanted over rhythmic, meditative
production — the brief was "meditation depth + groove energy". 观自在菩萨
opening, the full 色不異空 passage, ending on 揭諦揭諦. An attempt to make
ancient scripture something you can actually move to.

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

### 4. 新劲 — Fresh Energy

A harder-edged companion to 新靓 — same meditative lineage, more percussive
drive. No lyric sheet on this one; it lives as a vibe piece.

<figure class="suno-track">
  <audio controls preload="metadata" oncontextmenu="return false;" controlslist="nodownload" src="https://content.hoelee.com/file/hoelee/music/%E6%96%B0%E5%8A%B2.mp3"></audio>
</figure>

### 5. 泡泡星球漫游记 — Bubble Planet Adventure

Kids' indie folk, and the one with the most documented backstory — the
full original brief, style prompt, and lyric sheet are in the worked
example below. Bubble planets, candy fountains, a galactic playground.

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

### 6. 日漫心经 — Heart Sutra, Anime Style

The same classical text, reimagined with an anime-inspired sound palette —
big chorus energy, dramatic key lifts, the emotional grammar of
contemporary J-pop openings.

<figure class="suno-track">
  <audio controls preload="metadata" oncontextmenu="return false;" controlslist="nodownload" src="https://content.hoelee.com/file/hoelee/music/%E6%97%A5%E6%BC%AB%E5%BF%83%E7%BB%8F.mp3"></audio>
</figure>

### 7. 未接来电 Unread Heartbeats (v2)

A mandopop ballad about that one missed call: the dial tone as a heartbeat,
the read receipts that stay unread. v2 is the final master — tighter
arrangement, cleaner vocal mix. (The original take stays in my archive.)

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

## Worked example: Bubble Planet Adventure, from brief to track

This is the full chain for 泡泡星球漫游记 — the only one I kept every
scrap of paperwork for. It shows the workflow above in concrete form.

**Step 1 — the concept brief (my notes, in Chinese):**

> 独立民谣（Indie Folk）：木吉他+口哨声组合，适合突出童趣感
> 人声选择「精灵少女」音色库，自带俏皮气声
> 打击乐：玻璃瓶敲击音效呼应「橘子汽水」意象
> 副歌加入反向混响（reverse reverb）增强魔法感

**Step 2 — the English style prompt (what actually went into Suno):**

```text
Indie folk vibe with acoustic guitar and playful whistles, fizzy like
orange soda, featuring sprite-girl vocals and clinking glass bottle
beats, reverse reverb brings dreamlike magic
```

Four decisions compressed into one line: the *instrument* (acoustic
guitar + whistles), the *feel* (fizzy like orange soda), the *voice*
(sprite-girl with airy delivery), and the *production trick* (reverse
reverb on the chorus for the magic feel).

**Step 3 — the lyric sheet with metatags:**

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

Note what the metatags enforce that a bare lyric sheet wouldn't:
section *labels* (`[Bridge]`, `[Outro]`), *delivery* (`[Whistling]`,
`[Giggles]`), a *production change* mid-song (`[Reverse Reverb]` only on
choruses), and a stylistic shift in the bridge (`[Fantasy Pop]`). The
fill-in parentheticals — 飞呀飞呀, 晃呀晃呀 — tell the singer exactly
how to ornament each line.

**Step 4 — generate, listen, repeat.** 3–5 takes per section, keep the
best, extend the chorus that landed. The final track plays above.

## What I'd do differently with v6

If I made these today, four things change:

1. **Section edits instead of full rerolls.** 轮回的渡船's bridge took six
   generations to nail. With v6 I'd say *"make the bridge slower and
   sparser, just voice and a plucked guzheng"* and keep the rest intact.
2. **Single-line lyric swaps.** The 忘川 couplet went through four wordings;
   v6 edits one line without rebuilding the song.
3. **Voices / custom models.** v5.5's Voices would let me keep one
   consistent singer across all seven tracks instead of seven different
   AI vocalists.
4. **Stems and Studio.** On the Premier plan, Studio (a browser DAW with
   multitrack + MIDI export) means fixing a vocal artifact instead of
   regenerating around it.

The craft layer — decent lyrics, an emotional arc, honest metatags —
carries straight across model versions. The models get more controllable;
the songwriting stays the job.

## The result

Seven original songs, written and produced with Suno AI, hosted on my own
infrastructure (`content.hoelee.com`), embedded here with plain HTML5 audio
and synced lyrics — no music-studio budget, no booking a vocalist, no
session musician. The whole catalog lives in one folder on my NAS,
versioned like any other project.

If you're curious about AI music, start with your own lyrics and an honest
style sentence — genre, feel, voice, one production trick — then iterate
until one take surprises you. That's the whole craft.

---

## Want original music — or AI-powered anything — for your business?

I build websites, Telegram/WhatsApp bots, and self-hosted infrastructure,
and I produce original AI-assisted music for brands that want a jingle,
background tracks, or event audio without a studio budget. There's no
session musician to book and no licence maze — you get an original track
you can actually use. If that sounds useful, I'd love to talk:

- 📱 **WhatsApp:** [+60 12-797 2969](https://wa.me/60127972969)
- 📧 **Email:** [me@hoelee.com](mailto:me@hoelee.com?subject=Music%20for%20my%20business)
- 🌐 **Website:** [hoelee.com](https://hoelee.com)