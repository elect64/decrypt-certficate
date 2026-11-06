/* ==========================================================
   DECRYPT CERTIFICATE ENGINE — cert.js
   ========================================================== */

/* ---------- CONFIG ---------- */
var API          = 'https://script.google.com/macros/s/AKfycbxhx5PmRQ3bJdKLyW0Bia-t5b0dNcy---geQJtGNrwOh6l8BylVdVotY9gAaQL8AzydLQ/exec';
var API_TIMEOUT_MS = 90000;
var QR_TIMEOUT_MS  = 15000;

/* Verification page base URL — update once your portal is deployed */
var VERIFY_BASE  = 'https://decrypt-certficate.vercel.app/verify.html';

/* Certificate font — Cormorant Garamond is already loaded in the HTML */
var CERT_FONT    = 'Cormorant Garamond';

/* ==========================================================
   STATE
   ========================================================== */
var _token       = sessionStorage.getItem('dcmd_cert_session') || '';
var _templateImg = null;   // HTMLImageElement of uploaded template
var _templateDim = { w: 0, h: 0 }; // natural px dimensions

var _fields = {
  name: { xPct: 0.5, yPct: 0.52 },  // fractional position (0-1) on template
  qr:   { xPct: 0.85, yPct: 0.72 }
};
var _style = {
  fontSize:    42,
  color:       '#07220C',
  fontStyle:   'italic',
  align:       'center',
  spacing:     2,
  qrSize:      90      // px on canvas preview
};

var _recipients  = [];  // fetched eligible list

/* ==========================================================
   UTILITIES
   ========================================================== */
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, function (c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function toast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { el.classList.remove('show'); }, 2800);
}
function apiFetch(params) {
  if (_token) params._token = _token;
  var qs = Object.keys(params).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  return fetchJson(API + '?' + qs, {}, API_TIMEOUT_MS);
}

/* POST version — used for certificate sends where the PDF base64
   is too large for a URL parameter. text/plain avoids a CORS preflight;
   Apps Script reads the JSON body from e.postData.contents. */
function apiPost(payload) {
  if (_token) payload._token = _token;
  return fetchJson(API, {
    method:  'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body:    JSON.stringify(payload)
  }, API_TIMEOUT_MS);
}

function fetchJson(url, options, timeoutMs) {
  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var requestOptions = Object.assign({}, options);
  if (controller) requestOptions.signal = controller.signal;

  var timedOut = false;
  var timer;
  var request = fetch(url, requestOptions).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
  var timeout = new Promise(function (_, reject) {
    timer = setTimeout(function () {
      timedOut = true;
      if (controller) controller.abort();
      reject(new Error('Request timed out after ' + Math.round(timeoutMs / 1000) + ' seconds.'));
    }, timeoutMs);
  });

  return Promise.race([request, timeout]).then(function (result) {
    clearTimeout(timer);
    return result;
  }, function (error) {
    clearTimeout(timer);
    if (timedOut) {
      throw new Error('Request timed out after ' + Math.round(timeoutMs / 1000) + ' seconds.');
    }
    throw error;
  });
}
function el(id) { return document.getElementById(id); }

/* ==========================================================
   AUTH
   ========================================================== */
var Auth = (function () {
  function init() {
    if (_token) { showApp(); return; }
    var btn   = el('auth-btn');
    var label = el('auth-btn-label');
    var err   = el('auth-error');
    var wrap  = el('auth-field-wrap');

    function attempt() {
      var pw = el('auth-input').value.trim();
      if (!pw) return;
      btn.disabled = true; label.textContent = 'Checking…';
      fetch(API + '?action=admin_auth&pw=' + encodeURIComponent(pw))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.ok) {
            _token = d.token;
            sessionStorage.setItem('dcmd_cert_session', _token);
            showApp();
          } else {
            label.textContent = 'Unlock'; btn.disabled = false;
            err.textContent = 'Incorrect password.';
            wrap.classList.add('shake');
            setTimeout(function () { wrap.classList.remove('shake'); }, 400);
            el('auth-input').value = '';
          }
        })
        .catch(function () {
          label.textContent = 'Unlock'; btn.disabled = false;
          err.textContent = 'Could not reach server.';
        });
    }
    btn.addEventListener('click', attempt);
    el('auth-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') attempt(); });
  }

  function logout() {
    sessionStorage.removeItem('dcmd_cert_session');
    _token = '';
    location.reload();
  }

  function showApp() {
    el('auth-veil').style.display = 'none';
    el('app-shell').style.display = '';
    el('topbar-logout').addEventListener('click', logout);
    Steps.init();
  }

  return { init: init };
})();

