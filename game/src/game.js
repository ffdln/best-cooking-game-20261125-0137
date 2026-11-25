// Warung Sizzle — Dapur Kilat. Game DOM murni, tanpa dependensi dan tanpa network.
// Alur main: klik bahan -> wajan -> tunggu matang -> klik wajan -> piring ->
// klik piring, lalu klik tiket pesanan yang cocok sebelum kesabaran habis.
(function () {
  'use strict';

  /* ================= Data: bahan dan menu ================= */

  var ITEMS = [
    { id: 'nasi',   label: 'Nasi',   swatch: '#f5f5f4', hotkey: '1' },
    { id: 'mie',    label: 'Mie',    swatch: '#fbbf24', hotkey: '2' },
    { id: 'ayam',   label: 'Ayam',   swatch: '#fca5a5', hotkey: '3' },
    { id: 'telur',  label: 'Telur',  swatch: '#fde68a', hotkey: '4' },
    { id: 'sayur',  label: 'Sayur',  swatch: '#4ade80', hotkey: '5' },
    { id: 'cabai',  label: 'Cabai',  swatch: '#ef4444', hotkey: '6' },
    { id: 'kacang', label: 'Kacang', swatch: '#d97706', hotkey: '7' },
    { id: 'teh',    label: 'Teh',    swatch: '#a16207', hotkey: '8' },
    { id: 'gula',   label: 'Gula',   swatch: '#e7e5e4', hotkey: '9' },
    { id: 'es',     label: 'Es',     swatch: '#7dd3fc', hotkey: '0' },
  ];
  var ITEM_BY_ID = {};
  ITEMS.forEach(function (it) { ITEM_BY_ID[it.id] = it; });

  var MENUS = [
    { id: 'nasi-goreng', label: 'Nasi Goreng', needs: ['nasi', 'telur', 'cabai'], cookMs: 6000, price: 25, color: '#f59e0b' },
    { id: 'mie-goreng',  label: 'Mie Goreng',  needs: ['mie', 'telur', 'sayur'], cookMs: 6000, price: 25, color: '#fb923c' },
    { id: 'sate-ayam',   label: 'Sate Ayam',   needs: ['ayam', 'kacang', 'gula'], cookMs: 8000, price: 30, color: '#b45309' },
    { id: 'es-teh',      label: 'Es Teh Manis', needs: ['teh', 'gula', 'es'],    cookMs: 3000, price: 15, color: '#fbbf24' },
  ];
  var MENU_BY_ID = {};
  MENUS.forEach(function (m) { MENU_BY_ID[m.id] = m; });

  /* ================= Konstanta permainan ================= */

  var SHIFT_MS = 180000;      // satu shift: 3 menit
  var PATIENCE_MS = 42000;    // kesabaran tiap pesanan
  var BURN_AFTER_MS = 6000;   // masakan matang gosong setelah 6 detik di wajan
  var MAX_TICKETS = 3;        // pesanan aktif paling banyak
  var SPAWN_EVERY_MS = 8000;  // jeda antar pesanan baru

  /* ================= RNG deterministik (untuk ?shot) ================= */

  var query = new URLSearchParams(location.search);
  var shotMode = query.get('shot') || '';
  var seedNum = parseInt(query.get('seed') || '1', 10) || 1;

  function makeRng(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ================= State ================= */

  function emptyPan() {
    return { items: [], status: 'empty', dishId: null, progress: 0, doneMs: 0 };
  }

  function newGame() {
    return {
      running: false, over: false, frozen: !!shotMode,
      timeLeftMs: SHIFT_MS, coins: 0, served: 0,
      combo: 1, bestCombo: 1,
      orders: [], nextOrderId: 1, spawnInMs: 2000,
      pans: [emptyPan(), emptyPan()],
      plate: null, plateArmed: false, selectedOrder: null,
      rng: makeRng(seedNum), toastTimer: 0,
    };
  }

  var state;

  /* ================= Referensi DOM ================= */

  function $(id) { return document.getElementById(id); }
  var hudTime = $('hud-time'), hudCoins = $('hud-coins'), hudServed = $('hud-served'),
      hudCombo = $('hud-combo'), ordersBox = $('orders'), recipeBox = $('recipe-detail'),
      toastBox = $('toast'), binsBox = $('bins'), overlay = $('overlay'),
      overlayCard = $('overlay-card'), plateEl = $('plate');

  /* ================= Util kecil ================= */

  function clockText(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function say(msg, ms) {
    toastBox.textContent = msg;
    state.toastTimer = ms || 2200;
  }

  function breakCombo() {
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.combo = 1;
  }

  // Cocokkan 3 bahan di wajan dengan salah satu menu; null kalau bukan resep.
  function matchMenu(items) {
    if (items.length !== 3) return null;
    var key = items.slice().sort().join(',');
    for (var i = 0; i < MENUS.length; i++) {
      if (MENUS[i].needs.slice().sort().join(',') === key) return MENUS[i];
    }
    return null;
  }

  function recipeLine(menu) {
    return menu.needs.map(function (id) { return ITEM_BY_ID[id].label; }).join(' + ');
  }

  function findOrder(id) {
    for (var i = 0; i < state.orders.length; i++) {
      if (state.orders[i].id === id) return state.orders[i];
    }
    return null;
  }

  /* ================= Render ================= */

  function paintHud() {
    hudTime.textContent = clockText(state.timeLeftMs);
    hudTime.classList.toggle('hot', state.timeLeftMs < 30000);
    hudCoins.textContent = state.coins;
    hudServed.textContent = state.served;
    hudCombo.textContent = '×' + state.combo;
  }

  function paintOrders() {
    ordersBox.innerHTML = '';
    if (!state.orders.length) {
      var empty = document.createElement('div');
      empty.className = 'order-empty';
      empty.textContent = 'Belum ada pesanan — pelanggan segera datang…';
      ordersBox.appendChild(empty);
      return;
    }
    state.orders.forEach(function (o) {
      var menu = MENU_BY_ID[o.dishId];
      var frac = Math.max(0, o.patienceMs / PATIENCE_MS);
      var ticket = document.createElement('div');
      ticket.className = 'order' + (state.selectedOrder === o.id ? ' selected' : '');
      ticket.dataset.orderId = o.id;
      ticket.innerHTML =
        '<div class="order-top"><span class="order-dish">' + menu.label + '</span>' +
        '<span class="order-price">' + menu.price + ' koin</span></div>' +
        '<div class="order-recipe">' + recipeLine(menu) + ' &middot; masak ' + (menu.cookMs / 1000) + ' dtk</div>' +
        '<div class="patience' + (frac < 0.35 ? ' low' : '') + '"><div style="width:' + Math.round(frac * 100) + '%"></div></div>';
      ticket.addEventListener('click', function () { onTicketClick(o.id, ticket); });
      ordersBox.appendChild(ticket);
    });
  }

  function paintRecipe() {
    var o = findOrder(state.selectedOrder);
    if (!o) {
      recipeBox.textContent = 'Pilih satu pesanan di kiri atas untuk melihat bahan-bahannya.';
      return;
    }
    var menu = MENU_BY_ID[o.dishId];
    recipeBox.innerHTML = '<b>' + menu.label + '</b> — ' + recipeLine(menu) +
      '<br>Masak ' + (menu.cookMs / 1000) + ' detik di kompor. Harga ' + menu.price + ' koin.';
  }

  function paintPans() {
    state.pans.forEach(function (pan, idx) {
      var stove = $('stove-' + idx);
      var panEl = stove.querySelector('.pan');
      var cls = pan.status === 'cooking' ? ' cooking' : pan.status === 'done' ? ' done' : pan.status === 'burnt' ? ' burnt' : '';
      panEl.className = 'pan' + cls;
      stove.querySelector('.pan-fill').style.width = Math.round(pan.progress * 100) + '%';
      var label = stove.querySelector('.pan-state');
      if (pan.status === 'empty') label.textContent = 'kosong';
      else if (pan.status === 'filling') label.textContent = 'isi bahan: ' + pan.items.length + '/3';
      else if (pan.status === 'cooking') label.textContent = 'memasak ' + MENU_BY_ID[pan.dishId].label + '…';
      else if (pan.status === 'done') label.textContent = MENU_BY_ID[pan.dishId].label + ' MATANG — klik!';
      else if (pan.status === 'burnt') label.textContent = 'GOSONG! klik buat buang';
      else label.textContent = 'campuran salah — buang';
      var slots = stove.querySelector('.pan-slots');
      slots.innerHTML = '';
      for (var i = 0; i < 3; i++) {
        var chip = document.createElement('span');
        if (pan.items[i]) { chip.className = 'slot'; chip.textContent = ITEM_BY_ID[pan.items[i]].label; }
        else { chip.className = 'slot empty'; chip.textContent = '—'; }
        slots.appendChild(chip);
      }
    });
  }

  function paintPlate() {
    plateEl.classList.toggle('full', !!state.plate);
    plateEl.querySelector('.plate-state').textContent = state.plate
      ? MENU_BY_ID[state.plate].label + (state.plateArmed ? ' — klik pesanan yang cocok!' : ' — klik piring lalu klik pesanan')
      : 'piring kosong';
  }

  function paintAll() { paintHud(); paintOrders(); paintRecipe(); paintPans(); paintPlate(); }

  /* ================= Aksi pemain ================= */

  function firstOpenPan() {
    for (var i = 0; i < state.pans.length; i++) {
      var p = state.pans[i];
      if ((p.status === 'empty' || p.status === 'filling') && p.items.length < 3) return i;
    }
    return -1;
  }

  function addIngredient(id) {
    if (!state.running || state.over) { say('Klik MULAI SHIFT dulu!'); return; }
    var pi = firstOpenPan();
    if (pi < 0) { say('Tidak ada wajan kosong — sajikan atau buang dulu.'); return; }
    var pan = state.pans[pi];
    pan.items.push(id);
    pan.status = 'filling';
    if (pan.items.length === 3) {
      var menu = matchMenu(pan.items);
      if (menu) {
        pan.dishId = menu.id; pan.status = 'cooking'; pan.progress = 0;
        say(menu.label + ' mulai dimasak!');
      } else {
        pan.status = 'wrong';
        say('Campuran salah — bukan resep apa pun. Buang!');
      }
    }
    paintAll();
  }

  function clearPan(idx, wasMistake) {
    state.pans[idx] = emptyPan();
    if (wasMistake) breakCombo();
    paintAll();
  }

  function onPanClick(idx) {
    if (!state.running || state.over) return;
    var pan = state.pans[idx];
    if (pan.status === 'done') {
      if (state.plate) { say('Piring masih terisi — sajikan dulu.'); return; }
      var served = MENU_BY_ID[pan.dishId].label;
      state.plate = pan.dishId;
      state.plateArmed = false;
      state.pans[idx] = emptyPan();
      say(served + ' di piring. Klik piring, lalu klik pesanannya!');
      paintAll();
    } else if (pan.status === 'burnt') {
      clearPan(idx, true);
      say('Makanan gosong dibuang. Kombo reset.');
    } else if (pan.status === 'filling' || pan.status === 'wrong') {
      say('Wajan ini masih diisi — klik Buang kalau mau ganti.');
    }
  }

  function onPlateClick() {
    if (!state.running || state.over || !state.plate) return;
    state.plateArmed = !state.plateArmed;
    paintAll();
  }

  function onTicketClick(orderId, el) {
    state.selectedOrder = orderId;
    paintRecipe();
    paintOrders();
    if (!state.running || state.over || !state.plate || !state.plateArmed) return;
    var oi = -1;
    for (var i = 0; i < state.orders.length; i++) if (state.orders[i].id === orderId) oi = i;
    if (oi < 0) return;
    var order = state.orders[oi];
    if (order.dishId !== state.plate) {
      if (el) { el.classList.remove('flash-wrong'); void el.offsetWidth; el.classList.add('flash-wrong'); }
      breakCombo();
      say('Bukan pesanan itu! Kombo reset.');
      paintAll();
      return;
    }
    var menu = MENU_BY_ID[order.dishId];
    var frac = Math.max(0, order.patienceMs / PATIENCE_MS);
    // Saji cepat (kesabaran masih penuh) dibayar lebih, plus bonus kombo.
    var gain = Math.round(menu.price * (0.5 + 0.5 * frac)) + 2 * (state.combo - 1);
    state.coins += gain;
    state.served += 1;
    state.orders.splice(oi, 1);
    state.plate = null;
    state.plateArmed = false;
    state.combo += 1;
    state.bestCombo = Math.max(state.bestCombo, state.combo - 1);
    say('Tersaji! +' + gain + ' koin — ' + menu.label + '. Kombo ×' + (state.combo - 1) + '.');
    paintAll();
  }

  function newTicket() {
    var menu = MENUS[Math.floor(state.rng() * MENUS.length)];
    state.orders.push({ id: state.nextOrderId++, dishId: menu.id, patienceMs: PATIENCE_MS });
  }

  /* ================= Overlay: mulai & selesai ================= */

  function showStart() {
    overlayCard.innerHTML =
      '<h1>WARUNG SIZZLE</h1><h2>Dapur Kilat — masak cepat, saji tepat waktu</h2>' +
      '<p>Pelanggan datang dengan pesanan dan kesabaran yang menipis. ' +
      'Klik bahan untuk mengisi wajan, tunggu sampai matang, pindahkan ke piring, ' +
      'lalu sajikan ke pesanan yang cocok sebelum waktunya habis. Gosong atau salah saji ' +
      'memutus kombo. Shift berlangsung <b>3 menit</b> — berapa banyak yang bisa kamu sajikan?</p>' +
      '<div class="big-stats"><div class="stat"><div class="v">4</div><div class="k">MENU</div></div>' +
      '<div class="stat"><div class="v">2</div><div class="k">KOMPOR</div></div>' +
      '<div class="stat"><div class="v">3:00</div><div class="k">SHIFT</div></div></div>' +
      '<button class="big-btn" id="start-btn" type="button">MULAI SHIFT</button>';
    overlay.classList.remove('hidden');
    $('start-btn').addEventListener('click', beginShift);
  }

  function starsFor(served) {
    if (served >= 12) return { stars: '★★★', title: 'Koki Legenda!' };
    if (served >= 8) return { stars: '★★☆', title: 'Koki Andal!' };
    if (served >= 4) return { stars: '★☆☆', title: 'Koki Magang Naik Level!' };
    return { stars: '☆☆☆', title: 'Dapur Masih Berantakan…' };
  }

  function showEnd() {
    var rank = starsFor(state.served);
    overlayCard.innerHTML =
      '<h1>SHIFT SELESAI</h1><h2>' + rank.title + '</h2><div class="stars">' + rank.stars + '</div>' +
      '<div class="big-stats">' +
      '<div class="stat"><div class="v">' + state.coins + '</div><div class="k">KOIN</div></div>' +
      '<div class="stat"><div class="v">' + state.served + '</div><div class="k">TERSAJI</div></div>' +
      '<div class="stat"><div class="v">×' + state.bestCombo + '</div><div class="k">KOMBO TERBAIK</div></div></div>' +
      '<p>Sajikan lebih cepat selagi kesabaran pelanggan masih penuh untuk koin maksimal, ' +
      'dan jangan biarkan wajan gosong — kombo adalah kunci skor besar.</p>' +
      '<button class="big-btn" id="again-btn" type="button">MAIN LAGI</button>';
    overlay.classList.remove('hidden');
    $('again-btn').addEventListener('click', function () { location.reload(); });
  }

  function beginShift() {
    overlay.classList.add('hidden');
    state.running = true;
    say('Shift dimulai! Pesanan pertama segera datang.');
  }

  /* ================= Loop utama ================= */

  var prevTs = 0;
  function tick(ts) {
    if (!prevTs) prevTs = ts;
    var dt = Math.min(100, ts - prevTs);
    prevTs = ts;
    if (state.running && !state.over && !state.frozen) {
      state.timeLeftMs -= dt;
      if (state.timeLeftMs <= 0) {
        state.timeLeftMs = 0; state.over = true; state.running = false;
        paintAll(); showEnd();
        return;
      }
      state.spawnInMs -= dt;
      if (state.spawnInMs <= 0) {
        if (state.orders.length < MAX_TICKETS) newTicket();
        state.spawnInMs = SPAWN_EVERY_MS;
      }
      for (var i = state.orders.length - 1; i >= 0; i--) {
        state.orders[i].patienceMs -= dt;
        if (state.orders[i].patienceMs <= 0) {
          say('Pesanan ' + MENU_BY_ID[state.orders[i].dishId].label + ' hangus — pelanggan pergi!');
          state.orders.splice(i, 1);
          breakCombo();
        }
      }
      state.pans.forEach(function (pan) {
        if (pan.status === 'cooking') {
          pan.progress += dt / MENU_BY_ID[pan.dishId].cookMs;
          if (pan.progress >= 1) {
            pan.progress = 1; pan.status = 'done'; pan.doneMs = 0;
            say(MENU_BY_ID[pan.dishId].label + ' matang! Cepat pindahkan ke piring.');
          }
        } else if (pan.status === 'done') {
          pan.doneMs += dt;
          if (pan.doneMs >= BURN_AFTER_MS) {
            pan.status = 'burnt';
            say(MENU_BY_ID[pan.dishId].label + ' gosong di wajan!');
          }
        }
      });
      if (state.toastTimer > 0) {
        state.toastTimer -= dt;
        if (state.toastTimer <= 0) toastBox.textContent = '';
      }
      paintAll();
    }
    requestAnimationFrame(tick);
  }

  /* ================= State beku untuk screenshot (?shot=...) ================= */

  function stageShot() {
    state.frozen = true;
    if (shotMode === 'start') {
      state.orders = [
        { id: 1, dishId: 'nasi-goreng', patienceMs: PATIENCE_MS * 0.8 },
        { id: 2, dishId: 'mie-goreng', patienceMs: PATIENCE_MS * 0.6 },
      ];
      state.nextOrderId = 3;
      paintAll(); showStart();
    } else if (shotMode === 'play') {
      state.running = true;
      state.timeLeftMs = 151000; state.coins = 145; state.served = 5;
      state.combo = 3; state.bestCombo = 3;
      state.orders = [
        { id: 1, dishId: 'nasi-goreng', patienceMs: PATIENCE_MS * 0.72 },
        { id: 2, dishId: 'mie-goreng', patienceMs: PATIENCE_MS * 0.45 },
        { id: 3, dishId: 'sate-ayam', patienceMs: PATIENCE_MS * 0.86 },
      ];
      state.nextOrderId = 4; state.selectedOrder = 2;
      state.pans[0] = { items: ['mie', 'telur', 'sayur'], status: 'cooking', dishId: 'mie-goreng', progress: 0.62, doneMs: 0 };
      state.pans[1] = { items: ['nasi', 'telur', 'cabai'], status: 'done', dishId: 'nasi-goreng', progress: 1, doneMs: 0 };
      state.plate = 'sate-ayam'; state.plateArmed = true;
      say('Sate Ayam di piring — klik pesanan yang cocok!');
      paintAll();
    } else if (shotMode === 'end') {
      state.over = true; state.running = false;
      state.coins = 412; state.served = 11; state.combo = 1; state.bestCombo = 5;
      state.timeLeftMs = 0;
      paintAll(); showEnd();
    }
  }

  /* ================= Pasang tombol & keyboard ================= */

  ITEMS.forEach(function (it) {
    var btn = document.createElement('button');
    btn.className = 'bin'; btn.type = 'button';
    btn.innerHTML = '<div class="dot" style="background:' + it.swatch + '"></div>' +
      '<div class="ing-name">' + it.label + '</div><div class="ing-key">tombol ' + it.hotkey + '</div>';
    btn.addEventListener('click', function () { addIngredient(it.id); });
    binsBox.appendChild(btn);
  });

  document.querySelectorAll('.stove').forEach(function (stove, idx) {
    stove.querySelector('.pan').addEventListener('click', function () { onPanClick(idx); });
    stove.querySelector('.trash-btn').addEventListener('click', function () {
      var pan = state.pans[idx];
      if (pan.status === 'empty') { say('Wajan sudah kosong.'); return; }
      var cooked = pan.status === 'cooking' || pan.status === 'done' || pan.status === 'burnt';
      clearPan(idx, cooked);
      say('Wajan dibersihkan.');
    });
  });

  plateEl.addEventListener('click', onPlateClick);

  document.addEventListener('keydown', function (e) {
    for (var i = 0; i < ITEMS.length; i++) {
      if (e.key === ITEMS[i].hotkey) { addIngredient(ITEMS[i].id); return; }
    }
  });

  /* ================= Boot ================= */

  state = newGame();
  if (shotMode) { stageShot(); }
  else { paintAll(); showStart(); }
  requestAnimationFrame(tick);
})();
