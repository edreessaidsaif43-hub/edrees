'use strict';

// The document uses a stable coordinate space. The viewport can zoom and pan
// around it without rewriting the saved drawing.
window.BoardCanvas = (() => {
  const BOARD_WIDTH = 1000;
  const BOARD_HEIGHT = 650;
  const HISTORY_LIMIT = 60;
  const FONT = '"Segoe UI", Tahoma, Arial, sans-serif';
  const INK_TOOLS = new Set(['pen', 'brush', 'marker', 'eraser']);
  const GUIDE_TOOLS = new Set(['pen', 'brush', 'marker']);
  const SHAPE_TOOLS = new Set(['line', 'rectangle', 'ellipse', 'triangle', 'ruler', 'protractor', 'set-square']);
  const INSTRUMENTS = new Set(['ruler', 'protractor', 'set-square']);
  const COMPASS_TOOLS = new Set(['compass', 'compass-arc']);
  const CURSORS = { select: 'default', pan: 'grab', text: 'text', eraser: 'cell' };
  const WIDTH_MULTIPLIER = { pen: 1, brush: 2, marker: 4.25, eraser: 6 };
  const GUIDE_RADIUS = 11;
  const GUIDE_END_TOLERANCE = 7;
  const ROTATION_HANDLE_OFFSET = 28;
  const ROTATION_STEP = Math.PI / 12;
  const FULL_TURN = 2 * Math.PI;
  const BACKGROUNDS = {
    plain: { fill: '#ffffff' },
    grid: { fill: '#ffffff', line: '#eeedf4', major: '#e9e6f2' },
    dots: { fill: '#ffffff', line: '#dcd6e8' },
    notebook: { fill: '#fffdfa', line: '#d2e0ef', margin: '#e5a5b2' },
    dark: { fill: '#211c2e', line: '#302a40', major: '#3b334e' },
  };

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function segmentDistance(point, from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return distance(point, from);
    const along = ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared;
    const t = Math.max(0, Math.min(1, along));
    return distance(point, { x: from.x + t * dx, y: from.y + t * dy });
  }

  function pathContains(points, point, radius) {
    if (!points?.length) return false;
    if (points.length === 1) return distance(point, points[0]) <= radius;
    return points.some((to, index) => index > 0 && segmentDistance(point, points[index - 1], to) <= radius);
  }

  function inside(rect, point, padding = 0) {
    return point.x >= rect.x - padding && point.x <= rect.x + rect.width + padding
      && point.y >= rect.y - padding && point.y <= rect.y + rect.height + padding;
  }

  function dimensions(object) {
    const w = object.w ?? 0;
    const h = object.h ?? 0;
    return {
      x: object.x + Math.min(0, w), y: object.y + Math.min(0, h),
      width: Math.abs(w), height: Math.abs(h),
    };
  }

  function instrumentFrame(object) {
    const angle = Number.isFinite(object.angle) ? object.angle : 0;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    return {
      x: object.x + object.w / 2, y: object.y + object.h / 2,
      angle, ux, uy, nx: -uy, ny: ux, w: object.w, h: object.h,
    };
  }

  function instrumentPoint(frame, along, across) {
    return {
      x: frame.x + along * frame.ux + across * frame.nx,
      y: frame.y + along * frame.uy + across * frame.ny,
    };
  }

  function instrumentCoordinates(frame, point) {
    const dx = point.x - frame.x;
    const dy = point.y - frame.y;
    return {
      along: dx * frame.ux + dy * frame.uy,
      across: dx * frame.nx + dy * frame.ny,
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function circlePoint(center, radius, angle) {
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
  }

  function guideLine(from, to) {
    const length = distance(from, to);
    const ux = (to.x - from.x) / length;
    const uy = (to.y - from.y) / length;
    return { kind: 'line', from, to, length, ux, uy };
  }

  function instrumentEdges(object) {
    const frame = instrumentFrame(object);
    if (object.type === 'ruler') {
      const { w, h } = frame;
      return [
        guideLine(instrumentPoint(frame, -w / 2, -h / 2), instrumentPoint(frame, w / 2, -h / 2)),
        guideLine(instrumentPoint(frame, w / 2, h / 2), instrumentPoint(frame, -w / 2, h / 2)),
      ];
    }
    const world = (point) => instrumentPoint(frame, point.x - frame.x, point.y - frame.y);
    if (object.type === 'protractor') {
      const { cx, cy, r } = window.BoardMath.protractorGeometry(object);
      if (r <= 0) return [];
      return [
        { kind: 'arc', center: world({ x: cx, y: cy }), radius: r, angle: frame.angle },
        guideLine(world({ x: cx + r, y: cy }), world({ x: cx - r, y: cy })),
      ];
    }
    const vertices = window.BoardMath.setSquareVertices(object).map(world);
    return vertices.map((vertex, index) => guideLine(vertex, vertices[(index + 1) % vertices.length]));
  }

  function guideParameter(guide, point, previous) {
    if (guide.kind === 'line') {
      return (point.x - guide.from.x) * guide.ux + (point.y - guide.from.y) * guide.uy;
    }
    const dx = point.x - guide.center.x;
    const dy = point.y - guide.center.y;
    if (Math.hypot(dx, dy) < 0.5 && previous !== undefined) return previous;
    const angle = normalizeAngle(Math.atan2(dy, dx) - guide.angle);
    if (Math.abs(angle) < 1e-8) return 0;
    if (angle > Math.PI - 1e-8) return -Math.PI;
    if (angle <= 0) return angle;
    return (previous ?? -angle) < -Math.PI / 2 ? -Math.PI : 0;
  }

  function guidePoint(guide, parameter, offset) {
    if (guide.kind === 'arc') {
      return circlePoint(guide.center, guide.radius + offset, guide.angle + parameter);
    }
    const along = clamp(parameter, 0, guide.length);
    return {
      x: guide.from.x + along * guide.ux + offset * guide.uy,
      y: guide.from.y + along * guide.uy - offset * guide.ux,
    };
  }

  function nearestGuide(objects, point, scale) {
    let nearest = null;
    let closest = GUIDE_RADIUS / scale;
    const endTolerance = GUIDE_END_TOLERANCE / scale;
    for (let index = objects.length - 1; index >= 0; index--) {
      const object = objects[index];
      if (!INSTRUMENTS.has(object.type) || object.w <= 0 || object.h <= 0) continue;
      instrumentEdges(object).forEach((guide, edge) => {
        const parameter = guideParameter(guide, point);
        if (guide.kind === 'line' && Math.abs(parameter - clamp(parameter, 0, guide.length)) > endTolerance) return;
        const edgeDistance = distance(point, guidePoint(guide, parameter, 0));
        if (edgeDistance < closest) {
          closest = edgeDistance;
          nearest = { ...guide, instrument: object, edge, parameter };
        }
      });
    }
    return nearest;
  }

  function rotationHandle(frame, scale) {
    return instrumentPoint(frame, 0, -frame.h / 2 - ROTATION_HANDLE_OFFSET / scale);
  }

  function normalizeAngle(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
  }

  function snapAngle(angle) {
    return Math.round(angle / ROTATION_STEP) * ROTATION_STEP;
  }

  function hitInstrument(object, point, margin) {
    const frame = instrumentFrame(object);
    const { along, across } = instrumentCoordinates(frame, point);
    if (Math.abs(along) > frame.w / 2 + margin || Math.abs(across) > frame.h / 2 + margin) return false;
    if (object.type === 'ruler') return true;
    const local = { x: frame.x + along, y: frame.y + across };
    if (object.type === 'protractor') {
      const { cx, cy, r } = window.BoardMath.protractorGeometry(object);
      return r > 0 && local.y <= cy + margin && Math.hypot(local.x - cx, local.y - cy) <= r + margin;
    }
    const distanceToDiagonal = (frame.w * (local.y - object.y) - frame.h * (local.x - object.x)) / Math.hypot(frame.w, frame.h);
    return distanceToDiagonal >= -margin;
  }

  function hitArc(object, point, margin) {
    const center = { x: object.x + object.w / 2, y: object.y + object.h / 2 };
    const radius = object.w / 2;
    const tolerance = margin + (object.width || 4) / 2;
    if (Math.abs(distance(center, point) - radius) > tolerance) return false;
    const angle = Math.atan2(point.y - center.y, point.x - center.x);
    const progress = (angle - object.angle) * Math.sign(object.sweep);
    if (((progress % FULL_TURN) + FULL_TURN) % FULL_TURN <= Math.abs(object.sweep)) return true;
    return [object.angle, object.angle + object.sweep].some(end => distance(point, circlePoint(center, radius, end)) <= tolerance);
  }

  function textLayout(ctx, object) {
    const fontSize = object.fontSize || Math.max(20, (object.width || 4) * 4.75);
    ctx.font = `${object.weight || 600} ${fontSize}px ${FONT}`;
    ctx.textAlign = object.align || 'right';
    ctx.direction = object.direction || 'rtl';
    ctx.textBaseline = 'top';
    return { lines: String(object.text ?? '').split('\n'), lineHeight: fontSize * 1.32 };
  }

  function objectBounds(ctx, object) {
    if (INK_TOOLS.has(object.type)) {
      if (!object.points?.length) return null;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const point of object.points) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
      const radius = (object.width || 4) / 2;
      return { x: minX - radius, y: minY - radius, width: maxX - minX + radius * 2, height: maxY - minY + radius * 2 };
    }
    if (object.type === 'text') {
      ctx.save();
      const { lines, lineHeight } = textLayout(ctx, object);
      const width = Math.max(1, ...lines.map(line => ctx.measureText(line).width));
      const alignment = ctx.textAlign;
      const right = alignment === 'right' || (alignment === 'start' && ctx.direction === 'rtl')
        || (alignment === 'end' && ctx.direction === 'ltr');
      const x = right ? object.x - width : alignment === 'center' ? object.x - width / 2 : object.x;
      ctx.restore();
      return { x, y: object.y, width, height: lines.length * lineHeight };
    }
    if (INSTRUMENTS.has(object.type)) {
      const frame = instrumentFrame(object);
      const width = Math.abs(frame.w * frame.ux) + Math.abs(frame.h * frame.nx);
      const height = Math.abs(frame.w * frame.uy) + Math.abs(frame.h * frame.ny);
      return { x: frame.x - width / 2, y: frame.y - height / 2, width, height };
    }
    if (SHAPE_TOOLS.has(object.type) || object.type === 'arc') return dimensions(object);
    return window.BoardMath?.bounds?.(object) || dimensions(object);
  }

  function visibleColor(color, background) {
    if (background !== 'dark' || !/^#[0-9a-f]{6}$/i.test(color)) return color;
    const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
    const brightness = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    if (brightness >= 135) return color;
    return `rgb(${rgb.map(component => Math.round(component * 0.45 + 148)).join(',')})`;
  }

  function pressureWidth(width, point) {
    const pressure = Number.isFinite(point.p) ? Math.max(0, Math.min(1, point.p)) : 0.5;
    return width * (0.55 + pressure * 0.9);
  }

  function drawInk(ctx, object) {
    const points = object.points;
    if (!points?.length) return;
    const width = object.width || 4;
    if (object.type === 'eraser') ctx.globalCompositeOperation = 'destination-out';
    if (object.type === 'marker') ctx.globalAlpha = 0.32;
    const pressureSensitive = (object.type === 'pen' || object.type === 'brush') && points[0].p != null;

    ctx.beginPath();
    if (points.length === 1) {
      const point = points[0];
      const diameter = pressureSensitive ? pressureWidth(width, point) : width;
      ctx.arc(point.x, point.y, diameter / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (pressureSensitive) {
      for (let index = 1; index < points.length; index++) {
        const from = points[index - 1];
        const to = points[index];
        ctx.lineWidth = (pressureWidth(width, from) + pressureWidth(width, to)) / 2;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
      return;
    }

    ctx.lineWidth = width;
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length - 1; index++) {
      const point = points[index];
      const next = points[index + 1];
      ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
    }
    const end = points[points.length - 1];
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  function drawObject(ctx, object, background) {
    const color = visibleColor(object.color || '#432664', background);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = object.width || 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (INK_TOOLS.has(object.type)) {
      drawInk(ctx, object);
    } else if (object.type === 'text') {
      const { lines, lineHeight } = textLayout(ctx, object);
      lines.forEach((line, index) => ctx.fillText(line, object.x, object.y + index * lineHeight));
    } else if (object.type === 'line') {
      ctx.beginPath();
      ctx.moveTo(object.x, object.y);
      ctx.lineTo(object.x + object.w, object.y + object.h);
      ctx.stroke();
    } else if (object.type === 'arc' && object.w > 0) {
      ctx.beginPath();
      ctx.arc(object.x + object.w / 2, object.y + object.h / 2, object.w / 2,
        object.angle, object.angle + object.sweep, object.sweep < 0);
      ctx.stroke();
    } else if (object.type === 'rectangle' || object.type === 'ellipse' || object.type === 'triangle') {
      const { x, y, width, height } = dimensions(object);
      ctx.beginPath();
      if (object.type === 'rectangle') ctx.rect(x, y, width, height);
      if (object.type === 'ellipse') ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      if (object.type === 'triangle') {
        ctx.moveTo(x + width / 2, y);
        ctx.lineTo(x + width, y + height);
        ctx.lineTo(x, y + height);
        ctx.closePath();
      }
      ctx.stroke();
    } else {
      if (INSTRUMENTS.has(object.type) && Number.isFinite(object.angle) && object.angle !== 0) {
        const center = instrumentFrame(object);
        ctx.translate(center.x, center.y);
        ctx.rotate(object.angle);
        ctx.translate(-center.x, -center.y);
      }
      const adaptColor = object.color || (background === 'dark' && object.type === 'demo-label');
      window.BoardMath?.draw?.(ctx, adaptColor ? { ...object, color } : object, background);
    }

    ctx.restore();
  }

  function paintNotebook(ctx, width, height, view, palette) {
    const limit = 240;
    const naturalStep = 30 * view.scale;
    const density = Math.max(1, height / (naturalStep * limit));
    const step = naturalStep * 2 ** Math.ceil(Math.log2(density));
    const firstRule = ((view.y % step) + step) % step;

    ctx.lineWidth = 1;
    ctx.strokeStyle = palette.line;
    ctx.beginPath();
    for (let index = 0; index <= limit; index++) {
      const position = firstRule + index * step;
      if (position >= height) break;
      const y = Math.round(position) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Notebook margins stay with the paper as the viewport zooms and pans.
    const margin = Math.round(view.x + (BOARD_WIDTH - 84) * view.scale) + 0.5;
    if (margin < 0 || margin >= width) return;
    ctx.strokeStyle = palette.margin;
    ctx.beginPath();
    ctx.moveTo(margin, 0);
    ctx.lineTo(margin, height);
    ctx.stroke();
  }

  function paintBackground(ctx, width, height, view, background) {
    const palette = BACKGROUNDS[background];
    ctx.fillStyle = palette.fill;
    ctx.fillRect(0, 0, width, height);
    if (!palette.line) return;
    if (background === 'notebook') {
      paintNotebook(ctx, width, height, view, palette);
      return;
    }

    const regularStep = 24 * view.scale;
    const density = Math.max(1, Math.max(width, height) / (regularStep * 240));
    const step = regularStep * 2 ** Math.ceil(Math.log2(density));
    const firstX = Math.ceil(-view.x / step);
    const firstY = Math.ceil(-view.y / step);
    const lastX = Math.floor((width - view.x) / step);
    const lastY = Math.floor((height - view.y) / step);
    if (background === 'dots') {
      ctx.fillStyle = palette.line;
      ctx.beginPath();
      const radius = Math.max(0.65, Math.min(1.15, view.scale));
      for (let x = firstX; x <= lastX; x++) {
        for (let y = firstY; y <= lastY; y++) {
          const left = view.x + x * step;
          const top = view.y + y * step;
          ctx.moveTo(left + radius, top);
          ctx.arc(left, top, radius, 0, Math.PI * 2);
        }
      }
      ctx.fill();
      return;
    }

    // Group lines by color so the full grid takes two stroke calls.
    for (const major of [false, true]) {
      ctx.strokeStyle = major ? palette.major : palette.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let index = firstX; index <= lastX; index++) {
        if ((index % 5 === 0) !== major) continue;
        const x = Math.round(view.x + index * step) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let index = firstY; index <= lastY; index++) {
        if ((index % 5 === 0) !== major) continue;
        const y = Math.round(view.y + index * step) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
    }
  }

  function transparentCanvas() {
    const canvas = document.createElement('canvas');
    return { canvas, ctx: canvas.getContext('2d') };
  }

  function prepareLayer(layer, width, height, ratio, view) {
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (layer.canvas.width !== pixelWidth) layer.canvas.width = pixelWidth;
    if (layer.canvas.height !== pixelHeight) layer.canvas.height = pixelHeight;
    const { ctx } = layer;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pixelWidth, pixelHeight);
    ctx.setTransform(view.scale * ratio, 0, 0, view.scale * ratio, view.x * ratio, view.y * ratio);
    return ctx;
  }

  function paintScene(layer, inkLayer, width, height, ratio, view, objects, draft, selected, moving, background) {
    const ctx = prepareLayer(layer, width, height, ratio, view);
    const scene = moving ? objects.map((object, index) => index === selected ? moving : object) : objects;
    const commands = draft ? [...scene, draft] : scene;
    const erasers = commands.filter((object) => object.type === 'eraser');
    if (!erasers.length) {
      commands.forEach((object) => drawObject(ctx, object, background));
      return;
    }

    // Keep each run of ink in its original stacking position. Erasers can
    // affect that run and earlier ink, without touching the objects in between.
    let erasersSeen = 0;
    for (let start = 0; start < commands.length;) {
      const object = commands[start];
      if (!INK_TOOLS.has(object.type)) {
        drawObject(ctx, object, background);
        start++;
        continue;
      }

      const isolate = erasersSeen < erasers.length;
      let end = start;
      let hasInk = false;
      while (end < commands.length && INK_TOOLS.has(commands[end].type)) {
        if (commands[end].type === 'eraser') erasersSeen++;
        else hasInk = true;
        end++;
      }
      if (hasInk) {
        const run = isolate ? prepareLayer(inkLayer, width, height, ratio, view) : ctx;
        for (let index = start; index < end; index++) drawObject(run, commands[index], background);
        if (isolate) {
          for (let index = erasersSeen; index < erasers.length; index++) drawObject(run, erasers[index], background);
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(inkLayer.canvas, 0, 0);
          ctx.restore();
        }
      }
      start = end;
    }
  }

  function shifted(object, dx, dy) {
    if (INK_TOOLS.has(object.type)) {
      return { ...object, points: object.points.map(point => ({ ...point, x: point.x + dx, y: point.y + dy })) };
    }
    return { ...object, x: object.x + dx, y: object.y + dy };
  }

  function placeRuler(start, end, style, { scale, fallback, constrain }) {
    const height = 42;
    const length = distance(start, end);
    if (fallback && length * scale < 5) {
      return { type: 'ruler', x: start.x - 90, y: start.y - height / 2, w: 180, h: height, ...style };
    }
    const direction = Math.atan2(end.y - start.y, end.x - start.x);
    const angle = constrain ? snapAngle(direction) : direction;
    const width = Math.max(80, length);
    const center = { x: start.x + Math.cos(angle) * width / 2, y: start.y + Math.sin(angle) * width / 2 };
    return { type: 'ruler', x: center.x - width / 2, y: center.y - height / 2, w: width, h: height, angle, ...style };
  }

  function shapeAt(type, start, end, style, { scale, fallback = false, constrain = false }) {
    if (type === 'ruler') return placeRuler(start, end, style, { scale, fallback, constrain });
    let x = start.x;
    let y = start.y;
    let w = end.x - x;
    let h = end.y - y;
    if (fallback && distance(start, end) * scale < 5) {
      const defaults = {
        line: [130, 0], rectangle: [135, 85], ellipse: [105, 105], triangle: [120, 94],
        protractor: [160, 80], 'set-square': [156, 156],
      };
      [w, h] = defaults[type];
      x -= w / 2;
      y -= h / 2;
    } else if (type === 'protractor') {
      w = Math.sign(w || 1) * Math.max(95, Math.abs(w), Math.abs(h) * 2);
      h = Math.sign(h || 1) * Math.abs(w) / 2;
    } else if (type === 'set-square') {
      const side = Math.max(90, Math.abs(w), Math.abs(h));
      w = Math.sign(w || 1) * side;
      h = Math.sign(h || 1) * side;
    } else if (constrain && type === 'line') {
      const increment = Math.PI / 4;
      const angle = Math.round(Math.atan2(h, w) / increment) * increment;
      const length = Math.hypot(w, h);
      w = Math.cos(angle) * length;
      h = Math.sin(angle) * length;
    } else if (constrain) {
      const ratio = type === 'triangle' ? Math.sqrt(3) / 2 : 1;
      const side = Math.max(Math.abs(w), Math.abs(h) / ratio);
      w = Math.sign(w || 1) * side;
      h = Math.sign(h || 1) * side * ratio;
    }
    if (type === 'protractor' || type === 'set-square') {
      if (w < 0) x += w;
      if (h < 0) y += h;
      w = Math.abs(w);
      h = Math.abs(h);
    }
    return { type, x, y, w, h, ...style };
  }

  function viewPoint(view, point) {
    return { x: view.x + point.x * view.scale, y: view.y + point.y * view.scale };
  }

  function paintGuide(ctx, view, guide, active, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = active ? 0.92 : 0.55;
    ctx.lineWidth = active ? 2.5 : 1.7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (guide.kind === 'arc') {
      const center = viewPoint(view, guide.center);
      ctx.arc(center.x, center.y, guide.radius * view.scale, guide.angle - Math.PI, guide.angle);
    } else {
      const from = viewPoint(view, guide.from);
      const to = viewPoint(view, guide.to);
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function paintInstrumentSelection(ctx, view, instrument, color, dark) {
    const frame = instrumentFrame(instrument);
    const padding = 5 / view.scale;
    const halfWidth = frame.w / 2 + padding;
    const halfHeight = frame.h / 2 + padding;
    const corners = [[-halfWidth, -halfHeight], [halfWidth, -halfHeight], [halfWidth, halfHeight], [-halfWidth, halfHeight]];
    const outline = corners.map(([along, across]) => viewPoint(view, instrumentPoint(frame, along, across)));
    const center = viewPoint(view, instrumentPoint(frame, 0, -halfHeight));
    const handle = viewPoint(view, rotationHandle(frame, view.scale));

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.3;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(outline[0].x, outline[0].y);
    outline.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(handle.x, handle.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(handle.x, handle.y, 10, 0, Math.PI * 2);
    ctx.fillStyle = dark ? '#302440' : '#ffffff';
    ctx.fill();
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.arc(handle.x, handle.y, 4, -Math.PI * 0.8, Math.PI * 0.72);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(handle.x - 4.5, handle.y - 4.2);
    ctx.lineTo(handle.x - 3.3, handle.y - 2.35);
    ctx.lineTo(handle.x - 1.05, handle.y - 3.15);
    ctx.stroke();
    ctx.restore();
  }

  function compassAnchor(center, tip) {
    return { x: center.x, y: center.y, radius: distance(center, tip), angle: Math.atan2(tip.y - center.y, tip.x - center.x) };
  }

  function compassPreview(anchor, style, sweep) {
    const { x, y, radius, angle } = anchor;
    return {
      type: 'compass-preview', x, y, w: radius, h: radius, angle: angle + (sweep || 0),
      startAngle: angle, sweep, ...style,
    };
  }

  function compassDrawing(type, anchor, style, sweep) {
    const { x, y, radius, angle } = anchor;
    const shape = { type, x: x - radius, y: y - radius, w: 2 * radius, h: 2 * radius, ...style };
    return type === 'arc' ? { ...shape, angle, sweep } : shape;
  }

  return class BoardCanvas {
    constructor({
      canvas, onChange = () => {}, onView = () => {}, onSelection = () => {}, onGuide = () => {},
      onCompassPhase = () => {}, getText = () => '',
    }) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.layer = transparentCanvas();
      this.inkLayer = transparentCanvas();
      this.onChange = onChange;
      this.onView = onView;
      this.onSelection = onSelection;
      this.onGuide = onGuide;
      this.onCompassPhase = onCompassPhase;
      this.getText = getText;
      this.objects = [];
      this.past = [];
      this.future = [];
      this.background = 'grid';
      this.tool = 'pen';
      this.style = { color: '#432664', width: 4 };
      this.zoom = 1;
      this.pan = { x: 0, y: 0 };
      this.pointers = new Map();
      this.selected = -1;
      this.reportedSelection = null;
      this.guide = null;
      this.hoverGuide = null;
      this.compassOpening = null;
      this.sceneVersion = 0;
      this.frame = null;
      this.canvas.style.touchAction = 'none';
      this.setTool(this.tool);

      canvas.addEventListener('pointerdown', event => this.pointerDown(event));
      canvas.addEventListener('pointermove', event => this.pointerMove(event));
      canvas.addEventListener('pointerleave', () => this.setHoverGuide(null));
      canvas.addEventListener('pointerup', event => this.pointerUp(event));
      canvas.addEventListener('pointercancel', event => this.pointerUp(event, true));
      canvas.addEventListener('lostpointercapture', event => {
        if (this.pointers.has(event.pointerId)) this.pointerUp(event, true);
      });
      canvas.addEventListener('wheel', event => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        this.zoomAt(this.zoom * Math.exp(-event.deltaY * 0.012), this.localPoint(event));
      }, { passive: false });

      if (window.ResizeObserver) {
        this.observer = new ResizeObserver(() => this.queueRender());
        this.observer.observe(canvas);
      }
      window.addEventListener('resize', () => this.queueRender());
      this.queueRender();
    }

    setScene(objects, background) {
      this.cancelGesture();
      this.sceneVersion++;
      this.objects = Array.isArray(objects) ? objects.slice() : [];
      this.past = [];
      this.future = [];
      this.setSelection(-1);
      this.pinch = null;
      this.pointers.clear();
      this.setBackground(background);
      this.resetView();
    }

    setTool(tool) {
      if (this.tool !== tool) this.cancelGesture();
      this.tool = tool;
      if (tool !== 'select') this.setSelection(-1);
      this.canvas.style.cursor = CURSORS[tool] || 'crosshair';
      this.queueRender();
    }

    setSelection(index) {
      this.selected = index;
      const object = this.objects[index] || null;
      if (this.reportedSelection === object) return;
      this.reportedSelection = object;
      this.onSelection(object);
    }

    setGuide(guide) {
      const wasActive = Boolean(this.guide);
      this.guide = guide;
      if (wasActive !== Boolean(guide)) this.onGuide(Boolean(guide));
    }

    setHoverGuide(guide) {
      if (this.hoverGuide?.instrument === guide?.instrument && this.hoverGuide?.edge === guide?.edge) return;
      this.hoverGuide = guide;
      this.queueRender();
    }

    setCompassOpening(opening) {
      const wasOpen = Boolean(this.compassOpening);
      this.compassOpening = opening;
      if (wasOpen !== Boolean(opening)) this.onCompassPhase(Boolean(opening));
    }

    cancelGesture() {
      const active = this.gesture || this.draft || this.moving || this.guide || this.compassOpening;
      this.gesture = null;
      this.draft = null;
      this.moving = null;
      this.setGuide(null);
      this.setHoverGuide(null);
      this.setCompassOpening(null);
      this.canvas.style.cursor = CURSORS[this.tool] || 'crosshair';
      if (active) this.queueRender();
    }

    setStyle({ color, width }) {
      if (typeof color === 'string') this.style.color = color;
      const value = Number(width);
      if (Number.isFinite(value) && value > 0) this.style.width = Math.min(60, value);
      if (this.compassOpening) this.queueRender();
    }

    setBackground(background) {
      this.background = Object.hasOwn(BACKGROUNDS, background) ? background : 'grid';
      this.queueRender();
    }

    getZoom() {
      return Math.round(this.zoom * 100);
    }

    setZoom(percent) {
      this.zoomAt(Number(percent) / 100);
    }

    resetView() {
      this.setHoverGuide(null);
      this.zoom = 1;
      this.pan = { x: 0, y: 0 };
      this.onView(this.getZoom());
      this.queueRender();
    }

    zoomAt(nextZoom, anchor) {
      if (!Number.isFinite(nextZoom)) return;
      this.setHoverGuide(null);
      const { width, height } = this.canvas.getBoundingClientRect();
      anchor ||= { x: width / 2, y: height / 2 };
      const world = this.worldPoint(anchor);
      this.zoom = Math.max(0.3, Math.min(3, nextZoom));
      this.anchorWorld(world, anchor);
      this.onView(this.getZoom());
      this.queueRender();
    }

    anchorWorld(world, anchor) {
      const view = this.viewport();
      this.pan.x += anchor.x - (world.x * view.scale + view.x);
      this.pan.y += anchor.y - (world.y * view.scale + view.y);
    }

    add(object) {
      if (!object || typeof object.type !== 'string') return;
      this.replace([...this.objects, object]);
    }

    clear() {
      this.cancelGesture();
      if (this.objects.length) this.replace([]);
      else this.queueRender();
    }

    canUndo() { return this.past.length > 0; }

    canRedo() { return this.future.length > 0; }

    undo() {
      if (!this.canUndo()) return;
      this.cancelGesture();
      this.future.push(this.objects);
      this.objects = this.past.pop();
      this.setSelection(-1);
      this.changed();
    }

    redo() {
      if (!this.canRedo()) return;
      this.cancelGesture();
      this.past.push(this.objects);
      this.objects = this.future.pop();
      this.setSelection(-1);
      this.changed();
    }

    deleteSelection() {
      if (this.selected < 0) return false;
      this.cancelGesture();
      this.replace(this.objects.filter((_, index) => index !== this.selected));
      return true;
    }

    rotateSelection(degrees) {
      const instrument = this.objects[this.selected];
      if (!INSTRUMENTS.has(instrument?.type) || !Number.isFinite(degrees)) return false;
      this.cancelGesture();
      const angle = normalizeAngle((instrument.angle || 0) + degrees * Math.PI / 180);
      return this.commitRotation(angle);
    }

    commitRotation(angle) {
      const instrument = this.objects[this.selected];
      if (Math.abs(normalizeAngle(angle - (instrument.angle || 0))) < 0.0001) return false;
      const objects = this.objects.slice();
      objects[this.selected] = { ...instrument, angle };
      this.replace(objects, this.selected);
      return true;
    }

    replace(objects, selected = -1) {
      this.past.push(this.objects);
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
      this.future = [];
      this.objects = objects;
      this.setHoverGuide(null);
      this.setSelection(selected);
      this.changed();
    }

    changed() {
      this.queueRender();
      this.onChange(this.objects);
    }

    viewport() {
      const { width, height } = this.canvas.getBoundingClientRect();
      const fit = Math.max(0.01, Math.min(width / BOARD_WIDTH, height / BOARD_HEIGHT));
      const scale = fit * this.zoom;
      return {
        width, height, scale,
        x: (width - BOARD_WIDTH * scale) / 2 + this.pan.x,
        y: (height - BOARD_HEIGHT * scale) / 2 + this.pan.y,
      };
    }

    localPoint(event) {
      const rect = this.canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    worldPoint(point) {
      const view = this.viewport();
      return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale };
    }

    eventPoint(event) {
      const point = this.worldPoint(this.localPoint(event));
      if (event.pointerType === 'pen') point.p = event.pressure || 0.45;
      return point;
    }

    hitTest(point) {
      const margin = 7 / this.viewport().scale;
      let inkErased = false;
      for (let index = this.objects.length - 1; index >= 0; index--) {
        const object = this.objects[index];
        if (object.type === 'eraser') {
          if (pathContains(object.points, point, (object.width || 4) / 2)) inkErased = true;
        } else if (INK_TOOLS.has(object.type)) {
          if (!inkErased && pathContains(object.points, point, (object.width || 4) / 2 + margin)) return index;
        } else if (object.type === 'line') {
          const to = { x: object.x + object.w, y: object.y + object.h };
          if (segmentDistance(point, object, to) <= (object.width || 4) / 2 + margin) return index;
        } else if (object.type === 'arc') {
          if (hitArc(object, point, margin)) return index;
        } else if (INSTRUMENTS.has(object.type)) {
          if (hitInstrument(object, point, margin)) return index;
        } else {
          const bounds = objectBounds(this.ctx, object);
          if (bounds && inside(bounds, point, margin)) return index;
        }
      }
      return -1;
    }

    rotationAt(point) {
      const instrument = this.objects[this.selected];
      if (this.tool !== 'select' || !INSTRUMENTS.has(instrument?.type)) return null;
      const frame = instrumentFrame(instrument);
      const { scale } = this.viewport();
      return distance(point, rotationHandle(frame, scale)) <= 12 / scale ? frame : null;
    }

    gestureAngle(point, gesture, constrain) {
      const { frame, pointerAngle, instrument } = gesture.rotation;
      const angle = (instrument.angle || 0) + Math.atan2(point.y - frame.y, point.x - frame.x) - pointerAngle;
      return normalizeAngle(constrain ? snapAngle(angle) : angle);
    }

    updateHover(point) {
      if (GUIDE_TOOLS.has(this.tool)) {
        this.setHoverGuide(nearestGuide(this.objects, point, this.viewport().scale));
      } else if (this.tool === 'select') {
        this.canvas.style.cursor = this.rotationAt(point) ? 'grab' : CURSORS.select;
      } else if (this.tool === 'compass-arc') {
        this.canvas.style.cursor = this.nearCompassTip(point) ? 'grab' : 'crosshair';
      }
    }

    nearCompassTip(point) {
      const opening = this.compassOpening;
      if (!opening) return false;
      const tip = circlePoint(opening, opening.radius, opening.angle);
      return distance(point, tip) * this.viewport().scale <= 24;
    }

    updateCompassSweep(gesture, point) {
      const sweep = gesture.compass;
      const { opening, lastAngle } = sweep;
      if (distance(point, opening) * this.viewport().scale < 3) return;
      const angle = Math.atan2(point.y - opening.y, point.x - opening.x);
      sweep.angle = clamp(sweep.angle + normalizeAngle(angle - lastAngle), -FULL_TURN, FULL_TURN);
      sweep.lastAngle = angle;
    }

    pointerDown(event) {
      if (event.button !== 0 && event.button !== 1 && event.button !== 5) return;
      if (this.pointers.size && event.pointerType !== 'touch') return;
      event.preventDefault();
      const local = this.localPoint(event);
      this.pointers.set(event.pointerId, local);
      this.canvas.setPointerCapture(event.pointerId);
      if (this.pointers.size === 2) {
        this.cancelGesture();
        const [a, b] = this.pointers.values();
        const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this.pinch = { world: this.worldPoint(midpoint), distance: Math.max(1, distance(a, b)), zoom: this.zoom };
        this.queueRender();
        return;
      }
      if (this.pointers.size > 1) return;

      this.setHoverGuide(null);
      const start = this.eventPoint(event);
      const defaultTool = event.button === 1 ? 'pan' : event.button === 5 ? 'eraser' : this.tool;
      const frame = defaultTool === 'select' ? this.rotationAt(start) : null;
      const sweeping = defaultTool === 'compass-arc' && this.nearCompassTip(start);
      const tool = frame ? 'rotate-instrument' : sweeping ? 'compass-sweep' : defaultTool;
      this.gesture = { id: event.pointerId, tool, start, local, originalPan: { ...this.pan } };
      if (tool === 'pan' || tool === 'rotate-instrument' || sweeping) this.canvas.style.cursor = 'grabbing';
      if (frame) {
        this.gesture.rotation = {
          frame, instrument: this.objects[this.selected], pointerAngle: Math.atan2(start.y - frame.y, start.x - frame.x),
        };
      } else if (tool === 'select') {
        this.setSelection(this.hitTest(start));
      } else if (sweeping) {
        const opening = this.compassOpening;
        const lastAngle = Math.atan2(start.y - opening.y, start.x - opening.x);
        this.gesture.compass = { opening, lastAngle, angle: 0 };
      } else if (tool === 'compass-arc') {
        this.setCompassOpening(null);
      }
      if (INK_TOOLS.has(tool)) {
        const width = this.style.width * WIDTH_MULTIPLIER[tool];
        const { scale } = this.viewport();
        const guide = GUIDE_TOOLS.has(tool) ? nearestGuide(this.objects, start, scale) : null;
        if (guide) guide.offset = width / 2 + 1.2 / scale;
        this.setGuide(guide);
        const firstPoint = guide ? { ...start, ...guidePoint(guide, guide.parameter, guide.offset) } : start;
        this.draft = { type: tool, points: [firstPoint], color: this.style.color, width };
      }
      this.queueRender();
    }

    pointerMove(event) {
      if (!this.pointers.has(event.pointerId)) {
        if (!this.pointers.size && event.pointerType !== 'touch') this.updateHover(this.eventPoint(event));
        return;
      }
      const local = this.localPoint(event);
      this.pointers.set(event.pointerId, local);
      if (this.pinch && this.pointers.size >= 2) {
        const [a, b] = this.pointers.values();
        const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this.zoom = Math.max(0.3, Math.min(3, this.pinch.zoom * distance(a, b) / this.pinch.distance));
        this.anchorWorld(this.pinch.world, midpoint);
        this.onView(this.getZoom());
      } else if (this.gesture?.id === event.pointerId) {
        const { tool, start, originalPan } = this.gesture;
        const point = this.eventPoint(event);
        if (tool === 'pan') {
          this.pan = { x: originalPan.x + local.x - this.gesture.local.x, y: originalPan.y + local.y - this.gesture.local.y };
        } else if (tool === 'rotate-instrument') {
          this.moving = { ...this.gesture.rotation.instrument, angle: this.gestureAngle(point, this.gesture, event.shiftKey) };
        } else if (tool === 'select' && this.selected >= 0) {
          this.moving = shifted(this.objects[this.selected], point.x - start.x, point.y - start.y);
        } else if (tool === 'compass-sweep') {
          const coalesced = event.getCoalescedEvents?.() || [];
          for (const sample of coalesced.length ? coalesced : [event]) this.updateCompassSweep(this.gesture, this.eventPoint(sample));
          const { opening, angle } = this.gesture.compass;
          this.draft = compassPreview(opening, this.style, angle);
        } else if (COMPASS_TOOLS.has(tool)) {
          const opening = compassAnchor(start, point);
          this.draft = opening.radius > 0 ? compassPreview(opening, this.style) : null;
        } else if (INK_TOOLS.has(tool)) {
          const coalesced = event.getCoalescedEvents?.() || [];
          for (const sample of coalesced.length ? coalesced : [event]) this.appendPoint(this.eventPoint(sample));
        } else if (SHAPE_TOOLS.has(tool)) {
          this.draft = shapeAt(tool, start, point, this.style, {
            scale: this.viewport().scale, constrain: event.shiftKey,
          });
        }
      }
      this.queueRender();
    }

    appendPoint(point) {
      const points = this.draft.points;
      const last = points[points.length - 1];
      const guide = this.guide;
      if (!guide) {
        if (distance(last, point) > 0.8) points.push(point);
        return;
      }
      const parameter = guideParameter(guide, point, guide.parameter);
      const position = guidePoint(guide, parameter, guide.offset);
      if (distance(last, position) <= 0.8) return;
      if (guide.kind === 'line') {
        points.push({ ...point, ...position });
      } else {
        // Resample angular motion so a fast drag still traces a curve between events.
        const span = parameter - guide.parameter;
        const count = Math.max(1, Math.ceil(Math.abs(span) / (Math.PI / 36)));
        for (let index = 1; index <= count; index++) {
          const fraction = index / count;
          const sample = { ...point, ...guidePoint(guide, guide.parameter + span * fraction, guide.offset) };
          if (last.p != null && point.p != null) sample.p = last.p + (point.p - last.p) * fraction;
          points.push(sample);
        }
      }
      guide.parameter = parameter;
    }

    pointerUp(event, cancelled = false) {
      if (!this.pointers.has(event.pointerId)) return;
      this.pointers.delete(event.pointerId);
      if (this.pinch && this.pointers.size < 2) this.pinch = null;
      const gesture = this.gesture;
      if (gesture?.id !== event.pointerId) return;
      this.gesture = null;
      this.canvas.style.cursor = CURSORS[this.tool] || 'crosshair';
      const { tool, start } = gesture;
      if (!cancelled) {
        const point = this.eventPoint(event);
        const moved = distance(this.localPoint(event), gesture.local);
        if (INK_TOOLS.has(tool) && this.draft) {
          this.appendPoint(point);
          this.add(this.draft);
        } else if (tool === 'compass-sweep') {
          this.updateCompassSweep(gesture, point);
          const { opening, angle } = gesture.compass;
          if (Math.abs(angle) * opening.radius * this.viewport().scale >= 2) {
            this.setCompassOpening(null);
            this.add(compassDrawing('arc', opening, this.style, angle));
          }
        } else if (COMPASS_TOOLS.has(tool) && moved >= 5) {
          const opening = compassAnchor(start, point);
          if (tool === 'compass-arc') this.setCompassOpening(opening);
          else this.add(compassDrawing('ellipse', opening, this.style));
        } else if (SHAPE_TOOLS.has(tool)) {
          this.add(shapeAt(tool, start, point, this.style, {
            scale: this.viewport().scale, fallback: true, constrain: event.shiftKey,
          }));
        } else if (tool === 'text' && moved < 12) {
          this.requestText(start);
        } else if (tool === 'pan') {
          const local = this.localPoint(event);
          this.pan = {
            x: gesture.originalPan.x + local.x - gesture.local.x,
            y: gesture.originalPan.y + local.y - gesture.local.y,
          };
        } else if (tool === 'rotate-instrument' && moved > 2) {
          this.commitRotation(this.gestureAngle(point, gesture, event.shiftKey));
        } else if (tool === 'select' && this.selected >= 0 && moved > 2) {
          const objects = this.objects.slice();
          objects[this.selected] = shifted(objects[this.selected], point.x - start.x, point.y - start.y);
          this.replace(objects, this.selected);
        }
      }
      this.setGuide(null);
      this.draft = null;
      this.moving = null;
      if (!cancelled && !this.pointers.size && event.pointerType !== 'touch') this.updateHover(this.eventPoint(event));
      this.queueRender();
    }

    async requestText(point) {
      const version = this.sceneVersion;
      const style = { ...this.style };
      const value = await this.getText(point);
      if (version === this.sceneVersion && typeof value === 'string' && value.trim()) {
        this.add({ type: 'text', x: point.x, y: point.y, text: value, ...style });
      }
    }

    queueRender() {
      if (this.frame !== null) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        this.render();
      });
    }

    render() {
      const view = this.viewport();
      const { width, height } = view;
      if (width <= 0 || height <= 0) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
      const pixelWidth = Math.max(1, Math.round(width * ratio));
      const pixelHeight = Math.max(1, Math.round(height * ratio));
      if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
      if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;
      const { ctx } = this;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      paintBackground(ctx, width, height, view, this.background);
      const draft = this.draft || (this.compassOpening && compassPreview(this.compassOpening, this.style));
      paintScene(this.layer, this.inkLayer, width, height, ratio, view, this.objects, draft, this.selected, this.moving, this.background);
      ctx.drawImage(this.layer.canvas, 0, 0, width, height);

      const dark = this.background === 'dark';
      const accent = dark ? '#c8adff' : '#7742d5';
      const guide = this.guide || this.hoverGuide;
      if (guide) paintGuide(ctx, view, guide, Boolean(this.guide), accent);
      const selectedObject = this.moving || this.objects[this.selected];
      if (INSTRUMENTS.has(selectedObject?.type)) {
        paintInstrumentSelection(ctx, view, selectedObject, accent, dark);
      } else if (selectedObject) {
        const bounds = objectBounds(ctx, selectedObject);
        if (!bounds) return;
        const margin = 7;
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.3;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(view.x + bounds.x * view.scale - margin, view.y + bounds.y * view.scale - margin,
          bounds.width * view.scale + margin * 2, bounds.height * view.scale + margin * 2);
        ctx.restore();
      }
    }

    exportPng() {
      let x = 0;
      let y = 0;
      let right = BOARD_WIDTH;
      let bottom = BOARD_HEIGHT;
      for (const object of this.objects) {
        if (object.type === 'eraser') continue;
        const bounds = objectBounds(this.ctx, object);
        if (!bounds) continue;
        x = Math.min(x, Math.floor(bounds.x - 16));
        y = Math.min(y, Math.floor(bounds.y - 16));
        right = Math.max(right, Math.ceil(bounds.x + bounds.width + 16));
        bottom = Math.max(bottom, Math.ceil(bounds.y + bounds.height + 16));
      }
      const width = right - x;
      const height = bottom - y;
      const ratio = Math.min(2, 4096 / Math.max(width, height));
      const view = { x: -x, y: -y, scale: 1 };
      const layer = transparentCanvas();
      paintScene(layer, transparentCanvas(), width, height, ratio, view, this.objects, null, -1, null, this.background);
      const output = transparentCanvas();
      output.canvas.width = layer.canvas.width;
      output.canvas.height = layer.canvas.height;
      output.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      paintBackground(output.ctx, width, height, view, this.background);
      output.ctx.drawImage(layer.canvas, 0, 0, width, height);
      return output.canvas.toDataURL('image/png');
    }
  };
})();