/* ==========================================================
   STEP NAVIGATION
   ========================================================== */
var Steps = (function () {
  var _current = 1;

  function goTo(n) {
    document.querySelectorAll('.step').forEach(function (s) { s.classList.remove('active'); });
    el('step-' + n).classList.add('active');
    document.querySelectorAll('.step-pill').forEach(function (p) {
      var sn = Number(p.dataset.step);
      p.classList.toggle('active', sn === n);
      p.classList.toggle('done', sn < n);
    });
    _current = n;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function init() {
    /* Step 1 → 2 */
    el('step1-next').addEventListener('click', function () {
      goTo(2);
      setTimeout(PositionEditor.init, 80); // wait for layout
    });
    /* Step 2 back / next */
    el('step2-back').addEventListener('click', function () { goTo(1); });
    el('step2-next').addEventListener('click', function () { goTo(3); Preview.render(); });
    /* Step 3 back / next */
    el('step3-back').addEventListener('click', function () { goTo(2); });
    el('step3-next').addEventListener('click', function () { goTo(4); SendPanel.init(); });
    el('step4-back').addEventListener('click', function () { goTo(3); });
  }

  return { init: init, goTo: goTo };
})();

/* ==========================================================
   STEP 1 — TEMPLATE UPLOAD
   ========================================================== */
var TemplateUpload = (function () {
  function init() {
    var zone  = el('upload-zone');
    var input = el('template-file-input');

    zone.addEventListener('click', function () { input.click(); });
    zone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') input.click(); });

    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', function (e) {
      e.preventDefault(); zone.classList.remove('drag-over');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });

    input.addEventListener('change', function () { if (this.files[0]) handleFile(this.files[0]); });
    el('upload-change-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      el('upload-preview').style.display = 'none';
      zone.style.display = '';
      el('step1-next').disabled = true;
      _templateImg = null;
      input.value = '';
    });
  }

  function handleFile(file) {
    if (!file.type.startsWith('image/')) { toast('Please upload a PNG or JPG image.'); return; }
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        _templateImg = img;
        _templateDim = { w: img.naturalWidth, h: img.naturalHeight };
        el('upload-preview-img').src = e.target.result;
        el('upload-preview-name').textContent = file.name;
        el('upload-preview-dims').textContent = img.naturalWidth + ' × ' + img.naturalHeight + ' px';
        el('upload-zone').style.display = 'none';
        el('upload-preview').style.display = '';
        el('step1-next').disabled = false;
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  return { init: init };
})();

/* ==========================================================
   STEP 2 — POSITION EDITOR
   ========================================================== */
