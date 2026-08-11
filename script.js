(function(){
  'use strict';

  const CHARSETS = {
    dense:   " .'`^\",:;Il!i><~+_-?][}{1)(|\\\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
    blocks:  ' ░▒▓█',
    minimal: ' .:-=+*#%@',
    binary:  ' █'
  };

  const els = {
    drop: document.getElementById('drop'),
    fileInput: document.getElementById('fileInput'),
    thumb: document.getElementById('thumb'),
    cols: document.getElementById('cols'),
    colsVal: document.getElementById('colsVal'),
    fitMethod: document.getElementById('fitMethod'),
    charset: document.getElementById('charset'),
    customCharset: document.getElementById('customCharset'),
    charsetPreview: document.getElementById('charsetPreview'),
    contrast: document.getElementById('contrast'),
    contrastVal: document.getElementById('contrastVal'),
    invertToggle: document.getElementById('invertToggle'),
    colorToggle: document.getElementById('colorToggle'),
    animToggle: document.getElementById('animToggle'),
    animBadge: document.getElementById('animBadge'),
    waveMode: document.getElementById('waveMode'),
    amplitude: document.getElementById('amplitude'),
    ampVal: document.getElementById('ampVal'),
    speed: document.getElementById('speed'),
    speedVal: document.getElementById('speedVal'),
    frequency: document.getElementById('frequency'),
    freqVal: document.getElementById('freqVal'),
    phase: document.getElementById('phase'),
    phaseVal: document.getElementById('phaseVal'),
    rotateX: document.getElementById('rotateX'),
    rotateXVal: document.getElementById('rotateXVal'),
    rotateXField: document.getElementById('rotateXField'),
    rotateY: document.getElementById('rotateY'),
    rotateYVal: document.getElementById('rotateYVal'),
    rotateYField: document.getElementById('rotateYField'),
    rippleToggle: document.getElementById('rippleToggle'),
    rippleStrength: document.getElementById('rippleStrength'),
    rippleStrengthVal: document.getElementById('rippleStrengthVal'),
    plasmaToggle: document.getElementById('plasmaToggle'),
    plasmaBadge: document.getElementById('plasmaBadge'),
    plasmaPalette: document.getElementById('plasmaPalette'),
    plasmaScale: document.getElementById('plasmaScale'),
    plasmaScaleVal: document.getElementById('plasmaScaleVal'),
    plasmaSpeed: document.getElementById('plasmaSpeed'),
    plasmaSpeedVal: document.getElementById('plasmaSpeedVal'),
    plasmaCols: document.getElementById('plasmaCols'),
    plasmaColsVal: document.getElementById('plasmaColsVal'),
    plasmaRows: document.getElementById('plasmaRows'),
    plasmaRowsVal: document.getElementById('plasmaRowsVal'),
    plasmaRunBtn: document.getElementById('plasmaRunBtn'),
    runBtn: document.getElementById('runBtn'),
    canvasWrap: document.getElementById('canvasWrap'),
    canvas: document.getElementById('asciiCanvas'),
    placeholder: document.getElementById('placeholder'),
    copyBtn: document.getElementById('copyBtn'),
    downloadTxt: document.getElementById('downloadTxt'),
    downloadPng: document.getElementById('downloadPng'),
    exportGif: document.getElementById('exportGif'),
    gifDuration: document.getElementById('gifDuration'),
    gifDurationVal: document.getElementById('gifDurationVal'),
    costStrip: document.getElementById('costStrip'),
    costVal: document.getElementById('costVal'),
    costLabel: document.getElementById('costLabel'),
    costBar: document.getElementById('costBar'),
    costLog: document.getElementById('costLog')
  };

  const ctx = els.canvas.getContext('2d', { alpha:false });

  let sourceImg = null;
  let invert = false;
  let colorGlyphs = false;
  let animEnabled = false;
  let lastResult = null;
  let animationId = null;
  let animationStart = 0;
  let renderMetrics = null;
  let mouseRipplesEnabled = true;
  let ripples = [];
  let lastPointer = null;
  let pointerDown = false;
  let rippleAnimationId = null;
  let rippleLastTime = 0;
  let plasmaEnabled = false;
  let plasmaMode = 'standalone'; // 'standalone' | 'overlay'
  let fittedGridSnapshot = null; // {cols, rowsN, chars:[[...]]} captured after an image fit

  function clamp01(v){
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function nextFrame(){
    return new Promise(resolve => requestAnimationFrame(resolve));
  }

  function logLine(text){
    const d = document.createElement('div');
    d.textContent = '> ' + text;
    els.costLog.appendChild(d);
    els.costLog.scrollTop = els.costLog.scrollHeight;
  }

  function getActiveCharset(){
    const preset = CHARSETS[els.charset.value];
    if(els.charset.value === 'custom'){
      const custom = els.customCharset.value.replace(/\s+/g, ' ').trim();
      return custom || CHARSETS.minimal;
    }
    return preset || CHARSETS.dense;
  }

  function refreshCharsetPreview(){
    els.charsetPreview.textContent = getActiveCharset();
  }

  function updateCustomCharsetVisibility(){
    const isCustom = els.charset.value === 'custom';
    els.customCharset.hidden = !isCustom;
    refreshCharsetPreview();
  }

  function setStatusForNewSource(){
    stopAnimation();
    stopRippleAnimation();
    ripples = [];
    lastPointer = null;
    lastResult = null;
    renderMetrics = null;
    plasmaEnabled = false;
    fittedGridSnapshot = null;
    els.plasmaToggle.classList.remove('on');
    els.plasmaBadge.textContent = 'off';
    els.plasmaBadge.classList.remove('active');
    els.canvas.hidden = true;
    els.canvas.width = 1;
    els.canvas.height = 1;
    els.placeholder.style.display = 'block';
    els.costStrip.classList.remove('show');
    els.copyBtn.disabled = true;
    els.downloadTxt.disabled = true;
    els.downloadPng.disabled = true;
    els.exportGif.disabled = true;
  }

  const PLASMA_PALETTES = {
    classic: [[40,60,255],[0,220,255],[70,230,110],[255,220,60],[255,70,60],[230,80,255]],
    fire:    [[15,4,2],[90,10,4],[190,55,6],[255,130,10],[255,205,60],[255,250,210]],
    mono:    [[8,26,10],[30,80,34],[70,140,64],[120,200,104],[175,255,150],[220,255,205]],
    ocean:   [[4,10,38],[8,42,92],[10,95,138],[18,150,178],[70,205,205],[190,245,232]]
  };

  function plasmaValue(x,y,time,scale,speed){
    const v = Math.sin(x*0.2*scale + time*speed) +
              Math.sin(y*0.15*scale + time*1.3*speed) +
              Math.sin((x+y)*0.1*scale + time*0.7*speed) +
              Math.sin(Math.sqrt(x*x+y*y)*0.1*scale - time*speed);
    return clamp01((v + 4) / 8);
  }

  function updatePlasmaGrid(time){
    if(!plasmaEnabled || !lastResult) return;

    const palette = PLASMA_PALETTES[els.plasmaPalette.value] || PLASMA_PALETTES.classic;
    const scale = parseFloat(els.plasmaScale.value);
    const speed = parseFloat(els.plasmaSpeed.value);
    const useOwnChars = plasmaMode === 'standalone';
    const chars = useOwnChars ? Array.from(getActiveCharset()) : null;

    for(let y=0;y<lastResult.rowsN;y++){
      const row = lastResult.rows[y];

      for(let x=0;x<lastResult.cols;x++){
        const v = plasmaValue(x,y,time,scale,speed);
        const colorIdx = Math.max(0,Math.min(palette.length-1,Math.floor(v*(palette.length-1))));
        const [r,g,b] = palette[colorIdx];

        const cell = row[x];
        cell.r = r; cell.g = g; cell.b = b;

        /*
          Overlay mode never touches cell.char — the shape came from the
          image fit and stays exactly as fitted. Only color animates.
        */
        if(useOwnChars){
          const charIdx = Math.max(0,Math.min(chars.length-1,Math.floor(v*(chars.length-1))));
          cell.char = chars[charIdx];
        }
      }
    }
  }

  function runPlasma(){
    stopAnimation();

    let cols, rows;

    if(fittedGridSnapshot){
      plasmaMode = 'overlay';
      cols = fittedGridSnapshot.cols;
      rows = fittedGridSnapshot.rowsN;
    }else{
      plasmaMode = 'standalone';
      cols = parseInt(els.plasmaCols.value,10);
      rows = parseInt(els.plasmaRows.value,10);
    }

    const rowsArr = new Array(rows);
    for(let y=0;y<rows;y++){
      const rowArr = new Array(cols);
      for(let x=0;x<cols;x++){
        const ch = plasmaMode === 'overlay' ? fittedGridSnapshot.chars[y][x] : ' ';
        rowArr[x] = {char:ch,r:0,g:0,b:0};
      }
      rowsArr[y] = rowArr;
    }

    lastResult = { rows: rowsArr, cols, rowsN: rows };
    plasmaEnabled = true;
    els.plasmaToggle.classList.add('on');
    els.plasmaBadge.textContent = plasmaMode === 'overlay' ? 'on · overlay' : 'on · standalone';
    els.plasmaBadge.classList.add('active');

    els.placeholder.style.display = 'none';
    els.costStrip.classList.remove('show');

    if(!colorGlyphs){
      colorGlyphs = true;
      els.colorToggle.classList.add('on');
    }

    updatePlasmaGrid(0);
    setupCanvasMetrics();
    renderFrame(0);

    els.copyBtn.disabled = false;
    els.downloadTxt.disabled = false;
    els.downloadPng.disabled = false;
    els.exportGif.disabled = false;

    if(!animEnabled){
      animEnabled = true;
      els.animToggle.classList.add('on');
      els.animBadge.textContent = 'on';
      els.animBadge.classList.add('active');
    }

    startAnimation();
  }

  els.plasmaToggle.addEventListener('click', () => {
    if(!plasmaEnabled){
      runPlasma();
      return;
    }

    plasmaEnabled = false;
    els.plasmaToggle.classList.remove('on');
    els.plasmaBadge.textContent = 'off';
    els.plasmaBadge.classList.remove('active');

    if(!animEnabled) stopAnimation();
    renderFrame(0);

    els.exportGif.disabled = (!animEnabled && !plasmaEnabled) || !lastResult;
  });

  els.plasmaScale.addEventListener('input', () => {
    els.plasmaScaleVal.textContent = parseFloat(els.plasmaScale.value).toFixed(1);
  });
  els.plasmaSpeed.addEventListener('input', () => {
    els.plasmaSpeedVal.textContent = parseFloat(els.plasmaSpeed.value).toFixed(1);
  });
  els.plasmaCols.addEventListener('input', () => {
    els.plasmaColsVal.textContent = els.plasmaCols.value;
  });
  els.plasmaRows.addEventListener('input', () => {
    els.plasmaRowsVal.textContent = els.plasmaRows.value;
  });

  els.plasmaRunBtn.addEventListener('click', runPlasma);

  els.gifDuration.addEventListener('input', () => {
    els.gifDurationVal.textContent = els.gifDuration.value + 's';
  });

  els.cols.addEventListener('input', () => {
    els.colsVal.textContent = els.cols.value;
  });

  els.contrast.addEventListener('input', () => {
    els.contrastVal.textContent = parseFloat(els.contrast.value).toFixed(2);
  });

  els.charset.addEventListener('change', updateCustomCharsetVisibility);
  els.customCharset.addEventListener('input', refreshCharsetPreview);

  els.amplitude.addEventListener('input', () => {
    els.ampVal.textContent = parseFloat(els.amplitude.value).toFixed(1);
  });

  els.speed.addEventListener('input', () => {
    els.speedVal.textContent = parseFloat(els.speed.value).toFixed(1);
  });

  els.frequency.addEventListener('input', () => {
    els.freqVal.textContent = parseFloat(els.frequency.value).toFixed(2);
  });

  els.phase.addEventListener('input', () => {
    els.phaseVal.textContent = parseFloat(els.phase.value).toFixed(2);
  });

  els.rotateX.addEventListener('input', () => {
    els.rotateXVal.textContent = parseFloat(els.rotateX.value).toFixed(1);
  });

  els.rotateY.addEventListener('input', () => {
    els.rotateYVal.textContent = parseFloat(els.rotateY.value).toFixed(1);
  });

  function updateRotateFieldVisibility(){
    const show = els.waveMode.value === 'perspective3d';
    els.rotateXField.style.display = show ? '' : 'none';
    els.rotateYField.style.display = show ? '' : 'none';
  }
  els.waveMode.addEventListener('change', updateRotateFieldVisibility);
  updateRotateFieldVisibility();

  els.rippleStrength.addEventListener('input', () => {
    els.rippleStrengthVal.textContent = parseFloat(els.rippleStrength.value).toFixed(1);
  });

  els.rippleToggle.addEventListener('click', () => {
    mouseRipplesEnabled = !mouseRipplesEnabled;
    els.rippleToggle.classList.toggle('on', mouseRipplesEnabled);
    if(!mouseRipplesEnabled){
      ripples = [];
      lastPointer = null;
      stopRippleAnimation();
      renderFrame(0);
    }
  });

  els.invertToggle.addEventListener('click', () => {
    invert = !invert;
    els.invertToggle.classList.toggle('on', invert);
    if(lastResult) renderFrame(0);
  });

  els.colorToggle.addEventListener('click', () => {
    colorGlyphs = !colorGlyphs;
    els.colorToggle.classList.toggle('on', colorGlyphs);
    if(lastResult) renderFrame(0);
  });

  els.animToggle.addEventListener('click', () => {
    animEnabled = !animEnabled;
    els.animToggle.classList.toggle('on', animEnabled);
    els.animBadge.textContent = animEnabled ? 'on' : 'off';
    els.animBadge.classList.toggle('active', animEnabled);
    els.exportGif.disabled = (!animEnabled && !plasmaEnabled) || !lastResult;

    if(animEnabled && lastResult){
      startAnimation();
    }else if(!animEnabled){
      stopAnimation();
      renderFrame(0);
    }
  });

  [els.waveMode, els.amplitude, els.speed, els.frequency, els.phase, els.rotateX, els.rotateY].forEach(el => {
    el.addEventListener('input', () => {
      if(animEnabled && lastResult) startAnimation();
    });
    el.addEventListener('change', () => {
      if(animEnabled && lastResult) startAnimation();
    });
  });

  els.drop.addEventListener('click', () => els.fileInput.click());

  els.drop.addEventListener('dragover', e => {
    e.preventDefault();
    els.drop.classList.add('drag');
  });

  els.drop.addEventListener('dragleave', () => {
    els.drop.classList.remove('drag');
  });

  els.drop.addEventListener('drop', e => {
    e.preventDefault();
    els.drop.classList.remove('drag');
    if(e.dataTransfer.files && e.dataTransfer.files[0]){
      loadFile(e.dataTransfer.files[0]);
    }
  });

  els.fileInput.addEventListener('change', e => {
    if(e.target.files && e.target.files[0]){
      loadFile(e.target.files[0]);
    }
  });

  function loadFile(file){
    if(!file.type.startsWith('image/')) return;

    const reader = new FileReader();

    reader.onload = ev => {
      const img = new Image();

      img.onload = () => {
        sourceImg = img;
        els.thumb.src = ev.target.result;
        els.thumb.style.display = 'block';
        els.runBtn.disabled = false;
        setStatusForNewSource();
      };

      img.src = ev.target.result;
    };

    reader.readAsDataURL(file);
  }

  function buildGlyphAtlas(chars, cellW, cellH){
    const atlas = Object.create(null);
    const c = document.createElement('canvas');
    c.width = cellW;
    c.height = cellH;

    const cctx = c.getContext('2d', { willReadFrequently:true });
    const fontSize = Math.floor(cellH * 1.15);

    cctx.textBaseline = 'middle';
    cctx.textAlign = 'center';
    cctx.font = `${fontSize}px "IBM Plex Mono", monospace`;

    for(const ch of chars){
      cctx.fillStyle = '#000';
      cctx.fillRect(0,0,cellW,cellH);

      cctx.fillStyle = '#fff';
      cctx.fillText(ch, cellW / 2, cellH / 2 + 1);

      const data = cctx.getImageData(0,0,cellW,cellH).data;
      const lum = new Float32Array(cellW * cellH);

      for(let i=0,p=0;i<data.length;i+=4,p++){
        lum[p] = data[i] / 255;
      }

      atlas[ch] = { lum };
    }

    return atlas;
  }

  async function runFit(){
    if(!sourceImg) return;

    plasmaEnabled = false;
    fittedGridSnapshot = null;
    els.plasmaToggle.classList.remove('on');
    els.plasmaBadge.textContent = 'off';
    els.plasmaBadge.classList.remove('active');

    stopAnimation();
    els.runBtn.disabled = true;
    els.placeholder.style.display = 'none';
    els.costStrip.classList.add('show');
    els.costLog.innerHTML = '';
    els.costBar.style.width = '0%';

    const method = els.fitMethod.value; // 'gradient' | 'traditional'
    els.costLabel.textContent = method === 'gradient' ? 'mean reconstruction error' : 'mean ramp deviation';

    const cols = parseInt(els.cols.value,10);
    const charAspect = 0.52;
    const srcAspect = sourceImg.width / sourceImg.height;

    let rows = Math.max(1, Math.round((cols * charAspect) / srcAspect));
    rows = Math.min(rows,260);

    /*
      Matching resolution is deliberately small.
      The expensive part is fitting, not rendering.
    */
    const cellPx = 10;
    const cellW = Math.round(cellPx * charAspect * 2);
    const cellH = cellPx * 2;

    const chars = Array.from(getActiveCharset());

    /*
      Traditional mode skips glyph rasterization/comparison entirely.
      It's the classic approach: average the luminance of each cell and
      index straight into a light->dark character ramp. Much cheaper,
      no per-glyph error minimization.
    */
    let atlas = null;
    if(method === 'gradient'){
      logLine(`atlas: rasterizing ${chars.length} candidate glyphs at ${cellW}×${cellH}px`);
      atlas = buildGlyphAtlas(chars,cellW,cellH);
      await nextFrame();
    }else{
      logLine(`traditional: mapping cell brightness onto a ${chars.length}-level ramp`);
      await nextFrame();
    }

    const work = document.createElement('canvas');
    work.width = cols * cellW;
    work.height = rows * cellH;

    const wctx = work.getContext('2d',{willReadFrequently:true});
    wctx.imageSmoothingEnabled = true;
    wctx.drawImage(sourceImg,0,0,work.width,work.height);

    const imgData = wctx.getImageData(0,0,work.width,work.height).data;
    const contrast = parseFloat(els.contrast.value);

    const result = new Array(rows);
    let totalError = 0;
    let cellCount = 0;

    logLine(method === 'gradient'
      ? `descent: minimizing per-cell reconstruction error over ${cols}×${rows} grid`
      : `ramp: sampling mean brightness over ${cols}×${rows} grid`);
    await nextFrame();

    for(let ry=0;ry<rows;ry++){
      const rowArr = new Array(cols);

      for(let rx=0;rx<cols;rx++){
        const patch = method === 'gradient' ? new Float32Array(cellW * cellH) : null;
        let sumR=0,sumG=0,sumB=0,sumL=0;

        const baseX = rx * cellW;
        const baseY = ry * cellH;

        for(let y=0;y<cellH;y++){
          for(let x=0;x<cellW;x++){
            const idx = ((baseY+y) * work.width + (baseX+x)) * 4;
            const r = imgData[idx];
            const g = imgData[idx+1];
            const b = imgData[idx+2];

            let l = (0.299*r + 0.587*g + 0.114*b) / 255;
            l = clamp01((l - 0.5) * contrast + 0.5);
            if(invert) l = 1 - l;

            if(patch) patch[y*cellW+x] = l;
            sumL += l;
            sumR += r;
            sumG += g;
            sumB += b;
          }
        }

        const n = cellW * cellH;
        let bestChar = chars[0];
        let bestErr = 0;

        if(method === 'gradient'){
          bestErr = Infinity;

          for(const ch of chars){
            const glyph = atlas[ch].lum;
            let err = 0;

            for(let p=0;p<n;p++){
              const d = patch[p] - glyph[p];
              err += d*d;
            }

            if(err < bestErr){
              bestErr = err;
              bestChar = ch;
            }
          }

          bestErr = bestErr / n;
        }else{
          /*
            Classic ramp mapping: average brightness of the cell picks an
            index straight into the character set, ordered light -> dark.
            Bright cells (l near 1) land on the sparse end, dark cells
            (l near 0) land on the dense end.
          */
          const avgL = sumL / n;
          const idx = Math.max(0, Math.min(chars.length-1, Math.round((1-avgL) * (chars.length-1))));
          bestChar = chars[idx];

          const d = avgL - (1 - idx/(chars.length-1||1));
          bestErr = d*d;
        }

        totalError += bestErr;
        cellCount++;

        rowArr[rx] = {
          char:bestChar,
          r:Math.round(sumR/n),
          g:Math.round(sumG/n),
          b:Math.round(sumB/n)
        };
      }

      result[ry] = rowArr;

      if(ry % 8 === 0 || ry === rows-1){
        const pct = Math.round(((ry+1)/rows)*100);
        const meanErr = totalError / cellCount;

        els.costBar.style.width = pct + '%';
        els.costVal.textContent = meanErr.toFixed(4);

        if(ry % 24 === 0){
          logLine(`row ${ry+1}/${rows} — mean error ${meanErr.toFixed(4)}`);
        }

        await nextFrame();
      }
    }

    const finalError = totalError / cellCount;
    logLine(method === 'gradient'
      ? `converged — final mean reconstruction error ${finalError.toFixed(4)}`
      : `done — final mean ramp deviation ${finalError.toFixed(4)}`);

    lastResult = {
      rows:result,
      cols,
      rowsN:rows
    };

    fittedGridSnapshot = {
      cols,
      rowsN: rows,
      chars: result.map(row => row.map(cell => cell.char))
    };

    setupCanvasMetrics();
    renderFrame(0);

    els.runBtn.disabled = false;
    els.copyBtn.disabled = false;
    els.downloadTxt.disabled = false;
    els.downloadPng.disabled = false;
    els.exportGif.disabled = !animEnabled;

    if(animEnabled) startAnimation();
  }

  /*
    Canvas renderer
    ----------------
    The ASCII is no longer represented by thousands of DOM spans.
    One canvas is drawn per frame. This removes layout/reflow overhead
    and makes wave animation scale much better.
  */
  function setupCanvasMetrics(){
    if(!lastResult) return;

    const cols = lastResult.cols;
    const rows = lastResult.rowsN;

    const fontSize = Math.max(3,Math.min(14,Math.floor(1100 / cols)));
    const charWidth = fontSize * 0.6;
    const lineHeight = fontSize;

    /*
      Extra padding is intentional. It prevents glyph overhang from being
      clipped at either edge, especially with dense character sets.
    */
    const padX = Math.max(8,fontSize);
    const padY = Math.max(8,fontSize);

    const logicalWidth = Math.ceil(cols * charWidth + padX * 2 + fontSize);
    const logicalHeight = Math.ceil(rows * lineHeight + padY * 2 + fontSize);

    const dpr = Math.min(window.devicePixelRatio || 1,2);

    els.canvas.width = Math.ceil(logicalWidth * dpr);
    els.canvas.height = Math.ceil(logicalHeight * dpr);
    els.canvas.style.width = logicalWidth + 'px';
    els.canvas.style.height = logicalHeight + 'px';
    els.canvas.hidden = false;

    renderMetrics = {
      fontSize,
      charWidth,
      lineHeight,
      padX,
      padY,
      logicalWidth,
      logicalHeight,
      dpr
    };
  }

  function getBackground(){
    return invert ? '#f4f1ea' : '#0b0d0a';
  }

  function getDefaultGlyphColor(){
    return invert ? '#10150f' : '#9dff8f';
  }

  /*
    Mouse ripple system
    -------------------
    Ripples are created only by a primary-button click or click-drag over
    the output canvas. Plain mouse movement never creates a ripple. A small
    capped array keeps the per-frame cost predictable.
  */
  function canvasPointerPosition(e){
    if(!renderMetrics) return null;
    const rect = els.canvas.getBoundingClientRect();
    if(rect.width <= 0 || rect.height <= 0) return null;

    return {
      x: (e.clientX - rect.left) * (renderMetrics.logicalWidth / rect.width),
      y: (e.clientY - rect.top) * (renderMetrics.logicalHeight / rect.height)
    };
  }

  function addRipple(x,y,dx,dy){
    const now = performance.now();
    const strength = parseFloat(els.rippleStrength.value);
    const movement = Math.hypot(dx,dy);

    if(movement < 1.5) return;

    ripples.push({
      x,
      y,
      born: now,
      life: 1150,
      strength: Math.min(24, strength * (0.65 + Math.min(movement,24) / 40)),
      seed: Math.random() * Math.PI * 2
    });

    if(ripples.length > 9) ripples.shift();
    startRippleAnimation();
  }

  function startRippleAnimation(){
    if(rippleAnimationId !== null) return;
    rippleLastTime = performance.now();

    function tick(now){
      if(!ripples.length){
        rippleAnimationId = null;
        return;
      }

      const dt = now - rippleLastTime;
      rippleLastTime = now;
      let alive = false;

      ripples = ripples.filter(r => {
        const age = now - r.born;
        const keep = age < r.life;
        if(keep) alive = true;
        return keep;
      });

      if(alive){
        const t = animEnabled && animationStart
          ? (now - animationStart) / 1000
          : 0;
        renderFrame(t, now);
        rippleAnimationId = requestAnimationFrame(tick);
      }else{
        rippleAnimationId = null;
        renderFrame(0);
      }
    }

    rippleAnimationId = requestAnimationFrame(tick);
  }

  function stopRippleAnimation(){
    if(rippleAnimationId !== null){
      cancelAnimationFrame(rippleAnimationId);
      rippleAnimationId = null;
    }
  }

  function getRippleDisplacement(px,py,now){
    if(!mouseRipplesEnabled || !ripples.length) return {dx:0,dy:0};

    let totalX = 0;
    let totalY = 0;

    for(const r of ripples){
      const age = now - r.born;
      if(age < 0 || age > r.life) continue;

      const life = age / r.life;
      const dx = px - r.x;
      const dy = py - r.y;
      const dist = Math.hypot(dx,dy);
      if(dist < 0.001) continue;

      /* Expanding wavefront with a soft annular envelope. */
      const radius = 20 + age * 0.34;
      const ringWidth = 34 + age * 0.012;
      const ring = Math.exp(-Math.pow((dist - radius) / ringWidth, 2));
      const wave = Math.sin((dist - radius) * 0.20 + r.seed);
      const fade = Math.pow(1 - life, 1.7);
      const amount = r.strength * ring * wave * fade;

      totalX += (dx / dist) * amount;
      totalY += (dy / dist) * amount;
    }

    return {
      dx: Math.max(-22,Math.min(22,totalX)),
      dy: Math.max(-22,Math.min(22,totalY))
    };
  }

  els.canvas.addEventListener('pointermove', e => {
    const p = canvasPointerPosition(e);
    if(!p) return;

    // Plain mouse movement does nothing. Ripples are created only while
    // the primary mouse button is held down (click + drag).
    if(mouseRipplesEnabled && pointerDown && lastPointer && lastResult){
      addRipple(p.x,p.y,p.x-lastPointer.x,p.y-lastPointer.y);
    }

    lastPointer = p;
  });

  els.canvas.addEventListener('pointerleave', () => {
    lastPointer = null;
  });

  els.canvas.addEventListener('pointerdown', e => {
    if(e.button !== 0) return;
    pointerDown = true;

    const p = canvasPointerPosition(e);
    if(!p) return;

    lastPointer = p;

    // A click produces one initial ripple. Movement alone never does.
    if(mouseRipplesEnabled && lastResult){
      addRipple(p.x,p.y,8,8);
    }
  });

  els.canvas.addEventListener('pointerup', () => {
    pointerDown = false;
    lastPointer = null;
  });

  els.canvas.addEventListener('pointercancel', () => {
    pointerDown = false;
    lastPointer = null;
  });

  window.addEventListener('pointerup', () => {
    pointerDown = false;
    lastPointer = null;
  });

  function computeWave(col,row,time){
    const mode = els.waveMode.value;
    const amplitude = parseFloat(els.amplitude.value);
    const speed = parseFloat(els.speed.value);
    const frequency = parseFloat(els.frequency.value);
    const phase = parseFloat(els.phase.value);

    const t = time * speed;
    let dx = 0;
    let dy = 0;

    switch(mode){
      case 'horizontal':
        dy = amplitude * Math.sin(col * frequency + t + phase);
        break;

      case 'vertical':
        dx = amplitude * Math.sin(row * frequency + t + phase);
        break;

      case 'water': {
        const a = amplitude * 0.7;
        const b = amplitude * 0.8;
        dx = a * Math.sin(row * frequency * 1.2 + t * 0.9 + phase);
        dy = b * Math.sin(col * frequency + t * 1.2 + phase * 0.7);
        break;
      }

      case 'radial': {
        const cx = lastResult.cols / 2;
        const cy = lastResult.rowsN / 2;
        const vx = col - cx;
        const vy = row - cy;
        const d = Math.hypot(vx,vy) + 0.001;
        const offset = amplitude * 0.8 *
          Math.sin(d * frequency * 1.8 - t * 1.1 + phase);

        dx = offset * vx / d;
        dy = offset * vy / d;
        break;
      }

      case 'turbulence': {
        const a = amplitude * 0.6;
        const f = frequency * 1.4;

        dx = a * Math.sin(col*f + row*f*0.7 + t*1.3 + phase);
        dy = a * Math.cos(row*f*0.8 - col*f*0.5 + t*0.9 + phase*1.2);
        break;
      }

      case 'perspective3d': {
        // Give every glyph a 3D position: (x,y) on a plane, z from a wave.
        // Rotate that point around BOTH the Y axis (spin) and X axis (tilt),
        // then perspective-project back to screen with x'=f*x/z, y'=f*y/z
        // (scale = f/z), so depth changes both position and glyph size.
        const cx = lastResult.cols / 2;
        const cy = lastResult.rowsN / 2;
        const nx = (col - cx) / cx;   // normalized -1..1
        const ny = (row - cy) / cy;   // normalized -1..1

        const z0 = Math.sin(nx * frequency * 3 + t + phase) *
                    Math.cos(ny * frequency * 3 + t * 0.8);

        const rotX = parseFloat(els.rotateX.value);
        const rotY = parseFloat(els.rotateY.value);
        const angleY = t * rotY;
        const angleX = t * rotX;

        // rotate around Y
        const cyA = Math.cos(angleY), syA = Math.sin(angleY);
        const x1 = nx * cyA + z0 * syA;
        const z1 = -nx * syA + z0 * cyA;
        const y1 = ny;

        // rotate around X
        const cxA = Math.cos(angleX), sxA = Math.sin(angleX);
        const y2 = y1 * cxA - z1 * sxA;
        const z2 = y1 * sxA + z1 * cxA;
        const x2 = x1;

        const zr = z2 * 0.6 + 3.2; // camera distance offset, keep zr > 0
        const focal = 3.2;
        const scale = focal / zr;

        const spanX = cx * (amplitude / 6);
        const spanY = cy * (amplitude / 6);

        dx = x2 * spanX * scale - nx * spanX;
        dy = y2 * spanY * scale - ny * spanY;

        return {dx, dy, scale};
      }
    }

    return {dx,dy,scale:1};
  }

  function renderFrame(time, rippleNow = performance.now()){
    if(!lastResult || !renderMetrics) return;

    const m = renderMetrics;
    const dpr = m.dpr;

    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle = getBackground();
    ctx.fillRect(0,0,m.logicalWidth,m.logicalHeight);

    ctx.font = `${m.fontSize}px "IBM Plex Mono", monospace`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.shadowBlur = invert ? 0 : Math.min(6,m.fontSize * 0.8);
    ctx.shadowColor = invert ? 'transparent' : 'rgba(157,255,143,.35)';

    for(let y=0;y<lastResult.rowsN;y++){
      const row = lastResult.rows[y];

      for(let x=0;x<lastResult.cols;x++){
        const cell = row[x];

        let dx = 0;
        let dy = 0;
        let scale = 1;

        if(animEnabled && time !== 0){
          const wave = computeWave(x,y,time);
          dx = wave.dx;
          dy = wave.dy;
          scale = wave.scale ?? 1;
        }

        if(mouseRipplesEnabled && ripples.length){
          const centerX = m.padX + x * m.charWidth + m.charWidth * 0.5;
          const centerY = m.padY + y * m.lineHeight + m.lineHeight * 0.5;
          const ripple = getRippleDisplacement(centerX,centerY,rippleNow);
          dx += ripple.dx;
          dy += ripple.dy;
        }

        if(colorGlyphs){
          ctx.fillStyle = `rgb(${cell.r},${cell.g},${cell.b})`;
        }else{
          ctx.fillStyle = getDefaultGlyphColor();
        }

        const px = m.padX + x * m.charWidth + dx;
        const py = m.padY + y * m.lineHeight + dy;

        if(scale !== 1){
          ctx.save();
          ctx.translate(px, py);
          ctx.scale(scale, scale);
          ctx.fillText(cell.char, 0, 0);
          ctx.restore();
        }else{
          ctx.fillText(cell.char,px,py);
        }
      }
    }

    ctx.shadowBlur = 0;
  }

  function startAnimation(){
    stopAnimation();
    if(!lastResult) return;

    animationStart = performance.now();

    function tick(now){
      if(!animEnabled && !plasmaEnabled) return;

      const elapsed = (now - animationStart) / 1000;
      if(plasmaEnabled) updatePlasmaGrid(elapsed);
      renderFrame(elapsed);
      animationId = requestAnimationFrame(tick);
    }

    animationId = requestAnimationFrame(tick);
  }

  function stopAnimation(){
    if(animationId !== null){
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  function toPlainText(res){
    return res.rows.map(row => row.map(cell => cell.char).join('')).join('\n');
  }

  els.runBtn.addEventListener('click',runFit);

  els.copyBtn.addEventListener('click',async()=>{
    if(!lastResult) return;

    try{
      await navigator.clipboard.writeText(toPlainText(lastResult));
      const original = els.copyBtn.textContent;
      els.copyBtn.textContent = 'copied';
      setTimeout(() => els.copyBtn.textContent = original,1200);
    }catch(err){
      console.error(err);
    }
  });

  els.downloadTxt.addEventListener('click',()=>{
    if(!lastResult) return;

    const blob = new Blob([toPlainText(lastResult)],{type:'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = 'glyphfit-output.txt';
    a.click();

    setTimeout(() => URL.revokeObjectURL(url),1000);
  });

  els.downloadPng.addEventListener('click',()=>{
    if(!lastResult) return;

    /*
      Important: export uses the exact same canvas renderer and dimensions
      as the visible output. No second width calculation, so the right edge
      cannot lose its background or glyphs because of mismatched geometry.
    */
    stopAnimation();

    const wasAnimating = animEnabled;
    const exportTime = wasAnimating && animationStart
      ? (performance.now() - animationStart) / 1000
      : 0;

    renderFrame(exportTime);

    els.canvas.toBlob(blob => {
      if(!blob){
        if(wasAnimating) startAnimation();
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');

      a.href = url;
      a.download = 'glyphfit-output.png';
      a.click();

      setTimeout(() => URL.revokeObjectURL(url),1000);

      if(wasAnimating) startAnimation();
    },'image/png');
  });

  /* Self-contained GIF89a export, sampled from the same canvas renderer.
     The encoder uses conservative literal LZW blocks so exported frames
     decode correctly instead of becoming corrupted/noisy. */
  function buildGifPalette(){
    const palette=[];
    for(let r=0;r<6;r++) for(let g=0;g<6;g++) for(let b=0;b<6;b++)
      palette.push(Math.round(r*255/5),Math.round(g*255/5),Math.round(b*255/5));
    for(let i=0;i<40;i++){ const v=Math.round(i*255/39); palette.push(v,v,v); }
    return palette;
  }

  function nearestGifColor(r,g,b){
    const ri=Math.round(r/51),gi=Math.round(g/51),bi=Math.round(b/51);
    const cr=ri*51,cg=gi*51,cb=bi*51;
    const cubeErr=(r-cr)**2+(g-cg)**2+(b-cb)**2;
    const gray=Math.round((r+g+b)/3),gv=Math.round(gray/255*39),v=Math.round(gv*255/39);
    const grayErr=(r-v)**2+(g-v)**2+(b-v)**2;
    return cubeErr<=grayErr ? ri*36+gi*6+bi : 216+gv;
  }

  function canvasToIndexedFrame(){
    const w=els.canvas.width,h=els.canvas.height,pixels=ctx.getImageData(0,0,w,h).data;
    const indexed=new Uint8Array(w*h);
    for(let i=0,p=0;i<pixels.length;i+=4,p++) indexed[p]=nearestGifColor(pixels[i],pixels[i+1],pixels[i+2]);
    return indexed;
  }

  /*
    GIF LZW encoder
    ---------------
    Keep the LZW stream deliberately conservative. The previous encoder
    allowed the encoder/decoder code-size boundary to drift, which can make
    browsers decode the exported animation as corrupted/noisy pixels.

    We emit literal pixel indices in short blocks. Each block starts with a
    clear code and contains fewer than 512 codes, so the stream stays at the
    initial 9-bit code width. It is larger than a fully compressed LZW stream,
    but it is extremely robust and still practical for a short animation.
  */
  function gifLzwEncode(indexed,minCodeSize=8){
    const clear = 1 << minCodeSize;
    const end = clear + 1;
    const codeSize = minCodeSize + 1; // 9 bits for a 256-color palette
    const blockPixels = 200;          // safely below the 9 -> 10 bit boundary

    const out = [];
    let bitBuffer = 0;
    let bitCount = 0;

    function writeCode(code){
      bitBuffer |= code << bitCount;
      bitCount += codeSize;

      while(bitCount >= 8){
        out.push(bitBuffer & 255);
        bitBuffer >>>= 8;
        bitCount -= 8;
      }
    }

    for(let start=0;start<indexed.length;start+=blockPixels){
      const stop = Math.min(indexed.length,start+blockPixels);

      // Reset the decoder dictionary before each short literal run.
      writeCode(clear);

      for(let i=start;i<stop;i++){
        writeCode(indexed[i]);
      }
    }

    writeCode(end);

    if(bitCount > 0){
      out.push(bitBuffer & 255);
    }

    const blocks = [];

    for(let i=0;i<out.length;i+=255){
      const chunk = out.slice(i,i+255);
      blocks.push(chunk.length,...chunk);
    }

    blocks.push(0);
    return blocks;
  }

  function pushU16(a,n){a.push(n&255,(n>>8)&255);}

  function encodeGif(frames,w,h,delaysCs){
    // delaysCs: either a single number (applied to all frames) or an
    // array with one delay per frame, in 1/100s units.
    const bytes=[],palette=buildGifPalette(); for(const c of 'GIF89a')bytes.push(c.charCodeAt(0));
    pushU16(bytes,w);pushU16(bytes,h);bytes.push(0xF7,0,0);bytes.push(...palette);
    bytes.push(0x21,0xFF,0x0B);for(const c of 'NETSCAPE2.0')bytes.push(c.charCodeAt(0));bytes.push(0x03,0x01,0,0,0);
    frames.forEach((indexed,idx)=>{
      const delayCs = Array.isArray(delaysCs) ? delaysCs[idx] : delaysCs;
      bytes.push(0x21,0xF9,0x04,0x08,delayCs&255,(delayCs>>8)&255,0,0);
      bytes.push(0x2C);pushU16(bytes,0);pushU16(bytes,0);pushU16(bytes,w);pushU16(bytes,h);bytes.push(0,8);
      const imageData = gifLzwEncode(indexed,8);
      for(let i=0;i<imageData.length;i++) bytes.push(imageData[i]);
    });
    bytes.push(0x3B);return new Blob([new Uint8Array(bytes)],{type:'image/gif'});
  }

  async function exportGif(){
    if((!animEnabled && !plasmaEnabled)||!lastResult)return;
    const originalLabel=els.exportGif.textContent;
    stopAnimation();stopRippleAnimation();els.exportGif.disabled=true;
    const oldRipples=ripples;ripples=[];
    const fps=12;
    const userDuration=parseFloat(els.gifDuration.value)||3;
    try{
      /*
        Frame-per-time renderer used for every exported frame. When plasma
        is active this also advances its procedural field (color, and
        char in standalone mode) — not just the wave displacement — so the
        exported gif matches what's animating on screen.
      */
      function renderExportFrame(t){
        if(plasmaEnabled) updatePlasmaGrid(t);
        renderFrame(t,performance.now());
      }

      let forwardFrames;
      let frameCount;

      if(plasmaEnabled){
        /*
          Plasma's field is continuous rather than tied to a single wave
          period, so there's no natural "extremum" to ping-pong against.
          Just render it forward for the chosen duration and loop as-is —
          the sine field already returns close to its start phase.
        */
        frameCount = Math.max(2,Math.round(userDuration*fps));
        forwardFrames = [];

        for(let i=0;i<frameCount;i++){
          renderExportFrame(i/fps);
          forwardFrames.push(canvasToIndexedFrame());
          els.exportGif.textContent=`gif ${i+1}/${frameCount}`;
          await nextFrame();
        }

        const delays=[];
        let prevCs=0;
        for(let i=1;i<=forwardFrames.length;i++){
          const cumulativeCs=Math.round(i*100/fps);
          delays.push(Math.max(2,cumulativeCs-prevCs));
          prevCs=cumulativeCs;
        }

        const blob=encodeGif(forwardFrames,els.canvas.width,els.canvas.height,delays),url=URL.createObjectURL(blob),a=document.createElement('a');
        a.href=url;a.download='glyphfit-plasma.gif';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }else{
        /*
          Build a ping-pong sequence. Two things previously caused a visible
          jump/jitter at the loop point:

          1) The turnaround landed at an arbitrary phase of the wave, so
             reversing direction there was a sudden velocity flip (like a
             ball instantly bouncing mid-flight instead of at its peak).
             Fix: snap the forward clip's duration to the nearest quarter
             period of the base oscillation (2*PI / speed), so the turn
             lands on (or very near) an extremum, where the motion is
             naturally slowing to a stop anyway.

          2) GIF delays are quantized to 1/100s, so a fixed 100/fps delay
             per frame doesn't evenly divide and timing drifts across the
             sequence. Fix: accumulate real elapsed time and derive each
             frame's delay from the rounding error left over from the
             previous frame, instead of reusing one rounded constant.
        */
        const speed=parseFloat(els.speed.value);
        const basePeriod=(2*Math.PI)/Math.max(speed,0.01); // seconds
        const quarter=basePeriod/4;
        const targetDuration=userDuration/2; // full ping-pong round trip ≈ userDuration
        const cycles=Math.max(1,Math.round(targetDuration/quarter));
        const forwardSeconds=cycles*quarter;
        frameCount=Math.max(2,Math.round(forwardSeconds*fps));

        forwardFrames=[];
        for(let i=0;i<frameCount;i++){
          renderExportFrame(i/fps);
          forwardFrames.push(canvasToIndexedFrame());
          els.exportGif.textContent=`gif ${i+1}/${frameCount*2}`;
          await nextFrame();
        }

        const frames=[...forwardFrames];
        /* Exclude both endpoints so no frame is shown twice at the turn/boundary. */
        for(let i=forwardFrames.length-2;i>0;i--){
          frames.push(forwardFrames[i]);
          els.exportGif.textContent=`gif ${frameCount + (forwardFrames.length-1-i)+1}/${frameCount*2-2}`;
          await nextFrame();
        }

        // Evenly distribute rounding error across per-frame delays (in cs)
        // instead of using one constant that drifts over the sequence.
        const delays=[];
        let prevCs=0;
        for(let i=1;i<=frames.length;i++){
          const cumulativeCs=Math.round(i*100/fps);
          delays.push(Math.max(2,cumulativeCs-prevCs));
          prevCs=cumulativeCs;
        }

        const blob=encodeGif(frames,els.canvas.width,els.canvas.height,delays),url=URL.createObjectURL(blob),a=document.createElement('a');
        a.href=url;a.download='glyphfit-wave.gif';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
    }catch(err){console.error('GIF export failed:',err);}
    finally{ripples=oldRipples;els.exportGif.textContent=originalLabel;els.exportGif.disabled=(!animEnabled && !plasmaEnabled)||!lastResult;startAnimation();}
  }
  els.exportGif.addEventListener('click',exportGif);

  window.addEventListener('resize',()=>{
    if(lastResult){
      setupCanvasMetrics();
      renderFrame(0);
    }
  });

  updateCustomCharsetVisibility();
})();
