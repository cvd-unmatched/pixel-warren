"use strict";
(function(){

  var state = {
    key: null,
    size: 100,
    rows: [],
    palette: {},
    activeKey: null,
    tool: 'pencil',
    brushSize: 1,
    mirrorX: false,
    cellPx: 6,
    gridLines: true,
    ref: { url: null, naturalW: 0, naturalH: 0, x: 20, y: 20, scale: 1, opacity: 0.5 },
    undoStack: [],
    redoStack: [],
    drawing: false,
    draggingRef: false,
    dragStart: null,
    lastPaintCell: null,
    highlightKey: null
  };

  var el = {};
  ['monsterSelect','newKeyInput','newSizeInput','newMonsterBtn','duplicateBtn','resizeBtn',
   'refFileInput','refOpacity','refOpacityVal','refScale','refScaleNum','refMoveMode','refResetBtn','refClearBtn',
   'nudgeUp','nudgeDown','nudgeLeft','nudgeRight','autoTraceColors','autoTraceBtn','brushSize',
   'zoomRange','zoomVal','gridLinesToggle','mirrorXToggle',
   'stage','refImg','gridCanvas','statusLine',
   'paletteList','newPaletteKey','newPaletteColor','addPaletteBtn',
   'saveToFileBtn','genCodeBtn','copyCodeBtn','codeOutput','undoBtn','redoBtn'
  ].forEach(function(id){ el[id] = document.getElementById(id); });

  var ctx = el.gridCanvas.getContext('2d');

  function status(msg){ el.statusLine.textContent = msg; }

  /* ---------------- grid helpers ---------------- */
  function replaceChar(str, i, ch){ return str.slice(0, i) + ch + str.slice(i + 1); }

  function setCell(x, y, ch){
    if(x < 0 || x >= state.size || y < 0 || y >= state.size) return;
    state.rows[y] = replaceChar(state.rows[y], x, ch);
    if(state.mirrorX){
      var mx = state.size - 1 - x;
      state.rows[y] = replaceChar(state.rows[y], mx, ch);
    }
  }
  function getCell(x, y){
    if(x < 0 || x >= state.size || y < 0 || y >= state.size) return '.';
    return state.rows[y][x];
  }

  // paints a state.brushSize x state.brushSize square centered (as evenly
  // as possible) on (cx,cy) -- used by the pencil/eraser tools so you're
  // not stuck painting one pixel at a time on a 100x100 canvas.
  function paintBrush(cx, cy, ch){
    var offset = Math.floor((state.brushSize - 1) / 2);
    for(var dy = 0; dy < state.brushSize; dy++){
      for(var dx = 0; dx < state.brushSize; dx++){
        setCell(cx - offset + dx, cy - offset + dy, ch);
      }
    }
  }
  // steps along the line from (x0,y0) to (x1,y1) stamping the brush at
  // every point, so fast mouse drags don't leave gaps between stamps.
  function brushLineTo(x0, y0, x1, y1, ch){
    var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    var err = dx + dy;
    while(true){
      paintBrush(x0, y0, ch);
      if(x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if(e2 >= dy){ err += dy; x0 += sx; }
      if(e2 <= dx){ err += dx; y0 += sy; }
    }
  }

  function blankRows(size){
    var rows = [];
    var blank = new Array(size + 1).join('.');
    for(var y = 0; y < size; y++) rows.push(blank);
    return rows;
  }

  function resizeGrid(newSize){
    var old = state.rows, oldSize = state.size;
    var rows = [];
    for(var y = 0; y < newSize; y++){
      var row = '';
      for(var x = 0; x < newSize; x++){
        row += (y < oldSize && x < oldSize) ? old[y][x] : '.';
      }
      rows.push(row);
    }
    state.rows = rows;
    state.size = newSize;
  }

  /* ---------------- undo/redo (stroke-level) ---------------- */
  function pushUndo(){
    state.undoStack.push(state.rows.slice());
    if(state.undoStack.length > 60) state.undoStack.shift();
    state.redoStack.length = 0;
  }
  function undo(){
    if(!state.undoStack.length) return;
    state.redoStack.push(state.rows.slice());
    state.rows = state.undoStack.pop();
    render();
  }
  function redo(){
    if(!state.redoStack.length) return;
    state.undoStack.push(state.rows.slice());
    state.rows = state.redoStack.pop();
    render();
  }

  /* ---------------- drawing primitives ---------------- */
  function lineTo(x0, y0, x1, y1, ch){
    var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    var err = dx + dy;
    while(true){
      setCell(x0, y0, ch);
      if(x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if(e2 >= dy){ err += dy; x0 += sx; }
      if(e2 <= dx){ err += dx; y0 += sy; }
    }
  }
  function rectShape(x0, y0, x1, y1, ch){
    var xa = Math.min(x0, x1), xb = Math.max(x0, x1);
    var ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    for(var y = ya; y <= yb; y++) for(var x = xa; x <= xb; x++) setCell(x, y, ch);
  }
  function ellipseShape(x0, y0, x1, y1, ch){
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    var rx = Math.abs(x1 - x0) / 2 || 0.5, ry = Math.abs(y1 - y0) / 2 || 0.5;
    var xa = Math.floor(cx - rx), xb = Math.ceil(cx + rx);
    var ya = Math.floor(cy - ry), yb = Math.ceil(cy + ry);
    for(var y = ya; y <= yb; y++){
      for(var x = xa; x <= xb; x++){
        var nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        if(nx * nx + ny * ny <= 1) setCell(x, y, ch);
      }
    }
  }
  function floodFill(x0, y0, ch){
    var target = getCell(x0, y0);
    if(target === ch) return;
    var stack = [[x0, y0]];
    var seen = {};
    while(stack.length){
      var p = stack.pop();
      var x = p[0], y = p[1];
      if(x < 0 || x >= state.size || y < 0 || y >= state.size) continue;
      var k = x + ',' + y;
      if(seen[k]) continue;
      if(getCell(x, y) !== target) continue;
      seen[k] = true;
      setCell(x, y, ch);
      stack.push([x + 1, y]); stack.push([x - 1, y]);
      stack.push([x, y + 1]); stack.push([x, y - 1]);
    }
  }

  /* ---------------- rendering ---------------- */
  function render(){
    if(!state.rows.length){ el.gridCanvas.width = 0; el.gridCanvas.height = 0; return; }
    var px = state.cellPx;
    el.gridCanvas.width = state.size * px;
    el.gridCanvas.height = state.size * px;
    ctx.clearRect(0, 0, el.gridCanvas.width, el.gridCanvas.height);
    var hl = state.highlightKey;
    for(var y = 0; y < state.size; y++){
      var row = state.rows[y];
      for(var x = 0; x < state.size; x++){
        var ch = row[x];
        if(ch === '.') continue;
        var color = state.palette[ch];
        if(!color) continue;
        ctx.globalAlpha = (hl && ch !== hl) ? 0.2 : 1;
        ctx.fillStyle = color;
        ctx.fillRect(x * px, y * px, px, px);
      }
    }
    ctx.globalAlpha = 1;
    if(hl){
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = px >= 6 ? 2 : 1;
      for(var hy = 0; hy < state.size; hy++){
        var hrow = state.rows[hy];
        for(var hx = 0; hx < state.size; hx++){
          if(hrow[hx] === hl) ctx.strokeRect(hx * px + 1, hy * px + 1, px - 2, px - 2);
        }
      }
    }
    if(state.gridLines && px >= 4){
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for(var gx = 0; gx <= state.size; gx++){
        ctx.moveTo(gx * px + 0.5, 0); ctx.lineTo(gx * px + 0.5, state.size * px);
      }
      for(var gy = 0; gy <= state.size; gy++){
        ctx.moveTo(0, gy * px + 0.5); ctx.lineTo(state.size * px, gy * px + 0.5);
      }
      ctx.stroke();
    }
    renderRef();
  }

  function renderRef(){
    if(!state.ref.url){ el.refImg.hidden = true; return; }
    el.refImg.hidden = false;
    el.refImg.style.left = state.ref.x + 'px';
    el.refImg.style.top = state.ref.y + 'px';
    el.refImg.style.width = (state.ref.naturalW * state.ref.scale) + 'px';
    el.refImg.style.height = (state.ref.naturalH * state.ref.scale) + 'px';
    el.refImg.style.opacity = state.ref.opacity;
  }

  /* ---------------- palette panel ---------------- */
  function renderPalette(){
    el.paletteList.innerHTML = '';
    Object.keys(state.palette).forEach(function(k){
      var row = document.createElement('div');
      row.className = 'palette-swatch' + (state.activeKey === k ? ' active' : '');
      var keySpan = document.createElement('span');
      keySpan.className = 'key';
      keySpan.textContent = k;
      var colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = state.palette[k];
      colorInput.addEventListener('input', function(){
        state.palette[k] = colorInput.value;
        render();
      });
      colorInput.addEventListener('click', function(e){ e.stopPropagation(); });
      var del = document.createElement('span');
      del.className = 'del';
      del.textContent = '✕';
      del.title = 'remove color (clears painted cells using it)';
      del.addEventListener('click', function(e){
        e.stopPropagation();
        pushUndo();
        for(var y = 0; y < state.size; y++){
          if(state.rows[y].indexOf(k) !== -1){
            var r = state.rows[y];
            var out = '';
            for(var x = 0; x < r.length; x++) out += (r[x] === k) ? '.' : r[x];
            state.rows[y] = out;
          }
        }
        delete state.palette[k];
        if(state.activeKey === k) state.activeKey = Object.keys(state.palette)[0] || null;
        renderPalette();
        render();
      });
      row.appendChild(keySpan);
      row.appendChild(colorInput);
      row.appendChild(del);
      row.addEventListener('click', function(){
        state.activeKey = k;
        renderPalette();
      });
      row.addEventListener('mouseenter', function(){
        state.highlightKey = k;
        render();
      });
      row.addEventListener('mouseleave', function(){
        state.highlightKey = null;
        render();
      });
      (function(kk, rowEl){
        if(state.activeKey === kk) rowEl.classList.add('active');
      })(k, row);
      el.paletteList.appendChild(row);
    });
  }

  /* ---------------- monster load/new ---------------- */
  function populateMonsterSelect(){
    var keys = Object.keys(window.MONSTERS || {}).sort();
    el.monsterSelect.innerHTML = '<option value="">select...</option>';
    keys.forEach(function(k){
      var opt = document.createElement('option');
      opt.value = k; opt.textContent = k;
      el.monsterSelect.appendChild(opt);
    });
  }
  function addSelectOption(key){
    if([].some.call(el.monsterSelect.options, function(o){ return o.value === key; })) return;
    var opt = document.createElement('option');
    opt.value = key; opt.textContent = key;
    el.monsterSelect.appendChild(opt);
  }

  function loadMonster(key){
    var m = window.MONSTERS[key];
    if(!m) return;
    state.key = key;
    state.rows = m.rows.slice();
    state.size = m.rows.length;
    state.palette = Object.assign({}, m.palette);
    state.activeKey = Object.keys(state.palette)[0] || null;
    state.undoStack = []; state.redoStack = [];
    renderPalette();
    render();
    status('Editing "' + key + '" (' + state.size + 'x' + state.size + ')');
  }

  function newMonster(key, size){
    state.key = key;
    state.size = size;
    state.rows = blankRows(size);
    state.palette = { o: '#141414' };
    state.activeKey = 'o';
    state.undoStack = []; state.redoStack = [];
    addSelectOption(key);
    el.monsterSelect.value = key;
    renderPalette();
    render();
    status('New monster "' + key + '" (' + size + 'x' + size + ')');
  }

  /* ---------------- export ---------------- */
  function generateCode(){
    var lines = [];
    lines.push(state.key + ':{');
    var palEntries = Object.keys(state.palette).map(function(k){ return k + ":'" + state.palette[k] + "'"; });
    lines.push('  palette:{' + palEntries.join(',') + '},');
    lines.push('  rows:[');
    state.rows.forEach(function(r, i){
      lines.push('    "' + r + '"' + (i < state.rows.length - 1 ? ',' : ''));
    });
    lines.push('  ]');
    lines.push('}');
    return lines.join('\n');
  }

  /* ---------------- mouse interaction ---------------- */
  function cellFromEvent(e){
    var rect = el.gridCanvas.getBoundingClientRect();
    var x = Math.floor((e.clientX - rect.left) / state.cellPx);
    var y = Math.floor((e.clientY - rect.top) / state.cellPx);
    return { x: Math.max(0, Math.min(state.size - 1, x)), y: Math.max(0, Math.min(state.size - 1, y)) };
  }

  function applyToolAt(x, y){
    var ch = state.tool === 'eraser' ? '.' : state.activeKey;
    if(state.tool === 'pencil' || state.tool === 'eraser'){
      paintBrush(x, y, ch);
    } else if(state.tool === 'fill'){
      floodFill(x, y, ch);
    } else if(state.tool === 'eyedrop'){
      var picked = getCell(x, y);
      if(picked !== '.'){ state.activeKey = picked; renderPalette(); }
    }
  }

  el.gridCanvas.addEventListener('mousedown', function(e){
    if(!state.key) return;
    if(el.refMoveMode.checked && state.ref.url){
      state.draggingRef = true;
      state.dragStart = { mx: e.clientX, my: e.clientY, rx: state.ref.x, ry: state.ref.y };
      return;
    }
    var c = cellFromEvent(e);
    pushUndo();
    if(state.tool === 'pencil' || state.tool === 'eraser' || state.tool === 'fill' || state.tool === 'eyedrop'){
      applyToolAt(c.x, c.y);
      state.drawing = true;
      state.lastPaintCell = c;
      render();
    } else {
      state.drawing = true;
      state.dragStart = c;
    }
  });

  window.addEventListener('mousemove', function(e){
    if(state.draggingRef){
      state.ref.x = state.dragStart.rx + (e.clientX - state.dragStart.mx);
      state.ref.y = state.dragStart.ry + (e.clientY - state.dragStart.my);
      renderRef();
      return;
    }
    if(!state.drawing) return;
    var c = cellFromEvent(e);
    if(state.tool === 'pencil' || state.tool === 'eraser'){
      if(!state.lastPaintCell || state.lastPaintCell.x !== c.x || state.lastPaintCell.y !== c.y){
        brushLineTo(state.lastPaintCell ? state.lastPaintCell.x : c.x, state.lastPaintCell ? state.lastPaintCell.y : c.y, c.x, c.y, state.tool === 'eraser' ? '.' : state.activeKey);
        state.lastPaintCell = c;
        render();
      }
    } else if(state.tool === 'line' || state.tool === 'rect' || state.tool === 'ellipse'){
      render();
      previewShape(state.dragStart, c);
    }
  });

  window.addEventListener('mouseup', function(e){
    if(state.draggingRef){ state.draggingRef = false; return; }
    if(!state.drawing) return;
    state.drawing = false;
    if(state.tool === 'line' || state.tool === 'rect' || state.tool === 'ellipse'){
      var c = cellFromEvent(e);
      var fn = state.tool === 'line' ? lineTo : (state.tool === 'rect' ? rectShape : ellipseShape);
      fn(state.dragStart.x, state.dragStart.y, c.x, c.y, state.activeKey);
      render();
    }
    state.lastPaintCell = null;
  });

  function previewShape(start, end){
    var px = state.cellPx;
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = state.palette[state.activeKey] || '#ffffff';
    if(state.tool === 'rect'){
      var xa = Math.min(start.x, end.x), xb = Math.max(start.x, end.x);
      var ya = Math.min(start.y, end.y), yb = Math.max(start.y, end.y);
      ctx.fillRect(xa * px, ya * px, (xb - xa + 1) * px, (yb - ya + 1) * px);
    } else if(state.tool === 'ellipse'){
      var cx = (start.x + end.x) / 2, cy = (start.y + end.y) / 2;
      var rx = Math.abs(end.x - start.x) / 2 || 0.5, ry = Math.abs(end.y - start.y) / 2 || 0.5;
      ctx.beginPath();
      ctx.ellipse((cx + 0.5) * px, (cy + 0.5) * px, rx * px, ry * px, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if(state.tool === 'line'){
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = px;
      ctx.beginPath();
      ctx.moveTo((start.x + 0.5) * px, (start.y + 0.5) * px);
      ctx.lineTo((end.x + 0.5) * px, (end.y + 0.5) * px);
      ctx.stroke();
    }
    ctx.restore();
  }

  function syncScaleUI(){
    el.refScale.value = Math.round(state.ref.scale * 100);
    el.refScaleNum.value = (state.ref.scale * 100).toFixed(1);
  }
  function setRefScale(pct){
    state.ref.scale = Math.max(0.01, Math.min(40, pct / 100));
    syncScaleUI();
    renderRef();
  }

  el.gridCanvas.addEventListener('wheel', function(e){
    if(!state.ref.url) return;
    e.preventDefault();
    // fine by default, even finer with Shift, coarser with Ctrl -- so a
    // careful trace pass and a quick rough resize both feel natural
    var step = e.ctrlKey ? 1.05 : (e.shiftKey ? 1.005 : 1.02);
    var delta = e.deltaY < 0 ? step : 1 / step;
    setRefScale(state.ref.scale * 100 * delta);
  }, { passive: false });

  /* ---------------- toolbar wiring ---------------- */
  document.querySelectorAll('.tool-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('.tool-btn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      state.tool = btn.dataset.tool;
    });
  });
  document.querySelector('.tool-btn[data-tool="pencil"]').classList.add('active');

  el.brushSize.addEventListener('input', function(){
    state.brushSize = Math.max(1, Math.min(20, parseInt(el.brushSize.value, 10) || 1));
  });

  el.undoBtn.addEventListener('click', undo);
  el.redoBtn.addEventListener('click', redo);
  window.addEventListener('keydown', function(e){
    if((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey){ e.preventDefault(); undo(); }
    if((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))){ e.preventDefault(); redo(); }
  });

  el.monsterSelect.addEventListener('change', function(){
    if(el.monsterSelect.value) loadMonster(el.monsterSelect.value);
  });
  el.newMonsterBtn.addEventListener('click', function(){
    var key = el.newKeyInput.value.trim();
    if(!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)){ status('Key must start with a letter, letters/digits only.'); return; }
    var size = Math.max(4, Math.min(128, parseInt(el.newSizeInput.value, 10) || 100));
    newMonster(key, size);
  });
  el.duplicateBtn.addEventListener('click', function(){
    if(!state.key) return;
    var name = prompt('New key for the duplicate:', state.key + 'Copy');
    if(!name || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) return;
    state.key = name;
    addSelectOption(name);
    el.monsterSelect.value = name;
    status('Duplicated as "' + name + '" -- remember to save it.');
  });
  el.resizeBtn.addEventListener('click', function(){
    var size = parseInt(prompt('New grid size:', state.size), 10);
    if(!size || size < 4 || size > 128) return;
    pushUndo();
    resizeGrid(size);
    render();
  });

  el.refFileInput.addEventListener('change', function(){
    var file = el.refFileInput.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(){
      var img = new Image();
      img.onload = function(){
        state.ref.url = reader.result;
        state.ref.naturalW = img.naturalWidth;
        state.ref.naturalH = img.naturalHeight;
        state.ref.x = 20; state.ref.y = 20; state.ref.scale = 1;
        el.refImg.src = reader.result;
        syncScaleUI();
        renderRef();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
  el.refOpacity.addEventListener('input', function(){
    state.ref.opacity = el.refOpacity.value / 100;
    el.refOpacityVal.textContent = el.refOpacity.value + '%';
    renderRef();
  });
  el.refScale.addEventListener('input', function(){
    state.ref.scale = el.refScale.value / 100;
    el.refScaleNum.value = el.refScale.value;
    renderRef();
  });
  el.refScaleNum.addEventListener('input', function(){
    var v = parseFloat(el.refScaleNum.value);
    if(isNaN(v) || v <= 0) return;
    state.ref.scale = v / 100;
    el.refScale.value = Math.round(v);
    renderRef();
  });
  el.refResetBtn.addEventListener('click', function(){
    state.ref.x = 20; state.ref.y = 20; state.ref.scale = 1;
    syncScaleUI();
    renderRef();
  });
  el.refClearBtn.addEventListener('click', function(){
    state.ref.url = null;
    el.refImg.src = '';
    renderRef();
  });

  function nudgeRef(dx, dy){
    if(!state.ref.url) return;
    state.ref.x += dx; state.ref.y += dy;
    renderRef();
  }
  // press-and-hold repeat: nudge once immediately, then keep nudging
  // (accelerating a little) for as long as the button stays pressed
  function wireHoldNudge(btn, dx, dy){
    var timeout = null, interval = null, elapsed = 0;
    function stop(){
      clearTimeout(timeout); clearInterval(interval);
      timeout = null; interval = null; elapsed = 0;
    }
    function start(e){
      if(e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      nudgeRef(dx, dy);
      timeout = setTimeout(function(){
        interval = setInterval(function(){
          elapsed += 1;
          var step = elapsed > 20 ? 4 : (elapsed > 8 ? 2 : 1);
          nudgeRef(dx * step, dy * step);
        }, 40);
      }, 300);
    }
    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseup', stop);
    btn.addEventListener('mouseleave', stop);
    btn.addEventListener('touchstart', start, { passive: false });
    btn.addEventListener('touchend', stop);
    btn.addEventListener('touchcancel', stop);
  }
  wireHoldNudge(el.nudgeUp, 0, -1);
  wireHoldNudge(el.nudgeDown, 0, 1);
  wireHoldNudge(el.nudgeLeft, -1, 0);
  wireHoldNudge(el.nudgeRight, 1, 0);
  window.addEventListener('keydown', function(e){
    if(!state.ref.url) return;
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    var step = e.shiftKey ? 10 : 1;
    if(e.key === 'ArrowUp'){ nudgeRef(0, -step); e.preventDefault(); }
    else if(e.key === 'ArrowDown'){ nudgeRef(0, step); e.preventDefault(); }
    else if(e.key === 'ArrowLeft'){ nudgeRef(-step, 0); e.preventDefault(); }
    else if(e.key === 'ArrowRight'){ nudgeRef(step, 0); e.preventDefault(); }
  });

  /* ---------------- auto-trace: sample the aligned reference image into
     the grid, then reduce to a small palette via k-means, so a rough pass
     can be generated automatically before hand touch-up. ---------------- */
  function kmeansQuantize(samples, k){
    // samples: array of [r,g,b]. Seed centers evenly spread through the
    // sorted-by-luminance samples so we don't get unlucky with all-random
    // picks landing on near-duplicate colors.
    var sorted = samples.slice().sort(function(a, b){
      return (a[0]*0.3+a[1]*0.59+a[2]*0.11) - (b[0]*0.3+b[1]*0.59+b[2]*0.11);
    });
    var centers = [];
    for(var i = 0; i < k; i++){
      centers.push(sorted[Math.floor(i * sorted.length / k)].slice());
    }
    var assign = new Array(samples.length).fill(0);
    for(var iter = 0; iter < 8; iter++){
      for(var s = 0; s < samples.length; s++){
        var best = 0, bestDist = Infinity;
        for(var c = 0; c < centers.length; c++){
          var dr = samples[s][0]-centers[c][0], dg = samples[s][1]-centers[c][1], db = samples[s][2]-centers[c][2];
          var dist = dr*dr+dg*dg+db*db;
          if(dist < bestDist){ bestDist = dist; best = c; }
        }
        assign[s] = best;
      }
      var sums = centers.map(function(){ return [0,0,0,0]; });
      for(var s2 = 0; s2 < samples.length; s2++){
        var a = assign[s2], sm = sums[a];
        sm[0] += samples[s2][0]; sm[1] += samples[s2][1]; sm[2] += samples[s2][2]; sm[3]++;
      }
      centers = centers.map(function(old, ci){
        var sm = sums[ci];
        if(sm[3] === 0) return old;
        return [Math.round(sm[0]/sm[3]), Math.round(sm[1]/sm[3]), Math.round(sm[2]/sm[3])];
      });
    }
    return { centers: centers, assign: assign };
  }
  function toHex(rgb){
    return '#' + rgb.map(function(v){ return Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0'); }).join('');
  }
  var KEY_POOL = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');

  // Post-quantization cleanup: raw per-pixel nearest-centroid assignment
  // leaves "salt and pepper" speckle wherever the source photo had fine
  // gradient noise (this is what made traces feel photographic/muddy
  // instead of like clean pixel art -- e.g. the slime's eye highlight).
  // For each cell, if an OVERWHELMING majority (6+ of 8 neighbors) of its
  // neighborhood disagrees with it, snap it to that majority. A real
  // edge/detail pixel never has a 6+/8 majority against it, so this only
  // removes true isolated noise, not intentional small details.
  function despeckle(grid, size, passes){
    for(var p = 0; p < passes; p++){
      var next = grid.map(function(row){ return row.slice(); });
      for(var y = 0; y < size; y++){
        for(var x = 0; x < size; x++){
          var counts = {};
          var self = grid[y][x];
          for(var dy = -1; dy <= 1; dy++){
            for(var dx = -1; dx <= 1; dx++){
              if(dx === 0 && dy === 0) continue;
              var nx = x + dx, ny = y + dy;
              if(nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
              var v = grid[ny][nx];
              counts[v] = (counts[v] || 0) + 1;
            }
          }
          var bestKey = self, bestCount = counts[self] || 0;
          Object.keys(counts).forEach(function(k){ if(counts[k] > bestCount){ bestCount = counts[k]; bestKey = k; } });
          if(bestKey !== self && bestCount >= 6) next[y][x] = bestKey;
        }
      }
      grid = next;
    }
    return grid;
  }

  el.autoTraceBtn.addEventListener('click', function(){
    if(!state.key){ status('Load or create a monster first.'); return; }
    if(!state.ref.url){ status('Load a reference image first.'); return; }
    if(!confirm('This replaces the current pixels with an auto-traced version of the reference image. Continue?')) return;

    var size = state.size, cellPx = state.cellPx;
    var sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = size; sampleCanvas.height = size;
    var sctx = sampleCanvas.getContext('2d');
    sctx.imageSmoothingEnabled = true;
    var cellImgSize = cellPx / state.ref.scale;
    var inBounds = [];
    for(var gy = 0; gy < size; gy++){
      inBounds.push([]);
      for(var gx = 0; gx < size; gx++){
        var stagePx = gx * cellPx, stagePy = gy * cellPx;
        var imgX = (stagePx - state.ref.x) / state.ref.scale;
        var imgY = (stagePy - state.ref.y) / state.ref.scale;
        var ok = imgX >= 0 && imgY >= 0 && imgX + cellImgSize <= state.ref.naturalW && imgY + cellImgSize <= state.ref.naturalH;
        inBounds[gy].push(ok);
        if(ok){
          try{ sctx.drawImage(el.refImg, imgX, imgY, cellImgSize, cellImgSize, gx, gy, 1, 1); }catch(e){}
        }
      }
    }
    var data = sctx.getImageData(0, 0, size, size).data;
    var samples = [], sampleIdx = [];
    var edgeVotes = {};
    function colKey(r,g,b){ return r+','+g+','+b; }
    for(var y = 0; y < size; y++){
      for(var x = 0; x < size; x++){
        var i = (y*size+x)*4;
        var alpha = data[i+3];
        if(!inBounds[y][x] || alpha < 20) continue;
        samples.push([data[i], data[i+1], data[i+2]]);
        sampleIdx.push(y*size+x);
        if(x === 0 || y === 0 || x === size-1 || y === size-1){
          var ck = colKey(data[i],data[i+1],data[i+2]);
          edgeVotes[ck] = (edgeVotes[ck]||0) + 1;
        }
      }
    }
    if(samples.length < 4){ status('Reference image is not aligned over the grid -- position it first.'); return; }
    var k = Math.max(2, Math.min(32, parseInt(el.autoTraceColors.value, 10) || 16));
    var result = kmeansQuantize(samples, k);

    // whichever cluster the most border pixels land in is treated as the
    // background color and becomes '.' instead of a painted cell
    var borderCount = new Array(result.centers.length).fill(0);
    for(var s = 0; s < samples.length; s++){
      var idx = sampleIdx[s];
      var yy = Math.floor(idx/size), xx = idx%size;
      if(xx===0||yy===0||xx===size-1||yy===size-1) borderCount[result.assign[s]]++;
    }
    var bgCluster = borderCount.indexOf(Math.max.apply(null, borderCount));

    // assign single-char keys, reusing existing palette keys for close
    // color matches so repeated auto-traces don't churn the key set
    var newPalette = {};
    var clusterKey = [];
    var usedKeys = {};
    result.centers.forEach(function(rgb, ci){
      if(ci === bgCluster){ clusterKey.push('.'); return; }
      var hex = toHex(rgb);
      var reuse = Object.keys(state.palette).find(function(k2){
        return state.palette[k2].toLowerCase() === hex.toLowerCase() && !usedKeys[k2];
      });
      var key = reuse || KEY_POOL.find(function(c){ return !usedKeys[c] && c !== '.'; });
      usedKeys[key] = true;
      newPalette[key] = hex;
      clusterKey.push(key);
    });

    var rows = [];
    for(var y2 = 0; y2 < size; y2++) rows.push(new Array(size).fill('.'));
    for(var s2 = 0; s2 < samples.length; s2++){
      var idx2 = sampleIdx[s2];
      var yy2 = Math.floor(idx2/size), xx2 = idx2%size;
      rows[yy2][xx2] = clusterKey[result.assign[s2]];
    }
    rows = despeckle(rows, size, 2);

    // fill tiny ENCLOSED background pockets (a few stray pixels inside a
    // glossy highlight, say, that quantized to the background cluster)
    // with their surrounding color, before the outline pass below -- left
    // alone, each one would get its own little outline ring stamped
    // around it, reading as ugly speckle rather than a clean surface.
    (function fillTinyHoles(){
      var outside = Array.from({length:size},function(){return new Array(size).fill(false);});
      var st = [];
      for(var x=0;x<size;x++){ st.push([x,0]); st.push([x,size-1]); }
      for(var y=0;y<size;y++){ st.push([0,y]); st.push([size-1,y]); }
      while(st.length){
        var p=st.pop(), x=p[0], y=p[1];
        if(x<0||x>=size||y<0||y>=size) continue;
        if(outside[y][x] || rows[y][x]!=='.') continue;
        outside[y][x]=true;
        st.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
      }
      var visited = Array.from({length:size},function(){return new Array(size).fill(false);});
      for(var y2=0;y2<size;y2++){
        for(var x2=0;x2<size;x2++){
          if(rows[y2][x2]!=='.' || outside[y2][x2] || visited[y2][x2]) continue;
          var stack=[[x2,y2]], comp=[];
          visited[y2][x2]=true;
          while(stack.length){
            var q=stack.pop(); comp.push(q);
            [[q[0]+1,q[1]],[q[0]-1,q[1]],[q[0],q[1]+1],[q[0],q[1]-1]].forEach(function(np){
              var nx=np[0], ny=np[1];
              if(nx<0||nx>=size||ny<0||ny>=size) return;
              if(visited[ny][nx]||rows[ny][nx]!=='.'||outside[ny][nx]) return;
              visited[ny][nx]=true; stack.push([nx,ny]);
            });
          }
          if(comp.length <= 8){
            var counts = {};
            comp.forEach(function(pt){
              [[pt[0]+1,pt[1]],[pt[0]-1,pt[1]],[pt[0],pt[1]+1],[pt[0],pt[1]-1]].forEach(function(np){
                var nx=np[0], ny=np[1];
                if(nx<0||nx>=size||ny<0||ny>=size) return;
                var v = rows[ny][nx];
                if(v!=='.') counts[v] = (counts[v]||0)+1;
              });
            });
            var fillKey = null, best = 0;
            Object.keys(counts).forEach(function(k){ if(counts[k]>best){ best=counts[k]; fillKey=k; } });
            if(fillKey) comp.forEach(function(pt){ rows[pt[1]][pt[0]] = fillKey; });
          }
        }
      }
    })();

    // silhouette outline: a photo trace has no crisp graphic edge the way
    // hand-drawn pixel art does, which is a big part of why a trace can
    // read as "photographic/muddy" instead of like pixel art. Stamp a
    // dark outline around the outer silhouette (and around any enclosed
    // background pocket, e.g. an eye) to give it that defined edge.
    var luminance = function(hex){
      var r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
      return 0.3*r+0.59*g+0.11*b;
    };
    var darkestKey = null, darkestLum = 999;
    Object.keys(newPalette).forEach(function(k){
      var lum = luminance(newPalette[k]);
      if(lum < darkestLum){ darkestLum = lum; darkestKey = k; }
    });
    var outlineKey;
    if(darkestKey !== null && darkestLum < 40){
      outlineKey = darkestKey;
    } else {
      outlineKey = KEY_POOL.find(function(c){ return !newPalette[c] && c !== '.'; });
      newPalette[outlineKey] = '#161010';
    }
    var withOutline = rows.map(function(r){ return r.slice(); });
    for(var oy = 0; oy < size; oy++){
      for(var ox = 0; ox < size; ox++){
        if(rows[oy][ox] === '.') continue;
        var borders = (ox===0||rows[oy][ox-1]==='.') || (ox===size-1||rows[oy][ox+1]==='.') ||
                      (oy===0||rows[oy-1][ox]==='.') || (oy===size-1||rows[oy+1][ox]==='.');
        if(borders) withOutline[oy][ox] = outlineKey;
      }
    }
    rows = withOutline;

    pushUndo();
    state.rows = rows.map(function(r){ return r.join(''); });
    state.palette = newPalette;
    state.activeKey = Object.keys(state.palette)[0] || null;
    renderPalette();
    render();
    status('Auto-traced with ' + Object.keys(newPalette).length + ' colors. Clean up the result by hand as needed.');
  });

  el.zoomRange.addEventListener('input', function(){
    state.cellPx = parseInt(el.zoomRange.value, 10);
    el.zoomVal.textContent = state.cellPx + 'px/cell';
    render();
  });
  el.gridLinesToggle.addEventListener('change', function(){
    state.gridLines = el.gridLinesToggle.checked;
    render();
  });
  el.mirrorXToggle.addEventListener('change', function(){
    state.mirrorX = el.mirrorXToggle.checked;
  });

  var stageWrap = document.querySelector('.tool-stage-wrap');
  document.querySelectorAll('#bgSwatches button').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('#bgSwatches button').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      stageWrap.classList.remove('bg-black', 'bg-white', 'bg-red', 'bg-magenta');
      var bg = btn.dataset.bg;
      if(bg !== 'checker') stageWrap.classList.add('bg-' + bg);
    });
  });

  el.addPaletteBtn.addEventListener('click', function(){
    var k = el.newPaletteKey.value.trim();
    if(k.length !== 1 || k === '.'){ status('Palette key must be exactly one character (not ".").'); return; }
    if(state.palette[k]){ status('Key "' + k + '" is already in the palette.'); return; }
    state.palette[k] = el.newPaletteColor.value;
    state.activeKey = k;
    el.newPaletteKey.value = '';
    renderPalette();
  });

  el.genCodeBtn.addEventListener('click', function(){
    if(!state.key){ status('Load or create a monster first.'); return; }
    el.codeOutput.value = generateCode();
  });
  el.copyCodeBtn.addEventListener('click', function(){
    if(!el.codeOutput.value) el.codeOutput.value = generateCode();
    el.codeOutput.select();
    navigator.clipboard && navigator.clipboard.writeText(el.codeOutput.value).catch(function(){
      document.execCommand('copy');
    });
    status('Code copied to clipboard.');
  });

  el.saveToFileBtn.addEventListener('click', function(){
    if(!state.key){ status('Load or create a monster first.'); return; }
    var code = generateCode();
    status('Saving...');
    fetch('/api/tool/save-sprite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: state.key, code: code })
    }).then(function(r){ return r.json(); }).then(function(data){
      if(data.ok){
        window.MONSTERS[state.key] = { palette: Object.assign({}, state.palette), rows: state.rows.slice() };
        addSelectOption(state.key);
        status('Saved "' + state.key + '" into sprites.js (' + data.mode + '). Reload the game to see it live.');
      } else {
        status('Save failed: ' + data.error);
      }
    }).catch(function(e){ status('Save failed: ' + e.message); });
  });

  /* ---------------- boot ---------------- */
  populateMonsterSelect();
  render();

  // Scripting hook for batch reference-tracing work (upload a bunch of
  // reference images without hand-driving the UI for each one). Harmless
  // in normal use -- just exposes the same actions the buttons call.
  window.__tool = {
    loadMonster: loadMonster,
    newMonster: newMonster,
    resizeGrid: function(size){ pushUndo(); resizeGrid(size); render(); },
    setRefFromDataUrl: function(dataUrl, naturalW, naturalH){
      state.ref.url = dataUrl;
      state.ref.naturalW = naturalW; state.ref.naturalH = naturalH;
      state.ref.x = 0; state.ref.y = 0; state.ref.scale = 1;
      el.refImg.src = dataUrl;
      syncScaleUI();
      renderRef();
    },
    fitRefToCanvas: function(){
      var canvasPx = state.size * state.cellPx;
      var scale = Math.min(canvasPx / state.ref.naturalW, canvasPx / state.ref.naturalH);
      state.ref.scale = scale;
      state.ref.x = (canvasPx - state.ref.naturalW * scale) / 2;
      state.ref.y = (canvasPx - state.ref.naturalH * scale) / 2;
      syncScaleUI();
      renderRef();
    },
    autoTrace: function(colors){
      el.autoTraceColors.value = colors || 16;
      var origConfirm = window.confirm;
      window.confirm = function(){ return true; };
      el.autoTraceBtn.click();
      window.confirm = origConfirm;
      return status;
    },
    getRowsAndPalette: function(){ return { rows: state.rows.slice(), palette: Object.assign({}, state.palette) }; },
    setRowsAndPalette: function(rows, palette){
      pushUndo();
      state.rows = rows.slice();
      state.palette = Object.assign({}, palette);
      state.activeKey = Object.keys(state.palette)[0] || null;
      renderPalette();
      render();
    },
    eraseCells: function(points){
      pushUndo();
      points.forEach(function(p){ setCell(p[0], p[1], '.'); });
      render();
    },
    saveToFile: function(){
      return fetch('/api/tool/save-sprite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: state.key, code: generateCode() })
      }).then(function(r){ return r.json(); }).then(function(data){
        if(data.ok) window.MONSTERS[state.key] = { palette: Object.assign({}, state.palette), rows: state.rows.slice() };
        return data;
      });
    },
    getStatus: function(){ return el.statusLine.textContent; }
  };
})();