var PositionEditor = (function () {
  var _canvas, _ctx, _wrap;
  var _scale = 1; // canvas display width / template natural width
  var _dragging = null;
  var _dragOffX = 0, _dragOffY = 0;
  var _qrCache = {}; // cache QR images by code

  function init() {
    if (!_templateImg) return;
    _canvas = el('position-canvas');
    _ctx    = _canvas.getContext('2d');
    _wrap   = el('canvas-wrap');

    /* Set canvas to template natural dimensions for accuracy */
    _canvas.width  = _templateDim.w;
    _canvas.height = _templateDim.h;

    /* Scale via CSS to fit the container */
    var maxW = _wrap.offsetWidth || 700;
    _scale = maxW / _templateDim.w;
    _canvas.style.width  = '100%';
    _canvas.style.height = 'auto';

    /* Position handles */
    positionHandles();
    draw();
    bindControls();
    bindDrag();
  }

  function positionHandles() {
    var rect = _canvas.getBoundingClientRect();
    var cw = rect.width  || (_templateDim.w * _scale);
    var ch = rect.height || (_templateDim.h * _scale);

    setHandlePos('handle-name', _fields.name.xPct * cw, _fields.name.yPct * ch);
    setHandlePos('handle-qr',   _fields.qr.xPct   * cw, _fields.qr.yPct   * ch);
    updateNumericInputs(cw, ch);
  }

  function setHandlePos(id, px, py) {
    var h = el(id);
    h.style.left = px + 'px';
    h.style.top  = py + 'px';
    h.style.transform = 'translate(-50%, -50%)';
  }

  function updateNumericInputs(cw, ch) {
    el('ctrl-name-x').value = Math.round(_fields.name.xPct * cw);
    el('ctrl-name-y').value = Math.round(_fields.name.yPct * ch);
    el('ctrl-qr-x').value   = Math.round(_fields.qr.xPct   * cw);
    el('ctrl-qr-y').value   = Math.round(_fields.qr.yPct   * ch);
  }

  function draw() {
    if (!_ctx || !_templateImg) return;
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    _ctx.drawImage(_templateImg, 0, 0);

    /* Name preview */
    var nameX = _fields.name.xPct * _canvas.width;
    var nameY = _fields.name.yPct * _canvas.height;
    var fontSize = Math.round(_style.fontSize * (_canvas.width / 800));
    _ctx.font = _style.fontStyle + ' ' + fontSize + 'px "' + CERT_FONT + '", serif';
    _ctx.fillStyle   = _style.color;
    _ctx.textAlign   = _style.align;
    _ctx.letterSpacing = _style.spacing + 'px';
    _ctx.fillText('Participant Name', nameX, nameY);

    /* QR placeholder box */
    var qrX    = _fields.qr.xPct * _canvas.width;
    var qrY    = _fields.qr.yPct * _canvas.height;
    var qrSize = Math.round(_style.qrSize * (_canvas.width / 800));
    _ctx.strokeStyle = 'rgba(7,34,12,0.3)';
    _ctx.lineWidth   = 2;
    _ctx.setLineDash([6, 4]);
    _ctx.strokeRect(qrX - qrSize / 2, qrY - qrSize / 2, qrSize, qrSize);
    _ctx.setLineDash([]);
    _ctx.fillStyle = 'rgba(7,34,12,0.06)';
    _ctx.fillRect(qrX - qrSize / 2, qrY - qrSize / 2, qrSize, qrSize);
    _ctx.fillStyle = 'rgba(7,34,12,0.3)';
    _ctx.font = '500 ' + Math.round(10 * (_canvas.width / 800)) + 'px "JetBrains Mono", monospace';
    _ctx.textAlign = 'center';
    _ctx.fillText('QR CODE', qrX, qrY + 4);
  }

  function bindDrag() {
    ['handle-name', 'handle-qr'].forEach(function (hid) {
      var handle = el(hid);
      handle.addEventListener('mousedown',  startDrag);
      handle.addEventListener('touchstart', startDrag, { passive: false });
    });
    document.addEventListener('mousemove',  onDrag);
    document.addEventListener('touchmove',  onDrag, { passive: false });
    document.addEventListener('mouseup',    endDrag);
    document.addEventListener('touchend',   endDrag);
  }

  function startDrag(e) {
    e.preventDefault();
    _dragging = this.dataset.field;
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;
    var rect = this.getBoundingClientRect();
    _dragOffX = clientX - (rect.left + rect.width  / 2);
    _dragOffY = clientY - (rect.top  + rect.height / 2);
  }

  function onDrag(e) {
    if (!_dragging) return;
    e.preventDefault();
    var clientX = e.touches ? e.touches[0].clientX : e.clientX;
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;
    var wrapRect = _wrap.getBoundingClientRect();
    var px = Math.max(0, Math.min(clientX - _dragOffX - wrapRect.left, wrapRect.width));
    var py = Math.max(0, Math.min(clientY - _dragOffY - wrapRect.top,  wrapRect.height));
    _fields[_dragging].xPct = px / wrapRect.width;
    _fields[_dragging].yPct = py / wrapRect.height;
    setHandlePos('handle-' + _dragging, px, py);
    updateNumericInputs(wrapRect.width, wrapRect.height);
    draw();
  }

  function endDrag() { _dragging = null; }

  function bindControls() {
    /* Font size */
    el('ctrl-font-size').addEventListener('input', function () {
      _style.fontSize = Number(this.value);
      el('ctrl-font-size-val').textContent = this.value + 'px';
      draw();
    });
    /* Color */
    el('ctrl-color').addEventListener('input', function () {
      _style.color = this.value;
      el('ctrl-color-val').textContent = this.value;
      draw();
    });
    /* Font style */
    el('ctrl-font-style').addEventListener('change', function () { _style.fontStyle = this.value; draw(); });
    /* Alignment */
    document.querySelectorAll('.align-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.align-btn').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        _style.align = this.dataset.align;
        draw();
      });
    });
    /* Letter spacing */
    el('ctrl-spacing').addEventListener('input', function () {
      _style.spacing = Number(this.value);
      el('ctrl-spacing-val').textContent = this.value + 'px';
      draw();
    });
    /* QR size */
    el('ctrl-qr-size').addEventListener('input', function () {
      _style.qrSize = Number(this.value);
      el('ctrl-qr-size-val').textContent = this.value + 'px';
      draw();
    });
    /* Numeric position inputs */
    ['name', 'qr'].forEach(function (field) {
      ['x', 'y'].forEach(function (axis) {
        el('ctrl-' + field + '-' + axis).addEventListener('change', function () {
          var rect = _wrap.getBoundingClientRect();
          var dim  = axis === 'x' ? rect.width : rect.height;
          _fields[field][axis + 'Pct'] = Math.max(0, Math.min(Number(this.value) / dim, 1));
          var px = _fields[field].xPct * rect.width;
          var py = _fields[field].yPct * rect.height;
          setHandlePos('handle-' + field, px, py);
          draw();
        });
      });
    });
  }

  return { init: init };
})();

