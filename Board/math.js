(function () {
  "use strict";

  const digitSets = ["٠١٢٣٤٥٦٧٨٩", "۰۱۲۳۴۵۶۷۸۹"];
  const superscripts = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  const functions = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
    ln: Math.log, log: Math.log10, log10: Math.log10, exp: Math.exp,
    floor: Math.floor, ceil: Math.ceil, round: Math.round,
    "جا": Math.sin, "جتا": Math.cos, "ظا": Math.tan,
    "جذر": Math.sqrt, "لو": Math.log10
  };
  const ink = "#27223b";
  const purple = "#7448d1";
  const uiFont = 'Tahoma, "Segoe UI", sans-serif';
  const darkText = {
    [ink]: "#f3edf9",
    [purple]: "#b690ff",
    "#5a4a73": "#e2d2fa",
    "#685a7e": "#beafd3",
    "#6643b0": "#e0caff",
    "#5a4e70": "#d0c1df",
    "#685979": "#cbb6e4",
    "#5f35b6": "#e0caff"
  };
  const darkFills = {
    "rgba(255, 255, 255, .92)": "rgba(43, 35, 60, .96)",
    "#f0e8fd": "#493367",
    "#e8dff4": "#4c3c61",
    "#efe7fb": "#493367"
  };
  const darkBorders = { "#e8e0f3": "#59466f", "#e4d7f8": "#6a4e8e" };

  function textColor(color, dark) {
    return dark ? darkText[color] || color : color;
  }

  function normalize(expression) {
    return expression.trim()
      .replace(/[٠-٩۰-۹]/g, digit => String(digitSets.find(set => set.includes(digit)).indexOf(digit)))
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g, power => `^(${Array.from(power, char => {
        if (char === "⁺") return "+";
        if (char === "⁻") return "-";
        return superscripts.indexOf(char);
      }).join("")})`)
      .replace(/[×·]/g, "*").replace(/÷/g, "/").replace(/[−–]/g, "-")
      .replace(/٫/g, ".").replace(/[،,](?=\d)/g, ".")
      .replace(/^(?:y|ص|f\s*\(\s*x\s*\)|د\s*\(\s*س\s*\))\s*=\s*/i, "")
      .replace(/\*\*/g, "^").toLowerCase();
  }

  function tokenize(input) {
    const tokens = [];
    let remaining = input;
    while (remaining.length) {
      remaining = remaining.trimStart();
      if (!remaining) break;
      const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/.exec(remaining);
      const name = /^[a-z\u0621-\u064aπ][a-z\u0621-\u064aπ0-9]*/.exec(remaining);
      if (number) {
        const value = Number(number[0]);
        if (!Number.isFinite(value)) throw new Error("العدد في الدالة خارج النطاق.");
        tokens.push({ kind: "number", value });
        remaining = remaining.slice(number[0].length);
      } else if (name) {
        tokens.push({ kind: "name", value: name[0] });
        remaining = remaining.slice(name[0].length);
      } else if ("+-*/^()√".includes(remaining[0])) {
        tokens.push({ kind: remaining[0] });
        remaining = remaining.slice(1);
      } else {
        throw new Error("تحتوي الدالة على رمز غير مدعوم.");
      }
    }
    tokens.push({ kind: "end" });
    return tokens;
  }

  function compile(expression) {
    if (typeof expression !== "string" || !expression.trim()) {
      throw new Error("أدخل دالة مثل x^2 - 4.");
    }
    if (expression.length > 180) throw new Error("الدالة طويلة جدًا.");
    const tokens = tokenize(normalize(expression));
    let index = 0;
    const peek = () => tokens[index].kind;

    function consume(kind) {
      if (peek() !== kind) return false;
      index += 1;
      return true;
    }

    function grouped() {
      const value = sum();
      if (!consume(")")) throw new Error("أغلق الأقواس في الدالة.");
      return value;
    }

    function primary() {
      const token = tokens[index];
      if (consume("number")) return () => token.value;
      if (consume("(")) return grouped();
      if (consume("√")) {
        const argument = primary();
        return x => Math.sqrt(argument(x));
      }
      if (consume("name")) {
        if (token.value === "x" || token.value === "س") return x => x;
        if (["pi", "π", "ط"].includes(token.value)) return () => Math.PI;
        if (token.value === "e") return () => Math.E;
        if (Object.hasOwn(functions, token.value)) {
          if (!consume("(")) throw new Error("ضع قيمة الدالة بين قوسين.");
          const argument = grouped();
          const operation = functions[token.value];
          return x => operation(argument(x));
        }
        throw new Error(`اسم غير مدعوم في الدالة: ${token.value}`);
      }
      throw new Error("أكمل الدالة بقيمة أو متغير أو قوس.");
    }

    function power() {
      const base = primary();
      if (!consume("^")) return base;
      const exponent = unary();
      return x => Math.pow(base(x), exponent(x));
    }

    function unary() {
      if (consume("+")) return unary();
      if (consume("-")) {
        const value = unary();
        return x => -value(x);
      }
      return power();
    }

    function product() {
      let result = unary();
      while (true) {
        const multiply = consume("*");
        const divide = !multiply && consume("/");
        const implicit = ["number", "name", "(", "√"].includes(peek());
        if (!multiply && !divide && !implicit) return result;
        const left = result;
        const right = unary();
        result = divide ? x => left(x) / right(x) : x => left(x) * right(x);
      }
    }

    function sum() {
      let result = product();
      while (peek() === "+" || peek() === "-") {
        const add = consume("+");
        if (!add) consume("-");
        const left = result;
        const right = product();
        result = add ? x => left(x) + right(x) : x => left(x) - right(x);
      }
      return result;
    }

    const evaluate = sum();
    if (peek() !== "end") throw new Error("تحقّق من الأقواس والعمليات في الدالة.");
    return evaluate;
  }

  const expressionCache = new Map();

  function expressionFunction(expression) {
    if (expressionCache.has(expression)) return expressionCache.get(expression);
    let fn = null;
    try {
      fn = compile(expression);
    } catch {
      // Skip an invalid plot loaded from an older or external board.
    }
    if (expressionCache.size >= 40) expressionCache.delete(expressionCache.keys().next().value);
    expressionCache.set(expression, fn);
    return fn;
  }

  function roundRect(ctx, x, y, w, h, radius) {
    const r = Math.max(0, Math.min(radius, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function segment(ctx, x1, y1, x2, y2) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }

  function scale(object) {
    let { x, y, w, h, xMin = -8, xMax = 8, yMin = -6, yMax = 6 } = object;
    if (![xMin, xMax, yMin, yMax].every(Number.isFinite) || xMin >= xMax || yMin >= yMax) {
      [xMin, xMax, yMin, yMax] = [-8, 8, -6, 6];
    }
    const xs = value => x + w * (value - xMin) / (xMax - xMin);
    const ys = value => y + h * (yMax - value) / (yMax - yMin);
    return { x, y, w, h, xMin, xMax, yMin, yMax, xs, ys };
  }

  function niceStep(value) {
    const magnitude = 10 ** Math.floor(Math.log10(value));
    const ratio = value / magnitude;
    return (ratio < 1.5 ? 1 : ratio < 3 ? 2 : ratio < 7 ? 5 : 10) * magnitude;
  }

  function ticks(min, max, size) {
    const step = niceStep((max - min) * 30 / size);
    if (!Number.isFinite(step) || step <= 0) return [];
    const first = Math.ceil(min / step);
    const last = Math.floor(max / step);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return [];
    const result = [];
    for (let index = first; index <= last && result.length < 75; index += 1) {
      result.push(Number((index * step).toPrecision(10)));
    }
    return result;
  }

  function drawAxes(ctx, view, labels, dark) {
    const { x, y, w, h, xMin, xMax, yMin, yMax, xs, ys } = view;
    const xValues = ticks(xMin, xMax, w);
    const yValues = ticks(yMin, yMax, h);
    const cx = xs(0);
    const cy = ys(0);
    const hasHorizontal = cy >= y && cy <= y + h;
    const hasVertical = cx >= x && cx <= x + w;

    ctx.lineWidth = 1;
    ctx.strokeStyle = dark ? "#49405a" : "#e8e1f4";
    ctx.beginPath();
    xValues.forEach(value => segment(ctx, xs(value), y, xs(value), y + h));
    yValues.forEach(value => segment(ctx, x, ys(value), x + w, ys(value)));
    ctx.stroke();

    ctx.strokeStyle = dark ? "#a698bd" : "#84779c";
    ctx.lineWidth = 1.55;
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (hasHorizontal) {
      segment(ctx, x, cy, x + w, cy);
      ctx.moveTo(x + w - 8, cy - 4);
      ctx.lineTo(x + w, cy);
      ctx.lineTo(x + w - 8, cy + 4);
      xValues.forEach(value => {
        if (value && xs(value) > x + 5 && xs(value) < x + w - 10) {
          segment(ctx, xs(value), cy - 3, xs(value), cy + 3);
        }
      });
    }
    if (hasVertical) {
      segment(ctx, cx, y + h, cx, y);
      ctx.moveTo(cx - 4, y + 8);
      ctx.lineTo(cx, y);
      ctx.lineTo(cx + 4, y + 8);
      yValues.forEach(value => {
        if (value && ys(value) > y + 10 && ys(value) < y + h - 5) {
          segment(ctx, cx - 3, ys(value), cx + 3, ys(value));
        }
      });
    }
    ctx.stroke();

    if (!labels || w < 105 || h < 90) return;
    ctx.fillStyle = dark ? "#c5b7d7" : "#746886";
    ctx.font = `10px ${uiFont}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.direction = "ltr";
    if (hasHorizontal) {
      xValues.forEach(value => {
        if (value && xs(value) > x + 11 && xs(value) < x + w - 17) {
          ctx.fillText(String(value), xs(value), cy < y + h - 20 ? cy + 13 : cy - 13);
        }
      });
      ctx.fillText("x", x + w - 7, cy - 12);
    }
    if (hasVertical) {
      yValues.forEach(value => {
        if (value && ys(value) > y + 15 && ys(value) < y + h - 8) {
          ctx.fillText(String(value), cx > x + 22 ? cx - 14 : cx + 14, ys(value));
        }
      });
      ctx.fillText("y", cx + 12, y + 6);
    }
  }

  function drawPlot(ctx, object, view, dark) {
    const evaluate = expressionFunction(object.expression);
    if (!evaluate) return;
    const { x, y, w, h, xMin, xMax, xs, ys } = view;
    const count = Math.max(75, Math.min(1000, Math.ceil(w * 1.35)));
    const step = (xMax - xMin) / count;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = textColor(object.color || purple, dark);
    ctx.lineWidth = Math.max(1.8, Math.min(object.width || 3.4, 12));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    let previous = NaN;
    for (let index = 0; index <= count; index += 1) {
      const coordinate = xMin + index * step;
      const pixel = ys(evaluate(coordinate));
      if (!Number.isFinite(pixel)) {
        previous = NaN;
        continue;
      }
      const outside = Math.max(y - h * 2, Math.min(y + h * 3, pixel));
      let discontinuity = false;
      if (Math.abs(pixel - previous) > h * 0.52) {
        const midpoint = ys(evaluate(coordinate - step / 2));
        discontinuity = !Number.isFinite(midpoint) || Math.abs(midpoint - (pixel + previous) / 2) > h * 0.18;
      }
      if (Number.isFinite(previous) && !discontinuity) ctx.lineTo(xs(coordinate), outside);
      else ctx.moveTo(xs(coordinate), outside);
      previous = pixel;
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawRuler(ctx, { x, y, w, h }, dark) {
    if (w < 4 || h < 4) return;
    const inset = Math.min(14, w * 0.08);
    const divisions = 15;
    const marks = divisions * 10;
    const step = (w - inset * 2) / marks;
    const corner = Math.min(5, h * 0.12, inset * 0.5);
    const body = ctx.createLinearGradient(x, y, x, y + h);
    body.addColorStop(0, dark ? "rgba(171, 138, 225, .44)" : "rgba(248, 239, 255, .82)");
    body.addColorStop(0.16, dark ? "rgba(128, 94, 186, .39)" : "rgba(229, 210, 252, .58)");
    body.addColorStop(0.85, dark ? "rgba(107, 75, 158, .55)" : "rgba(220, 195, 248, .48)");
    body.addColorStop(1, dark ? "rgba(161, 126, 223, .56)" : "rgba(196, 162, 237, .71)");
    roundRect(ctx, x, y, w, h, corner);
    ctx.fillStyle = body;
    ctx.fill();

    // The silhouette and both drawing edges sit on the ruler's snap boundary.
    roundRect(ctx, x + 0.55, y + 0.55, w - 1.1, h - 1.1, Math.max(0, corner - 0.55));
    ctx.strokeStyle = dark ? "#c6a9f1" : "#81629f";
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = dark ? "rgba(245, 225, 255, .34)" : "rgba(255, 255, 255, .74)";
    ctx.lineWidth = 0.75;
    segment(ctx, x + corner, y + 2.3, x + w - corner, y + 2.3);
    segment(ctx, x + corner, y + h - 2.4, x + w - corner, y + h - 2.4);
    ctx.stroke();

    const graduation = [
      { length: Math.min(h * 0.13, 4.6), width: Math.min(step * 0.6, 0.7), color: dark ? "#d3b6f1" : "#81619e" },
      { length: Math.min(h * 0.22, 8), width: 0.85, color: dark ? "#e5cef9" : "#664784" },
      { length: Math.min(h * 0.31, 12), width: 1.1, color: dark ? "#f8eeff" : "#4d3068" }
    ];
    ctx.lineCap = "butt";
    for (let tier = 0; tier < graduation.length; tier += 1) {
      const { length, width, color } = graduation[tier];
      ctx.beginPath();
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      for (let index = 0; index <= marks; index += 1) {
        const markTier = index % 10 === 0 ? 2 : index % 5 === 0 ? 1 : 0;
        if (markTier !== tier) continue;
        const tickX = x + inset + index * step;
        segment(ctx, tickX, y + 0.8, tickX, y + 0.8 + length);
      }
      ctx.stroke();
    }

    if (w < 70 || h < 24) return;
    const fontSize = Math.min(11, Math.max(8, h * 0.21));
    const labelEvery = step * 10 >= fontSize * 1.55 ? 1 : step * 10 >= fontSize * 0.85 ? 3 : 5;
    ctx.font = `700 ${fontSize}px ${uiFont}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.direction = "ltr";
    ctx.fillStyle = dark ? "#f8eeff" : "#4d3068";
    for (let index = 0; index <= divisions; index += labelEvery) {
      ctx.fillText(String(index), x + inset + index * step * 10, y + h * 0.53);
    }
    if (h >= 31) {
      ctx.font = `600 ${Math.min(9, Math.max(7, h * 0.16))}px ${uiFont}`;
      ctx.fillStyle = dark ? "#ddc7f4" : "#694e85";
      ctx.fillText("cm", x + w / 2, y + h * 0.79);
    }
  }

  function drawProtractor(ctx, { x, y, w, h }, dark) {
    const radius = Math.min(w / 2 - 5, h - 10);
    if (radius <= 0) return;
    const cx = x + w / 2;
    const cy = y + h - 5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI, 2 * Math.PI);
    ctx.closePath();
    ctx.fillStyle = dark ? "rgba(104, 71, 152, .57)" : "rgba(238, 225, 255, .75)";
    ctx.strokeStyle = dark ? "#bd9bea" : "#9a77d5";
    ctx.lineWidth = 1.35;
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = dark ? "#d9c0f9" : "#8d6dc1";
    ctx.lineWidth = 0.9;
    for (let degree = 0; degree <= 180; degree += 1) {
      const angle = (180 + degree) * Math.PI / 180;
      const length = degree % 10 === 0 ? 10 : degree % 5 === 0 ? 7 : 3.5;
      segment(ctx, cx + radius * Math.cos(angle), cy + radius * Math.sin(angle),
        cx + (radius - length) * Math.cos(angle), cy + (radius - length) * Math.sin(angle));
    }
    if (radius > 32) {
      ctx.moveTo(cx - radius * 0.48, cy);
      ctx.arc(cx, cy, radius * 0.48, Math.PI, 2 * Math.PI);
    }
    ctx.stroke();
    if (radius > 65) {
      ctx.fillStyle = dark ? "#f1e2ff" : "#614293";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.font = `600 10px ${uiFont}`;
      const increment = radius < 105 ? 30 : 15;
      for (let degree = increment; degree < 180; degree += increment) {
        const angle = (180 + degree) * Math.PI / 180;
        ctx.fillText(String(180 - degree), cx + (radius - 20) * Math.cos(angle), cy + (radius - 20) * Math.sin(angle));
        if (radius >= 105 && degree % 30 === 0) {
          ctx.fillText(String(degree), cx + (radius - 36) * Math.cos(angle), cy + (radius - 36) * Math.sin(angle));
        }
      }
    }
    ctx.strokeStyle = dark ? "#dfc9ff" : "#7650b5";
    ctx.beginPath();
    segment(ctx, cx - 5, cy, cx + 5, cy);
    segment(ctx, cx, cy - 6, cx, cy + 3);
    ctx.stroke();
  }

  function drawLabel(ctx, object, dark) {
    const { x, y, w, h, text, color = ink, fontSize = 18, weight = 600, align = "right", direction = "rtl" } = object;
    ctx.fillStyle = textColor(color, dark);
    ctx.font = `${weight} ${fontSize}px ${object.serif ? 'Georgia, "Times New Roman", serif' : uiFont}`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.direction = direction;
    const left = align === "right" ? x + w : align === "center" ? x + w / 2 : x;
    ctx.fillText(text, left, y + h / 2, w);
  }

  function drawFraction(ctx, { x, y, w, h, numerator, denominator, color = ink }, dark) {
    if (w < 8 || h < 8) return;
    const top = String(numerator ?? "");
    const bottom = String(denominator ?? "");
    const centerX = x + w / 2;
    const centerY = y + h / 2;
    const fontSize = Math.min(30, h * 0.37);
    const textWidth = w - 8;
    ctx.font = `600 ${fontSize}px "Cambria Math", Georgia, ${uiFont}`;
    ctx.fillStyle = textColor(color, dark);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.direction = /[\u0621-\u064a]/.test(top) ? "rtl" : "ltr";
    ctx.fillText(top, centerX, y + h * 0.245, textWidth);
    ctx.direction = /[\u0621-\u064a]/.test(bottom) ? "rtl" : "ltr";
    ctx.fillText(bottom, centerX, y + h * 0.755, textWidth);
    const width = Math.min(textWidth, Math.max(ctx.measureText(top).width, ctx.measureText(bottom).width, 16) + 13);
    ctx.lineWidth = Math.max(1.3, fontSize / 14);
    ctx.lineCap = "round";
    ctx.beginPath();
    segment(ctx, centerX - width / 2, centerY, centerX + width / 2, centerY);
    ctx.stroke();
  }

  function draw(ctx, object, background) {
    if (!object || ![object.x, object.y, object.w, object.h].every(Number.isFinite) || object.w <= 0 || object.h <= 0) return;
    const dark = background === "dark";
    ctx.save();
    if (object.type === "axes" || object.type === "plot") {
      const view = scale(object);
      if (object.type === "axes" || object.axes !== false) drawAxes(ctx, view, object.labels !== false, dark);
      if (object.type === "plot") drawPlot(ctx, object, view, dark);
    } else if (object.type === "ruler") {
      drawRuler(ctx, object, dark);
    } else if (object.type === "protractor") {
      drawProtractor(ctx, object, dark);
    } else if (object.type === "fraction") {
      drawFraction(ctx, object, dark);
    } else if (object.type === "demo-label") {
      drawLabel(ctx, object, dark);
    } else if (object.type === "demo-box") {
      roundRect(ctx, object.x, object.y, object.w, object.h, object.radius || 8);
      ctx.fillStyle = dark ? darkFills[object.fill] || object.fill : object.fill;
      ctx.fill();
      if (object.border) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = dark ? darkBorders[object.border] || object.border : object.border;
        ctx.stroke();
      }
    } else if (object.type === "demo-point") {
      ctx.beginPath();
      ctx.arc(object.x + object.w / 2, object.y + object.h / 2, object.w / 2, 0, Math.PI * 2);
      ctx.fillStyle = textColor(object.color || purple, dark);
      ctx.strokeStyle = dark ? "#2b233c" : "#fff";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function bounds(object) {
    if (!object || ![object.x, object.y, object.w, object.h].every(Number.isFinite)) return null;
    return { x: object.x, y: object.y, width: object.w, height: object.h };
  }

  function demo() {
    const label = (text, x, y, w, h, style = {}) => ({ type: "demo-label", text, x, y, w, h, ...style });
    const box = (x, y, w, h, fill, border, radius) => ({ type: "demo-box", x, y, w, h, fill, border, radius });
    const equation = (text, x, y, w, h, style = {}) => label(text, x, y, w, h, {
      align: "left", direction: "ltr", serif: true, fontSize: 30, weight: 600, ...style
    });
    const plot = { type: "plot", x: 173, y: 211, w: 294, h: 271, xMin: -4.6, xMax: 4.6, yMin: -5, yMax: 5.3,
      color: purple, width: 3.8, expression: "x^2 - 4" };
    const { xs, ys } = scale(plot);
    const point = x => ({ type: "demo-point", x: xs(x) - 5, y: ys(0) - 5, w: 10, h: 10 });

    return [
      box(146, 155, 348, 372, "rgba(255, 255, 255, .92)", "#e8e0f3", 16),
      label("الرسم البياني", 173, 172, 294, 26, { color: "#5a4a73", fontSize: 13 }),
      plot,
      point(-2), point(2),
      label("نقطتا التقاطع مع المحور الأفقي", 173, 491, 294, 23, { color: "#685a7e", fontSize: 11 }),
      box(693, 159, 157, 28, "#f0e8fd", null, 14),
      label("الجبر · درس نموذجي", 701, 160, 141, 26, { align: "center", color: "#6643b0", fontSize: 12 }),
      label("الدالة التربيعية", 523, 196, 327, 59, { fontSize: 39, weight: 800 }),
      label("إيجاد جذور الدالة وتمثيلها بيانيًا", 523, 266, 327, 31, { color: "#5a4e70", fontSize: 18, weight: 400 }),
      box(543, 316, 307, 2, "#e8dff4", null, 1),
      equation("f(x) = x² − 4", 550, 333, 294, 41),
      equation("f(x) = 0   ⇒   x² = 4", 550, 382, 294, 39, { color: "#685979", fontSize: 25, weight: 400 }),
      box(543, 444, 307, 67, "#efe7fb", "#e4d7f8", 12),
      equation("x = ±2", 561, 452, 125, 50, { color: "#5f35b6", fontSize: 35 }),
      label("جذرا الدالة", 713, 455, 119, 44, { color: "#5f35b6", fontSize: 16, weight: 700 })
    ];
  }

  window.BoardMath = { compile, draw, bounds, demo };
}());
