/* ============================================================
 * 《旧物回响》游戏逻辑
 * 页面切换 / 打字机阅读 / 选择分支 / localStorage 存档
 * ============================================================ */
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  const DATA = window.GAME_DATA;
  const ITEMS = DATA.items;

  const KEY = {
    read: 'oe_read',
    choices: 'oe_choices',
    endings: 'oe_endings',
    intro: 'oe_intro',
    ending: 'oe_ending',
  };

  const store = {
    get read() {
      try { return new Set(JSON.parse(localStorage.getItem(KEY.read) || '[]')); }
      catch (e) { return new Set(); }
    },
    set read(v) { localStorage.setItem(KEY.read, JSON.stringify([...v])); },
    get choices() {
      try { return JSON.parse(localStorage.getItem(KEY.choices) || '{}'); }
      catch (e) { return {}; }
    },
    set choices(v) { localStorage.setItem(KEY.choices, JSON.stringify(v)); },
    get endings() {
      try { return JSON.parse(localStorage.getItem(KEY.endings) || '{}'); }
      catch (e) { return {}; }
    },
    set endings(v) { localStorage.setItem(KEY.endings, JSON.stringify(v)); },
    get introSeen() { return localStorage.getItem(KEY.intro) === '1'; },
    set introSeen(v) { localStorage.setItem(KEY.intro, v ? '1' : '0'); },
    get endingSeen() { return localStorage.getItem(KEY.ending) === '1'; },
    set endingSeen(v) { localStorage.setItem(KEY.ending, v ? '1' : '0'); },
  };

  let read = store.read;
  let choices = store.choices;

  /* ---------- 背景音乐 ---------- */
  const BGM_FILES = {
    title: 'assets/bgm/title.mp3',
    reading: 'assets/bgm/reading.mp3',
    ending: 'assets/bgm/ending.mp3',
  };
  const bgm = {
    current: null,
    els: {},
    muted: localStorage.getItem('oe_muted') === '1',
    unlocked: false,
  };
  let bgmFadeTimer = null;

  function bgmEl(name) {
    if (!bgm.els[name]) {
      const a = new Audio(BGM_FILES[name]);
      a.loop = true;
      a.volume = 0;
      a.preload = 'none';
      bgm.els[name] = a;
    }
    return bgm.els[name];
  }

  function updateMuteUI() {
    const label = bgm.muted ? '音乐 关' : '音乐 开';
    ['#btn-mute-title', '#btn-mute-shop'].forEach((s) => {
      const el = $(s);
      if (el) el.textContent = label;
    });
  }

  function playBgm(name) {
    bgm.current = name;
    updateMuteUI();
    if (!bgm.unlocked) return;
    if (bgm.muted) {
      Object.values(bgm.els).forEach((a) => a.pause());
      return;
    }
    const next = bgmEl(name);
    const olds = Object.values(bgm.els).filter((a) => a !== next && !a.paused);
    next.play().catch(() => {});
    clearInterval(bgmFadeTimer);
    const t0 = performance.now();
    bgmFadeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / 800);
      olds.forEach((a) => (a.volume = 0.5 * (1 - k)));
      next.volume = 0.5 * k;
      if (k >= 1) {
        clearInterval(bgmFadeTimer);
        olds.forEach((a) => a.pause());
      }
    }, 50);
  }

  function toggleMute() {
    bgm.muted = !bgm.muted;
    localStorage.setItem('oe_muted', bgm.muted ? '1' : '0');
    updateMuteUI();
    clearInterval(bgmFadeTimer);
    if (bgm.muted) {
      Object.values(bgm.els).forEach((a) => a.pause());
    } else if (bgm.unlocked && bgm.current) {
      const a = bgmEl(bgm.current);
      a.volume = 0.5;
      a.play().catch(() => {});
    }
  }

  /* 把玩互动用:临时停掉店内音乐(如收音机响的时候),关掉后恢复 */
  window.OEBGM = {
    duck(on) {
      if (on) {
        const cur = bgm.els[bgm.current];
        if (cur && !cur.paused) cur.pause();
      } else if (bgm.unlocked && !bgm.muted && bgm.current) {
        const a = bgmEl(bgm.current);
        a.volume = 0.5;
        a.play().catch(() => {});
      }
    },
  };

  let unit = null;
  let pageIndex = 0;
  let typing = false;
  let typeTimer = null;
  let phase = 'idle'; // typing | waiting | choosing | endingTyping | finished
  let fromCollection = false;
  let endingText = '';
  let nodeId = null;
  let fullText = '';
  let bgIndex = 0;
  let typeGen = 0;
  const ART_VER = 'p5';

  /* 背景 = 同图深模糊铺底(窄屏上下留白区) + 横版插画(窄屏 contain 完整显示 / 宽屏 cover 铺满);物件图压暗 */
  function setStoryBg(src, isObject) {
    const idx = bgIndex;
    bgIndex = 1 - bgIndex;
    const bdNext = idx ? $('#story-bg-b') : $('#story-bg-a');
    const bdPrev = idx ? $('#story-bg-a') : $('#story-bg-b');
    const artNext = idx ? $('#story-art-b') : $('#story-art-a');
    const artPrev = idx ? $('#story-art-a') : $('#story-art-b');
    if (!bdNext || !artNext) return;
    const v = src + (src.includes('?') ? '&' : '?') + 'v=' + ART_VER;

    const revealBd = () => {
      bdNext.classList.add('show');
      bdPrev.classList.remove('show');
    };
    bdNext.onload = revealBd;
    bdNext.src = v;
    if (bdNext.complete && bdNext.naturalWidth > 0) {
      bdNext.onload = null;
      revealBd();
    }

    artNext.classList.toggle('dim', !!isObject);
    const revealArt = () => {
      artNext.classList.add('show');
      artPrev.classList.remove('show');
    };
    artNext.onload = revealArt;
    artNext.src = v;
    if (artNext.complete && artNext.naturalWidth > 0) {
      artNext.onload = null;
      revealArt();
    }
  }

  function show(id) {
    $$('.screen').forEach((s) => s.classList.remove('active'));
    $(id).classList.add('active');
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
  }

  function clearSave() {
    Object.values(KEY).forEach((k) => localStorage.removeItem(k));
    read = store.read;
    choices = store.choices;
  }

  /* ---------- 标题页 ---------- */
  function initTitle() {
    const hasSave = store.introSeen || read.size > 0;
    if (hasSave) {
      $('#btn-start').textContent = '从头开始';
      $('#btn-continue').style.display = '';
    }
  }

  /* ---------- 小店探索页 ---------- */
  function enterShop() {
    renderShop();
    show('#screen-shop');
    playBgm('title');
  }

  function renderShop() {
    const area = $('#shelf-area');
    area.innerHTML = '';
    const groups = [ITEMS.slice(0, 3), ITEMS.slice(3, 6), ITEMS.slice(6, 8)];
    groups.forEach((group, gi) => {
      const shelf = document.createElement('div');
      shelf.className = 'shelf' + (gi === 2 ? ' shelf-two' : '');
      group.forEach((it) => {
        const slot = document.createElement('button');
        slot.className = 'slot ' + (read.has(it.id) ? 'read' : 'unread');
        slot.dataset.id = it.id;
        slot.innerHTML =
          `<span class="toy-btn" data-toy="${it.id}">把玩</span>` +
          `<img class="item-img" src="${it.img}" alt="${it.name}">` +
          `<span class="price-tag"><b>${it.name}</b><em>陈伯寄卖</em></span>`;
        shelf.appendChild(slot);
      });
      area.appendChild(shelf);
    });
    $('#progress').textContent = `已唤醒 ${read.size} / ${ITEMS.length} 件旧物`;

    const all = read.size >= ITEMS.length;
    const sign = $('#door-sign');
    sign.classList.toggle('ready', all && !store.endingSeen);
    sign.classList.toggle('open', all && store.endingSeen);
    $('#sign-text').textContent = all && store.endingSeen ? '营业中' : '歇业中';

    if (all && !store.endingSeen) toast('货架空了。门口的木牌,好像在等什么。');
  }

  /* ---------- 故事阅读 ---------- */
  function playUnit(u, opts = {}) {
    unit = u;
    pageIndex = 0;
    fromCollection = opts.from === 'collection';
    playBgm(u.id === 'ending' ? 'ending' : 'reading');
    setStoryBg(u.img, true);
    $('#story-name').textContent = u.name;
    $('#story-era').textContent = u.era;
    $('#btn-finish').textContent = u.finishLabel;
    $('#story-actions').classList.remove('show');
    $('#choice-box').innerHTML = '';
    $('#choice-prompt').style.display = 'none';
    $('#story-hint').classList.remove('show');
    show('#screen-story');
    if (u.nodes) {
      nodeId = u.start;
      playNode();
    } else {
      typePage();
    }
  }

  function playNode() {
    const node = unit.nodes[nodeId];
    if (node.img) setStoryBg(node.img);
    phase = 'typing';
    $('#story-actions').classList.remove('show');
    $('#story-hint').classList.remove('show');
    $('#choice-box').innerHTML = '';
    $('#choice-prompt').style.display = 'none';
    setPageLabel();
    fullText = node.text;
    typeOut(node.text);
  }

  function typeOut(text, onDone) {
    clearInterval(typeTimer);
    const gen = ++typeGen;
    const el = $('#story-text');
    const body = $('#story-body');
    if (typeof text !== 'string') text = String(text ?? '');
    const done = onDone || finishTyping;
    if (!el) { typing = false; done(); return; }
    el.textContent = '';
    typing = true;
    let i = 0;
    typeTimer = setInterval(() => {
      if (gen !== typeGen) { clearInterval(typeTimer); return; }
      if (i >= text.length) {
        clearInterval(typeTimer);
        typing = false;
        done();
        return;
      }
      el.textContent += text[i++];
      if (body && body.scrollHeight > body.clientHeight) body.scrollTop = body.scrollHeight;
    }, 40);
  }

  function typePage() {
    phase = 'typing';
    $('#story-actions').classList.remove('show');
    $('#story-hint').classList.remove('show');
    setPageLabel();
    fullText = unit.pages[pageIndex];
    typeOut(fullText);
  }

  function finishTyping() {
    clearInterval(typeTimer);
    typing = false;
    const t = $('#story-text');
    if (t) t.textContent = fullText;
    if (unit.nodes) {
      const node = unit.nodes[nodeId];
      if (node.choices) {
        showNodeChoices(node);
      } else if (node.next) {
        phase = 'waiting';
        $('#story-hint').classList.add('show');
      } else {
        showFinish();
      }
      return;
    }
    const isLast = pageIndex === unit.pages.length - 1;
    if (isLast) {
      if (unit.choice) showChoices();
      else showFinish();
    } else {
      phase = 'waiting';
      $('#story-hint').classList.add('show');
    }
  }

  function setPageLabel() {
    const el = $('#story-page-num');
    if (unit && unit.nodes) {
      el.textContent = '';
      return;
    }
    if (phase === 'endingTyping' || phase === 'finished') {
      el.textContent = '';
    } else {
      el.textContent = `${pageIndex + 1} / ${unit.pages.length}`;
    }
  }

  function showNodeChoices(node) {
    phase = 'choosing';
    setPageLabel();
    $('#choice-prompt').style.display = '';
    $('#choice-prompt').textContent = node.prompt;
    const box = $('#choice-box');
    box.innerHTML = '';
    node.choices.forEach((opt) => {
      const b = document.createElement('button');
      b.className = 'choice-btn';
      b.innerHTML =
        `<span class="choice-label">${opt.label}</span>` +
        (opt.tag ? `<span class="choice-tag">${opt.tag}</span>` : '');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        nodeId = opt.to;
        playNode();
      });
      box.appendChild(b);
    });
    $('#btn-finish').style.display = 'none';
    $('#story-actions').classList.add('show');
  }

  function showChoices() {
    phase = 'choosing';
    setPageLabel();
    $('#choice-prompt').style.display = '';
    $('#choice-prompt').textContent = unit.choice.prompt;
    const box = $('#choice-box');
    box.innerHTML = '';
    unit.choice.options.forEach((opt, i) => {
      const b = document.createElement('button');
      b.className = 'choice-btn';
      b.textContent = opt.label;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        onChoose(i);
      });
      box.appendChild(b);
    });
    $('#btn-finish').style.display = 'none';
    $('#story-actions').classList.add('show');
  }

  function onChoose(i) {
    choices[unit.id] = i;
    store.choices = choices;
    phase = 'endingTyping';
    setPageLabel();
    $('#choice-box').innerHTML = '';
    $('#choice-prompt').style.display = 'none';
    $('#story-actions').classList.remove('show');
    $('#story-hint').classList.remove('show');

    endingText = unit.choice.options[i].ending;
    fullText = endingText;
    typeOut(endingText, showFinish);
  }

  function showFinish() {
    phase = 'finished';
    setPageLabel();
    const node = unit.nodes ? unit.nodes[nodeId] : null;
    $('#btn-finish').textContent = (node && node.finishLabel) || unit.finishLabel;
    $('#btn-finish').style.display = '';
    $('#story-actions').classList.add('show');
  }

  $('#screen-story').addEventListener('click', (e) => {
    if (e.target.closest('#story-actions')) return;
    if (typing) {
      clearInterval(typeTimer);
      typeGen++;
      typing = false;
      const t = $('#story-text');
      if (t) t.textContent = fullText;
      const body = $('#story-body');
      if (body && body.scrollHeight > body.clientHeight) body.scrollTop = body.scrollHeight;
      if (phase === 'endingTyping') showFinish();
      else finishTyping();
      return;
    }
    if (phase === 'waiting') {
      if (unit.nodes) {
        nodeId = unit.nodes[nodeId].next;
        playNode();
      } else {
        pageIndex += 1;
        typePage();
      }
    }
  });

  $('#btn-finish').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!unit) return;
    if (unit.id === 'intro') {
      store.introSeen = true;
      enterShop();
      toast('陈记旧物,今天起由你照看。');
      return;
    }
    if (unit.id === 'ending') {
      store.endingSeen = true;
      show('#screen-credits');
      return;
    }
    const isNew = !read.has(unit.id);
    read.add(unit.id);
    store.read = read;

    let endingToast = '';
    const node = unit.nodes ? unit.nodes[nodeId] : null;
    if (node && node.ending) {
      const all = store.endings;
      const got = all[unit.id] || [];
      if (!got.includes(node.ending)) {
        got.push(node.ending);
        all[unit.id] = got;
        store.endings = all;
        const total = Object.values(unit.nodes).filter((n) => n.ending).length;
        endingToast = `《${unit.name}》新结局解锁(${got.length}/${total})`;
      }
    }
    if (node && node.eggTo) {
      const all = store.endings;
      const got = all[unit.id] || [];
      if (!got.includes('egg')) {
        got.push('egg');
        all[unit.id] = got;
        store.endings = all;
        toast(`《${unit.name}》已收入回响集`);
        nodeId = node.eggTo;
        playNode();
        return;
      }
    }

    if (fromCollection) {
      openCollection();
      if (endingToast) toast(endingToast);
      return;
    }
    enterShop();
    if (isNew) toast(`《${unit.name}》已收入回响集`);
    else if (endingToast) toast(endingToast);
  });

  /* ---------- 回响集 ---------- */
  /* 结局图鉴文案:名称/金句为已解锁显示,暗示句为未解锁显示 */
  const ENDINGS_META = {
    mug: {
      A: { name: '两只缸', quote: '「缸是空的,人得是满的。」', hint: '新缸的第一口茶,可以泡给师傅。' },
      B: { name: '半市斤粮票', quote: '「咱家……也出先进了。」', hint: '病床前,也有一双等着看这口红字的手。' },
      C: { name: '最后一个夜班', quote: '磕碰,是岁月一枚一枚,盖下的章。', hint: '厂房门口的灯,可以亮到天明。' },
      egg: { name: '缸底的秘密', quote: '「第三张了。别声张,给顺子。」', hint: '这只缸,还有一层没说完的话。' },
    },
    tin: {
      A: { name: '喜字上窗', quote: '「想说的话,我当面跟你说。」', hint: '三年攒下的话,可以在桥心一口气倒出来。' },
      B: { name: '七封没寄的信', quote: '原来这三年,攒话的,不止他一个人。', hint: '把开口的机会,让给她。' },
      C: { name: '丑话四十年', quote: '「就说了一句,在桥上。丑话,倒说了四十年。」', hint: '有些路,陪着走完,比说破更长久。' },
      egg: { name: '没寄出的那一封', quote: '我想你。我想你。我想你。', hint: '红头绳的最底下,还压着纸。' },
    },
    sewing: {
      A: { name: '头一针', quote: '「别慌,慢慢踩,日子就直了。」', hint: '机器,可以搬进城里,教新的手。' },
      B: { name: '旧衣改新', quote: '「膝盖,要双线。小孩子,费膝盖。」', hint: '八十岁,也能重新坐回机器前。' },
      C: { name: '守在老屋', quote: '「老伙计们,就该守在一处。」', hint: '人走了,机油,还是要上的。' },
      egg: { name: '没舍得做的嫁衣', quote: '她把自己,一寸一寸,缝进了这个家。', hint: '抽屉最里层,样子底下,还有样子。' },
    },
    radio: {
      A: { name: '我爷爷的台', quote: '「换台,他会找不着的。」', hint: '六点半的评书,可以在宿舍里接着响。' },
      B: { name: '指针停在982', quote: '雪地里走出来,心里,是满的。', hint: '老屋,可以不卖。每年回去一趟。' },
      C: { name: '替人说话', quote: '它,又开始替人说话了。', hint: '隔壁张奶奶,一个人过了很多年。' },
      egg: { name: '挂历的背面', quote: '他把收音机里的话,和孙女的话,记在同一本挂历上。', hint: '爷爷识字不多。有些字,是描的。' },
    },
    frog: {
      A: { name: '玻璃柜', quote: '像受过伤、又好了的,那种。', hint: '可以把它端端正正,锁进亮处。' },
      B: { name: '单日归哥,双日归弟', quote: '被两个小孩,爱了二十多年的,那种。', hint: '写一块牌子,让全村的娃娃都看见它。' },
      C: { name: '上八圈就行', quote: '这话,说了一代。又传一代。', hint: '年夜饭桌上,让它从一个家,跳到另一个家。' },
      egg: { name: '字条的背面', quote: '「你输了那么多年,是不是就想让哥,多赢几回?」', hint: '玻璃柜里那张字条,值得再细看一遍。' },
    },
    camera: {
      A: { name: '第一千家', quote: '「不用翻。原片,一直在等你。」', hint: '最显眼的柜子上,可以摆一句话。' },
      B: { name: '三十里土路', quote: '「人齐了,就该挂着。」', hint: '蓝布包好,绑上后座,送一趟。' },
      C: { name: '给岁月存的', quote: '「照片,是给人看的。底片,是给岁月存的。」', hint: '编号,可以描上三遍。' },
      egg: { name: '〇〇一号', quote: '「爹娘一辈子,就照过这一回。是我拍的。」', hint: '铁柜最底层,有一袋编号最小的底片。' },
    },
    canteen: {
      A: { name: '戈壁军礼', quote: '苦得发涩,像父亲的一生。', hint: '有一片营房,只剩土墙了。值得浇半壶茶。' },
      B: { name: '立过功', quote: '「立过。二等功。」', hint: '让它和一套锡焊工具,摆进同一格。' },
      C: { name: '挂在门后', quote: '让需要水的人,随时,能喝上一口。', hint: '把它,留给还在下地的人。' },
      egg: { name: '壶盖内壁', quote: '「赠 王铁柱 一九七一」', hint: '拧开壶盖,凑到灯下。' },
    },
    hanky: {
      A: { name: '折痕深处', quote: '「绣得不好,别嫌。别洗。」', hint: '交给阿禾的时候,只叮嘱六个字。' },
      B: { name: '枕头底下', quote: '她要当面,说给一个人听了。', hint: '枕头底下,还压着一张黑白照片。' },
      C: { name: '通车了', quote: '「没事。通车了。」', hint: '揣上手帕,买一张往西南去的车票。' },
      egg: { name: '没拆的信', quote: '有些话,寄到了。就别再拆了。', hint: '樟木箱的夹层里,还有一个没拆的信封。' },
    },
  };

  function openCollection() {
    renderCollection();
    show('#screen-collection');
  }

  function renderCollection() {
    const grid = $('#col-grid');
    grid.innerHTML = '';
    ITEMS.forEach((it) => {
      const unlocked = read.has(it.id);
      const card = document.createElement(unlocked ? 'button' : 'div');
      card.className = 'col-card ' + (unlocked ? 'unlocked' : 'locked');
      if (unlocked) {
        const got = it.nodes ? (store.endings[it.id] || []) : [];
        const seals = it.nodes
          ? '<div class="col-seals">' +
            ['A', 'B', 'C'].map((e) => `<i class="seal${got.includes(e) ? ' lit' : ''}">回</i>`).join('') +
            `<i class="seal egg-seal${got.includes('egg') ? ' lit' : ''}">★</i></div>`
          : '';
        card.innerHTML = `
          <img class="col-img" src="${it.img}" alt="${it.name}">
          <i class="col-tape t-l"></i><i class="col-tape t-r"></i>
          <p class="col-name">${it.name}</p>
          <p class="col-epigraph">${it.epigraph}</p>
          <span class="col-stamp">已听</span>
          ${seals}`;
        card.addEventListener('click', () => openColDetail(it));
      } else {
        card.innerHTML = `
          <span class="col-q">?</span>
          <p class="col-name">未唤醒</p>`;
      }
      grid.appendChild(card);
    });
    $('#col-count').textContent = `${read.size} / ${ITEMS.length}`;
    $('#col-hint').textContent =
      read.size >= ITEMS.length && !store.endingSeen
        ? '货架空了。把门口的牌子翻过来吧。'
        : '';
  }

  /* 结局图鉴弹层:点开一件已听过的旧物,看结局收集详情 */
  const cdOverlay = $('#col-detail');
  let cdItem = null;

  function openColDetail(it) {
    cdItem = it;
    $('#cd-img').src = it.img;
    $('#cd-name').textContent = it.name;
    $('#cd-era').textContent = it.era;
    $('#cd-epigraph').textContent = it.epigraph;
    const box = $('#cd-endings');
    box.innerHTML = '';
    const meta = ENDINGS_META[it.id];
    if (it.nodes && meta) {
      const got = store.endings[it.id] || [];
      ['A', 'B', 'C'].forEach((e, i) => {
        const m = meta[e];
        const has = got.includes(e);
        const div = document.createElement('div');
        div.className = 'cd-end' + (has ? ' got' : '');
        div.innerHTML = has
          ? `<span class="cd-tag">结局${'一二三'[i]}</span><h4>${m.name}</h4><p class="cd-quote">${m.quote}</p>`
          : `<span class="cd-tag">结局${'一二三'[i]}</span><h4>?</h4><p class="cd-hint">${m.hint}</p>`;
        box.appendChild(div);
      });
      const hasEgg = got.includes('egg');
      const eg = document.createElement('div');
      eg.className = 'cd-egg' + (hasEgg ? ' got' : '');
      eg.innerHTML =
        '<span class="cd-egg-star">★</span>' +
        (hasEgg
          ? `<div><h4>${meta.egg.name}</h4><p class="cd-quote">${meta.egg.quote}</p></div>`
          : `<div><h4>???</h4><p class="cd-hint">${meta.egg.hint}</p></div>`);
      box.appendChild(eg);
    }
    cdOverlay.classList.add('open');
  }

  function closeColDetail() {
    if (!cdOverlay.classList.contains('open')) return;
    cdOverlay.classList.remove('open');
  }

  $('#cd-close').addEventListener('click', closeColDetail);
  cdOverlay.addEventListener('click', (e) => {
    if (e.target === cdOverlay) closeColDetail();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeColDetail();
  });
  $('#cd-replay').addEventListener('click', () => {
    if (!cdItem) return;
    const it = cdItem;
    closeColDetail();
    playUnit(it, { from: 'collection' });
  });

  /* ---------- 事件绑定 ---------- */
  $('#btn-start').addEventListener('click', () => {
    bgm.unlocked = true;
    const hasSave = store.introSeen || read.size > 0;
    if (hasSave) {
      if (!confirm('从头开始会清空现有进度,确定吗?')) return;
      clearSave();
    }
    playUnit(DATA.intro);
  });

  $('#btn-continue').addEventListener('click', () => {
    bgm.unlocked = true;
    enterShop();
  });
  $('#btn-collect').addEventListener('click', openCollection);
  $('#btn-col-back').addEventListener('click', enterShop);
  $('#btn-back-shop').addEventListener('click', enterShop);

  $('#btn-title').addEventListener('click', () => {
    initTitle();
    show('#screen-title');
    playBgm('title');
  });

  $('#btn-mute-title').addEventListener('click', toggleMute);
  $('#btn-mute-shop').addEventListener('click', toggleMute);

  $('#shelf-area').addEventListener('click', (e) => {
    const toyBtn = e.target.closest('.toy-btn');
    if (toyBtn) {
      if (window.ToyBox) window.ToyBox.open(toyBtn.dataset.toy);
      return;
    }
    const slot = e.target.closest('.slot');
    if (!slot) return;
    const it = ITEMS.find((i) => i.id === slot.dataset.id);
    if (it) playUnit(it);
  });

  $('#door-sign').addEventListener('click', () => {
    if (read.size < ITEMS.length) {
      toast('还有些旧物,没有摸过。');
      return;
    }
    playUnit(DATA.ending);
  });

  $('#btn-restart').addEventListener('click', () => {
    if (confirm('清空全部进度,重新开始?')) {
      clearSave();
      location.reload();
    }
  });

  initTitle();
  updateMuteUI();
})();