/* ==========================================================
   CERTIFICATE GENERATOR
   Builds one certificate canvas given a participant object.
   Returns a Promise<HTMLCanvasElement>.
   ========================================================== */
function buildCertificateCanvas(participant) {
  return new Promise(function (resolve, reject) {
    if (!_templateImg) { reject(new Error('No template')); return; }

    var cvs = document.createElement('canvas');
    cvs.width  = _templateDim.w;
    cvs.height = _templateDim.h;
    var ctx = cvs.getContext('2d');

    /* Draw template */
    ctx.drawImage(_templateImg, 0, 0);

    /* Name */
    var nameX    = _fields.name.xPct * cvs.width;
    var nameY    = _fields.name.yPct * cvs.height;
    var fontSize = Math.round(_style.fontSize * (cvs.width / 800));
    ctx.font = _style.fontStyle + ' ' + fontSize + 'px "' + CERT_FONT + '", serif';
    ctx.fillStyle    = _style.color;
    ctx.textAlign    = _style.align;
    ctx.letterSpacing = _style.spacing + 'px';
    ctx.fillText(participant.name || '', nameX, nameY);

    /* QR code */
    var verifyUrl = VERIFY_BASE + '?code=' + encodeURIComponent(participant.code || '');
    var qrUrl    = 'https://quickchart.io/qr?text=' +
                   encodeURIComponent(verifyUrl) +
                   '&size=300&margin=1&dark=07220C&light=FFFFFF';
    var qrImg    = new Image();
    var qrTimer  = setTimeout(function () {
      finishQr(new Error('QR code service did not respond in time.'));
    }, QR_TIMEOUT_MS);
    var qrFinished = false;
    function finishQr(error) {
      if (qrFinished) return;
      qrFinished = true;
      clearTimeout(qrTimer);
      qrImg.onload = null;
      qrImg.onerror = null;
      if (error) reject(error);
      else resolve(cvs);
    }
    qrImg.crossOrigin = 'anonymous';
    qrImg.onload = function () {
      try {
        var qrSize = Math.round(_style.qrSize * (cvs.width / 800));
        var qrX    = _fields.qr.xPct * cvs.width  - qrSize / 2;
        var qrY    = _fields.qr.yPct * cvs.height - qrSize / 2;
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
        finishQr();
      } catch (error) {
        finishQr(new Error('Could not add the QR code to the certificate.'));
      }
    };
    qrImg.onerror = function () {
      finishQr(new Error('Could not generate the QR code. Check the connection and retry.'));
    };
    qrImg.src = qrUrl;
  });
}

