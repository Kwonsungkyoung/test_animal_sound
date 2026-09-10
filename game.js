(function () {
  "use strict";

  // ---------- DOM ----------
  const container = document.getElementById("game-container");
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const distanceHud = document.getElementById("distance-hud");
  const hpRow = document.getElementById("hp-row");
  const obesityFill = document.getElementById("obesity-bar-fill");
  const milestoneBanner = document.getElementById("milestone-banner");
  const toastEl = document.getElementById("toast");
  const screenStart = document.getElementById("screen-start");
  const screenGameover = document.getElementById("screen-gameover");
  const screenClear = document.getElementById("screen-clear");
  const gameoverReasonEl = document.getElementById("gameover-reason");
  const gameoverDistanceEl = document.getElementById("gameover-distance");
  const clearDistanceEl = document.getElementById("clear-distance");
  const btnStart = document.getElementById("btn-start");
  const btnRetryOver = document.getElementById("btn-retry-over");
  const btnRetryClear = document.getElementById("btn-retry-clear");
  const btnLeft = document.getElementById("btn-left");
  const btnRight = document.getElementById("btn-right");
  const btnJump = document.getElementById("btn-jump");
  const btnSlide = document.getElementById("btn-slide");

  // ---------- Config ----------
  const CONFIG = {
    laneCount: 3,
    obesityMin: 1,
    obesityMax: 10,
    obesityStart: 5,
    hpMax: 3,
    hitInvulnDuration: 1.2,
    baseSpeed: 230, // px/s at speed multiplier 1
    metersPerSecBase: 7.5,
    milestones: [
      { id: "sibling", dist: 300, label: "동생" },
      { id: "dad", dist: 600, label: "아빠" },
      { id: "mom", dist: 900, label: "엄마" },
    ],
    jumpDuration: 0.45,
    slideDuration: 0.5,
    spawnIntervalStart: 1.1,
    spawnIntervalMin: 0.55,
  };

  const GOOD_FOODS = [
    { id: "apple", label: "사과", color: "#e6483a" },
    { id: "carrot", label: "당근", color: "#ff9a3c" },
    { id: "broccoli", label: "브로콜리", color: "#4caf7d" },
    { id: "water", label: "물", color: "#4a90d9" },
  ];
  const BAD_FOODS = [
    { id: "grape", label: "포도", color: "#8e5fc2" },
    { id: "cake", label: "초코케이크", color: "#6b4226" },
    { id: "candy", label: "사탕", color: "#ff5c8a" },
    { id: "donut", label: "도넛", color: "#e6a23c" },
  ];
  const OBSTACLES = [
    { id: "rock", avoid: "jump" },
    { id: "puddle", avoid: "jump" },
    { id: "fence", avoid: "slide" },
  ];

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function speedMultiplier(obesity) { return 1.6 - (obesity - 1) * (1.0 / 9); }

  // Korean object-particle (을/를) picker based on the final syllable's batchim.
  function withObjParticle(word) {
    const code = word.charCodeAt(word.length - 1);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const hasBatchim = (code - 0xac00) % 28 !== 0;
      return word + (hasBatchim ? "을" : "를");
    }
    return word + "를";
  }

  // ---------- Layout ----------
  let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
  let LANE_X = [0, 0, 0];
  let PLAYER_Y = 0;

  function computeLanes() {
    const laneAreaWidth = Math.min(W * 0.78, 420);
    const left = (W - laneAreaWidth) / 2;
    LANE_X = [
      left + laneAreaWidth * 0.166,
      left + laneAreaWidth * 0.5,
      left + laneAreaWidth * 0.833,
    ];
    PLAYER_Y = H * 0.74;
  }

  function resize() {
    W = container.clientWidth || window.innerWidth;
    H = container.clientHeight || window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    computeLanes();
  }
  window.addEventListener("resize", resize);

  // ---------- State ----------
  let state = "start"; // start | playing | milestone | gameover | clear
  let player = null;
  let entities = [];
  let joinedFamily = [];
  let distance = 0;
  let elapsed = 0;
  let spawnTimer = 0.6;
  let nextMilestoneIndex = 0;
  let scrollY = 0;
  let hitFlashT = 0;

  function resetPlayer() {
    player = {
      lane: 1,
      x: LANE_X[1],
      y: PLAYER_Y,
      obesity: CONFIG.obesityStart,
      hp: CONFIG.hpMax,
      invulnT: 0,
      jumping: false, jumpT: 0,
      sliding: false, slideT: 0,
      legPhase: 0,
    };
  }

  function updateObesityBar() {
    const pct = (player.obesity - CONFIG.obesityMin) / (CONFIG.obesityMax - CONFIG.obesityMin) * 100;
    obesityFill.style.width = pct + "%";
  }

  function renderHP() {
    hpRow.innerHTML = "";
    for (let i = 0; i < CONFIG.hpMax; i++) {
      const pip = document.createElement("div");
      pip.className = "hp-pip" + (i >= player.hp ? " lost" : "");
      hpRow.appendChild(pip);
    }
  }

  function triggerHitFlash() { hitFlashT = 0.3; }

  function startGame() {
    resetPlayer();
    entities = [];
    joinedFamily = [];
    distance = 0;
    elapsed = 0;
    spawnTimer = 0.6;
    nextMilestoneIndex = 0;
    scrollY = 0;
    hitFlashT = 0;
    updateObesityBar();
    renderHP();
    distanceHud.textContent = "0m";
    screenStart.classList.add("hidden");
    screenGameover.classList.add("hidden");
    screenClear.classList.add("hidden");
    state = "playing";
  }

  // ---------- Input ----------
  const SWIPE_THRESHOLD = 28;
  let dragStart = null;

  function handleSwipe(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) < SWIPE_THRESHOLD) return;
      moveLane(dx > 0 ? 1 : -1);
    } else {
      if (Math.abs(dy) < SWIPE_THRESHOLD) return;
      if (dy < 0) doJump(); else doSlide();
    }
  }

  container.addEventListener("pointerdown", (e) => { dragStart = { x: e.clientX, y: e.clientY }; });
  container.addEventListener("pointerup", (e) => {
    if (!dragStart) return;
    handleSwipe(e.clientX - dragStart.x, e.clientY - dragStart.y);
    dragStart = null;
  });
  document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

  window.addEventListener("keydown", (e) => {
    if (state !== "playing") return;
    if (e.key === "ArrowLeft") moveLane(-1);
    else if (e.key === "ArrowRight") moveLane(1);
    else if (e.key === "ArrowUp") doJump();
    else if (e.key === "ArrowDown") doSlide();
  });

  function bindBtn(el, fn) {
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
  }
  bindBtn(btnLeft, () => moveLane(-1));
  bindBtn(btnRight, () => moveLane(1));
  bindBtn(btnJump, doJump);
  bindBtn(btnSlide, doSlide);
  bindBtn(btnStart, () => { sfx.unlock(); startGame(); });
  bindBtn(btnRetryOver, startGame);
  bindBtn(btnRetryClear, startGame);

  function moveLane(dir) {
    if (state !== "playing") return;
    player.lane = clamp(player.lane + dir, 0, CONFIG.laneCount - 1);
  }
  function doJump() {
    if (state !== "playing" || player.jumping || player.sliding) return;
    player.jumping = true; player.jumpT = 0;
    sfx.jump();
  }
  function doSlide() {
    if (state !== "playing" || player.jumping || player.sliding) return;
    player.sliding = true; player.slideT = 0;
    sfx.slide();
  }

  // ---------- Sound (WebAudio, no external files) ----------
  const sfx = (function () {
    let ac = null;
    function ensure() {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === "suspended") ac.resume();
      return ac;
    }
    function tone(freq, dur, type, peak, delay, glideTo) {
      const audio = ensure();
      const t0 = audio.currentTime + (delay || 0);
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, t0);
      if (glideTo) osc.frequency.linearRampToValueAtTime(glideTo, t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(peak || 0.15, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(audio.destination);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    }
    function noiseBurst(dur, peak) {
      const audio = ensure();
      const size = Math.floor(audio.sampleRate * dur);
      const buffer = audio.createBuffer(1, size, audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
      const src = audio.createBufferSource();
      src.buffer = buffer;
      const gain = audio.createGain();
      gain.gain.value = peak;
      const filter = audio.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1200;
      src.connect(filter).connect(gain).connect(audio.destination);
      src.start();
    }
    return {
      unlock() { try { ensure(); } catch (e) { /* audio unsupported */ } },
      good() { try { tone(660, 0.12, "triangle", 0.16); tone(880, 0.14, "triangle", 0.14, 0.08); } catch (e) {} },
      bad() { try { tone(320, 0.22, "sawtooth", 0.15, 0, 220); } catch (e) {} },
      jump() { try { tone(500, 0.12, "square", 0.08, 0, 700); } catch (e) {} },
      slide() { try { tone(260, 0.12, "square", 0.08, 0, 150); } catch (e) {} },
      hit() { try { noiseBurst(0.3, 0.3); tone(140, 0.25, "sawtooth", 0.2); } catch (e) {} },
      milestone() { try { [523, 659, 784].forEach((f, i) => tone(f, 0.2, "triangle", 0.18, i * 0.12)); } catch (e) {} },
      clear() { try { [523, 659, 784, 1046, 880].forEach((f, i) => tone(f, 0.28, "triangle", 0.2, i * 0.16)); } catch (e) {} },
      sad() { try { [400, 330, 260].forEach((f, i) => tone(f, 0.35, "sine", 0.18, i * 0.22)); } catch (e) {} },
    };
  })();

  // ---------- Gameplay ----------
  function spawnEntity() {
    const lane = Math.floor(Math.random() * CONFIG.laneCount);
    const r = Math.random();
    let en;
    if (r < 0.42) {
      const f = GOOD_FOODS[Math.floor(Math.random() * GOOD_FOODS.length)];
      en = { kind: "good", sub: f.id, label: f.label, color: f.color, lane, y: -40, done: false };
    } else if (r < 0.75) {
      const f = BAD_FOODS[Math.floor(Math.random() * BAD_FOODS.length)];
      en = { kind: "bad", sub: f.id, label: f.label, color: f.color, lane, y: -40, done: false };
    } else {
      const o = OBSTACLES[Math.floor(Math.random() * OBSTACLES.length)];
      en = { kind: "obstacle", sub: o.id, avoid: o.avoid, lane, y: -40, done: false };
    }
    entities.push(en);
  }

  function changeObesity(delta) {
    player.obesity = clamp(player.obesity + delta, CONFIG.obesityMin, CONFIG.obesityMax);
    updateObesityBar();
  }

  function showToast(text, color) {
    toastEl.textContent = text;
    toastEl.style.color = color || "#4a3b2a";
    toastEl.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove("show"), 650);
  }
  function showMilestoneBanner(text) {
    milestoneBanner.textContent = text;
    requestAnimationFrame(() => milestoneBanner.classList.add("show"));
  }
  function hideMilestoneBanner() {
    milestoneBanner.classList.remove("show");
  }

  function triggerMilestone(m, isLast) {
    state = "milestone";
    showMilestoneBanner(withObjParticle(m.label) + " 만났어요!");
    sfx.milestone();
    const f = { id: m.id, label: m.label, offsetX: -60 - joinedFamily.length * 46, x: 0, y: player.y, legPhase: 0 };
    f.x = LANE_X[player.lane] + f.offsetX;
    joinedFamily.push(f);
    setTimeout(() => {
      hideMilestoneBanner();
      if (isLast) triggerClear();
      else state = "playing";
    }, 1600);
  }

  function triggerClear() {
    state = "clear";
    sfx.clear();
    clearDistanceEl.textContent = "총 " + Math.floor(distance) + "m 완주!";
    screenClear.classList.remove("hidden");
  }

  function endGame(reason) {
    if (state === "gameover") return;
    state = "gameover";
    gameoverReasonEl.textContent = reason === "fat"
      ? "너무 뚱뚱해져서 더 뛸 수 없어요!"
      : "장애물에 너무 많이 부딪혀서 더 이상 뛸 수 없어요!";
    gameoverDistanceEl.textContent = Math.floor(distance) + "m까지 달렸어요";
    screenGameover.classList.remove("hidden");
  }

  function update(dt) {
    if (state !== "playing") return;
    elapsed += dt;
    const mult = speedMultiplier(player.obesity);
    const speedPx = CONFIG.baseSpeed * mult;
    distance += CONFIG.metersPerSecBase * mult * dt;
    scrollY += speedPx * dt;
    distanceHud.textContent = Math.floor(distance) + "m";

    const targetX = LANE_X[player.lane];
    player.x += (targetX - player.x) * Math.min(1, dt * 12);
    player.legPhase += dt * 7 * mult;

    if (player.jumping) {
      player.jumpT += dt;
      if (player.jumpT >= CONFIG.jumpDuration) { player.jumping = false; player.jumpT = 0; }
    }
    if (player.sliding) {
      player.slideT += dt;
      if (player.slideT >= CONFIG.slideDuration) { player.sliding = false; player.slideT = 0; }
    }
    if (player.invulnT > 0) player.invulnT = Math.max(0, player.invulnT - dt);
    if (hitFlashT > 0) hitFlashT = Math.max(0, hitFlashT - dt);

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnEntity();
      const interval = Math.max(CONFIG.spawnIntervalMin, CONFIG.spawnIntervalStart - elapsed * 0.004);
      spawnTimer = interval * (0.8 + Math.random() * 0.4);
    }

    for (let i = entities.length - 1; i >= 0; i--) {
      const en = entities[i];
      en.y += speedPx * dt;
      if (!en.done && en.lane === player.lane && en.y >= player.y - 18 && en.y <= player.y + 18) {
        en.done = true;
        if (en.kind === "good") {
          changeObesity(-1);
          showToast(en.label + " 냠냠! 날씬해졌어요", "#2f8f5b");
          sfx.good();
          entities.splice(i, 1);
          continue;
        } else if (en.kind === "bad") {
          changeObesity(1);
          showToast(en.label + " 냠냠... 뚱뚱해졌어요", "#c23b2e");
          sfx.bad();
          entities.splice(i, 1);
          continue;
        } else {
          const avoided = (en.avoid === "jump" && player.jumping) || (en.avoid === "slide" && player.sliding);
          if (!avoided && player.invulnT <= 0) {
            player.hp -= 1;
            player.invulnT = CONFIG.hitInvulnDuration;
            renderHP();
            sfx.hit();
            triggerHitFlash();
            if (player.hp <= 0) {
              endGame("hp");
              return;
            }
            showToast("아야! 장애물에 부딪혔어요", "#c23b2e");
          }
        }
      }
      if (en.y > H + 80) entities.splice(i, 1);
    }

    joinedFamily.forEach((f) => {
      const tx = LANE_X[player.lane] + f.offsetX;
      f.x += (tx - f.x) * Math.min(1, dt * 10);
      f.y = player.y;
      f.legPhase += dt * 7 * mult;
    });

    if (nextMilestoneIndex < CONFIG.milestones.length) {
      const m = CONFIG.milestones[nextMilestoneIndex];
      if (distance >= m.dist) {
        const isLast = nextMilestoneIndex === CONFIG.milestones.length - 1;
        nextMilestoneIndex++;
        triggerMilestone(m, isLast);
        return;
      }
    }

    if (player.obesity >= CONFIG.obesityMax) {
      sfx.sad();
      endGame("fat");
    }
  }

  // ---------- Rendering ----------
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#bfe8ff");
    g.addColorStop(1, "#eaf8ff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawLanes() {
    const laneAreaWidth = Math.min(W * 0.78, 420);
    const left = (W - laneAreaWidth) / 2;
    ctx.fillStyle = "#f7ecd0";
    ctx.fillRect(left, 0, laneAreaWidth, H);
    ctx.strokeStyle = "rgba(160,120,70,0.35)";
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 18]);
    ctx.lineDashOffset = -(scrollY % 36);
    for (let i = 1; i < CONFIG.laneCount; i++) {
      const x = left + laneAreaWidth * (i / CONFIG.laneCount);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function drawGrapeCluster(cx, cy, color, size) {
    size = size || 5;
    ctx.fillStyle = color;
    const offs = [[0, -6], [7, -1], [-7, -1], [0, 6], [7, 11], [-7, 11], [0, 17]];
    offs.forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(cx + dx, cy + dy, size, 0, Math.PI * 2); ctx.fill(); });
  }

  function drawGarland() {
    const y = 46, amp = 8, step = 54;
    const offset = (scrollY * 0.4) % step;
    ctx.strokeStyle = "#4caf7d";
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let x = -step; x <= W + step; x += 6) {
      const yy = y + Math.sin((x - offset) / step * Math.PI * 2) * amp;
      if (x === -step) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    let idx = 0;
    for (let x = -step; x <= W + step; x += step) {
      const gx = x - offset;
      const gy = y + Math.sin(gx / step * Math.PI * 2) * amp;
      drawGrapeCluster(gx, gy + 14, idx % 2 === 0 ? "#8e5fc2" : "#a8d15c", 4);
      idx++;
    }
  }

  function drawCharacter(opts) {
    const bodyScale = opts.bodyScale || 1;
    const legSwing = opts.legSwing || 0;
    ctx.save();
    ctx.scale(opts.scaleAll || 1, opts.scaleAll || 1);
    ctx.fillStyle = opts.bottomColor;
    roundRect(ctx, -14, 10 + legSwing * 0.3, 9, 22, 4); ctx.fill();
    roundRect(ctx, 5, 10 - legSwing * 0.3, 9, 22, 4); ctx.fill();
    ctx.fillStyle = opts.topColor;
    const torsoW = 30 * bodyScale, torsoH = 28;
    roundRect(ctx, -torsoW / 2, -18, torsoW, torsoH, 10); ctx.fill();
    ctx.fillStyle = "#ffce54";
    ctx.beginPath(); ctx.arc(0, -16, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(0, -34, 17, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.15)"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.ellipse(-13, -48, 9, 13, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(13, -48, 9, 13, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#222";
    ctx.beginPath(); ctx.arc(-6, -34, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(6, -34, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPlayer() {
    const bodyScale = clamp(1 + (player.obesity - 5) * 0.055, 0.75, 1.4);
    let jumpOffset = 0;
    if (player.jumping) {
      const p = player.jumpT / CONFIG.jumpDuration;
      jumpOffset = -Math.sin(p * Math.PI) * 46;
    }
    const slideScaleY = player.sliding ? 0.6 : 1;
    const legSwing = player.sliding ? 0 : Math.sin(player.legPhase) * 10;

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.beginPath();
    ctx.ellipse(0, 4, 22 * bodyScale * (player.jumping ? 0.6 : 1), 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fill();
    ctx.translate(0, jumpOffset);
    ctx.scale(1, slideScaleY);
    const blinking = player.invulnT > 0 && Math.floor(player.invulnT * 10) % 2 === 0;
    ctx.globalAlpha = blinking ? 0.35 : 1;
    drawCharacter({ bodyScale, legSwing, topColor: "#ff8c42", bottomColor: "#e6483a" });
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  const FAMILY_STYLE = {
    sibling: { top: "#fff3b0", bottom: "#ff8c42", scaleAll: 0.8 },
    dad: { top: "#4caf7d", bottom: "#6b4a2f", scaleAll: 1.05 },
    mom: { top: "#4a90d9", bottom: "#ffce54", scaleAll: 1.0 },
  };

  function drawFamilyMember(f) {
    const style = FAMILY_STYLE[f.id] || { top: "#ccc", bottom: "#999", scaleAll: 1 };
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.beginPath(); ctx.ellipse(0, 4, 20, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.15)"; ctx.fill();
    const legSwing = Math.sin(f.legPhase) * 10;
    drawCharacter({ bodyScale: 1, legSwing, topColor: style.top, bottomColor: style.bottom, scaleAll: style.scaleAll });
    ctx.restore();
  }

  function drawFoodBase(color, r) {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 2; ctx.stroke();
  }

  function drawGoodFood(sub, color) {
    if (sub === "apple") {
      drawFoodBase(color, 15);
      ctx.strokeStyle = "#6b4226"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(0, -20); ctx.stroke();
      ctx.fillStyle = "#4caf7d";
      ctx.beginPath(); ctx.ellipse(6, -18, 5, 3, 0.6, 0, Math.PI * 2); ctx.fill();
    } else if (sub === "carrot") {
      ctx.fillStyle = "#ff9a3c";
      ctx.beginPath(); ctx.moveTo(-9, -8); ctx.lineTo(9, -8); ctx.lineTo(0, 16); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.stroke();
      ctx.fillStyle = "#4caf7d";
      [-5, 0, 5].forEach((dx) => {
        ctx.beginPath(); ctx.moveTo(dx, -8); ctx.lineTo(dx - 3, -18); ctx.lineTo(dx + 3, -18); ctx.closePath(); ctx.fill();
      });
    } else if (sub === "broccoli") {
      ctx.fillStyle = "#4caf7d";
      [[-7, -4], [7, -4], [0, -10]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(dx, dy, 8, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = "#c9a876"; ctx.fillRect(-3, 2, 6, 10);
    } else if (sub === "water") {
      ctx.fillStyle = "#8fd1f0";
      roundRect(ctx, -8, -14, 16, 26, 5); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.stroke();
      ctx.fillStyle = "#4a90d9"; ctx.fillRect(-4, -20, 8, 6);
    } else {
      drawFoodBase(color, 15);
    }
  }

  function drawBadFood(sub, color) {
    if (sub === "grape") {
      drawGrapeCluster(0, -3, "#8e5fc2", 6);
    } else if (sub === "cake") {
      ctx.fillStyle = "#6b4226";
      ctx.beginPath(); ctx.moveTo(-14, 10); ctx.lineTo(14, 10); ctx.lineTo(0, -14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.moveTo(-9, 10); ctx.lineTo(9, 10); ctx.lineTo(0, -6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#e6483a";
      ctx.beginPath(); ctx.arc(0, -14, 3, 0, Math.PI * 2); ctx.fill();
    } else if (sub === "candy") {
      ctx.fillStyle = "#ff5c8a";
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 1.4); ctx.stroke();
      ctx.fillStyle = "#ffb3c6";
      ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(-18, -5); ctx.lineTo(-18, 5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(18, -5); ctx.lineTo(18, 5); ctx.closePath(); ctx.fill();
    } else if (sub === "donut") {
      ctx.strokeStyle = "#e6a23c"; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#ffce54";
      [[-6, -8], [3, -11], [8, -2], [-2, -12]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(dx, dy, 1.6, 0, Math.PI * 2); ctx.fill(); });
    } else {
      drawFoodBase(color, 15);
    }
  }

  function drawObstacle(sub) {
    if (sub === "rock") {
      ctx.fillStyle = "#9a9a92";
      ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1.5;
      [[-6, 2], [6, 2], [0, -4]].forEach(([dx, dy]) => {
        ctx.beginPath(); ctx.arc(dx, dy, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
    } else if (sub === "puddle") {
      ctx.fillStyle = "rgba(90,140,170,0.55)";
      ctx.beginPath(); ctx.ellipse(0, 4, 20, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, 4, 12, 4, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (sub === "fence") {
      ctx.save();
      ctx.translate(0, -6);
      ctx.fillStyle = "#7a5330";
      roundRect(ctx, -22, -6, 44, 12, 3); ctx.fill();
      ctx.save();
      roundRect(ctx, -22, -6, 44, 12, 3); ctx.clip();
      ctx.strokeStyle = "#ffce54"; ctx.lineWidth = 5;
      for (let x = -30; x < 30; x += 10) { ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x + 14, 10); ctx.stroke(); }
      ctx.restore();
      ctx.restore();
    }
  }

  function drawEntity(en) {
    const x = LANE_X[en.lane];
    const y = en.y;
    const scale = clamp(0.55 + 0.45 * (y / PLAYER_Y), 0.4, 1.05);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    if (en.kind === "good") drawGoodFood(en.sub, en.color);
    else if (en.kind === "bad") drawBadFood(en.sub, en.color);
    else drawObstacle(en.sub);
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawLanes();
    drawGarland();
    entities.forEach(drawEntity);
    joinedFamily.forEach(drawFamilyMember);
    if (player) drawPlayer();
    if (hitFlashT > 0) {
      ctx.fillStyle = `rgba(230,72,58,${(hitFlashT / 0.3) * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------- Main loop ----------
  let lastT = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - lastT) / 1000);
    lastT = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  resize();
  resetPlayer();
  updateObesityBar();
  renderHP();
  requestAnimationFrame(loop);
})();
