/* ============================================================
 * 《旧物回响》· 把玩互动系统 toys.js
 * 8 件旧物的店内小互动:收音机(拨台听电台)、相机(胶片显影)
 * 为两个精做面板;其余 6 件为「音效 + 小动画」轻互动。
 * 所有音效由 WebAudio 现场合成,不依赖任何音频素材;
 * 电台音乐复用 assets/bgm/reading.mp3,经带通滤波做出
 * 老电子管收音机的"闷罐子"音色。
 * ============================================================ */
(function () {
  const DATA = window.GAME_DATA;
  const byId = Object.fromEntries(DATA.items.map((i) => [i.id, i]));

  /* ---------- WebAudio 合成器 ---------- */
  let ctx = null;
  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function noiseBuf(dur) {
    const c = ac();
    const b = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function tone(freq, dur, peak, type, when) {
    const c = ac(), t = c.currentTime + (when || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function noise(dur, peak, filterType, f0, f1, when) {
    const c = ac(), t = c.currentTime + (when || 0);
    const s = c.createBufferSource();
    s.buffer = noiseBuf(dur);
    const f = c.createBiquadFilter();
    f.type = filterType || 'lowpass';
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.linearRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + dur * 0.15);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(c.destination);
    s.start(t);
  }

  /* ---------- 各物件音效 ---------- */
  function sndPour() {    // 搪瓷缸:热水冲进缸
    noise(0.55, 0.13, 'bandpass', 950, 0, 0);
    noise(0.7, 0.1, 'lowpass', 520, 380, 0.5);
    tone(340, 0.4, 0.04, 'sine', 0.55);
  }
  function sndRustle() {  // 饼干盒:盒盖滑开+信纸
    noise(0.1, 0.16, 'highpass', 1100, 0, 0);
    noise(0.08, 0.12, 'highpass', 1600, 0, 0.13);
    noise(0.22, 0.1, 'highpass', 900, 2400, 0.26);
  }
  function sndCloth() {   // 手帕:布料抖开
    noise(0.5, 0.12, 'lowpass', 500, 1600, 0);
    noise(0.24, 0.07, 'lowpass', 1200, 600, 0.34);
  }
  function sndPedal() {   // 缝纫机:咔嗒咔嗒
    for (let i = 0; i < 11; i++) {
      tone(i % 2 ? 1050 : 880, 0.05, 0.16, 'square', i * 0.13);
    }
  }
  function sndFrog() {    // 青蛙:上弦→跳两下→侧身倒
    let t = 0;
    for (let i = 0; i < 10; i++) { t += 0.13 - i * 0.005; tone(920, 0.03, 0.12, 'square', t); }
    const jump = (w) => {
      const c = ac(), tt = c.currentTime + w;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(680, tt);
      o.frequency.exponentialRampToValueAtTime(170, tt + 0.13);
      g.gain.setValueAtTime(0.15, tt);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.15);
      o.connect(g).connect(c.destination);
      o.start(tt); o.stop(tt + 0.2);
    };
    jump(1.25);
    jump(1.85);
    tone(1400, 0.04, 0.12, 'square', 2.55);
    tone(420, 0.2, 0.1, 'sine', 2.6);
  }
  function sndScrew() {   // 水壶:拧盖棘轮+轻磕
    for (let i = 0; i < 5; i++) tone(1500, 0.028, 0.12, 'square', i * 0.14);
    tone(2350, 0.16, 0.07, 'sine', 0.78);
  }
  function sndShutter() { // 相机:快门
    noise(0.025, 0.2, 'highpass', 2600, 0, 0);
    tone(320, 0.04, 0.14, 'square', 0.03);
  }
  function sndPing() {    // 显影完成
    tone(1320, 0.7, 0.12);
    tone(1980, 0.5, 0.05, 'sine', 0.02);
  }

  /* ---------- 收音机电台 ---------- */
  const STATIONS = [
    {
      name: '城南人民广播电台', pos: 16, static: 0.05, music: false,
      lines: [
        '现在是天气预报。今夜到明天,晴转多云,东南风二级。晒着的谷子,趁天黑前收进仓吧。',
        '听众来信。一位姓周的师傅来信说,想点一支歌,送给当年手把手教他手艺的师父——他说,师父的耳朵,比仪器还准。',
        '下面播送本台提醒:秋凉了,夜里听收音机的同志,添件衣裳。',
      ],
    },
    {
      name: '音乐台', pos: 46, static: 0.035, music: true,
      lines: [
        '现在为您播放:轻音乐。',
        '愿这支曲子,陪着您手里没做完的活计。',
      ],
    },
    {
      name: '深夜点歌台', pos: 80, static: 0.17, music: true, muffled: true,
      lines: [
        '这个台,信号不好。',
        '只有半支歌,和一片沙沙的、像下着雨的声音。',
      ],
    },
  ];

  /* ---------- 相机胶片 ---------- */
  /* thumb 为胶片条专用小图(几KB),主图沿用场景原图与故事共享浏览器缓存 */
  const FRAMES = [
    { img: 'assets/img/scene/cam_frame.jpg',    thumb: 'assets/img/thumb/cam_frame_t.jpg',    cap: '一九五八 · 十四岁,进馆当学徒的第一天' },
    { img: 'assets/img/scene/cam_shop.jpg',     thumb: 'assets/img/thumb/cam_shop_t.jpg',     cap: '八十年代 · 东风照相馆,布景前站满了人' },
    { img: 'assets/img/scene/cam_darkroom.jpg', thumb: 'assets/img/thumb/cam_darkroom_t.jpg', cap: '暗房 · 红灯下,师傅说:手要稳,眼要准,心要静' },
    { img: 'assets/img/scene/cam_archive.jpg',  thumb: 'assets/img/thumb/cam_archive_t.jpg',  cap: '铁柜 · 四十年的底片袋,编号从〇〇一排到一千' },
    { img: 'assets/img/scene/cam_deliver.jpg',  thumb: 'assets/img/thumb/cam_deliver_t.jpg',  cap: '三十里土路 · 蓝布包着的相框,送到了堂屋' },
    { img: 'assets/img/scene/cam_display.jpg',  thumb: 'assets/img/thumb/cam_display_t.jpg',  cap: '第一千家 · 「等想看的人,回来看」' },
  ];

  /* ---------- 轻互动入口文字 ---------- */
  const MINI_ACT = {
    mug: '沏一杯热茶',
    tin: '打开盒盖',
    hanky: '凑近看',
    sewing: '踩两脚踏板',
    frog: '上几圈发条',
    canteen: '拧开壶盖',
  };

  /* ---------- 弹层骨架 ---------- */
  const overlay = document.createElement('div');
  overlay.id = 'toy-overlay';
  overlay.innerHTML =
    '<div class="toy-panel" role="dialog" aria-modal="true">' +
    '  <button class="toy-close">× 放回货架</button>' +
    '  <h3 id="toy-title"></h3>' +
    '  <div id="toy-stage"></div>' +
    '  <p id="toy-line"></p>' +
    '</div>';
  document.body.appendChild(overlay);
  const stage = overlay.querySelector('#toy-stage');
  const titleEl = overlay.querySelector('#toy-title');
  const lineEl = overlay.querySelector('#toy-line');

  let cleanup = null; // 每种玩法注册自己的清理函数

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('.toy-close').addEventListener('click', close);

  function open(id) {
    if (!byId[id]) return;
    close();
    titleEl.textContent = byId[id].name;
    lineEl.textContent = '';
    stage.innerHTML = '';
    if (id === 'radio') buildRadio();
    else if (id === 'camera') buildCamera();
    else buildMini(id);
    overlay.classList.add('open');
  }
  function close() {
    if (!overlay.classList.contains('open')) return;
    if (cleanup) { cleanup(); cleanup = null; }
    overlay.classList.remove('open');
    if (window.OEBGM && window.OEBGM.duck) window.OEBGM.duck(false);
  }
  function esc(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', esc);

  /* ---------- 轻互动:六件各有小场景 ---------- */
  function miniFrame(inner, act, onAct) {
    stage.innerHTML =
      '<div class="mini-scene">' + inner + '</div>' +
      '<div class="toy-act-row"><button class="btn toy-act">' + act + '</button></div>';
    const btn = stage.querySelector('.toy-act');
    btn.addEventListener('click', onAct);
    return { box: stage.querySelector('.mini-scene'), btn };
  }

  /* 搪瓷缸:沏一杯热茶,白汽一缕一缕往上爬 */
  function buildMug(alive) {
    const { box, btn } = miniFrame(
      '<img class="toy-img" src="' + byId.mug.img + '" alt="">' +
      '<i class="steam s1"></i><i class="steam s2"></i><i class="steam s3"></i>',
      '沏一杯热茶',
      () => {
        if (!alive.on) return;
        box.classList.remove('steaming');
        void box.offsetWidth;
        box.classList.add('steaming');
        sndPour();
        setTimeout(() => {
          if (!alive.on) return;
          lineEl.textContent = '热气,一缕一缕地往上爬——像那年夜班,老周从怀里摸出茶叶,泡的半缸子热茶。';
        }, 1400);
      });
    lineEl.textContent = '白瓷磕掉了一块,露出黑铁。缸里,还留着一点茶垢。';
    setTimeout(() => btn.click(), 250);
  }

  /* 饼干盒:开盖见信,解绳读信 */
  function buildTin(alive) {
    const { box, btn } = miniFrame(
      '<div class="tin">' +
      '  <div class="tin-inside">' +
      '    <i class="letter-stack ls-a"></i><i class="letter-stack ls-b"></i><i class="letter-stack ls-c"></i>' +
      '    <i class="red-string rs-h"></i><i class="red-string rs-v"></i>' +
      '  </div>' +
      '  <div class="tin-letter">' +
      '    <div class="tl-flap"></div>' +
      '    <p class="tl-text">你的字,像砖坯上刻的,<br>笨——可我认得。</p>' +
      '    <i class="tl-stamp"></i>' +
      '  </div>' +
      '  <div class="tin-lid"><span>囍</span></div>' +
      '</div>',
      '打开盒盖',
      () => {
        if (!alive.on) return;
        if (!box.classList.contains('lid-open')) {
          box.classList.add('lid-open');
          sndRustle();
          btn.textContent = '解开红头绳';
          lineEl.textContent = '里面没有饼干——一沓信,红头绳捆着。信封黄了,八分的邮票,端端正正。';
          return;
        }
        if (!box.classList.contains('letter-out')) {
          box.classList.add('letter-out');
          sndRustle();
          setTimeout(() => { if (alive.on) box.classList.add('letter-read'); }, 750);
          setTimeout(() => {
            if (!alive.on) return;
            lineEl.textContent = '最上面这封,是她的回信。字笨,可一笔,是一笔。';
          }, 1500);
          btn.textContent = '叠好,放回去';
          return;
        }
        box.classList.remove('letter-out', 'letter-read');
        btn.textContent = '解开红头绳';
        lineEl.textContent = '信,一沓一沓码好。红头绳,重新捆上。';
      });
    lineEl.textContent = '铁皮盒的漆色薄了。盒盖上那个红双喜,倒还留着颜色。';
    setTimeout(() => btn.click(), 250);
  }

  /* 手帕:凑近看,折痕深处的字 */
  function buildHanky(alive) {
    const { box, btn } = miniFrame(
      '<div class="hanky-wrap">' +
      '  <img class="hanky-img" src="' + byId.hanky.img + '" alt="">' +
      '  <i class="hanky-crease"></i>' +
      '  <span class="hanky-words">我等你</span>' +
      '</div>',
      '凑近看',
      () => {
        if (!alive.on) return;
        const z = box.classList.toggle('zoom');
        btn.textContent = z ? '退远些' : '凑近看';
        if (z) {
          sndCloth();
          lineEl.textContent = '折痕最深处——好像,有字。';
          setTimeout(() => {
            if (alive.on && box.classList.contains('zoom'))
              lineEl.textContent = '针脚很深。像要把这三个字,按进布的骨头里。';
          }, 2400);
        } else {
          lineEl.textContent = '叠好。折痕,深得快要断开。';
        }
      });
    lineEl.textContent = '细白棉布,锁着一圈细细的牙针。帕角,绣着并蒂莲。';
  }

  /* 缝纫机:踩踏板,红格子布走线 */
  function buildSewing(alive) {
    const { box, btn } = miniFrame(
      '<img class="sew-machine" src="' + byId.sewing.img + '" alt="">' +
      '<div class="sew-table">' +
      '  <i class="sew-cloth"></i>' +
      '  <i class="sew-stitch"></i>' +
      '  <i class="sew-needle"></i>' +
      '</div>',
      '踩两脚踏板',
      () => {
        if (!alive.on) return;
        box.classList.remove('running', 'done');
        void box.offsetWidth;
        box.classList.add('running');
        sndPedal();
        setTimeout(() => { if (alive.on) sndPedal(); }, 1450);
        setTimeout(() => {
          if (!alive.on) return;
          box.classList.remove('running');
          box.classList.add('done');
          lineEl.textContent = '咔嗒,咔嗒。针脚要匀——娘说,人这一辈子,跟踩机器一个理:别慌。';
        }, 2900);
      });
    lineEl.textContent = '「蝴蝶牌」三个金字,还亮着。红格子布,已经绷好了。';
    setTimeout(() => btn.click(), 250);
  }

  /* 铁皮青蛙:上弦,跳两下,侧身倒 */
  function buildFrog(alive) {
    const { box, btn } = miniFrame(
      '<div class="frog-stage"><i class="frog-key"></i>' +
      '<img class="frog-img" src="' + byId.frog.img + '" alt="">' +
      '</div>',
      '上几圈发条',
      () => {
        if (!alive.on) return;
        box.classList.remove('wound');
        void box.offsetWidth;
        box.classList.add('wound');
        sndFrog();
        setTimeout(() => {
          if (alive.on) lineEl.textContent = '跳两下,侧身——倒了。隔了五十年,还是这个脾气。';
        }, 3400);
      });
    lineEl.textContent = '「上八圈就行!二十圈,崩发条!」——这话,说了一代,又传一代。';
    setTimeout(() => btn.click(), 250);
  }

  /* 军用水壶:拧开盖,灯下看刻字 */
  function buildCanteen(alive) {
    const { box, btn } = miniFrame(
      '<div class="cant-row">' +
      '  <img class="cant-img" src="' + byId.canteen.img + '" alt="">' +
      '  <div class="cant-cap"><span>赠 王铁柱<br>一九七一</span></div>' +
      '</div>',
      '拧开壶盖',
      () => {
        if (!alive.on) return;
        const opened = box.classList.toggle('opened');
        if (opened) {
          sndScrew();
          btn.textContent = '凑到灯下看看';
          lineEl.textContent = '盖子拧开,一股淡淡的茶叶味——散不掉的那种。';
          setTimeout(() => {
            if (!alive.on) return;
            box.classList.add('engraved');
            lineEl.textContent = '借着灯光,壶盖内壁有一行极小的刻字——「赠 王铁柱,一九七一」。他的老班长。';
          }, 1300);
        } else {
          box.classList.remove('engraved');
          btn.textContent = '拧开壶盖';
          lineEl.textContent = '把盖子拧回去。茶要酽,日子才顶得住。';
        }
      });
    lineEl.textContent = '帆布背带,磨穿了两个洞。绿漆磕出的白点,像一身的勋章。';
    setTimeout(() => btn.click(), 250);
  }

  function buildMini(id) {
    const alive = { on: true };
    cleanup = () => { alive.on = false; };
    const builders = { mug: buildMug, tin: buildTin, hanky: buildHanky, sewing: buildSewing, frog: buildFrog, canteen: buildCanteen };
    (builders[id] || buildMug)(alive);
  }

  /* ---------- 收音机 ---------- */
  let radio = null;
  function buildRadio() {
    stage.innerHTML =
      '<div class="radio-box">' +
      '  <div class="radio-top"><span class="radio-brand">熊猫牌</span><span class="radio-light" id="radio-light"></span></div>' +
      '  <div class="radio-dial"><div class="dial-scale">' +
      '    <span>55</span><span>65</span><span>80</span><span>100</span><span>120</span><span>160</span>' +
      '  </div><div class="dial-needle" id="dial-needle"></div></div>' +
      '  <div class="radio-grill"></div>' +
      '  <p class="radio-station" id="radio-station">—— 兆赫 ——</p>' +
      '  <p class="radio-line" id="radio-line"></p>' +
      '  <button class="btn toy-act" id="radio-tune">拨一个台</button>' +
      '</div>';
    lineEl.textContent = '旋钮还有点涩。拧一拧,听听这店里,从前响过的声音。';

    if (window.OEBGM && window.OEBGM.duck) window.OEBGM.duck(true);

    const c = ac();
    /* 电流沙沙声 */
    const sSrc = c.createBufferSource();
    sSrc.buffer = noiseBuf(2);
    sSrc.loop = true;
    const sBp = c.createBiquadFilter();
    sBp.type = 'bandpass'; sBp.frequency.value = 1800; sBp.Q.value = 0.6;
    const sGain = c.createGain(); sGain.gain.value = 0;
    sSrc.connect(sBp).connect(sGain).connect(c.destination);
    sSrc.start();
    /* 音乐走带通滤波,做出收音机喇叭味 */
    const audio = new Audio('assets/bgm/reading.mp3');
    audio.loop = true;
    const mSrc = c.createMediaElementSource(audio);
    const mBp = c.createBiquadFilter();
    mBp.type = 'bandpass'; mBp.frequency.value = 1400; mBp.Q.value = 0.55;
    const mGain = c.createGain(); mGain.gain.value = 0;
    mSrc.connect(mBp).connect(mGain).connect(c.destination);

    radio = { sGain, audio, mGain, idx: -1, lineTimer: null, tuning: false };

    const needle = stage.querySelector('#dial-needle');
    const stationEl = stage.querySelector('#radio-station');
    const lineElR = stage.querySelector('#radio-line');

    function showLine(text) {
      lineElR.classList.remove('show');
      void lineElR.offsetWidth;
      lineElR.textContent = text;
      lineElR.classList.add('show');
    }
    function startStation(st) {
      if (!radio) return;
      stationEl.textContent = st.name + ' · ' + (55 + st.pos * 1.05).toFixed(0) + ' 千赫';
      let li = 0;
      showLine(st.lines[0]);
      clearInterval(radio.lineTimer);
      radio.lineTimer = setInterval(() => {
        li = (li + 1) % st.lines.length;
        showLine(st.lines[li]);
      }, 4600);
      if (st.music) {
        radio.audio.currentTime = 0;
        radio.mGain.gain.linearRampToValueAtTime(st.muffled ? 0.08 : 0.16, c.currentTime + 0.6);
        radio.audio.play().catch(() => {});
      }
      radio.sGain.gain.linearRampToValueAtTime(st.static, c.currentTime + 0.4);
    }
    function stopStation() {
      if (!radio) return;
      clearInterval(radio.lineTimer);
      radio.mGain.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.25);
      radio.audio.pause();
      lineElR.textContent = '';
      stationEl.textContent = '—— 兆赫 ——';
    }
    function tune() {
      if (!radio || radio.tuning) return;
      radio.tuning = true;
      stopStation();
      /* 拨台:先满噪声,指针摆动,再落台 */
      radio.sGain.gain.linearRampToValueAtTime(0.22, c.currentTime + 0.1);
      let n = 0;
      const wobble = setInterval(() => {
        if (!radio) { clearInterval(wobble); return; }
        n++;
        needle.style.left = (20 + Math.random() * 60) + '%';
        if (n >= 4) {
          clearInterval(wobble);
          radio.wobble = null;
          let next;
          do { next = Math.floor(Math.random() * STATIONS.length); } while (next === radio.idx);
          radio.idx = next;
          const st = STATIONS[next];
          needle.style.left = st.pos + '%';
          setTimeout(() => {
            if (!radio) return;
            startStation(st);
            radio.tuning = false;
          }, 500);
        }
      }, 160);
      radio.wobble = wobble;
    }

    stage.querySelector('#radio-tune').addEventListener('click', tune);
    radio.light = stage.querySelector('#radio-light');
    radio.light.classList.add('on');

    cleanup = function () {
      if (!radio) return;
      clearInterval(radio.lineTimer);
      clearInterval(radio.wobble);
      try {
        radio.sGain.gain.value = 0;
        radio.mGain.gain.value = 0;
        radio.audio.pause();
        sSrc.stop();
      } catch (e) { /* 已停止 */ }
      radio = null;
    };
    setTimeout(tune, 400);
  }

  /* ---------- 相机胶片 ---------- */
  function buildCamera() {
    stage.innerHTML =
      '<div class="film-viewer">' +
      '  <img id="film-img" alt="" decoding="async">' +
      '  <p id="film-cap"></p>' +
      '</div>' +
      '<div class="film-strip" id="film-strip"></div>' +
      '<div class="toy-act-row"><button class="btn toy-act" id="film-next">下一张底片</button></div>';
    lineEl.textContent = '铁柜最顺手那一格里,还有一卷没冲完的底片。压一压,让它慢慢显影。';

    const viewer = stage.querySelector('.film-viewer');
    const strip = stage.querySelector('#film-strip');
    const img = stage.querySelector('#film-img');
    const cap = stage.querySelector('#film-cap');
    let cur = 0;
    const loaded = new Set();

    FRAMES.forEach((f, i) => {
      const d = document.createElement('button');
      d.className = 'film-frame';
      d.innerHTML = '<img src="' + f.thumb + '" alt="" loading="lazy" decoding="async">';
      d.addEventListener('click', () => show(i));
      strip.appendChild(d);
    });
    const frames = [...strip.children];

    /* 主图按顺序后台预载:第 1 张立即上屏,其余排队加载 */
    (function preload(i) {
      if (i >= FRAMES.length) return;
      const p = new Image();
      p.onload = () => { loaded.add(FRAMES[i].img); preload(i + 1); };
      p.src = FRAMES[i].img;
    })(0);

    img.addEventListener('load', () => {
      loaded.add(FRAMES[cur].img);
      viewer.classList.remove('loading');
    });

    function show(i) {
      cur = i;
      frames.forEach((f, k) => f.classList.toggle('cur', k === i));
      cap.textContent = '';
      img.classList.remove('dev');
      if (!loaded.has(FRAMES[i].img)) viewer.classList.add('loading');
      img.src = FRAMES[i].img;
      void img.offsetWidth;
      sndShutter();
    }
    function develop() {
      if (img.classList.contains('dev')) { show((cur + 1) % FRAMES.length); return; }
      img.classList.add('dev');
      setTimeout(() => {
        cap.textContent = FRAMES[cur].cap;
        sndPing();
      }, 900);
    }
    stage.querySelector('#film-next').addEventListener('click', develop);
    img.addEventListener('click', develop);
    show(0);
    cleanup = function () { /* 无常驻资源 */ };
  }

  /* ---------- 对外 ---------- */
  window.ToyBox = { open, close, has: (id) => id === 'radio' || id === 'camera' || !!MINI_ACT[id] };
})();