function canvasToPdfBase64(cvs) {
  var { jsPDF } = window.jspdf;
  /* A4 landscape in mm */
  var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  var imgData = cvs.toDataURL('image/png', 1.0);
  doc.addImage(imgData, 'PNG', 0, 0, 297, 210);
  return doc.output('datauristring').split(',')[1]; // base64 only
}

/* ==========================================================
   STEP 3 — PREVIEW
   ========================================================== */
var Preview = (function () {
  function render() {
    var sampleParticipant = { name: 'Chiamaka Obi', code: 'DEC2.O-SAMPLE' };
    buildCertificateCanvas(sampleParticipant).then(function (cvs) {
      var previewCanvas = el('preview-canvas');
      previewCanvas.width  = cvs.width;
      previewCanvas.height = cvs.height;
      var ctx = previewCanvas.getContext('2d');
      ctx.drawImage(cvs, 0, 0);
    });

    el('step3-download').onclick = function () {
      buildCertificateCanvas(sampleParticipant).then(function (cvs) {
        var b64 = canvasToPdfBase64(cvs);
        var link = document.createElement('a');
        link.href     = 'data:application/pdf;base64,' + b64;
        link.download = 'DECRYPT-sample-certificate.pdf';
        link.click();
        toast('Sample PDF downloaded.');
      });
    };
  }
  return { render: render };
})();

/* ==========================================================
   STEP 4 — SEND PANEL
   ========================================================== */
var DEFAULT_MESSAGE =
  'Hi {{first_name}},\n\n' +
  'Thank you for being part of DECRYPT 2.0. Your certificate is attached to this email as a PDF.\n\n' +
  'You can check that it is genuine at any time with the button below or the QR code on the certificate.';

