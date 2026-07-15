window.PeelIt = window.PeelIt || {};

/*
 * sticker.js - procedural vector-art shape library + the Sticker entity.
 *
 * Every visual is drawn with canvas paths (no external images). Each shape
 * entry exposes:
 *   draw(ctx, size, color)   - renders the fully-inked artwork, centered at
 *                               the origin, assuming a bounding box of
 *                               roughly `size` x `size` design pixels.
 *   outline(ctx, size)       - traces a silhouette path (no fill/stroke)
 *                               used for the dashed target preview.
 */
PeelIt.Sticker = (function () {
  'use strict';

  // ---- color helpers ----------------------------------------------------
  function shade(hex, amt) {
    var c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(function (ch) { return ch + ch; }).join('');
    var num = parseInt(c, 16);
    var r = Math.min(255, Math.max(0, (num >> 16) + amt));
    var g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amt));
    var b = Math.min(255, Math.max(0, (num & 0xff) + amt));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function alpha(hex, a) {
    var c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(function (ch) { return ch + ch; }).join('');
    var num = parseInt(c, 16);
    var r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---- shape registry ----------------------------------------------------
  var SHAPES = {};

  // -- Boba tea parts -----------------------------------------------------
  SHAPES['boba-cup'] = {
    outline: function (ctx, size) {
      var s = size / 200, topW = 62 * s, botW = 46 * s, h = 140 * s;
      ctx.beginPath();
      ctx.moveTo(-topW, -h / 2);
      ctx.lineTo(topW, -h / 2);
      ctx.lineTo(botW, h / 2);
      ctx.quadraticCurveTo(0, h / 2 + 8 * s, -botW, h / 2);
      ctx.closePath();
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      this.outline(ctx, size);
      // Solid cream fill (was translucent white, which vanished against the
      // pastel background and made the whole cup look invisible - the boba
      // level then read as scattered pieces). A soft vertical gradient keeps
      // the "cup" feel while staying clearly visible.
      var grad = ctx.createLinearGradient(0, -70 * s, 0, 70 * s);
      grad.addColorStop(0, shade(color, 12));
      grad.addColorStop(1, shade(color, -8));
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = shade(color, -45);
      ctx.lineWidth = 5 * s;
      ctx.stroke();
      // rim
      ctx.beginPath();
      ctx.moveTo(-62 * s, -70 * s);
      ctx.lineTo(62 * s, -70 * s);
      ctx.strokeStyle = shade(color, -25);
      ctx.lineWidth = 6 * s;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  };

  SHAPES['boba-liquid'] = {
    outline: function (ctx, size) {
      var s = size / 200, topW = 50 * s, botW = 38 * s, h = 100 * s;
      ctx.beginPath();
      ctx.moveTo(-topW, -h / 2);
      ctx.lineTo(topW, -h / 2);
      ctx.lineTo(botW, h / 2);
      ctx.lineTo(-botW, h / 2);
      ctx.closePath();
    },
    draw: function (ctx, size, color) {
      this.outline(ctx, size);
      var grad = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
      grad.addColorStop(0, shade(color, 25));
      grad.addColorStop(1, shade(color, -15));
      ctx.fillStyle = grad;
      ctx.fill();
    }
  };

  SHAPES['boba-pearls'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.rect(-45 * s, -14 * s, 90 * s, 28 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      var xs = [-32, -11, 11, 32];
      xs.forEach(function (x, i) {
        ctx.beginPath();
        ctx.arc(x * s, (i % 2 === 0 ? -4 : 6) * s, 9 * s, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.fillStyle = alpha('#ffffff', 0.35);
        ctx.beginPath();
        ctx.arc(x * s - 2.5 * s, (i % 2 === 0 ? -4 : 6) * s - 2.5 * s, 2.5 * s, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  };

  SHAPES['boba-straw'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.save();
      roundRectPath(ctx, -11 * s, -75 * s, 22 * s, 150 * s, 10 * s);
      ctx.restore();
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      roundRectPath(ctx, -11 * s, -75 * s, 22 * s, 150 * s, 10 * s);
      ctx.fillStyle = color;
      ctx.fill();
      // candy stripes
      ctx.save();
      roundRectPath(ctx, -11 * s, -75 * s, 22 * s, 150 * s, 10 * s);
      ctx.clip();
      ctx.strokeStyle = alpha('#ffffff', 0.55);
      ctx.lineWidth = 8 * s;
      for (var i = -8; i <= 8; i++) {
        ctx.beginPath();
        ctx.moveTo(-20 * s + i * 18 * s, -85 * s);
        ctx.lineTo(-20 * s + i * 18 * s + 40 * s, 85 * s);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  SHAPES['boba-lid'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.ellipse(0, 0, 64 * s, 26 * s, 0, 0, Math.PI * 2);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      this.outline(ctx, size);
      ctx.fillStyle = alpha(color === '#FFFFFF' ? '#ffffff' : color, 0.9);
      ctx.fill();
      ctx.strokeStyle = shade('#d8d8d8', -30);
      ctx.lineWidth = 3 * s;
      ctx.stroke();
      // straw hole
      ctx.beginPath();
      ctx.ellipse(10 * s, 0, 8 * s, 5 * s, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(60,40,30,0.5)';
      ctx.fill();
      // shine
      ctx.beginPath();
      ctx.ellipse(-20 * s, -8 * s, 16 * s, 5 * s, -0.3, 0, Math.PI * 2);
      ctx.fillStyle = alpha('#ffffff', 0.6);
      ctx.fill();
    }
  };

  SHAPES['boba-face'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.rect(-40 * s, -20 * s, 80 * s, 40 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      // closed happy eyes ^ ^
      [-20, 20].forEach(function (x) {
        ctx.beginPath();
        ctx.moveTo((x - 10) * s, 2 * s);
        ctx.quadraticCurveTo(x * s, -10 * s, (x + 10) * s, 2 * s);
        ctx.lineWidth = 4 * s;
        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        ctx.stroke();
      });
      // blush
      [-34, 34].forEach(function (x) {
        ctx.beginPath();
        ctx.ellipse(x * s, 14 * s, 9 * s, 6 * s, 0, 0, Math.PI * 2);
        ctx.fillStyle = alpha('#ff9db3', 0.55);
        ctx.fill();
      });
      // smile
      ctx.beginPath();
      ctx.arc(0, 8 * s, 8 * s, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.lineWidth = 3.5 * s;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  };

  // -- Smiling cat parts ----------------------------------------------------
  SHAPES['cat-head'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.arc(0, 0, 62 * s, 0, Math.PI * 2);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      var grad = ctx.createRadialGradient(-15 * s, -20 * s, 10 * s, 0, 0, 65 * s);
      grad.addColorStop(0, shade(color, 25));
      grad.addColorStop(1, color);
      this.outline(ctx, size);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = shade(color, -30);
      ctx.lineWidth = 3 * s;
      ctx.stroke();
    }
  };

  SHAPES['cat-ears'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.rect(-70 * s, -55 * s, 140 * s, 45 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      [-1, 1].forEach(function (side) {
        var bx = side * 44 * s;
        ctx.beginPath();
        ctx.moveTo(bx - 26 * s * side, -8 * s);
        ctx.quadraticCurveTo(bx - 6 * s * side, -60 * s, bx + 22 * s * side, -10 * s);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = shade(color, -30);
        ctx.lineWidth = 3 * s;
        ctx.stroke();
        // inner ear
        ctx.beginPath();
        ctx.moveTo(bx - 14 * s * side, -14 * s);
        ctx.quadraticCurveTo(bx - 2 * s * side, -42 * s, bx + 10 * s * side, -16 * s);
        ctx.closePath();
        ctx.fillStyle = alpha('#ff9db3', 0.7);
        ctx.fill();
      });
    }
  };

  SHAPES['cat-eyes'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.rect(-40 * s, -10 * s, 80 * s, 20 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      [-22, 22].forEach(function (x) {
        ctx.beginPath();
        ctx.moveTo((x - 13) * s, 4 * s);
        ctx.quadraticCurveTo(x * s, -12 * s, (x + 13) * s, 4 * s);
        ctx.lineWidth = 4.5 * s;
        ctx.lineCap = 'round';
        ctx.strokeStyle = color;
        ctx.stroke();
      });
    }
  };

  SHAPES['cat-nose-mouth'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.rect(-20 * s, -8 * s, 40 * s, 30 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      // nose
      ctx.beginPath();
      ctx.moveTo(-6 * s, -2 * s);
      ctx.lineTo(6 * s, -2 * s);
      ctx.lineTo(0, 6 * s);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      // mouth (w shape)
      ctx.beginPath();
      ctx.moveTo(0, 6 * s);
      ctx.quadraticCurveTo(-10 * s, 10 * s, -14 * s, 4 * s);
      ctx.moveTo(0, 6 * s);
      ctx.quadraticCurveTo(10 * s, 10 * s, 14 * s, 4 * s);
      ctx.lineWidth = 3 * s;
      ctx.lineCap = 'round';
      ctx.strokeStyle = shade(color, -20);
      ctx.stroke();
    }
  };

  SHAPES['cat-whiskers'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.rect(-70 * s, -12 * s, 140 * s, 24 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      [-1, 1].forEach(function (side) {
        [-8, 0, 8].forEach(function (dy) {
          ctx.beginPath();
          ctx.moveTo(side * 20 * s, dy * s);
          ctx.lineTo(side * 62 * s, dy * 0.6 * s);
          ctx.lineWidth = 2.4 * s;
          ctx.lineCap = 'round';
          ctx.strokeStyle = color;
          ctx.stroke();
        });
      });
    }
  };

  SHAPES['cat-blush'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.rect(-60 * s, -12 * s, 120 * s, 24 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      [-40, 40].forEach(function (x) {
        ctx.beginPath();
        ctx.ellipse(x * s, 0, 14 * s, 9 * s, 0, 0, Math.PI * 2);
        ctx.fillStyle = alpha(color, 0.55);
        ctx.fill();
      });
    }
  };

  // -- Generic flat plate/saucer, reused under donuts and other treats ----
  SHAPES['plate'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.ellipse(0, 0, 85 * s, 30 * s, 0, 0, Math.PI * 2);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      this.outline(ctx, size);
      var g = ctx.createRadialGradient(-15 * s, -8 * s, 4 * s, 0, 0, 85 * s);
      g.addColorStop(0, shade(color, 20));
      g.addColorStop(1, shade(color, -12));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = shade(color, -30);
      ctx.lineWidth = 2 * s;
      ctx.stroke();
    }
  };

  // -- Birthday cake parts --------------------------------------------------
  SHAPES['cake-base'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      roundRectPath(ctx, -75 * s, -20 * s, 150 * s, 70 * s, 14 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      this.outline(ctx, size);
      var g = ctx.createLinearGradient(0, -20 * s, 0, 50 * s);
      g.addColorStop(0, shade(color, 20));
      g.addColorStop(1, shade(color, -20));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = shade(color, -40);
      ctx.lineWidth = 3 * s;
      ctx.stroke();
    }
  };

  SHAPES['cake-tier'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      roundRectPath(ctx, -55 * s, -55 * s, 110 * s, 55 * s, 12 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      this.outline(ctx, size);
      var g = ctx.createLinearGradient(0, -55 * s, 0, 0);
      g.addColorStop(0, shade(color, 20));
      g.addColorStop(1, shade(color, -15));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = shade(color, -35);
      ctx.lineWidth = 3 * s;
      ctx.stroke();
    }
  };

  SHAPES['cake-frosting'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.rect(-60 * s, -18 * s, 120 * s, 36 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      ctx.beginPath();
      ctx.moveTo(-60 * s, -10 * s);
      for (var i = -60; i < 60; i += 20) {
        ctx.quadraticCurveTo((i + 10) * s, 14 * s, (i + 20) * s, -10 * s);
      }
      ctx.lineTo(60 * s, -18 * s);
      ctx.lineTo(-60 * s, -18 * s);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = shade(color, -25);
      ctx.lineWidth = 2 * s;
      ctx.stroke();
    }
  };

  SHAPES['cake-sprinkles'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.rect(-50 * s, -14 * s, 100 * s, 28 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      var cols = [color, shade(color, 60), shade(color, -40), '#8FB3FF', '#B7F0C1'];
      var pts = [[-38, -4], [-20, 6], [-2, -6], [16, 4], [34, -4], [6, 8], [-28, 8]];
      pts.forEach(function (p, i) {
        ctx.save();
        ctx.translate(p[0] * s, p[1] * s);
        ctx.rotate(((i * 37) % 180) * Math.PI / 180);
        ctx.fillStyle = cols[i % cols.length];
        roundRectPath(ctx, -5 * s, -2 * s, 10 * s, 4 * s, 2 * s);
        ctx.fill();
        ctx.restore();
      });
    }
  };

  SHAPES['candle'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      roundRectPath(ctx, -8 * s, -50 * s, 16 * s, 70 * s, 5 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      this.outline(ctx, size);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = shade(color, -30);
      ctx.lineWidth = 2 * s;
      ctx.stroke();
      ctx.save();
      roundRectPath(ctx, -8 * s, -50 * s, 16 * s, 70 * s, 5 * s);
      ctx.clip();
      ctx.strokeStyle = alpha('#ffffff', 0.6);
      ctx.lineWidth = 5 * s;
      for (var i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-14 * s, i * 18 * s);
        ctx.lineTo(14 * s, i * 18 * s + 12 * s);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  SHAPES['candle-flame'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.ellipse(0, 0, 14 * s, 20 * s, 0, 0, Math.PI * 2);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      ctx.beginPath();
      ctx.moveTo(0, -22 * s);
      ctx.quadraticCurveTo(16 * s, -2 * s, 0, 22 * s);
      ctx.quadraticCurveTo(-16 * s, -2 * s, 0, -22 * s);
      ctx.closePath();
      var g = ctx.createRadialGradient(0, 6 * s, 2 * s, 0, 0, 20 * s);
      g.addColorStop(0, '#FFF7C2');
      g.addColorStop(0.5, color);
      g.addColorStop(1, shade(color, -30));
      ctx.fillStyle = g;
      ctx.fill();
    }
  };

  // -- Rainbow parts ---------------------------------------------------------
  SHAPES['cloud'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.ellipse(0, 6 * s, 60 * s, 24 * s, 0, 0, Math.PI * 2);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      [[-30, 0, 26], [0, -14, 32], [30, 0, 26], [55, 6, 20], [-55, 6, 20]].forEach(function (c) {
        ctx.beginPath();
        ctx.arc(c[0] * s, c[1] * s, c[2] * s, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });
      ctx.beginPath();
      ctx.ellipse(0, 10 * s, 60 * s, 20 * s, 0, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = shade(color, -25);
      ctx.lineWidth = 2.5 * s;
      ctx.stroke();
    }
  };

  // Half-annulus "band" used for the concentric rainbow arcs. All three
  // bands share the same target center so they nest into one arch.
  function arcBandPath(ctx, rOuter, rInner) {
    ctx.beginPath();
    ctx.arc(0, 0, rOuter, Math.PI, 0, false);
    ctx.lineTo(rInner, 0);
    ctx.arc(0, 0, rInner, 0, Math.PI, true);
    ctx.closePath();
  }

  SHAPES['rainbow-arc-outer'] = {
    outline: function (ctx, size) { var s = size / 200; arcBandPath(ctx, 95 * s, 75 * s); },
    draw: function (ctx, size, color) {
      var s = size / 200;
      arcBandPath(ctx, 95 * s, 75 * s);
      var g = ctx.createLinearGradient(0, -95 * s, 0, 0);
      g.addColorStop(0, shade(color, 15));
      g.addColorStop(1, shade(color, -15));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = shade(color, -30);
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
    }
  };
  SHAPES['rainbow-arc-mid'] = {
    outline: function (ctx, size) { var s = size / 200; arcBandPath(ctx, 72 * s, 52 * s); },
    draw: function (ctx, size, color) {
      var s = size / 200;
      arcBandPath(ctx, 72 * s, 52 * s);
      var g = ctx.createLinearGradient(0, -72 * s, 0, 0);
      g.addColorStop(0, shade(color, 15));
      g.addColorStop(1, shade(color, -15));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = shade(color, -30);
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
    }
  };
  SHAPES['rainbow-arc-inner'] = {
    outline: function (ctx, size) { var s = size / 200; arcBandPath(ctx, 49 * s, 29 * s); },
    draw: function (ctx, size, color) {
      var s = size / 200;
      arcBandPath(ctx, 49 * s, 29 * s);
      var g = ctx.createLinearGradient(0, -49 * s, 0, 0);
      g.addColorStop(0, shade(color, 15));
      g.addColorStop(1, shade(color, -15));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = shade(color, -30);
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
    }
  };

  // -- Sneaker parts -----------------------------------------------------
  SHAPES['shoe-sole'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.moveTo(-70 * s, 10 * s);
      ctx.quadraticCurveTo(-75 * s, 30 * s, -50 * s, 32 * s);
      ctx.lineTo(70 * s, 32 * s);
      ctx.quadraticCurveTo(85 * s, 30 * s, 80 * s, 12 * s);
      ctx.quadraticCurveTo(40 * s, 4 * s, -70 * s, 10 * s);
      ctx.closePath();
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      this.outline(ctx, size);
      var g = ctx.createLinearGradient(0, 10 * s, 0, 32 * s);
      g.addColorStop(0, shade(color, 10));
      g.addColorStop(1, shade(color, -20));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = shade(color, -35);
      ctx.lineWidth = 2.5 * s;
      ctx.stroke();
    }
  };

  SHAPES['shoe-body'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.moveTo(-65 * s, 5 * s);
      ctx.quadraticCurveTo(-70 * s, -35 * s, -20 * s, -40 * s);
      ctx.quadraticCurveTo(30 * s, -46 * s, 65 * s, -10 * s);
      ctx.quadraticCurveTo(78 * s, 0, 75 * s, 12 * s);
      ctx.lineTo(-65 * s, 12 * s);
      ctx.closePath();
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      this.outline(ctx, size);
      var g = ctx.createLinearGradient(0, -40 * s, 0, 12 * s);
      g.addColorStop(0, shade(color, 15));
      g.addColorStop(1, shade(color, -10));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = shade(color, -35);
      ctx.lineWidth = 2.5 * s;
      ctx.stroke();
    }
  };

  SHAPES['shoe-toe'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.ellipse(0, 0, 26 * s, 20 * s, -0.3, 0, Math.PI * 2);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      this.outline(ctx, size);
      var g = ctx.createRadialGradient(-8 * s, -6 * s, 3 * s, 0, 0, 28 * s);
      g.addColorStop(0, shade(color, 15));
      g.addColorStop(1, shade(color, -15));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = shade(color, -30);
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
    }
  };

  SHAPES['shoe-laces'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.rect(-30 * s, -38 * s, 60 * s, 30 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      for (var i = 0; i < 3; i++) {
        var y = -32 * s + i * 12 * s;
        ctx.beginPath();
        ctx.moveTo(-25 * s, y);
        ctx.lineTo(20 * s, y + 10 * s);
        ctx.moveTo(20 * s, y);
        ctx.lineTo(-25 * s, y + 10 * s);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3 * s;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }
  };

  SHAPES['shoe-swoosh'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.rect(-40 * s, -20 * s, 100 * s, 40 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      ctx.beginPath();
      ctx.moveTo(-40 * s, 10 * s);
      ctx.quadraticCurveTo(10 * s, -20 * s, 55 * s, -8 * s);
      ctx.quadraticCurveTo(10 * s, -4 * s, -30 * s, 18 * s);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }
  };

  SHAPES['shoe-heel-tab'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      roundRectPath(ctx, -82 * s, -28 * s, 20 * s, 26 * s, 8 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      roundRectPath(ctx, -82 * s, -28 * s, 20 * s, 26 * s, 8 * s);
      var g = ctx.createLinearGradient(-82 * s, -28 * s, -62 * s, -2 * s);
      g.addColorStop(0, shade(color, 15));
      g.addColorStop(1, shade(color, -15));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = shade(color, -35);
      ctx.lineWidth = 2 * s;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(-72 * s, -15 * s, 5 * s, 8 * s, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fill();
    }
  };

  // -- Donut parts -------------------------------------------------------
  SHAPES['donut-base'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.arc(0, 0, 70 * s, 0, Math.PI * 2);
      ctx.moveTo(28 * s, 0);
      ctx.arc(0, 0, 28 * s, 0, Math.PI * 2, true);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      ctx.beginPath();
      ctx.arc(0, 0, 70 * s, 0, Math.PI * 2);
      ctx.arc(0, 0, 28 * s, 0, Math.PI * 2, true);
      ctx.closePath();
      var g = ctx.createRadialGradient(0, 0, 28 * s, 0, 0, 70 * s);
      g.addColorStop(0, shade(color, -15));
      g.addColorStop(1, shade(color, 15));
      ctx.fillStyle = g;
      ctx.fill('evenodd');
      ctx.strokeStyle = shade(color, -35);
      ctx.lineWidth = 2.5 * s;
      ctx.stroke();
    }
  };

  SHAPES['donut-icing'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.arc(0, 0, 64 * s, 0, Math.PI * 2);
      ctx.moveTo(30 * s, 0);
      ctx.arc(0, 0, 30 * s, 0, Math.PI * 2, true);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      ctx.beginPath();
      ctx.arc(0, 0, 64 * s, 0, Math.PI * 2);
      ctx.arc(0, 0, 30 * s, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill('evenodd');
      [[-40, 60], [-5, 64], [35, 58]].forEach(function (p) {
        ctx.beginPath();
        ctx.moveTo(p[0] * s - 6 * s, p[1] * s);
        ctx.quadraticCurveTo(p[0] * s, p[1] * s + 22 * s, p[0] * s + 6 * s, p[1] * s);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      });
    }
  };

  SHAPES['donut-sprinkles'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.arc(0, 0, 55 * s, 0, Math.PI * 2);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      var cols = [color, '#FF8FB3', '#8FB3FF', '#B7F0C1', '#FFF3B0'];
      for (var i = 0; i < 14; i++) {
        var ang = (i / 14) * Math.PI * 2 + i * 0.7;
        var r = 34 + (i % 3) * 10;
        ctx.save();
        ctx.translate(Math.cos(ang) * r * s, Math.sin(ang) * r * s);
        ctx.rotate(ang);
        ctx.fillStyle = cols[i % cols.length];
        roundRectPath(ctx, -4 * s, -1.5 * s, 8 * s, 3 * s, 1.5 * s);
        ctx.fill();
        ctx.restore();
      }
    }
  };

  SHAPES['donut-shine'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.ellipse(-25 * s, -30 * s, 16 * s, 8 * s, -0.4, 0, Math.PI * 2);
    },
    draw: function (ctx, size, color) {
      void color;
      this.outline(ctx, size);
      ctx.fillStyle = alpha('#ffffff', 0.6);
      ctx.fill();
    }
  };

  // -- Sunflower parts ---------------------------------------------------
  SHAPES['flower-stem'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.moveTo(-6 * s, 0);
      ctx.quadraticCurveTo(10 * s, 45 * s, -4 * s, 90 * s);
      ctx.lineTo(4 * s, 90 * s);
      ctx.quadraticCurveTo(18 * s, 45 * s, 6 * s, 0);
      ctx.closePath();
    },
    draw: function (ctx, size, color) {
      this.outline(ctx, size);
      ctx.fillStyle = color;
      ctx.fill();
    }
  };

  SHAPES['flower-leaf'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.ellipse(0, 0, 22 * s, 10 * s, -0.5, 0, Math.PI * 2);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      this.outline(ctx, size);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = shade(color, -25);
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
    }
  };

  function petalRing(ctx, size, color, count, rOffset, angleOffset) {
    var s = size / 200;
    for (var i = 0; i < count; i++) {
      var ang = (i / count) * Math.PI * 2 + angleOffset;
      ctx.save();
      ctx.rotate(ang);
      ctx.translate(rOffset * s, 0);
      ctx.beginPath();
      ctx.ellipse(0, 0, 26 * s, 11 * s, 0, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = shade(color, -20);
      ctx.lineWidth = 1.5 * s;
      ctx.stroke();
      ctx.restore();
    }
  }

  SHAPES['flower-petals-back'] = {
    outline: function (ctx, size) { var s = size / 200; ctx.beginPath(); ctx.arc(0, 0, 68 * s, 0, Math.PI * 2); },
    draw: function (ctx, size, color) { petalRing(ctx, size, color, 10, 42, 0.15); }
  };
  SHAPES['flower-petals-front'] = {
    outline: function (ctx, size) { var s = size / 200; ctx.beginPath(); ctx.arc(0, 0, 60 * s, 0, Math.PI * 2); },
    draw: function (ctx, size, color) { petalRing(ctx, size, color, 10, 38, 0); }
  };

  SHAPES['flower-center'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.arc(0, 0, 34 * s, 0, Math.PI * 2);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      var g = ctx.createRadialGradient(-8 * s, -8 * s, 4 * s, 0, 0, 34 * s);
      g.addColorStop(0, shade(color, 25));
      g.addColorStop(1, shade(color, -20));
      ctx.beginPath();
      ctx.arc(0, 0, 34 * s, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      for (var ring = 1; ring <= 2; ring++) {
        var count = ring * 8;
        for (var i = 0; i < count; i++) {
          var ang = (i / count) * Math.PI * 2;
          var r = ring * 10 * s;
          ctx.beginPath();
          ctx.arc(Math.cos(ang) * r, Math.sin(ang) * r, 2.2 * s, 0, Math.PI * 2);
          ctx.fillStyle = shade(color, -45);
          ctx.fill();
        }
      }
    }
  };

  // -- Gaming controller parts --------------------------------------------
  SHAPES['controller-body'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.moveTo(-70 * s, -20 * s);
      ctx.quadraticCurveTo(-90 * s, -20 * s, -88 * s, 10 * s);
      ctx.quadraticCurveTo(-86 * s, 35 * s, -60 * s, 30 * s);
      ctx.lineTo(60 * s, 30 * s);
      ctx.quadraticCurveTo(86 * s, 35 * s, 88 * s, 10 * s);
      ctx.quadraticCurveTo(90 * s, -20 * s, 70 * s, -20 * s);
      ctx.closePath();
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      this.outline(ctx, size);
      var g = ctx.createLinearGradient(0, -20 * s, 0, 30 * s);
      g.addColorStop(0, shade(color, 15));
      g.addColorStop(1, shade(color, -15));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = shade(color, -35);
      ctx.lineWidth = 3 * s;
      ctx.stroke();
    }
  };

  SHAPES['dpad'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.rect(-20 * s, -20 * s, 40 * s, 40 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      roundRectPath(ctx, -8 * s, -20 * s, 16 * s, 40 * s, 4 * s);
      ctx.fillStyle = color;
      ctx.fill();
      roundRectPath(ctx, -20 * s, -8 * s, 40 * s, 16 * s, 4 * s);
      ctx.fillStyle = color;
      ctx.fill();
    }
  };

  SHAPES['buttons'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.rect(-18 * s, -18 * s, 36 * s, 36 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      var cols = [color, '#8FB3FF', '#B7F0C1', '#FFF3B0'];
      var pts = [[0, -14], [14, 0], [0, 14], [-14, 0]];
      pts.forEach(function (p, i) {
        ctx.beginPath();
        ctx.arc(p[0] * s, p[1] * s, 9 * s, 0, Math.PI * 2);
        ctx.fillStyle = cols[i % cols.length];
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1.5 * s;
        ctx.stroke();
      });
    }
  };

  SHAPES['joystick'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.arc(0, 4 * s, 20 * s, 0, Math.PI * 2);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      ctx.beginPath();
      ctx.arc(0, 4 * s, 20 * s, 0, Math.PI * 2);
      ctx.fillStyle = shade(color, -30);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 14 * s, 0, Math.PI * 2);
      var g = ctx.createRadialGradient(-4 * s, -4 * s, 2 * s, 0, 0, 14 * s);
      g.addColorStop(0, shade(color, 25));
      g.addColorStop(1, color);
      ctx.fillStyle = g;
      ctx.fill();
    }
  };

  SHAPES['shoulder-buttons'] = {
    // Built as one combined path (not two roundRectPath() calls, which
    // would each call ctx.beginPath() and wipe out the previous bump) so
    // the dashed placement-preview outline shows both bumps, not just
    // the last one drawn.
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      [-70, 36].forEach(function (x) {
        var xx = x * s, y = -34 * s, w = 34 * s, h = 16 * s, r = 8 * s;
        ctx.moveTo(xx + r, y);
        ctx.arcTo(xx + w, y, xx + w, y + h, r);
        ctx.arcTo(xx + w, y + h, xx, y + h, r);
        ctx.arcTo(xx, y + h, xx, y, r);
        ctx.arcTo(xx, y, xx + w, y, r);
        ctx.closePath();
      });
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      [-70, 36].forEach(function (x) {
        roundRectPath(ctx, x * s, -34 * s, 34 * s, 16 * s, 8 * s);
        var g = ctx.createLinearGradient(0, -34 * s, 0, -18 * s);
        g.addColorStop(0, shade(color, 20));
        g.addColorStop(1, shade(color, -10));
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = shade(color, -35);
        ctx.lineWidth = 2 * s;
        ctx.stroke();
      });
    }
  };

  SHAPES['controller-light'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.arc(0, 0, 6 * s, 0, Math.PI * 2);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      ctx.beginPath();
      ctx.arc(0, 0, 6 * s, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-2 * s, -2 * s, 2 * s, 0, Math.PI * 2);
      ctx.fillStyle = alpha('#ffffff', 0.7);
      ctx.fill();
    }
  };

  // -- Ice cream sundae parts ----------------------------------------------
  SHAPES['sundae-glass'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.moveTo(-50 * s, -40 * s);
      ctx.quadraticCurveTo(-45 * s, 30 * s, -15 * s, 60 * s);
      ctx.lineTo(15 * s, 60 * s);
      ctx.quadraticCurveTo(45 * s, 30 * s, 50 * s, -40 * s);
      ctx.closePath();
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      this.outline(ctx, size);
      // Light blue-tinted "glass" fill (was near-invisible translucent white).
      var grad = ctx.createLinearGradient(-50 * s, 0, 50 * s, 0);
      grad.addColorStop(0, alpha('#cfe0f2', 0.9));
      grad.addColorStop(0.5, alpha('#eef5fc', 0.95));
      grad.addColorStop(1, alpha('#cfe0f2', 0.9));
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = '#9db6d4';
      ctx.lineWidth = 3 * s;
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(-6 * s, 60 * s, 12 * s, 20 * s);
      ctx.fillStyle = alpha('#dbe7f5', 0.95);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 80 * s, 26 * s, 7 * s, 0, 0, Math.PI * 2);
      ctx.fillStyle = alpha('#dbe7f5', 0.95);
      ctx.fill();
      ctx.strokeStyle = '#9db6d4';
      ctx.lineWidth = 2 * s;
      ctx.stroke();
    }
  };

  SHAPES['scoop'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.arc(0, 0, 48 * s, Math.PI, 0, false);
      ctx.lineTo(48 * s, 10 * s);
      ctx.quadraticCurveTo(0, 26 * s, -48 * s, 10 * s);
      ctx.closePath();
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      this.outline(ctx, size);
      var g = ctx.createRadialGradient(-14 * s, -14 * s, 6 * s, 0, 0, 50 * s);
      g.addColorStop(0, shade(color, 25));
      g.addColorStop(1, shade(color, -10));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = shade(color, -30);
      ctx.lineWidth = 2 * s;
      ctx.stroke();
    }
  };

  SHAPES['syrup-drizzle'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.rect(-40 * s, -10 * s, 80 * s, 30 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      ctx.strokeStyle = color;
      ctx.lineWidth = 4 * s;
      ctx.lineCap = 'round';
      for (var i = -30; i <= 30; i += 15) {
        ctx.beginPath();
        ctx.moveTo(i * s, -10 * s);
        ctx.quadraticCurveTo((i + 8) * s, 4 * s, i * s, 18 * s);
        ctx.stroke();
      }
    }
  };

  SHAPES['cherry'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.arc(0, 10 * s, 14 * s, 0, Math.PI * 2);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      ctx.beginPath();
      ctx.moveTo(2 * s, -20 * s);
      ctx.quadraticCurveTo(10 * s, -6 * s, 4 * s, 4 * s);
      ctx.strokeStyle = '#7a9b57';
      ctx.lineWidth = 2 * s;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 10 * s, 14 * s, 0, Math.PI * 2);
      var g = ctx.createRadialGradient(-4 * s, 4 * s, 2 * s, 0, 10 * s, 14 * s);
      g.addColorStop(0, shade(color, 30));
      g.addColorStop(1, shade(color, -20));
      ctx.fillStyle = g;
      ctx.fill();
    }
  };

  SHAPES['wafer'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      roundRectPath(ctx, -8 * s, -40 * s, 16 * s, 80 * s, 4 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      this.outline(ctx, size);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = shade(color, -25);
      ctx.lineWidth = 2 * s;
      ctx.stroke();
      ctx.strokeStyle = alpha('#ffffff', 0.4);
      ctx.lineWidth = 2 * s;
      for (var y = -32; y <= 32; y += 12) {
        ctx.beginPath();
        ctx.moveTo(-8 * s, y * s);
        ctx.lineTo(8 * s, y * s);
        ctx.stroke();
      }
    }
  };

  // -- Planet parts --------------------------------------------------------
  SHAPES['planet-body'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.arc(0, 0, 60 * s, 0, Math.PI * 2);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      this.outline(ctx, size);
      var g = ctx.createRadialGradient(-18 * s, -18 * s, 8 * s, 0, 0, 62 * s);
      g.addColorStop(0, shade(color, 30));
      g.addColorStop(1, shade(color, -25));
      ctx.fillStyle = g;
      ctx.fill();
    }
  };

  SHAPES['planet-ring'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.ellipse(0, 0, 88 * s, 24 * s, -0.15, 0, Math.PI * 2);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      ctx.beginPath();
      ctx.ellipse(0, 0, 88 * s, 24 * s, -0.15, 0, Math.PI * 2);
      ctx.strokeStyle = alpha(color, 0.85);
      ctx.lineWidth = 10 * s;
      ctx.stroke();
      ctx.strokeStyle = alpha(shade(color, -30), 0.6);
      ctx.lineWidth = 3 * s;
      ctx.stroke();
    }
  };

  SHAPES['planet-spots'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.arc(0, 0, 55 * s, 0, Math.PI * 2);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      [[-20, -10, 10], [15, 10, 8], [0, -25, 6], [25, -15, 7], [-10, 20, 9]].forEach(function (c) {
        ctx.beginPath();
        ctx.ellipse(c[0] * s, c[1] * s, c[2] * s, c[2] * 0.7 * s, 0, 0, Math.PI * 2);
        ctx.fillStyle = alpha(color, 0.4);
        ctx.fill();
      });
    }
  };

  SHAPES['moon-small'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.arc(0, 0, 18 * s, 0, Math.PI * 2);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      this.outline(ctx, size);
      var g = ctx.createRadialGradient(-5 * s, -5 * s, 2 * s, 0, 0, 18 * s);
      g.addColorStop(0, shade(color, 25));
      g.addColorStop(1, shade(color, -15));
      ctx.fillStyle = g;
      ctx.fill();
    }
  };

  SHAPES['comet'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.rect(-60 * s, -20 * s, 100 * s, 40 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      var g = ctx.createLinearGradient(-60 * s, 0, 30 * s, 0);
      g.addColorStop(0, alpha(color, 0));
      g.addColorStop(1, alpha(color, 0.9));
      ctx.beginPath();
      ctx.moveTo(-60 * s, 0);
      ctx.lineTo(30 * s, -9 * s);
      ctx.lineTo(30 * s, 9 * s);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(32 * s, 0, 11 * s, 0, Math.PI * 2);
      var g2 = ctx.createRadialGradient(28 * s, -3 * s, 2 * s, 32 * s, 0, 11 * s);
      g2.addColorStop(0, '#ffffff');
      g2.addColorStop(1, shade(color, -20));
      ctx.fillStyle = g2;
      ctx.fill();
    }
  };

  SHAPES['stars-sparkle'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.rect(-60 * s, -40 * s, 120 * s, 80 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      var pts = [[-45, -20], [-10, -35], [30, -10], [45, 20], [-30, 25], [5, 10]];
      pts.forEach(function (p, i) {
        ctx.save();
        ctx.translate(p[0] * s, p[1] * s);
        ctx.rotate(i);
        var r = (i % 2 === 0 ? 6 : 4) * s;
        ctx.beginPath();
        for (var k = 0; k < 4; k++) {
          var a = (Math.PI / 2) * k;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          var a2 = a + Math.PI / 4;
          ctx.lineTo(Math.cos(a2) * r * 0.35, Math.sin(a2) * r * 0.35);
        }
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
      });
    }
  };

  // -- Butterfly parts ------------------------------------------------------
  SHAPES['butterfly-body'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.ellipse(0, 0, 7 * s, 45 * s, 0, 0, Math.PI * 2);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      this.outline(ctx, size);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * s;
      ctx.lineCap = 'round';
      [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.moveTo(0, -40 * s);
        ctx.quadraticCurveTo(side * 14 * s, -60 * s, side * 18 * s, -68 * s);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(side * 18 * s, -68 * s, 3 * s, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });
    }
  };

  function wingPath(ctx, s, upper, mirror) {
    var m = mirror ? -1 : 1;
    ctx.beginPath();
    if (upper) {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(m * 45 * s, -55 * s, m * 70 * s, -20 * s);
      ctx.quadraticCurveTo(m * 80 * s, 15 * s, m * 40 * s, 25 * s);
      ctx.quadraticCurveTo(m * 15 * s, 15 * s, 0, 0);
    } else {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(m * 35 * s, 10 * s, m * 50 * s, 40 * s);
      ctx.quadraticCurveTo(m * 45 * s, 65 * s, m * 15 * s, 55 * s);
      ctx.quadraticCurveTo(0, 30 * s, 0, 0);
    }
    ctx.closePath();
  }

  function wingShape(upper, mirror) {
    return {
      outline: function (ctx, size) { wingPath(ctx, size / 200, upper, mirror); },
      draw: function (ctx, size, color) {
        var s = size / 200;
        wingPath(ctx, s, upper, mirror);
        var g = ctx.createRadialGradient(m2(mirror) * 30 * s, -10 * s, 5 * s, 0, 0, 70 * s);
        g.addColorStop(0, shade(color, 25));
        g.addColorStop(1, color);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = shade(color, -30);
        ctx.lineWidth = 2 * s;
        ctx.stroke();
      }
    };
  }
  function m2(mirror) { return mirror ? -1 : 1; }

  SHAPES['wing-upper-left'] = wingShape(true, true);
  SHAPES['wing-upper-right'] = wingShape(true, false);
  SHAPES['wing-lower-left'] = wingShape(false, true);
  SHAPES['wing-lower-right'] = wingShape(false, false);

  SHAPES['wing-pattern'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.rect(-90 * s, -70 * s, 180 * s, 140 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      var pts = [[-45, -25], [45, -25], [-55, 20], [55, 20], [-25, -45], [25, -45], [-30, 40], [30, 40]];
      pts.forEach(function (p) {
        ctx.beginPath();
        ctx.arc(p[0] * s, p[1] * s, 6 * s, 0, Math.PI * 2);
        ctx.fillStyle = alpha(color, 0.7);
        ctx.fill();
      });
    }
  };

  // -- Aquarium parts -------------------------------------------------------
  SHAPES['tank'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      roundRectPath(ctx, -80 * s, -70 * s, 160 * s, 140 * s, 20 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      this.outline(ctx, size);
      // Light aqua glass fill (was near-invisible translucent white, leaving
      // the aquarium looking empty).
      ctx.fillStyle = alpha('#d6eefb', 0.85);
      ctx.fill();
      ctx.strokeStyle = '#7fb4d8';
      ctx.lineWidth = 6 * s;
      ctx.stroke();
      // glassy diagonal highlight
      ctx.save();
      roundRectPath(ctx, -80 * s, -70 * s, 160 * s, 140 * s, 20 * s);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(-60 * s, -70 * s);
      ctx.lineTo(-40 * s, -70 * s);
      ctx.lineTo(-65 * s, 70 * s);
      ctx.lineTo(-85 * s, 70 * s);
      ctx.closePath();
      ctx.fillStyle = alpha('#ffffff', 0.4);
      ctx.fill();
      ctx.restore();
    }
  };

  SHAPES['water-fill'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      roundRectPath(ctx, -72 * s, -40 * s, 144 * s, 105 * s, 14 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      this.outline(ctx, size);
      var g = ctx.createLinearGradient(0, -40 * s, 0, 65 * s);
      g.addColorStop(0, alpha(color, 0.55));
      g.addColorStop(1, alpha(shade(color, -15), 0.75));
      ctx.fillStyle = g;
      ctx.fill();
    }
  };

  SHAPES['seaweed'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.rect(-20 * s, -60 * s, 40 * s, 80 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      [-12, 0, 12].forEach(function (x, i) {
        ctx.beginPath();
        ctx.moveTo(x * s, 20 * s);
        ctx.quadraticCurveTo((x - 10) * s, -10 * s, (x + 6) * s, -40 * s - i * 4 * s);
        ctx.strokeStyle = color;
        ctx.lineWidth = 7 * s;
        ctx.lineCap = 'round';
        ctx.stroke();
      });
    }
  };

  SHAPES['fish-body'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.ellipse(0, 0, 32 * s, 20 * s, 0, 0, Math.PI * 2);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      this.outline(ctx, size);
      var g = ctx.createRadialGradient(-8 * s, -6 * s, 4 * s, 0, 0, 32 * s);
      g.addColorStop(0, shade(color, 25));
      g.addColorStop(1, shade(color, -10));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(16 * s, -4 * s, 4 * s, 0, Math.PI * 2);
      ctx.fillStyle = '#3a2b40';
      ctx.fill();
    }
  };

  SHAPES['fish-tail'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.moveTo(-4 * s, -16 * s);
      ctx.lineTo(-30 * s, 0);
      ctx.lineTo(-4 * s, 16 * s);
      ctx.closePath();
    },
    draw: function (ctx, size, color) {
      this.outline(ctx, size);
      ctx.fillStyle = color;
      ctx.fill();
    }
  };

  SHAPES['bubbles'] = {
    outline: function (ctx, size) {
      var s = size / 200;
      ctx.beginPath();
      ctx.rect(-20 * s, -50 * s, 40 * s, 100 * s);
    },
    draw: function (ctx, size, color) {
      var s = size / 200;
      [[0, 30, 10], [-8, 0, 6], [10, -25, 7], [2, -45, 4]].forEach(function (c) {
        ctx.beginPath();
        ctx.arc(c[0] * s, c[1] * s, c[2] * s, 0, Math.PI * 2);
        ctx.strokeStyle = alpha(color, 0.8);
        ctx.lineWidth = 2 * s;
        ctx.stroke();
        ctx.fillStyle = alpha('#ffffff', 0.25);
        ctx.fill();
      });
    }
  };

  // ---- easing helpers -----------------------------------------------------
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  // ---- Sticker entity -----------------------------------------------------
  function Sticker(def, levelId) {
    this.id = def.id;
    this.levelId = levelId;
    this.shape = def.shape;
    this.color = def.color;
    this.size = def.size;
    this.z = def.z;
    this.targetFracX = def.tx;
    this.targetFracY = def.ty;
    this.targetRot = (def.rot || 0) * Math.PI / 180;

    this.state = 'tray'; // tray | dragging | settling | returning | placed
    this.x = 0; this.y = 0;       // current draw position (design px)
    this.rot = 0;                  // current draw rotation (radians)
    this.trayX = 0; this.trayY = 0; // resting tray slot
    this.targetX = 0; this.targetY = 0; // absolute px target (set by layout)

    this.scaleX = 1; this.scaleY = 1;
    this.trayScale = 1;      // shrink-to-fit factor while resting in the tray (set by Game.layoutTray)
    this.peel = 0;           // 0 = flat on sheet, 1 = fully lifted (resistance-eased, see dragTo)
    this.wobblePhase = Math.random() * Math.PI * 2;
    this.settleT = 0;        // 0-1 progress through the snap squash tween
    this.returnT = 0;        // 0-1 progress through the return-to-tray tween
    this.returnFrom = { x: 0, y: 0 };
    this.shakeT = 0;         // >0 while playing the "wrong" shake
    this.dropDistance = null; // px distance from target at time of placement

    // Smoothed drag velocity, used so the peel corner curls away from the
    // direction of travel (the flap lifts from the trailing edge, like a
    // real sticker) instead of a fixed corner regardless of drag direction.
    this.dragVX = 0; this.dragVY = 0;
    this.foldAngle = -Math.PI * 0.75; // neutral default before any movement

    this.cachedCanvas = null;  // perf: baked bitmap once placed, see buildCache()
    this.cachedCanvasSize = 0;
  }

  Sticker.prototype.snapRadius = function () {
    // Forgiving snap zone: placement should feel like the slot magnetically
    // accepts the piece, not like a pixel-perfect drop test. Star rating
    // still rewards accuracy (dropDistance / snapRadius, tuned in game.js).
    return this.size * 0.5;
  };

  Sticker.prototype.update = function (dt, time) {
    if (this.state === 'tray') {
      // gentle idle wobble so the tray feels alive
      this.rot = Math.sin(time * 1.6 + this.wobblePhase) * 0.05;
      this.x = this.trayX;
      this.y = this.trayY;
      this.peel = 0;
      // Drawn shrunk-to-fit while resting in the tray. Applies to the dimmed
      // z-locked copies too, since renderTray() draws those through the same
      // draw() path.
      this.scaleX = this.scaleY = this.trayScale;
    } else if (this.state === 'settling') {
      this.settleT += dt / 0.34;
      if (this.settleT >= 1) {
        this.settleT = 1;
        this.state = 'placed';
        this.scaleX = this.scaleY = 1;
        this.rot = this.targetRot;
      } else {
        var t = this.settleT;
        this.rot = this.targetRot;
        this.x = this.targetX;
        this.y = this.targetY;
        if (t < 0.4) {
          // impact squash: flattens on landing (fast attack, continuous
          // with the spring phase below since both meet at scale 1,1)
          var p = t / 0.4;
          var squash = Math.sin(p * Math.PI) * 0.22;
          this.scaleX = 1 + squash;
          this.scaleY = 1 - squash;
        } else {
          // spring settle: a decaying oscillation starting and ending at
          // scale 1 (continuous with the squash phase above), wobbling
          // a couple of times in between like a real spring coming to rest.
          var p2 = (t - 0.4) / 0.6;
          var decay = Math.exp(-p2 * 4.5);
          var wobble = Math.sin(p2 * Math.PI * 2.5) * 0.07 * decay;
          this.scaleX = 1 - wobble;
          this.scaleY = 1 + wobble;
        }
      }
    } else if (this.state === 'returning') {
      this.returnT += dt / 0.28;
      if (this.shakeT > 0) this.shakeT -= dt;
      if (this.returnT >= 1) {
        this.returnT = 0;
        this.state = 'tray';
        this.shakeT = 0;
      } else {
        var rt = easeOutCubic(this.returnT);
        this.x = this.returnFrom.x + (this.trayX - this.returnFrom.x) * rt;
        this.y = this.returnFrom.y + (this.trayY - this.returnFrom.y) * rt;
        var shake = this.shakeT > 0 ? Math.sin(this.shakeT * 60) * 6 * this.shakeT : 0;
        this.x += shake;
        // Shrink back into the tray slot along the same eased curve as the
        // position, so a rejected sticker doesn't fly home at full size and
        // then pop to trayScale on the frame it lands.
        this.scaleX = this.scaleY = 1 + (this.trayScale - 1) * rt;
      }
    }
  };

  Sticker.prototype.startDrag = function (px, py) {
    this.state = 'dragging';
    this.x = px; this.y = py;
    this.peel = 0;
    this.dragVX = 0; this.dragVY = 0;
    this.dragStartX = px; this.dragStartY = py;
    // Pop back to full size the moment it lifts off the sheet. Load-bearing:
    // update() has no 'dragging' branch (and game.js's update loop skips the
    // active drag entirely), so nothing else would ever clear the tray's
    // shrink-to-fit scale - it would otherwise leak into the drag AND the
    // final placement, baking a tiny sticker into the finished picture.
    this.scaleX = this.scaleY = 1;
  };

  Sticker.prototype.dragTo = function (px, py, dt) {
    var dx = px - this.x, dy = py - this.y;
    this.x = px; this.y = py;

    // Peel resistance: the first bit of travel fights initial "adhesive"
    // resistance (peel grows slowly), then releases and catches up faster -
    // an eased curve reads as sticky-then-free rather than a linear reveal.
    var travelled = Math.hypot(px - this.dragStartX, py - this.dragStartY);
    var linear = Math.min(1, travelled / 55);
    this.peel = Math.pow(linear, 1.7);

    this.rot = Math.max(-0.18, Math.min(0.18, dx * 0.01));

    // Smooth the frame-to-frame velocity so the fold direction doesn't
    // jitter on noisy pointer input, then point the curl at the trailing
    // edge (opposite the direction of travel) - the flap lifts from where
    // the sticker is still peeling away from the sheet, not from wherever
    // the finger currently is.
    var moveMag = Math.hypot(dx, dy);
    if (moveMag > 0.4) {
      var lerpAmt = 0.3;
      this.dragVX += (dx - this.dragVX) * lerpAmt;
      this.dragVY += (dy - this.dragVY) * lerpAmt;
      var vMag = Math.hypot(this.dragVX, this.dragVY);
      if (vMag > 0.5) this.foldAngle = Math.atan2(this.dragVY, this.dragVX) + Math.PI;
    }

    return moveMag / Math.max(dt, 0.001); // px/sec speed for audio
  };

  Sticker.prototype.place = function () {
    this.state = 'settling';
    this.settleT = 0;
  };

  Sticker.prototype.returnToTray = function (wrong) {
    this.state = 'returning';
    this.returnFrom = { x: this.x, y: this.y };
    this.returnT = 0;
    this.shakeT = wrong ? 0.35 : 0;
  };

  // Perf: once a sticker is placed it never changes appearance again but was
  // still rebuilding its full vector path + gradients from scratch every single
  // frame for the rest of the level, forever. Bake it to an offscreen
  // bitmap once and blit that instead - a plain drawImage is far cheaper
  // than reconstructing paths/gradients 60 times a second, and this is
  // where most frames go once a level is mostly assembled (mostly-placed
  // stickers dominate the sticker count as a level nears completion).
  // Rendered at devicePixelRatio so it stays crisp on retina screens.
  Sticker.prototype.buildCache = function () {
    var shape = SHAPES[this.shape];
    if (!shape) return;
    var dpr = window.devicePixelRatio || 1;
    var cacheSize = Math.ceil(this.size * 1.7); // extra room for the soft shadow
    var canvas = document.createElement('canvas');
    canvas.width = Math.ceil(cacheSize * dpr);
    canvas.height = Math.ceil(cacheSize * dpr);
    var cctx = canvas.getContext('2d');
    cctx.scale(dpr, dpr);
    cctx.translate(cacheSize / 2, cacheSize / 2);
    cctx.rotate(this.targetRot);
    // Bake a soft contact shadow once, so every placed piece reads as a real
    // die-cut sticker resting on the page (curated depth) rather than a flat
    // vector fill - a big part of why the assembled picture now looks
    // intentional instead of "generated". First pass casts the shadow, second
    // redraws the art cleanly on top so only the soft edge shows.
    cctx.save();
    cctx.shadowColor = 'rgba(60,45,75,0.30)';
    cctx.shadowBlur = Math.max(4, this.size * 0.075);
    cctx.shadowOffsetX = 0;
    cctx.shadowOffsetY = Math.max(2, this.size * 0.05);
    shape.draw(cctx, this.size, this.color);
    cctx.restore();
    shape.draw(cctx, this.size, this.color);
    this.cachedCanvas = canvas;
    this.cachedCanvasSize = cacheSize;
  };

  // Renders the sticker at its current x/y/rot/scale.
  Sticker.prototype.draw = function (ctx) {
    var shape = SHAPES[this.shape];
    if (!shape) return;

    // Fast path: a settled sticker is static - blit the cached bitmap instead
    // of redrawing the live vector art (see buildCache above).
    if (this.state === 'placed') {
      if (!this.cachedCanvas) this.buildCache();
      ctx.save();
      ctx.translate(this.x, this.y);
      var half = this.cachedCanvasSize / 2;
      ctx.drawImage(this.cachedCanvas, -half, -half, this.cachedCanvasSize, this.cachedCanvasSize);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.scale(this.scaleX, this.scaleY);

    // drop shadow, grows while lifted off the sheet / tray
    if (this.state === 'dragging' || this.state === 'returning') {
      ctx.save();
      var lift = this.state === 'dragging' ? this.peel : 0;
      ctx.translate(4 + lift * 6, 8 + lift * 10);
      shape.outline(ctx, this.size);
      ctx.fillStyle = 'rgba(20,20,30,0.18)';
      ctx.fill();
      ctx.restore();
    }

    shape.draw(ctx, this.size, this.color);

    // Peel fold highlight: a curling flap at the sticker's trailing edge
    // (opposite the drag direction, tracked via foldAngle in dragTo) that
    // shrinks to a point as peel completes - fakes a lifting corner
    // without true mesh deformation, but now the corner is wherever the
    // sticker is actually still "attached" relative to how it's being
    // pulled, instead of a fixed spot regardless of direction.
    if (this.state === 'dragging' && this.peel < 1) {
      var liftAmt = 1 - this.peel;
      var foldLen = liftAmt * this.size * 0.36;
      // ctx is already rotated by this.rot (the sticker's own drag tilt);
      // foldAngle was computed in world space, so subtract this.rot to
      // keep the curl pointing the same real-world direction regardless
      // of that tilt.
      var localFoldAngle = this.foldAngle - this.rot;
      var edgeDist = this.size * 0.3;

      ctx.save();
      ctx.translate(Math.cos(localFoldAngle) * edgeDist, Math.sin(localFoldAngle) * edgeDist);
      ctx.rotate(localFoldAngle);
      ctx.globalCompositeOperation = 'lighter';

      var fg = ctx.createLinearGradient(0, 0, foldLen, 0);
      fg.addColorStop(0, 'rgba(255,255,255,0.12)');
      fg.addColorStop(1, 'rgba(255,255,255,0.8)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(0, -foldLen * 0.32);
      ctx.lineTo(0, foldLen * 0.32);
      ctx.lineTo(foldLen, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  };

  // Draws a dashed silhouette preview at an arbitrary position/rotation,
  // used for the not-yet-filled target outlines in the scene.
  function drawOutline(ctx, shapeId, size, x, y, rotRad, dimmed) {
    var shape = SHAPES[shapeId];
    if (!shape) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotRad);
    shape.outline(ctx, size);
    ctx.setLineDash([7, 7]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = dimmed ? 'rgba(120,110,140,0.25)' : 'rgba(120,110,140,0.55)';
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  return {
    Sticker: Sticker,
    SHAPES: SHAPES,
    drawOutline: drawOutline,
    shade: shade,
    alpha: alpha
  };
})();
