/* ==========================================
   CHARTS.js — Gráficos SVG sem dependências
   Responsivo: re-renderiza ao redimensionar o contêiner
   ========================================== */
const Charts = (() => {

  const COLORS = ['#1a56db','#10b981','#f59e0b','#ef4444','#8b5cf6','#f97316','#06b6d4','#84cc16','#ec4899','#64748b'];

  // Registro de gráficos ativos: containerId → { type, args }
  const _registry = new Map();

  // ResizeObserver único para todos os containers
  let _ro = null;
  function _initRO() {
    if (_ro || typeof ResizeObserver === 'undefined') return;
    let _debounceTimers = {};
    _ro = new ResizeObserver(entries => {
      entries.forEach(entry => {
        const id = entry.target.id;
        if (!id || !_registry.has(id)) return;
        clearTimeout(_debounceTimers[id]);
        _debounceTimers[id] = setTimeout(() => {
          const rec = _registry.get(id);
          if (rec) _rerender(id, rec);
        }, 120);
      });
    });
  }

  function _rerender(id, rec) {
    try {
      const el = document.getElementById(id);
      if (!el || !el.isConnected) { _registry.delete(id); return; }
      switch (rec.type) {
        case 'bar':    bar(rec.args);    break;
        case 'donut':  donut(rec.args);  break;
        case 'line':   line(rec.args);   break;
        case 'funnel': funnel(rec.args); break;
      }
    } catch (e) {
      console.warn('[Charts.rerender]', id, e.message);
    }
  }

  function _register(type, args) {
    const id = args.containerId;
    if (!id) return;
    _initRO();
    const el = document.getElementById(id);
    if (!el) return;
    _registry.set(id, { type, args });
    if (_ro && !_ro._observed?.has(id)) {
      _ro.observe(el);
      if (!_ro._observed) _ro._observed = new Set();
      _ro._observed.add(id);
    }
  }

  // Fallback window resize para browsers sem ResizeObserver
  let _winTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(_winTimer);
    _winTimer = setTimeout(() => {
      _registry.forEach((rec, id) => _rerender(id, rec));
    }, 200);
  });

  /* --- BAR CHART --- */
  function bar({ containerId, data, height = 200, showValues = true }) {
    const el = document.getElementById(containerId);
    if (!el || !data.length) return;
    const w = el.clientWidth || 400;
    const pad = { t: 20, r: 10, b: 50, l: 55 };
    const iw = w - pad.l - pad.r;
    const ih = height - pad.t - pad.b;
    const maxVal = Math.max(...data.map(d => d.value), 1);
    const barW = Math.min(40, (iw / data.length) * 0.6);
    const gap = iw / data.length;

    const yTicks = 4;
    let yLines = '';
    let yLabels = '';
    for (let i = 0; i <= yTicks; i++) {
      const y = pad.t + ih - (i / yTicks) * ih;
      const val = (maxVal * i / yTicks);
      yLines += `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="3,3"/>`;
      yLabels += `<text x="${pad.l - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#94a3b8">${val >= 1000 ? (val/1000).toFixed(0)+'k' : val.toFixed(0)}</text>`;
    }

    let bars = '';
    data.forEach((d, i) => {
      const bh = Math.max((d.value / maxVal) * ih, 2);
      const x = pad.l + gap * i + gap / 2 - barW / 2;
      const y = pad.t + ih - bh;
      const color = d.color || COLORS[i % COLORS.length];
      bars += `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" fill="${color}" rx="4" opacity=".9"/>`;
      if (showValues && d.value > 0) {
        const label = d.value >= 1000 ? Utils.formatCurrency(d.value).replace('R$ ','R$') : d.value;
        bars += `<text x="${x + barW/2}" y="${y - 4}" text-anchor="middle" font-size="10" fill="#475569" font-weight="600">${label}</text>`;
      }
      const lbl = (d.label || '').length > 6 ? d.label.slice(0,6)+'…' : (d.label || '');
      bars += `<text x="${x + barW/2}" y="${pad.t + ih + 14}" text-anchor="middle" font-size="10" fill="#64748b">${lbl}</text>`;
    });

    el.innerHTML = `<svg viewBox="0 0 ${w} ${height}" width="100%" height="${height}" style="display:block">
      ${yLines}${yLabels}
      <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t+ih}" stroke="#e2e8f0"/>
      <line x1="${pad.l}" y1="${pad.t+ih}" x2="${w-pad.r}" y2="${pad.t+ih}" stroke="#e2e8f0"/>
      ${bars}
    </svg>`;
    _register('bar', { containerId, data, height, showValues });
  }

  /* --- DONUT CHART --- */
  function donut({ containerId, data, size: _sizeHint = 180, showLegend = true }) {
    const el = document.getElementById(containerId);
    if (!el || !data.length) return;
    const total = data.reduce((s, d) => s + d.value, 0);
    if (total === 0) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-sub">Sem dados</div></div>'; return; }

    // Tamanho responsivo: usa largura do container, respeitando o hint como máximo
    const containerW = el.clientWidth || _sizeHint * 2;
    const size = Math.min(Math.max(Math.floor(containerW * 0.45), 100), _sizeHint);
    const cx = size / 2, cy = size / 2, r = size * 0.36, stroke = size * 0.18;
    let paths = '';
    let angle = -Math.PI / 2;

    data.forEach((d, i) => {
      const slice = (d.value / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      angle += slice;
      const x2 = cx + r * Math.cos(angle);
      const y2 = cy + r * Math.sin(angle);
      const large = slice > Math.PI ? 1 : 0;
      const color = d.color || COLORS[i % COLORS.length];
      paths += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" fill="${color}" opacity=".9"/>`;
    });

    const fontSize = Math.max(Math.round(size * 0.075), 9);
    const inner = `<circle cx="${cx}" cy="${cy}" r="${r - stroke}" fill="white"/>
      <text x="${cx}" y="${cy-4}" text-anchor="middle" font-size="${fontSize + 2}" font-weight="800" fill="#1a202c">${total}</text>
      <text x="${cx}" y="${cy+Math.round(fontSize*1.5)}" text-anchor="middle" font-size="${fontSize - 1}" fill="#64748b">total</text>`;

    let legend = '';
    if (showLegend) {
      legend = '<div class="chart-legend">';
      data.forEach((d, i) => {
        const color = d.color || COLORS[i % COLORS.length];
        const pct = total > 0 ? ((d.value/total)*100).toFixed(0) : 0;
        legend += `<div class="legend-item"><div class="legend-dot" style="background:${color}"></div>${Utils.escHtml(d.label)} (${pct}%)</div>`;
      });
      legend += '</div>';
    }

    el.innerHTML = `<div class="chart-wrap">
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block;margin:0 auto">
        ${paths}${inner}
      </svg>
      ${legend}
    </div>`;
    _register('donut', { containerId, data, size: _sizeHint, showLegend });
  }

  /* --- LINE CHART --- */
  function line({ containerId, series, height = 180, showDots = true }) {
    const el = document.getElementById(containerId);
    if (!el || !series.length || !series[0].data.length) return;
    const w = el.clientWidth || 400;
    const pad = { t: 20, r: 20, b: 40, l: 55 };
    const iw = w - pad.l - pad.r;
    const ih = height - pad.t - pad.b;
    const allVals = series.flatMap(s => s.data);
    const maxVal = Math.max(...allVals, 1);
    const n = series[0].data.length;

    const yTicks = 4;
    let gridLines = '', yLabels = '';
    for (let i = 0; i <= yTicks; i++) {
      const y = pad.t + ih - (i / yTicks) * ih;
      const val = maxVal * i / yTicks;
      gridLines += `<line x1="${pad.l}" y1="${y}" x2="${w-pad.r}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="3,3"/>`;
      yLabels += `<text x="${pad.l-6}" y="${y+4}" text-anchor="end" font-size="10" fill="#94a3b8">${val >= 1000 ? Utils.formatCurrency(val) : val.toFixed(0)}</text>`;
    }

    let paths = '';
    series.forEach((s, si) => {
      const color = s.color || COLORS[si % COLORS.length];
      const pts = s.data.map((v, i) => {
        const x = pad.l + (i / (n - 1 || 1)) * iw;
        const y = pad.t + ih - (v / maxVal) * ih;
        return `${x},${y}`;
      });
      paths += `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (showDots) {
        s.data.forEach((v, i) => {
          const x = pad.l + (i / (n - 1 || 1)) * iw;
          const y = pad.t + ih - (v / maxVal) * ih;
          paths += `<circle cx="${x}" cy="${y}" r="4" fill="${color}" stroke="white" stroke-width="2"/>`;
        });
      }
    });

    let xLabels = '';
    if (series[0].labels) {
      series[0].labels.forEach((lbl, i) => {
        const x = pad.l + (i / (n - 1 || 1)) * iw;
        xLabels += `<text x="${x}" y="${pad.t+ih+18}" text-anchor="middle" font-size="10" fill="#64748b">${lbl}</text>`;
      });
    }

    el.innerHTML = `<svg viewBox="0 0 ${w} ${height}" width="100%" height="${height}" style="display:block">
      ${gridLines}${yLabels}
      <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t+ih}" stroke="#e2e8f0"/>
      <line x1="${pad.l}" y1="${pad.t+ih}" x2="${w-pad.r}" y2="${pad.t+ih}" stroke="#e2e8f0"/>
      ${paths}${xLabels}
    </svg>`;
    _register('line', { containerId, series, height, showDots });
  }

  /* --- FUNNEL CHART --- */
  function funnel({ containerId, data }) {
    const el = document.getElementById(containerId);
    if (!el || !data.length) return;
    const maxVal = Math.max(...data.map(d => d.value), 1);
    let html = '<div style="display:flex;flex-direction:column;gap:6px;padding:8px 0">';
    data.forEach((d, i) => {
      const pct = (d.value / maxVal * 100).toFixed(0);
      const color = d.color || COLORS[i % COLORS.length];
      html += `<div>
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;font-size:12px">
          <span style="color:#475569;font-weight:600">${Utils.escHtml(d.label)}</span>
          <span style="color:#1a202c;font-weight:700">${d.value}</span>
        </div>
        <div class="progress"><div class="progress-fill" style="width:${pct}%;background:${color}"></div></div>
      </div>`;
    });
    html += '</div>';
    el.innerHTML = html;
    _register('funnel', { containerId, data });
  }

  // Wrappers defensivos — falha em um chart não derruba a página inteira
  function _safe(fn, name) {
    return function(...args) {
      try {
        return fn.apply(null, args);
      } catch (err) {
        console.warn(`[Charts.${name}] erro:`, err.message);
        // tenta inserir placeholder se o containerId for válido
        try {
          const cid = args[0]?.containerId;
          if (cid) {
            const el = document.getElementById(cid);
            if (el) el.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;font-size:12px">📊 Gráfico indisponível</div>';
          }
        } catch {}
        return null;
      }
    };
  }

  return {
    bar:    _safe(bar, 'bar'),
    donut:  _safe(donut, 'donut'),
    line:   _safe(line, 'line'),
    funnel: _safe(funnel, 'funnel'),
  };
})();