var SendPanel = (function () {
  var _initialized = false;
  var _selected = {};      // code -> true

  function selectedList() {
    return _recipients.filter(function (r) { return _selected[r.code]; });
  }

  function refreshSummary() {
    var n = selectedList().length, total = _recipients.length;
    var badge = el('recipient-count-badge');
    badge.textContent = n + ' of ' + total + ' selected';
    badge.classList.toggle('has-recipients', n > 0);
    var label = el('send-btn-label');
    label.textContent = n ? 'Send to ' + n + ' selected' : 'Select recipients';
    el('send-btn').disabled = n === 0;
    var rows = el('recipients-list').querySelectorAll('.recipient-row');
    Array.prototype.forEach.call(rows, function (row) {
      var on = !!_selected[row.getAttribute('data-code')];
      row.classList.toggle('is-selected', on);
      row.querySelector('input').checked = on;
    });
  }

  function applyFilter() {
    var q = el('pick-search').value.trim().toLowerCase();
    var rows = el('recipients-list').querySelectorAll('.recipient-row');
    var shown = 0;
    Array.prototype.forEach.call(rows, function (row) {
      var hit = !q || row.getAttribute('data-q').indexOf(q) !== -1;
      row.classList.toggle('is-hidden', !hit);
      if (hit) shown++;
    });
    var none = el('recipients-list').querySelector('.recipient-empty');
    if (none) none.hidden = shown !== 0;
  }

  function init() {
    if (!_initialized) {
      el('send-btn').addEventListener('click', confirmAndSend);
      el('pick-search').addEventListener('input', applyFilter);
      /* "Select all" applies to whatever the search currently shows */
      el('pick-all').addEventListener('click', function () {
        var rows = el('recipients-list').querySelectorAll('.recipient-row:not(.is-hidden)');
        Array.prototype.forEach.call(rows, function (row) { _selected[row.getAttribute('data-code')] = true; });
        refreshSummary();
      });
      el('pick-none').addEventListener('click', function () { _selected = {}; refreshSummary(); });
      el('recipients-list').addEventListener('change', function (ev) {
        var row = ev.target.closest && ev.target.closest('.recipient-row');
        if (!row) return;
        var code = row.getAttribute('data-code');
        if (ev.target.checked) _selected[code] = true; else delete _selected[code];
        refreshSummary();
      });
      _initialized = true;
    }
    var ta = el('cert-message');
    if (!ta.value) ta.value = DEFAULT_MESSAGE;
    loadRecipients();
  }

  function loadRecipients() {
    var listEl = el('recipients-list');
    var badge  = el('recipient-count-badge');
    listEl.innerHTML = '<div class="state-block"><div class="skel skel-line" style="width:60%"></div><div class="skel skel-line" style="width:40%"></div></div>';
    el('pick-bar').hidden = true;

    apiFetch({ action: 'getCertificatesData' })
      .then(function (d) {
        if (!d || d.ok === false) {
          throw new Error(d && d.error ? d.error : 'The server returned an invalid response.');
        }
        _recipients = (d.certificates || []).filter(function (c) { return c.status === 'Eligible'; });

        /* keep ticks that are still valid after a refresh (e.g. retrying failures) */
        var still = {};
        _recipients.forEach(function (r) { if (_selected[r.code]) still[r.code] = true; });
        _selected = still;

        if (!_recipients.length) {
          badge.textContent = '0 eligible';
          badge.classList.remove('has-recipients');
          listEl.innerHTML = '<p class="recipient-empty">No eligible participants yet. Certificates appear here once participants have checked in.</p>';
          el('send-btn-label').textContent = 'Select recipients';
          el('send-btn').disabled = true;
          return;
        }

        listEl.innerHTML = _recipients.map(function (r) {
          var q = (String(r.name || '') + ' ' + String(r.email || '') + ' ' + String(r.code || '')).toLowerCase();
          return '<label class="recipient-row" data-code="' + esc(r.code) + '" data-q="' + esc(q) + '">' +
            '<input type="checkbox" aria-label="Select ' + esc(r.name) + '">' +
            '<div><div class="recipient-name">' + esc(r.name) + '</div>' +
            '<div class="recipient-email">' + esc(r.email) + '</div></div>' +
            '<span class="recipient-code">' + esc(r.code) + '</span>' +
            '</label>';
        }).join('') + '<p class="recipient-empty" hidden>No one matches that search.</p>';

        el('pick-bar').hidden = false;
        el('pick-search').value = '';
        refreshSummary();
      })
      .catch(function (error) {
        _recipients = []; _selected = {};
        badge.textContent = 'Could not load';
        badge.classList.remove('has-recipients');
        el('send-btn').disabled = true;
        listEl.textContent = 'Could not load recipients: ' +
          (error && error.message ? error.message : 'Unexpected error.');
        listEl.className = 'chamber-body recipient-list recipient-empty';
      });
  }

  function confirmAndSend() {
    var chosen = selectedList();
    if (!chosen.length) return;
    var count = chosen.length;
    var left = _recipients.length - count;
    var confirmed = window.confirm(
      'You are about to send certificates to ' + count + ' selected participant' + (count !== 1 ? 's' : '') + '.' +
      (left ? '\n' + left + ' other eligible participant' + (left !== 1 ? 's' : '') + ' will not be sent anything yet.' : '') +
      '\n\nThis cannot be undone. Continue?'
    );
    if (!confirmed) return;
    startSend(chosen);
  }

  function startSend(chosen) {
    el('send-btn').disabled = true;
    el('step4-back').style.display = 'none';
    el('send-progress').style.display = '';
    el('send-result').style.display = 'none';
    el('pick-bar').hidden = true;
    var rowsEl = el('recipients-list');
    rowsEl.style.pointerEvents = 'none'; rowsEl.style.opacity = '.55';

    var queue   = chosen.slice();          // snapshot: later ticks can't change an in-flight send
    var total   = queue.length;
    var sent    = 0;
    var failures = [];
    var subject = el('cert-subject').value.trim() || 'Your DECRYPT 2.0 Certificate';
    var message = el('cert-message').value.trim();

    function sendNext(i) {
      if (i >= total) {
        onComplete(sent, failures);
        return;
      }
      var r = queue[i];
      var pct = Math.round((i / total) * 100);
      el('progress-bar-fill').style.width = pct + '%';
      el('progress-label').textContent = 'Generating certificate ' + (i + 1) + ' of ' + total + ' — ' + r.name + '…';

      buildCertificateCanvas(r)
        .then(function (cvs) {
          var pdfB64 = canvasToPdfBase64(cvs);
          el('progress-label').textContent = 'Sending certificate ' + (i + 1) + ' of ' + total + ' — ' + r.name + '…';
          return apiPost({
            action:      'sendCertificateEmail',
            code:        r.code,
            name:        r.name,
            email:       r.email,
            subject:     subject,
            message:     message,
            pdfBase64:   pdfB64,
            certRow:     r.row
          });
        })
        .then(function (res) {
          if (!res || !res.ok) {
            throw new Error(res && res.error ? res.error : 'The server rejected this certificate.');
          }
          sent++;
          delete _selected[r.code];        // delivered: no longer selected
        })
        .catch(function (error) {
          failures.push({
            name: r.name || r.email || 'Unknown recipient',
            error: error && error.message ? error.message : 'Unexpected error.'
          });                              // failed ones stay ticked for an easy retry
        })
        .then(function () {
          el('progress-bar-fill').style.width = Math.round(((i + 1) / total) * 100) + '%';
          sendNext(i + 1);
        });
    }

    sendNext(0);
  }

  function onComplete(sent, failures) {
    el('progress-bar-fill').style.width = '100%';
    el('progress-label').textContent = 'Done.';
    el('step4-back').style.display = '';
    el('recipients-list').style.pointerEvents = ''; el('recipients-list').style.opacity = '';
    setTimeout(function () {
      el('send-progress').style.display = 'none';
      var resultEl = el('send-result');
      resultEl.style.display = '';
      resultEl.textContent = '';
      if (!failures.length) {
        resultEl.className = 'send-result ok';
        resultEl.innerHTML = '<div class="send-result-title">Sent to ' + sent + ' participant' + (sent !== 1 ? 's' : '') + '</div>' +
          '<div class="send-result-sub">The Certificates sheet has been updated. Anyone you left unticked is still eligible below.</div>';
      } else {
        resultEl.className = 'send-result err';
        var title = document.createElement('div');
        title.className = 'send-result-title';
        title.textContent = sent + ' sent, ' + failures.length + ' failed';
        var sub = document.createElement('div');
        sub.className = 'send-result-sub';
        sub.textContent = 'The failed recipients stay ticked below so you can retry just them.';
        var list = document.createElement('ul');
        failures.forEach(function (failure) {
          var item = document.createElement('li');
          item.textContent = failure.name + ': ' + failure.error;
          list.appendChild(item);
        });
        resultEl.appendChild(title);
        resultEl.appendChild(sub);
        resultEl.appendChild(list);
      }
      loadRecipients();
    }, 600);
  }

  return { init: init };
})();

/* ==========================================================
   BOOT
   ========================================================== */
TemplateUpload.init();
Auth.init();

/* ==========================================================
   THEME
   ========================================================== */
(function () {
  var btn = document.getElementById('theme-btn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    var next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('decrypt-theme', next); } catch (e) {}
  });
})();
