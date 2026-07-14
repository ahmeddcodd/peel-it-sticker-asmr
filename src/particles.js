window.PeelIt = window.PeelIt || {};

/*
 * particles.js - lightweight pooled particle system for placement bursts,
 * scene-complete confetti and shimmer sparkles. Fixed-size pool, no
 * per-frame allocation, so it stays cheap on mid-range mobile.
 */
PeelIt.Particles = (function () {
  'use strict';

  var POOL_SIZE = 220;
  var pool = [];
  for (var i = 0; i < POOL_SIZE; i++) {
    pool.push({
      active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
      size: 4, color: '#fff', shape: 'circle', rot: 0, vr: 0, gravity: 0, fade: true
    });
  }

  function spawn(opts) {
    for (var i = 0; i < pool.length; i++) {
      var p = pool[i];
      if (!p.active) {
        p.active = true;
        p.x = opts.x; p.y = opts.y;
        p.vx = opts.vx || 0; p.vy = opts.vy || 0;
        p.life = 0; p.maxLife = opts.maxLife || 0.6;
        p.size = opts.size || 4;
        p.color = opts.color || '#ffffff';
        p.shape = opts.shape || 'circle';
        p.rot = opts.rot || 0;
        p.vr = opts.vr || 0;
        p.gravity = opts.gravity != null ? opts.gravity : 600;
        p.fade = opts.fade !== false;
        return p;
      }
    }
    return null; // pool exhausted: drop silently, never allocate more
  }

  // Small celebratory burst at a placement point, colored to match sticker.
  function burst(x, y, color) {
    var count = 14;
    for (var i = 0; i < count; i++) {
      var ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      var speed = 90 + Math.random() * 160;
      spawn({
        x: x, y: y,
        vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed - 60,
        maxLife: 0.5 + Math.random() * 0.3,
        size: 3 + Math.random() * 4,
        color: color,
        shape: Math.random() < 0.5 ? 'circle' : 'square',
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 8,
        gravity: 500
      });
    }
  }

  // Full-scene confetti fall for the level-complete celebration.
  function confetti(width, height, colors) {
    var count = 60;
    for (var i = 0; i < count; i++) {
      var x = Math.random() * width;
      spawn({
        x: x, y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 120, vy: 160 + Math.random() * 160,
        maxLife: 2.2 + Math.random() * 1.2,
        size: 5 + Math.random() * 6,
        color: colors[(Math.random() * colors.length) | 0],
        shape: Math.random() < 0.5 ? 'circle' : 'square',
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 6,
        gravity: 220
      });
    }
  }

  function sparkle(x, y, color) {
    spawn({
      x: x, y: y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20 - 10,
      maxLife: 0.5 + Math.random() * 0.4, size: 2 + Math.random() * 3,
      color: color || '#ffffff', shape: 'star', rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 4, gravity: 0, fade: true
    });
  }

  function update(dt) {
    for (var i = 0; i < pool.length; i++) {
      var p = pool[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) { p.active = false; continue; }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  function draw(ctx) {
    for (var i = 0; i < pool.length; i++) {
      var p = pool[i];
      if (!p.active) continue;
      var t = p.life / p.maxLife;
      var alpha = p.fade ? (1 - t) : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      var s = p.size;
      if (p.shape === 'circle') {
        ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill();
      } else if (p.shape === 'square') {
        ctx.fillRect(-s, -s, s * 2, s * 2);
      } else if (p.shape === 'star') {
        drawStar(ctx, s);
      }
      ctx.restore();
    }
  }

  function drawStar(ctx, r) {
    ctx.beginPath();
    for (var i = 0; i < 4; i++) {
      var a = (Math.PI / 2) * i;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      var a2 = a + Math.PI / 4;
      ctx.lineTo(Math.cos(a2) * r * 0.35, Math.sin(a2) * r * 0.35);
    }
    ctx.closePath();
    ctx.fill();
  }

  function clear() {
    for (var i = 0; i < pool.length; i++) pool[i].active = false;
  }

  return { burst: burst, confetti: confetti, sparkle: sparkle, update: update, draw: draw, clear: clear };
})();
