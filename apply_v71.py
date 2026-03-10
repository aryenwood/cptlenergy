#!/usr/bin/env python3
"""Apply v71 features to Capital Energy PWA index.html"""

import sys

with open('/Users/aryenwood/claude-projects/capital-energy/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

print(f"Original file length: {len(content.splitlines())} lines")
errors = []

def replace_once(old, new, label):
    global content
    if old in content:
        content = content.replace(old, new, 1)
        print(f"OK: {label}")
    else:
        print(f"FAIL: {label}")
        errors.append(label)

# ============================================================
# EDIT 1: F1+F5 — Insert DataStore block after <script> tag
# ============================================================

datastore_block = '''// ══════════════════════════════════════════════════════════════════════════
// DataStore — backend-ready abstraction (v71)
// Swap internals for fetch() calls when real backend is ready.
// All existing loadEntries/saveEntries/etc. calls continue working.
// ══════════════════════════════════════════════════════════════════════════
const DataStore = (() => {
  const KEYS = {
    entries:      'ce_log_entries',
    appointments: 'ce_appointments',
    team:         'ce_team',
  };
  function _read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch(_) { return fallback; }
  }
  function _write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch(_) {}
    _appendSync(key.replace('ce_',''), val);
  }
  function _appendSync(entity) {
    try {
      const q = JSON.parse(localStorage.getItem('ce_sync_queue') || '[]');
      q.push({ op:'upsert', entity, timestamp: Date.now(), deviceId: localStorage.getItem('ce_device_id') || 'unknown' });
      if (q.length > 500) q.splice(0, q.length - 500);
      localStorage.setItem('ce_sync_queue', JSON.stringify(q));
      _updateSyncBadge();
    } catch(_) {}
  }
  function _updateSyncBadge() {
    try {
      const q = JSON.parse(localStorage.getItem('ce_sync_queue') || '[]');
      const badge = document.getElementById('sync-queue-badge');
      if (!badge) return;
      if (q.length > 0) { badge.textContent = q.length + ' pending sync'; badge.style.display = 'inline-flex'; }
      else { badge.textContent = ''; badge.style.display = 'none'; }
    } catch(_) {}
  }
  return {
    loadEntries()        { return _read(KEYS.entries, []); },
    saveEntries(arr)     { _write(KEYS.entries, arr); },
    loadAppointments()   { return _read(KEYS.appointments, []); },
    saveAppointments(a)  { _write(KEYS.appointments, a); },
    loadTeam()           { return _read(KEYS.team, []); },
    saveTeam(t)          { _write(KEYS.team, t); },
    drainSyncQueue()     { localStorage.removeItem('ce_sync_queue'); _updateSyncBadge(); },
    updateSyncBadge()    { _updateSyncBadge(); },
  };
})();

// Ensure unique device ID
if (!localStorage.getItem('ce_device_id')) {
  try { localStorage.setItem('ce_device_id', Date.now().toString(36) + Math.random().toString(36).slice(2)); } catch(_) {}
}

// ── Identity helpers (supports impersonation — F10) ───────────────────────
function getActiveRole() {
  return localStorage.getItem('ce_impersonate_role') || localStorage.getItem('ce_user_role') || 'canvasser';
}
function getActiveName() {
  return localStorage.getItem('ce_impersonate_name') || localStorage.getItem('ce_user_name') || '';
}
function isImpersonating() { return !!localStorage.getItem('ce_impersonate_name'); }
function applyImpersonateBanner() {
  const banner = document.getElementById('impersonate-banner');
  const label  = document.getElementById('impersonate-label');
  if (!banner) return;
  if (isImpersonating()) {
    if (label) label.textContent = 'VIEWING AS ' + getActiveName().toUpperCase() + ' (' + getActiveRole() + ')';
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

'''

replace_once(
    '<script>\n// ── Tab navigation ────────────────────────────────────────────────────────',
    '<script>\n' + datastore_block + '// ── Tab navigation ────────────────────────────────────────────────────────',
    'EDIT 1: DataStore block inserted'
)

# ============================================================
# EDIT 2: Replace loadEntries/saveEntries with DataStore delegators
# ============================================================
replace_once(
    "function loadEntries() {\n  try { return JSON.parse(localStorage.getItem('ce_log_entries') || '[]'); } catch(_) { return []; }\n}\nfunction saveEntries(arr) {\n  try { localStorage.setItem('ce_log_entries', JSON.stringify(arr)); } catch(_) {}\n}",
    "function loadEntries()      { return DataStore.loadEntries(); }\nfunction saveEntries(arr)   { DataStore.saveEntries(arr); }",
    'EDIT 2: loadEntries/saveEntries replaced'
)

# ============================================================
# EDIT 3: Replace loadAppointments/saveAppointments
# ============================================================
replace_once(
    "function loadAppointments() {\n  try { return JSON.parse(localStorage.getItem('ce_appointments') || '[]'); } catch(_) { return []; }\n}\nfunction saveAppointments(arr) {\n  try { localStorage.setItem('ce_appointments', JSON.stringify(arr)); } catch(_) {}\n}",
    "function loadAppointments()  { return DataStore.loadAppointments(); }\nfunction saveAppointments(a) { DataStore.saveAppointments(a); }",
    'EDIT 3: loadAppointments/saveAppointments replaced'
)

# ============================================================
# EDIT 4: Replace loadTeam/saveTeam
# ============================================================
replace_once(
    "function loadTeam() {\n  try { return JSON.parse(localStorage.getItem('ce_team') || '[]'); } catch(_) { return []; }\n}\nfunction saveTeam(team) {\n  localStorage.setItem('ce_team', JSON.stringify(team));\n}",
    "function loadTeam()   { return DataStore.loadTeam(); }\nfunction saveTeam(t)  { DataStore.saveTeam(t); }",
    'EDIT 4: loadTeam/saveTeam replaced'
)

# ============================================================
# EDIT 5: F5 — Add sync badge HTML in header (after header title div)
# ============================================================
replace_once(
    '      <div id="header-titles">\n        <img id="header-brand-img" src="logo.png" alt="Capital Energy" />\n      </div>',
    '      <div id="header-titles">\n        <img id="header-brand-img" src="logo.png" alt="Capital Energy" />\n        <div id="sync-queue-badge" title="Changes pending cloud sync"></div>\n      </div>',
    'EDIT 5: Sync badge HTML added'
)

# ============================================================
# EDIT 6: F5 — Add CSS for sync badge and other v71 styles before </style>
# ============================================================
v71_css = '''
/* ═══════════════════════════════════════════════════════════════════════
   v71 NEW FEATURE STYLES
   ═══════════════════════════════════════════════════════════════════════ */

/* F5: Sync queue badge */
#sync-queue-badge {
  display: none;
  align-items: center;
  font-size: 10px; font-weight: 700;
  color: #fff; background: #f59e0b;
  padding: 2px 8px; border-radius: 50px;
  white-space: nowrap; margin: 0 6px;
  flex-shrink: 0;
}

/* F10: Impersonation banner */
#impersonate-banner {
  position: sticky; top: 0; z-index: 901;
  background: #ef4444; color: #fff;
  display: none; align-items: center; justify-content: center; gap: 12px;
  padding: 8px 16px; font-size: 12px; font-weight: 700;
  letter-spacing: 0.04em; text-transform: uppercase;
}
#impersonate-exit {
  padding: 3px 10px; border-radius: 6px;
  border: 1.5px solid rgba(255,255,255,0.6);
  background: transparent; color: #fff;
  font-size: 11px; font-weight: 700; cursor: pointer; font-family: inherit;
}

/* F9: Onboarding walkthrough */
#onboarding-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.65); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  opacity: 0; pointer-events: none; transition: opacity 0.3s;
}
#onboarding-overlay.open { opacity: 1; pointer-events: auto; }
#onboarding-card {
  background: var(--g3); border-radius: 24px;
  padding: 32px 24px 24px; width: min(360px, 90vw);
  text-align: center; display: flex; flex-direction: column; gap: 18px;
  border: 1px solid var(--g-border-hi);
  box-shadow: 0 24px 80px rgba(0,0,0,0.45);
}
.onboard-step { display: flex; flex-direction: column; gap: 10px; }
.onboard-step.onboard-hidden { display: none; }
.onboard-emoji { font-size: 48px; line-height: 1; }
.onboard-title { font-size: 20px; font-weight: 800; color: var(--text); }
.onboard-desc  { font-size: 14px; color: var(--text-2); line-height: 1.6; }
#onboard-dots  { display: flex; justify-content: center; gap: 6px; }
.onboard-dot   { width: 8px; height: 8px; border-radius: 50%; background: var(--g-border); transition: background 0.2s; }
.onboard-dot.active { background: var(--amber); }
#onboard-btn-row { display: flex; gap: 10px; }
#onboard-skip { flex: 1; padding: 12px; border-radius: 12px; border: 1px solid var(--g-border); background: var(--g1); color: var(--text-2); font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
#onboard-next { flex: 2; padding: 12px; border-radius: 12px; border: none; background: var(--amber); color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; }

/* F6: SMS Handoff sheet */
#handoff-overlay { position: fixed; inset: 0; z-index: 9000; background: rgba(0,0,0,0.55); display: none; }
#handoff-sheet {
  position: fixed; left: 0; right: 0;
  bottom: calc(var(--nav-h) + var(--safe-bottom));
  background: var(--g3); border-radius: 24px 24px 0 0;
  padding: 24px 20px 32px; z-index: 9001;
  transform: translateY(100%); transition: transform 0.35s var(--spring);
  border-top: 1px solid var(--g-border-hi);
}
#handoff-sheet.open { transform: translateY(0); }

/* F2: Snap Bill button */
.btn-snap-bill {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; border-radius: 12px; border: none;
  background: var(--amber); color: #fff;
  font-size: 14px; font-weight: 700; font-family: inherit;
  cursor: pointer; margin-bottom: 10px; width: 100%;
  -webkit-tap-highlight-color: transparent;
}
.btn-snap-bill:active { opacity: 0.85; transform: scale(0.97); }

/* F3: Route optimization */
#map-route-panel {
  position: absolute;
  bottom: calc(var(--nav-h) + var(--safe-bottom) + 56px);
  left: 12px; right: 12px; z-index: 420;
  background: var(--g3); border-radius: 16px;
  border: 1px solid var(--g-border-hi);
  padding: 12px 14px; display: none; flex-direction: column; gap: 8px;
}
#map-route-panel.visible { display: flex; }
#map-route-info { font-size: 13px; font-weight: 600; color: var(--text); }
#map-route-open-maps, #map-route-clear {
  padding: 10px; border-radius: 10px; border: none;
  font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit;
}
#map-route-open-maps { background: var(--amber); color: #fff; }
#map-route-clear { background: var(--g1); color: var(--text-2); border: 1px solid var(--g-border); }
.map-toggle-btn#map-route-btn.active { background: #22c55e; color: #fff; border-color: #22c55e; }

/* F7: Activity feed */
.feed-item {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 10px 12px; background: var(--g1);
  border-radius: 12px; border: 1px solid var(--g-border);
  margin-bottom: 7px;
}
.feed-avatar {
  width: 32px; height: 32px; border-radius: 50%;
  background: var(--amber-glow,rgba(245,158,11,0.12));
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: var(--amber); flex-shrink: 0;
}
.feed-body { flex: 1; min-width: 0; }
.feed-who  { font-size: 12px; font-weight: 700; color: var(--text); }
.feed-what { font-size: 11px; color: var(--text-2); margin-top: 2px; }
.feed-when { font-size: 10px; color: var(--text-3); margin-top: 2px; font-family: var(--font-mono,monospace); }

/* F10: Master admin View-As section */
#ma-impersonate-section p { font-size: 12px; color: #7ab8d4; margin: 0 0 10px; line-height: 1.5; }

'''

replace_once(
    '    .appt-item:active { opacity: 0.75; transform: scale(0.98); }\n\n  </style>\n</head>',
    '    .appt-item:active { opacity: 0.75; transform: scale(0.98); }\n' + v71_css + '  </style>\n</head>',
    'EDIT 6: v71 CSS added'
)

# ============================================================
# EDIT 7: F10 — Impersonation banner HTML after install-banner
# ============================================================
replace_once(
    '  <!-- ── PWA install banner ──────────────────────────────────────────────── -->\n  <div id="install-banner" role="banner">\n    <p><strong>Add to Home Screen</strong><br/>Install for offline access &amp; a native feel.</p>\n    <button id="install-btn">Install</button>\n    <button id="install-dismiss" aria-label="Dismiss">✕</button>\n  </div>\n\n  <!-- ── Tab panels ─────────────────────────────────────────────────────── -->',
    '  <!-- ── PWA install banner ──────────────────────────────────────────────── -->\n  <div id="install-banner" role="banner">\n    <p><strong>Add to Home Screen</strong><br/>Install for offline access &amp; a native feel.</p>\n    <button id="install-btn">Install</button>\n    <button id="install-dismiss" aria-label="Dismiss">✕</button>\n  </div>\n\n  <!-- v71: Impersonation banner -->\n  <div id="impersonate-banner">\n    <span id="impersonate-label"></span>\n    <button id="impersonate-exit" onclick="(function(){localStorage.removeItem(\'ce_impersonate_name\');localStorage.removeItem(\'ce_impersonate_role\');applyImpersonateBanner();applyRoleUI();renderDashboard();})()">Exit</button>\n  </div>\n\n  <!-- ── Tab panels ─────────────────────────────────────────────────────── -->',
    'EDIT 7: Impersonation banner HTML added'
)

# ============================================================
# EDIT 8: F9 — Onboarding overlay HTML after role-setup-overlay
# ============================================================
onboard_html = '''
<!-- v71: Onboarding walkthrough -->
<div id="onboarding-overlay">
  <div id="onboarding-card">
    <div class="onboard-step" data-step="0">
      <div class="onboard-emoji">🚪</div>
      <div class="onboard-title">Log your first door</div>
      <div class="onboard-desc">Tap the <strong>Log</strong> tab, then hit <strong>+ New Entry</strong> to record your first knock. Every door counts.</div>
    </div>
    <div class="onboard-step onboard-hidden" data-step="1">
      <div class="onboard-emoji">📅</div>
      <div class="onboard-title">Book appointments fast</div>
      <div class="onboard-desc">When a homeowner is interested, tap <strong>Book Appointment</strong> from the dashboard to assign a closer instantly.</div>
    </div>
    <div class="onboard-step onboard-hidden" data-step="2">
      <div class="onboard-emoji">📊</div>
      <div class="onboard-title">Track your pipeline</div>
      <div class="onboard-desc">Your dashboard shows doors knocked, contacts made, appointments set, and your live conversion rate.</div>
    </div>
    <div class="onboard-step onboard-hidden" data-step="3">
      <div class="onboard-emoji">🏆</div>
      <div class="onboard-title">Go earn it!</div>
      <div class="onboard-desc">The leaderboard updates in real-time. Stay consistent and climb to the top.</div>
    </div>
    <div id="onboard-dots"></div>
    <div id="onboard-btn-row">
      <button id="onboard-skip">Skip</button>
      <button id="onboard-next">Next →</button>
    </div>
  </div>
</div>
'''

replace_once(
    "  <button id=\"role-setup-go\">Let's Go →</button>\n</div>\n\n<!-- ── PIN Overlay (Master Admin access) ──────────────────────────────── -->",
    "  <button id=\"role-setup-go\">Let's Go →</button>\n</div>\n" + onboard_html + "\n<!-- ── PIN Overlay (Master Admin access) ──────────────────────────────── -->",
    'EDIT 8: Onboarding overlay HTML added'
)

# ============================================================
# EDIT 9: F6 — Team phone input before Add button
# ============================================================
replace_once(
    '          <input class="admin-input" type="text" id="admin-new-name" placeholder="Full name" style="flex:1;min-width:0" />\n          <button class="team-add-btn" id="admin-add-member">Add</button>',
    '          <input class="admin-input" type="text" id="admin-new-name" placeholder="Full name" style="flex:1;min-width:0" />\n          <input class="admin-input" type="tel" id="admin-new-phone" placeholder="Phone #" style="flex:0 0 100px;min-width:0" inputmode="tel" />\n          <button class="team-add-btn" id="admin-add-member">Add</button>',
    'EDIT 9: Phone input added to team add row'
)

# ============================================================
# EDIT 10: F6 — Handoff sheet HTML before Review QR modal
# ============================================================
handoff_html = '''<!-- v71: SMS Handoff Card -->
<div id="handoff-overlay" onclick="closeHandoffCard()"></div>
<div id="handoff-sheet">
  <div style="font-size:11px;font-weight:700;color:var(--amber);text-transform:uppercase;letter-spacing:.10em;margin-bottom:6px">Setter → Closer Handoff</div>
  <div id="handoff-customer-name" style="font-size:18px;font-weight:800;color:var(--text);margin-bottom:4px"></div>
  <div id="handoff-details" style="font-size:13px;color:var(--text-2);line-height:1.6;margin-bottom:16px"></div>
  <button id="handoff-sms-btn" style="width:100%;padding:14px;border-radius:14px;border:none;background:var(--amber);color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:8px">📱 Send SMS Handoff</button>
  <button onclick="closeHandoffCard()" style="width:100%;padding:10px;border-radius:12px;border:1px solid var(--g-border);background:var(--g1);color:var(--text-2);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Dismiss</button>
</div>

'''

replace_once(
    '<!-- ── Review QR code modal ───────────────────────────────────────────── -->\n<div id="review-qr-overlay" onclick="if(event.target===this)closeReviewQR()">',
    handoff_html + '<!-- ── Review QR code modal ───────────────────────────────────────────── -->\n<div id="review-qr-overlay" onclick="if(event.target===this)closeReviewQR()">',
    'EDIT 10: Handoff sheet HTML added'
)

# ============================================================
# EDIT 11: F3 — Route button after Installs toggle button
# ============================================================
replace_once(
    '        <button class="map-toggle-btn" data-layer="installs">Installs</button>\n      </div>',
    '        <button class="map-toggle-btn" data-layer="installs">Installs</button>\n        <button class="map-toggle-btn" id="map-route-btn">⬡ Route</button>\n      </div>',
    'EDIT 11: Route button added to map toggle'
)

# ============================================================
# EDIT 12: F3 — Route panel after map-count-badge
# ============================================================
replace_once(
    '      <!-- Pin count -->\n      <div id="map-count-badge">0 pins</div>\n\n      <!-- Legend -->',
    '      <!-- Pin count -->\n      <div id="map-count-badge">0 pins</div>\n\n      <div id="map-route-panel">\n        <div id="map-route-info">Select stops on the map</div>\n        <button id="map-route-open-maps">Open in Maps</button>\n        <button id="map-route-clear">Clear Route</button>\n      </div>\n\n      <!-- Legend -->',
    'EDIT 12: Route panel added'
)

# ============================================================
# EDIT 13: F4 — Background Reminders admin section before Save button
# ============================================================
replace_once(
    '      <!-- Save -->\n      <div class="admin-save-wrap">\n        <button class="admin-save-btn" id="admin-save-btn">Save &amp; Close</button>\n        <div class="admin-success" id="admin-success">✓ Saved!</div>\n      </div>',
    '      <div class="admin-section">\n        <div class="admin-section-title">🔔 Background Reminders</div>\n        <p style="font-size:12px;color:var(--text-3);margin:0 0 10px;line-height:1.5">Enable notifications that fire even when the app is closed.</p>\n        <button class="admin-save-btn" id="admin-enable-bg-reminders" style="margin-top:0">Enable Background Reminders</button>\n        <div id="admin-bg-reminder-status" style="font-size:12px;color:var(--text-3);margin-top:6px"></div>\n      </div>\n\n      <!-- Save -->\n      <div class="admin-save-wrap">\n        <button class="admin-save-btn" id="admin-save-btn">Save &amp; Close</button>\n        <div class="admin-success" id="admin-success">✓ Saved!</div>\n      </div>',
    'EDIT 13: Background Reminders admin section added'
)

# ============================================================
# EDIT 14: F7 — Activity feed HTML after dash-assign-section
# ============================================================
replace_once(
    '      <div id="dash-assign-section" style="display:none">\n        <div class="dash-section-label" style="margin-top:28px">\n          <span class="dash-section-title">⚡ Assign Closers</span>\n          <span class="dash-assign-subtitle" id="dash-assign-subtitle"></span>\n        </div>\n        <div id="dash-assign-list"></div>\n      </div>\n\n      <!-- Date range filter -->',
    '      <div id="dash-assign-section" style="display:none">\n        <div class="dash-section-label" style="margin-top:28px">\n          <span class="dash-section-title">⚡ Assign Closers</span>\n          <span class="dash-assign-subtitle" id="dash-assign-subtitle"></span>\n        </div>\n        <div id="dash-assign-list"></div>\n      </div>\n\n      <!-- v71: Manager Activity Feed -->\n      <div id="dash-feed-section" style="display:none">\n        <div class="dash-section-label" style="margin-top:24px">\n          <span class="dash-section-title">Live Activity Feed</span>\n          <button class="dash-section-action" id="dash-feed-toggle">Show</button>\n        </div>\n        <div id="dash-feed-list" style="display:none"></div>\n      </div>\n\n      <!-- Date range filter -->',
    'EDIT 14: Activity feed HTML added'
)

# ============================================================
# EDIT 15: F10 — Master Admin "View As Rep" section as first child of master-admin-body
# ============================================================
replace_once(
    '  <div id="master-admin-body">\n\n    <!-- White-Label -->\n    <div class="ma-section">',
    '  <div id="master-admin-body">\n\n    <!-- v71: View As Rep -->\n    <div class="ma-section" id="ma-impersonate-section">\n      <div class="ma-section-title">👁 View As Rep</div>\n      <p>Preview the app exactly as a specific team member sees it.</p>\n      <div class="ma-field">\n        <label class="ma-label">Select Team Member</label>\n        <select class="ma-input" id="ma-impersonate-select">\n          <option value="">— Select a team member —</option>\n        </select>\n      </div>\n      <div class="ma-field" style="margin-top:10px">\n        <button class="ma-btn" id="ma-impersonate-btn">View as Selected Rep</button>\n      </div>\n    </div>\n\n    <!-- White-Label -->\n    <div class="ma-section">',
    'EDIT 15: Master Admin View-As section added'
)

# ============================================================
# EDIT 16: JS — Insert all new JavaScript before </script>
# ============================================================
new_js = '''
// ══════════════════════════════════════════════════════════════════════════
// v71 NEW FEATURES — JavaScript
// ══════════════════════════════════════════════════════════════════════════

// ── F9: Onboarding Walkthrough ────────────────────────────────────────────
;(function() {
  let _step = 0;
  const TOTAL = 4;

  function _render() {
    document.querySelectorAll('.onboard-step').forEach((el, i) => {
      el.classList.toggle('onboard-hidden', i !== _step);
    });
    const dotsEl = document.getElementById('onboard-dots');
    if (dotsEl) {
      dotsEl.innerHTML = Array.from({length: TOTAL}, (_, i) =>
        '<div class="onboard-dot' + (i === _step ? ' active' : '') + '"></div>'
      ).join('');
    }
    const nb = document.getElementById('onboard-next');
    if (nb) nb.textContent = _step < TOTAL - 1 ? 'Next →' : "Let\'s Go! 🏆";
    if (_step === 3) { try { launchConfetti && launchConfetti('Go earn it! 🏆'); } catch(_){} }
  }

  window.showOnboarding = function() {
    if (localStorage.getItem('ce_onboarding_done')) return;
    const ov = document.getElementById('onboarding-overlay');
    if (!ov) return;
    _step = 0;
    _render();
    ov.classList.add('open');
  };
  window.hideOnboarding = function() {
    const ov = document.getElementById('onboarding-overlay');
    if (ov) ov.classList.remove('open');
    localStorage.setItem('ce_onboarding_done', '1');
  };

  document.addEventListener('DOMContentLoaded', function() {
    const nb = document.getElementById('onboard-next');
    const sb = document.getElementById('onboard-skip');
    if (nb) nb.addEventListener('click', function() {
      if (_step < TOTAL - 1) { _step++; _render(); }
      else hideOnboarding();
    });
    if (sb) sb.addEventListener('click', hideOnboarding);
  });
})();

// ── F6: SMS Handoff Card ──────────────────────────────────────────────────
function showHandoffCard(appt) {
  const name = [appt.firstName, appt.lastName].filter(Boolean).join(' ') || 'Customer';
  const dt   = new Date(appt.datetime);
  const dtStr = dt.toLocaleDateString('en-US', {weekday:'short',month:'short',day:'numeric'}) +
                ' at ' + dt.toLocaleTimeString('en-US', {hour:'numeric',minute:'2-digit'});
  const addr = [appt.street, appt.city, appt.state].filter(Boolean).join(', ');
  const el = document.getElementById('handoff-customer-name');
  const dl = document.getElementById('handoff-details');
  if (el) el.textContent = name;
  if (dl) dl.innerHTML = (dtStr ? dtStr + '<br>' : '') + (addr ? addr + '<br>' : '') +
    (appt.closer ? 'Closer: ' + appt.closer : '');
  const team   = loadTeam();
  const closer = team.find(function(m){ return m.name === appt.closer; });
  const phone  = (closer && closer.phone) ? closer.phone.replace(/\\D/g,'') : '';
  const body = encodeURIComponent(
    'HANDOFF — ' + name + '\\n' +
    'Appt: ' + dtStr + '\\n' +
    'Address: ' + addr + '\\n' +
    'Phone: ' + (appt.phone || '?') + '\\n' +
    'Bill: $' + (appt.avgBill || '?') + '/mo' +
    (appt.notes ? '\\nNotes: ' + appt.notes : '')
  );
  const smsLink = phone ? 'sms:+' + phone + '?body=' + body : 'sms:?body=' + body;
  const btn = document.getElementById('handoff-sms-btn');
  if (btn) btn.onclick = function(){ window.open(smsLink, '_self'); };
  const ov = document.getElementById('handoff-overlay');
  const sh = document.getElementById('handoff-sheet');
  if (ov) ov.style.display = 'block';
  if (sh) sh.classList.add('open');
}
function closeHandoffCard() {
  const ov = document.getElementById('handoff-overlay');
  const sh = document.getElementById('handoff-sheet');
  if (ov) ov.style.display = 'none';
  if (sh) sh.classList.remove('open');
}

// ── F3: Route Optimization ────────────────────────────────────────────────
var _routeMode      = false;
var _routeWaypoints = [];
var _routePolyline  = null;
var _routeMarkers   = [];

function toggleRouteMode() {
  _routeMode = !_routeMode;
  var btn = document.getElementById('map-route-btn');
  if (btn) btn.classList.toggle('active', _routeMode);
  var panel = document.getElementById('map-route-panel');
  if (!_routeMode) { clearRoute(); if (panel) panel.classList.remove('visible'); }
  else { if (panel) panel.classList.add('visible'); }
}
function clearRoute() {
  if (_routePolyline && window.mapInstance) { try { mapInstance.removeLayer(_routePolyline); } catch(_){} _routePolyline = null; }
  _routeMarkers.forEach(function(m){ try { mapInstance.removeLayer(m); } catch(_){} });
  _routeMarkers = [];
  _routeWaypoints = [];
  var info = document.getElementById('map-route-info');
  if (info) info.textContent = 'Select stops on the map';
  var panel = document.getElementById('map-route-panel');
  if (panel && !_routeMode) panel.classList.remove('visible');
}
function _nnOrder(pts) {
  if (!pts.length) return [];
  var unvisited = pts.slice();
  var route = [unvisited.splice(0,1)[0]];
  while (unvisited.length) {
    var last = route[route.length-1], bestIdx=0, bestD=Infinity;
    unvisited.forEach(function(p,i){
      var d = Math.hypot(p.lat-last.lat, p.lng-last.lng);
      if (d < bestD) { bestD=d; bestIdx=i; }
    });
    route.push(unvisited.splice(bestIdx,1)[0]);
  }
  return route;
}
function _haverMiles(a, b) {
  var R=3958.8, dLat=(b.lat-a.lat)*Math.PI/180, dLng=(b.lng-a.lng)*Math.PI/180;
  var x=Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}
function drawRoute() {
  if (!window.mapInstance || !window.L) return;
  if (_routePolyline) { try { mapInstance.removeLayer(_routePolyline); } catch(_){} }
  _routeMarkers.forEach(function(m){ try { mapInstance.removeLayer(m); } catch(_){} });
  _routeMarkers = [];
  var ordered = _nnOrder(_routeWaypoints.slice());
  _routePolyline = L.polyline(ordered.map(function(p){ return [p.lat,p.lng]; }), {color:'#22c55e',weight:3,opacity:0.85,dashArray:'7,5'}).addTo(mapInstance);
  ordered.forEach(function(p, i) {
    var m = L.marker([p.lat,p.lng], {icon: L.divIcon({
      html: '<div style="background:#22c55e;color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #fff">' + (i+1) + '</div>',
      className:'', iconSize:[24,24], iconAnchor:[12,12]
    })}).addTo(mapInstance);
    _routeMarkers.push(m);
  });
  var totalMi = 0;
  for (var i=1; i<ordered.length; i++) totalMi += _haverMiles(ordered[i-1], ordered[i]);
  var info = document.getElementById('map-route-info');
  if (info) info.textContent = ordered.length + ' stops · ~' + totalMi.toFixed(1) + ' mi';
  var openBtn = document.getElementById('map-route-open-maps');
  if (openBtn) openBtn.onclick = function() {
    var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS) {
      var daddr = ordered.map(function(p){ return p.lat+','+p.lng; }).join('+to:');
      window.open('maps://?saddr=Current+Location&daddr=' + daddr, '_blank');
    } else {
      var wayStr = ordered.map(function(p){ return p.lat+','+p.lng; }).join('/');
      window.open('https://www.google.com/maps/dir/' + wayStr, '_blank');
    }
  };
}
// Wire route button
document.addEventListener('DOMContentLoaded', function() {
  var routeBtn = document.getElementById('map-route-btn');
  if (routeBtn) routeBtn.addEventListener('click', toggleRouteMode);
  var clearBtn = document.getElementById('map-route-clear');
  if (clearBtn) clearBtn.addEventListener('click', clearRoute);
});

// ── F7: Manager Activity Feed ─────────────────────────────────────────────
var _feedVisible  = false;
var _feedInterval = null;
function renderActivityFeed() {
  var role = getActiveRole();
  var section = document.getElementById('dash-feed-section');
  if (!section) return;
  var isManager = role === 'manager' || role === 'master_admin';
  section.style.display = isManager ? '' : 'none';
  if (!isManager || !_feedVisible) return;
  var entries = loadEntries();
  var appts   = loadAppointments();
  var items = [];
  entries.forEach(function(e) {
    var status = (e.status || '').replace(/-/g,' ');
    items.push({ who: e.repName || 'Rep', what: 'Logged door — ' + status + (e.address ? ' @ ' + e.address : ''), when: e.timestamp || 0 });
  });
  appts.forEach(function(a) {
    var cn = [a.firstName, a.lastName].filter(Boolean).join(' ') || '?';
    items.push({ who: a.repName || 'Rep', what: 'Booked appt for ' + cn, when: a.createdAt || 0 });
  });
  items.sort(function(a,b){ return b.when - a.when; });
  var list = document.getElementById('dash-feed-list');
  if (!list) return;
  var visible = items.slice(0, 30);
  if (!visible.length) { list.innerHTML = '<div style="font-size:13px;color:var(--text-3);padding:8px 0">No activity yet.</div>'; return; }
  list.innerHTML = visible.map(function(item) {
    var av = (item.who || '?').charAt(0).toUpperCase();
    return '<div class="feed-item"><div class="feed-avatar">' + av + '</div><div class="feed-body"><div class="feed-who">' + escHtml(item.who) + '</div><div class="feed-what">' + escHtml(item.what) + '</div><div class="feed-when">' + timeAgo(item.when) + '</div></div></div>';
  }).join('');
}
document.addEventListener('DOMContentLoaded', function() {
  var toggleBtn = document.getElementById('dash-feed-toggle');
  if (!toggleBtn) return;
  toggleBtn.addEventListener('click', function() {
    _feedVisible = !_feedVisible;
    var list = document.getElementById('dash-feed-list');
    if (list) list.style.display = _feedVisible ? '' : 'none';
    toggleBtn.textContent = _feedVisible ? 'Hide' : 'Show';
    if (_feedVisible) {
      renderActivityFeed();
      clearInterval(_feedInterval);
      _feedInterval = setInterval(renderActivityFeed, 30000);
    } else {
      clearInterval(_feedInterval);
    }
  });
});

// ── F10: Impersonation ────────────────────────────────────────────────────
function populateImpersonateDropdown() {
  var sel = document.getElementById('ma-impersonate-select');
  if (!sel) return;
  while (sel.options.length > 1) sel.remove(1);
  loadTeam().forEach(function(m) {
    var opt = document.createElement('option');
    opt.value = m.name + '::' + m.role;
    opt.textContent = m.name + ' (' + m.role + ')';
    sel.appendChild(opt);
  });
}
document.addEventListener('DOMContentLoaded', function() {
  var impBtn = document.getElementById('ma-impersonate-btn');
  if (impBtn) impBtn.addEventListener('click', function() {
    var sel = document.getElementById('ma-impersonate-select');
    if (!sel || !sel.value) return;
    var parts = sel.value.split('::');
    localStorage.setItem('ce_impersonate_name', parts[0]);
    localStorage.setItem('ce_impersonate_role', parts[1] || 'canvasser');
    applyImpersonateBanner();
    try { closeMasterAdmin && closeMasterAdmin(); } catch(_) {}
    try { renderDashboard && renderDashboard(); } catch(_) {}
    try { applyRoleUI && applyRoleUI(); } catch(_) {}
  });
});

// ── F4: SW-backed Push Notifications ─────────────────────────────────────
var REMINDER_WINDOWS_SW = [
  { ms: 24*60*60*1000, label: '24 hours' },
  { ms:  2*60*60*1000, label: '2 hours'  },
  { ms:     60*60*1000, label: '1 hour'  },
  { ms:     10*60*1000, label: '10 minutes' },
];
function _loadPendingReminders() {
  try { return JSON.parse(localStorage.getItem('ce_pending_reminders') || '[]'); } catch(_) { return []; }
}
function _savePendingReminders(arr) {
  try { localStorage.setItem('ce_pending_reminders', JSON.stringify(arr)); } catch(_) {}
}
function scheduleSwReminder(appt) {
  if (!('serviceWorker' in navigator)) return;
  var apptTime = new Date(appt.datetime).getTime();
  var now = Date.now();
  var name = [appt.firstName, appt.lastName].filter(Boolean).join(' ') || 'Customer';
  var apptId = appt.id || appt.datetime;
  var reminders = _loadPendingReminders().filter(function(r){ return r.tag.indexOf('reminder-'+apptId) !== 0; });
  REMINDER_WINDOWS_SW.forEach(function(w) {
    var fireAt = apptTime - w.ms;
    if (fireAt <= now) return;
    var timeStr = new Date(appt.datetime).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
    reminders.push({
      tag: 'reminder-' + apptId + '-' + w.ms,
      fireAt: fireAt, fired: false,
      title: 'Appointment in ' + w.label,
      body: name + ' — ' + timeStr + (appt.closer ? '\\nCloser: ' + appt.closer : ''),
    });
  });
  _savePendingReminders(reminders);
}
function checkSwReminders() {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
  var reminders = _loadPendingReminders().filter(function(r){ return !r.fired; });
  if (!reminders.length) return;
  navigator.serviceWorker.controller.postMessage({ type: 'CHECK_REMINDERS', reminders: reminders });
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', function(event) {
    if (!event.data || event.data.type !== 'REMINDERS_FIRED') return;
    var fired = new Set(event.data.fired || []);
    var all = _loadPendingReminders().map(function(r){ return Object.assign({}, r, { fired: fired.has(r.tag) ? true : r.fired }); });
    _savePendingReminders(all);
  });
}
setInterval(checkSwReminders, 60000);

// Enable Background Reminders button
(function() {
  function _updateBgStatus() {
    var btn = document.getElementById('admin-enable-bg-reminders');
    var st  = document.getElementById('admin-bg-reminder-status');
    if (!btn || !st) return;
    if (!('Notification' in window)) { st.textContent = 'Notifications not supported in this browser.'; return; }
    if (Notification.permission === 'granted')  { st.textContent = '✅ Enabled — reminders will fire in background'; btn.textContent = 'Background Reminders On ✓'; }
    else if (Notification.permission === 'denied')  { st.textContent = '❌ Blocked — enable in browser/device settings'; }
    else { st.textContent = 'Tap to enable background reminders'; }
  }
  document.addEventListener('DOMContentLoaded', function() {
    _updateBgStatus();
    var btn = document.getElementById('admin-enable-bg-reminders');
    if (!btn) return;
    btn.addEventListener('click', function() {
      if (!('Notification' in window)) return;
      Notification.requestPermission().then(function(perm) {
        if (perm === 'granted') {
          try { scheduleAllUpcomingReminders && scheduleAllUpcomingReminders(); } catch(_) {}
          loadAppointments().filter(function(a){ return new Date(a.datetime).getTime() > Date.now(); }).forEach(scheduleSwReminder);
        }
        _updateBgStatus();
      });
    });
  });
})();
'''

# Find the end of the script to insert before
old_script_end = '''function closeDIspoSheet() {
  document.getElementById('dispo-appt-sheet').style.display = 'none';
  document.body.style.overflow = '';
}

document.getElementById('dispo-appt-btn').addEventListener('click', openDispoSheet);

// Update dispo badge on load
(function() {
  const appts   = loadAppointments();
  const pending = appts.filter(a => !a.result || a.result === 'Pending').length;
  const desc    = document.getElementById('dispo-appt-desc');
  if (desc) desc.textContent = pending ? `${pending} pending` : 'All dispositioned';
})();
</script>'''

new_script_end = '''function closeDIspoSheet() {
  document.getElementById('dispo-appt-sheet').style.display = 'none';
  document.body.style.overflow = '';
}

document.getElementById('dispo-appt-btn').addEventListener('click', openDispoSheet);

// Update dispo badge on load
(function() {
  const appts   = loadAppointments();
  const pending = appts.filter(a => !a.result || a.result === 'Pending').length;
  const desc    = document.getElementById('dispo-appt-desc');
  if (desc) desc.textContent = pending ? `${pending} pending` : 'All dispositioned';
})();
''' + new_js + '''</script>'''

replace_once(old_script_end, new_script_end, 'EDIT 16: New JS functions inserted')

# ============================================================
# EDIT 17: Modify onMapTap — add route mode guard at top
# ============================================================
replace_once(
    'function onMapTap(e) {\n  // Close appt sheet if open\n  const apptSheet = document.getElementById(\'appt-result-sheet\');',
    'function onMapTap(e) {\n  // v71: Route Mode — add waypoint instead of opening quick-log\n  if (_routeMode) {\n    _routeWaypoints.push({ lat: e.latlng.lat, lng: e.latlng.lng });\n    drawRoute();\n    return;\n  }\n  // Close appt sheet if open\n  const apptSheet = document.getElementById(\'appt-result-sheet\');',
    'EDIT 17: onMapTap route mode guard added'
)

# ============================================================
# EDIT 18: Modify booking form submit — show handoff card after confetti
# ============================================================
replace_once(
    "  // 🎮 Gamification — celebrate a booked appointment!\n  launchConfetti('🎯 Appointment Booked! Let\\'s close it!');\n});",
    "  // 🎮 Gamification — celebrate a booked appointment!\n  launchConfetti('🎯 Appointment Booked! Let\\'s close it!');\n  setTimeout(function(){ showHandoffCard(appt); }, 900);\n});",
    'EDIT 18: showHandoffCard call added after confetti'
)

# ============================================================
# EDIT 19: Modify first-run setup — trigger onboarding after hideFirstRunModal
# ============================================================
replace_once(
    '  migrateDataV1();\n  applyRoleUI();\n  hideFirstRunModal();\n});',
    '  migrateDataV1();\n  applyRoleUI();\n  hideFirstRunModal();\n  setTimeout(function(){ showOnboarding && showOnboarding(); }, 400);\n});',
    'EDIT 19: showOnboarding call added after hideFirstRunModal'
)

# ============================================================
# EDIT 20: Modify renderDashboard — add renderActivityFeed and updateSyncBadge
# ============================================================
replace_once(
    '  // Upcoming appointments section (closer + manager)\n  renderDashUpcoming();\n  // Manager assign-closer command center\n  renderDashAssign();\n}',
    '  // Upcoming appointments section (closer + manager)\n  renderDashUpcoming();\n  // Manager assign-closer command center\n  renderDashAssign();\n  renderActivityFeed();\n  DataStore.updateSyncBadge();\n}',
    'EDIT 20: renderActivityFeed and updateSyncBadge added to renderDashboard'
)

# ============================================================
# EDIT 21: Modify applyRoleUI — replace localStorage with getActiveRole()
# ============================================================
replace_once(
    "function applyRoleUI() {\n  const role = localStorage.getItem('ce_user_role') || 'canvasser';",
    "function applyRoleUI() {\n  const role = getActiveRole();",
    'EDIT 21: applyRoleUI updated to use getActiveRole()'
)

# ============================================================
# EDIT 22: Modify openMasterAdmin — add populateImpersonateDropdown call
# ============================================================
replace_once(
    "  sheet.classList.add('open');\n}\n\nfunction closeMasterAdmin() {",
    "  populateImpersonateDropdown();\n  sheet.classList.add('open');\n}\n\nfunction closeMasterAdmin() {",
    'EDIT 22: populateImpersonateDropdown added to openMasterAdmin'
)

# ============================================================
# EDIT 23: Modify admin-add-member — save phone field
# ============================================================
replace_once(
    '  team.push({ name, role });\n  saveTeam(team);\n  nameEl.value = \'\';',
    '  var newPhone = (document.getElementById(\'admin-new-phone\') ? document.getElementById(\'admin-new-phone\').value.trim() : \'\');\n  team.push({ name: name, role: role, phone: newPhone });\n  saveTeam(team);\n  nameEl.value = \'\';\n  var phoneEl = document.getElementById(\'admin-new-phone\');\n  if (phoneEl) phoneEl.value = \'\';',
    'EDIT 23: admin-add-member updated to save phone'
)

# ============================================================
# EDIT 24: F8 — Update _texts array in renderReports
# ============================================================
replace_once(
    "  let _texts = ['', '', ''];",
    "  let _texts = ['', '', '', '', '', '', ''];",
    'EDIT 24: _texts array extended to 7 elements'
)

# ============================================================
# EDIT 25: F8 — Add 4 new report blocks to body.innerHTML
# ============================================================
old_reports = '''    // ── Render ─────────────────────────────────────────────────────────────
    body.innerHTML = [
      visualBlock('📊', 'Team Summary',      summaryHtml,    0),
      visualBlock('🏆', 'Top Performers',    performersHtml, 1),
      visualBlock('📉', 'Conversion Funnel', funnelHtml,     2),
    ].join('');'''

new_reports = '''    // v71: extra analytics
    var repMap = {};
    re.forEach(function(e) {
      var rep = e.repName || 'Rep';
      if (!repMap[rep]) repMap[rep] = { doors:0, appts:0 };
      repMap[rep].doors++;
      if (e.status === 'appointment') repMap[rep].appts++;
    });
    var repRows = Object.entries(repMap).map(function(kv){ return { name:kv[0], rate: kv[1].doors ? Math.round(kv[1].appts/kv[1].doors*100) : 0 }; }).sort(function(a,b){ return b.rate-a.rate; });
    var maxRate = Math.max.apply(null, repRows.map(function(r){ return r.rate; }).concat([1]));
    var convByRepHtml = repRows.length ? repRows.map(function(r){ return statRow(r.name, r.rate+'%', r.rate/maxRate*100, '',''); }).join('') : '<div style="color:var(--text-3);font-size:13px">No data yet.</div>';

    var closerMap = {};
    ra.forEach(function(a) {
      var c = a.closer || 'Unassigned';
      if (!closerMap[c]) closerMap[c] = { total:0, signed:0 };
      closerMap[c].total++;
      if ((a.result||'').toLowerCase() === 'signed') closerMap[c].signed++;
    });
    var closerTableHtml = Object.keys(closerMap).length ? '<table style="width:100%;font-size:12px;border-collapse:collapse"><thead><tr><td style="padding:4px 6px;color:var(--text-3);font-weight:700">Closer</td><td style="padding:4px 6px;color:var(--text-3);font-weight:700;text-align:right">Signed/Total</td><td style="padding:4px 6px;color:var(--text-3);font-weight:700;text-align:right">Rate</td></tr></thead><tbody>' + Object.entries(closerMap).map(function(kv){ var c=kv[0],s=kv[1]; var rate=s.total?Math.round(s.signed/s.total*100):0; return '<tr><td style="padding:5px 6px;color:var(--text)">'+escHtml(c)+'</td><td style="padding:5px 6px;color:var(--text-2);text-align:right">'+s.signed+'/'+s.total+'</td><td style="padding:5px 6px;text-align:right;font-weight:700;color:'+(s.signed?'var(--c-green)':'var(--text-3)')+'">'+rate+'%</td></tr>'; }).join('') + '</tbody></table>' : '<div style="color:var(--text-3);font-size:13px">No closer data yet.</div>';

    var areaMap = {};
    re.filter(function(e){ return e.lat && e.lng; }).forEach(function(e) {
      var key = parseFloat(e.lat).toFixed(2) + ',' + parseFloat(e.lng).toFixed(2);
      if (!areaMap[key]) areaMap[key] = 0;
      areaMap[key]++;
    });
    var topArea = Object.entries(areaMap).sort(function(a,b){ return b[1]-a[1]; })[0];
    var bestAreaHtml = topArea ? '<div style="font-size:13px;color:var(--text-2)">Lat/Lng cluster: <strong style="color:var(--text)">' + topArea[0] + '</strong> — ' + topArea[1] + ' doors</div>' : '<div style="font-size:13px;color:var(--text-3)">No GPS data yet.</div>';

    var entryNameMap = {};
    re.forEach(function(e){ if(e.name) entryNameMap[e.name.toLowerCase()] = e.timestamp; });
    var closedAppts = ra.filter(function(a){ return (a.result||'').toLowerCase()==='signed' && a.createdAt; });
    var cycleTimes = closedAppts.map(function(a){ var cn=[a.firstName,a.lastName].join(' ').toLowerCase(); var fc=entryNameMap[cn]; if(!fc) return null; return (new Date(a.datetime).getTime()-fc)/86400000; }).filter(function(d){ return d!==null && d>=0; });
    var avgDays = cycleTimes.length ? (cycleTimes.reduce(function(s,d){return s+d;},0)/cycleTimes.length).toFixed(1) : '—';
    var cycleHtml = '<div style="font-size:28px;font-weight:900;color:var(--text)">' + avgDays + '</div><div style="font-size:12px;color:var(--text-3);margin-top:4px">average days from first contact to signed deal</div>';

    // ── Render ─────────────────────────────────────────────────────────────
    body.innerHTML = [
      visualBlock('📊', 'Team Summary',          summaryHtml,    0),
      visualBlock('🏆', 'Top Performers',        performersHtml, 1),
      visualBlock('📉', 'Conversion Funnel',     funnelHtml,     2),
      visualBlock('👤', 'Rep Conversion Rates',  convByRepHtml,  3),
      visualBlock('🤝', 'Close Rate by Closer',  closerTableHtml,4),
      visualBlock('⏱',  'Avg Sales Cycle',       cycleHtml,      5),
      visualBlock('📍', 'Best Territory',        bestAreaHtml,   6),
    ].join('');'''

replace_once(old_reports, new_reports, 'EDIT 25: renderReports enhanced with 4 new blocks')

# ============================================================
# EDIT 26: Update version string from v70 to v71
# ============================================================
replace_once(
    '      `App version:   capital-energy-v70\\n` +\n      `SW cache:      capital-energy-v70\\n` +',
    '      `App version:   capital-energy-v71\\n` +\n      `SW cache:      capital-energy-v71\\n` +',
    'EDIT 26: Version string updated to v71'
)

# Save file
with open('/Users/aryenwood/claude-projects/capital-energy/index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\nFinal file length: {len(content.splitlines())} lines")
if errors:
    print(f"\nFAILED EDITS: {errors}")
    sys.exit(1)
else:
    print("\nAll edits complete successfully!")
