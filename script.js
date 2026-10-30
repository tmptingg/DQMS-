// ========================================
// APP STATE
// ========================================
// structuredClone() gives the app its own copy, so changing the state
// while you click around never edits the original presets.
const appState = {
  theme: "dark",
  mainView: "opening",      // 'opening' (sign in), 'forgot', 'dispatcher', 'coop'
  currentUser: null,        // the signed-in account, null when signed out
  accounts: structuredClone(DQMS_DATA.accounts),
  dispatcherTab: "queue",   // 'queue', 'terminal', 'logs', 'incidents', 'newIncident', 'settings'
  coopTab: "analytics",     // 'analytics', 'reports', 'fleet', 'dispatchers', 'logs', 'settings'
  reportSubTab: "violations", // 'violations', 'history'

  maxCapacity: DQMS_DATA.maxCapacity,
  maxCounter: DQMS_DATA.maxCounter,

  // One queue per destination: { "Hagonoy": [{plate, driver, pax, arrivedTs, loadedTs}, ...], ... }
  queues: Object.fromEntries(DQMS_DATA.destinations.map(d => [d.name, structuredClone(DQMS_DATA.queues[d.name] || [])])),
  incidents: structuredClone(DQMS_DATA.incidents),
  drivers: DQMS_DATA.drivers.map((d, i) => ({ ...structuredClone(d), id: "drv" + (i + 1) })),
  dispatchers: structuredClone(DQMS_DATA.dispatchers),
  tripLogs: structuredClone(DQMS_DATA.tripLogs),
  coopLogs: structuredClone(DQMS_DATA.coopLogs),

  profilePics: {},          // email -> picture (data URL), set from the profile picture changer
  jeepEvents: [],           // check-out, time-in and void events, newest first
  obstructions: [],         // simulated road obstructions on the route map
  routeState: {},           // active and blocked route per destination
  routeNotice: "",          // last automatic route switch message
  incStatus: "all",         // admin incident filter: all, pending or resolved
  mapDest: "Hagonoy",       // destination shown on the route map
  lastDispatch: null,       // the last dispatch, so it can be undone for a few seconds
  incidentMedia: "No media",

  terminalSearch: "",
  dispatchSearch: "",
  fleetSearch: "",
  strikeSearch: "",
  dispatcherSearch: "",
  logDriver: "",            // driver name picked in the trip log filter, '' = all drivers
  viewAs: "all",            // 'all' or a dispatcher id

  tvDelay: DQMS_DATA.tvDelaySeconds,
  tvIndex: 0,
  tvTimer: null,
  isTvMode: false
};

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const PIN_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>';

// Validation rules
const NAME_RE = /^[A-Za-z][A-Za-z .'-]*$/;   // letters, spaces, periods, apostrophes, hyphens
const PLATE_RE = /^[A-Z]{3}-[0-9]{4}$/;      // ABC-1234 (a space typed in becomes a dash)

// ========================================
// INITIALIZE APP
// ========================================
document.addEventListener("DOMContentLoaded", () => {
  initClock();
  populateViolationTypes();
  $("tvDelaySelect").value = String(appState.tvDelay);
  restoreSession();
  const savedUser = appState.currentUser;
  switchMainView(savedUser ? (savedUser.role === "coop" ? "coop" : "dispatcher") : "opening");

  // Close the search dropdowns when you click anywhere else
  document.addEventListener("click", e => {
    if (!e.target.closest("#fleetSearchInput, #fleetSearchDropdown")) $("fleetSearchDropdown").classList.add("hidden");
    if (!e.target.closest("#dispatcherSearchInput, #dispatcherSearchDropdown")) $("dispatcherSearchDropdown").classList.add("hidden");
    if (!e.target.closest("#logDriverSearch, #logDriverDropdown")) $("logDriverDropdown").classList.add("hidden");
  });

  // Clicking the dimmed backdrop closes the modal
  $("modalOverlay").addEventListener("click", e => {
    if (e.target.id === "modalOverlay") closeModal();
  });

  // Typing again clears the wrong-password message
  $("signInEmail").addEventListener("input", () => $("signInError").classList.add("hidden"));
  $("signInPassword").addEventListener("input", () => $("signInError").classList.add("hidden"));
});

// ========================================
// TOP BANNER
// ========================================
// type: "success" (green), "error" (red), "info" (neutral, used for Coming Soon)
let bannerTimer;
let bannerAction = null;

// type: "success" (green), "error" (red), "info" (neutral, used for Coming Soon)
// action (optional): { label, seconds, run } adds a button, such as Undo
function showBanner(msg, type = "success", action = null) {
  const banner = $("dispatchToast");
  $("dispatchToastMsg").textContent = msg;
  banner.className = "toast-banner global-toast"
    + (type === "success" ? " green-toast" : type === "error" ? " error-toast" : "");

  const btn = $("bannerAction");
  bannerAction = action ? action.run : null;
  btn.textContent = action ? action.label : "";
  btn.classList.toggle("hidden", !action);

  clearTimeout(bannerTimer);
  const secs = action ? action.seconds : type === "info" ? DQMS_DATA.qrToastSeconds : DQMS_DATA.toastSeconds;
  bannerTimer = setTimeout(() => {
    banner.classList.add("hidden");
    bannerAction = null;
  }, secs * 1000);
}

function runBannerAction() {
  const fn = bannerAction;
  bannerAction = null;
  $("dispatchToast").classList.add("hidden");
  if (fn) fn();
}

// "Coming Soon" uses the same banner, in the neutral QR style
function comingSoon(label = "Coming Soon") {
  showBanner(label, "info");
}

// QR button on the terminal tab
function showQrComingSoon() {
  comingSoon("QR Scan: Coming Soon");
}

// ========================================
// CENTERED MODAL
// ========================================
// onConfirm returns false to keep the modal open (for example, when a field is invalid)
let modalAction = null;

function openModal({ title, body, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false, small = false, onConfirm = null }) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = body;
  $("modalBox").className = "modal-box" + (small ? " modal-sm" : "");

  const ok = $("modalConfirmBtn");
  ok.textContent = confirmLabel;
  ok.className = "modal-btn " + (danger ? "modal-btn-danger" : "modal-btn-primary");
  ok.style.display = onConfirm ? "" : "none";

  const cancel = $("modalCancelBtn");
  cancel.textContent = cancelLabel;
  cancel.style.display = cancelLabel ? "" : "none";

  modalAction = onConfirm;
  $("modalOverlay").classList.remove("hidden");
}

function closeModal() {
  $("modalOverlay").classList.add("hidden");
  modalAction = null;
}

function confirmModal() {
  const fn = modalAction;
  const keepOpen = fn ? fn() === false : false;
  if (!keepOpen) closeModal();
}

// ========================================
// SIGN IN / LOG OUT / FORGOT PASSWORD
// ========================================
// Lockout: 5 wrong passwords in a row locks sign-in for 30 seconds
const MAX_ATTEMPTS = 5;
const LOCK_SECONDS = 30;
let failedAttempts = 0;
let lockedUntil = 0;

function signIn() {
  const secondsLeft = Math.ceil((lockedUntil - Date.now()) / 1000);
  if (secondsLeft > 0) {
    showBanner(`Too many failed attempts. Try again in ${secondsLeft} seconds`, "error");
    return;
  }

  const email = $("signInEmail").value.trim().toLowerCase();
  const password = $("signInPassword").value;
  const account = appState.accounts.find(a => a.email === email && a.password === password);

  if (!account) {
    failedAttempts++;
    if (failedAttempts >= MAX_ATTEMPTS) {
      failedAttempts = 0;
      lockedUntil = Date.now() + LOCK_SECONDS * 1000;
      showBanner(`Too many failed attempts. Try again in ${LOCK_SECONDS} seconds`, "error");
    }
    $("signInError").classList.remove("hidden");
    return;
  }

  failedAttempts = 0;
  appState.currentUser = account;
  if (account.role === "dispatcher") appState.viewAs = account.dispatcherId;
  $("signInPassword").value = "";
  if ($("pwToggle")) { $("signInPassword").type = "password"; $("pwToggle").textContent = "Show"; }
  switchDispatcherTab("queue");
  switchCoopTab("analytics");
  switchMainView(account.role === "coop" ? "coop" : "dispatcher");

  const who = account.role === "coop" ? account.name : currentDispatcher().name;
  showBanner(`Login successful. Welcome, ${who}`, "success");
}

// Log out: confirm first, then clear the sign-in fields and go to the sign-in page
function askLogout() {
  openModal({
    title: "Log out?",
    body: `<p class="modal-text">You will need to sign in again to open your dashboard.</p>`,
    confirmLabel: "Log out",
    danger: true,
    onConfirm: doLogout
  });
}

function doLogout() {
  appState.currentUser = null;
  if ($("pwToggle")) { $("signInPassword").type = "password"; $("pwToggle").textContent = "Show"; }
  $("signInEmail").value = "";
  $("signInPassword").value = "";
  $("signInError").classList.add("hidden");
  switchMainView("opening");
  showBanner("Logout successful", "success");
}

// Only a notification for now, nothing is actually sent
function sendResetInstructions() {
  const email = $("forgotEmail").value.trim().toLowerCase();
  if (!email) {
    showBanner("Please enter your email address", "error");
    return;
  }
  const registered = appState.accounts.some(a => a.email === email);
  if (!registered) {
    showBanner("No registered email found", "error");
    return;
  }
  showBanner(`Reset instructions sent to ${email}. Check your inbox.`, "success");
}

// Show or hide the password while typing
function togglePasswordVisibility() {
  const pw = $("signInPassword");
  const show = pw.type === "password";
  pw.type = show ? "text" : "password";
  $("pwToggle").textContent = show ? "Hide" : "Show";
}

// Current dispatcher (null for the admin or when signed out)
function currentDispatcher() {
  const u = appState.currentUser;
  if (!u || u.role !== "dispatcher") return null;
  return appState.dispatchers.find(d => d.id === u.dispatcherId) || null;
}

function isCoop() {
  return !!appState.currentUser && appState.currentUser.role === "coop";
}

// Only the dispatcher whose account owns a place can counter and dispatch it
function canControlPlace(placeName) {
  const me = currentDispatcher();
  if (!me) return false;
  const owner = dispatcherOf(placeName);
  return !!owner && owner.id === me.id;
}

// Main View Navigator (sign in, forgot password, dispatcher, admin)
function switchMainView(viewName) {
  // Going back to the sign-in page signs the account out
  if (viewName === "opening" && appState.currentUser) appState.currentUser = null;

  // Dispatcher and coop pages need the matching account; otherwise stay where you are
  const role = appState.currentUser && appState.currentUser.role;
  if (viewName === "dispatcher" && role !== "dispatcher") return;
  if (viewName === "coop" && role !== "coop") return;

  appState.mainView = viewName;
  document.querySelectorAll(".main-page").forEach(page => page.classList.remove("active"));

  const target = $(`${viewName}View`) || $(`${viewName}OfficerView`);
  if (target) target.classList.add("active");

  // Theme toggle lives on the sign-in pages only; the dispatcher and admin have it in Settings
  $("themeToggleBtn").classList.toggle("hidden", !["opening", "forgot", "publicReport"].includes(viewName));

  if (appState.isTvMode) toggleTvMode(false);
  renderApp();
}

// Dispatcher Sub-Tab Switcher
// Dispatcher Sub-Tab Switcher (Queue, Terminal, Map, Drivers, Settings)
function switchDispatcherTab(tabName) {
  appState.dispatcherTab = tabName;
  document.querySelectorAll("#dispatcherView .sub-tab-panel").forEach(p => p.classList.remove("active"));

  const panels = {
    queue: "tabDispatchQueue",
    terminal: "tabDispatchTerminal",
    map: "tabDispatchMap",
    drivers: "tabDispatchDrivers",
    settings: "tabDispatchSettings"
  };
  $(panels[tabName]).classList.add("active");

  document.querySelectorAll("#dispatcherView .nav-tab-btn").forEach(btn => btn.classList.remove("active"));
  $("btnDispTab" + tabName.charAt(0).toUpperCase() + tabName.slice(1)).classList.add("active");

  if (tabName === "settings") renderSettingsProfiles();
  if (tabName === "map") renderRouteMap();
  if (tabName === "drivers") renderDriverOverview();
}

// Admin Sub-Tab Switcher
function switchCoopTab(tabName) {
  appState.coopTab = tabName;
  document.querySelectorAll("#coopOfficerView .sub-tab-panel").forEach(p => p.classList.remove("active"));

  const targetMap = {
    analytics: "tabCoopAnalytics",
    reports: "tabCoopReports",
    fleet: "tabCoopFleet",
    dispatchers: "tabCoopDispatchers",
    logs: "tabCoopLogs",
    settings: "tabCoopSettings"
  };
  $(targetMap[tabName]).classList.add("active");

  document.querySelectorAll("#coopOfficerView .nav-tab-btn").forEach(btn => btn.classList.remove("active"));
  const btnMap = {
    analytics: "btnCoopTabAnalytics",
    reports: "btnCoopTabReports",
    fleet: "btnCoopTabFleet",
    dispatchers: "btnCoopTabDispatchers",
    logs: "btnCoopTabLogs",
    settings: "btnCoopTabSettings"
  };
  if (btnMap[tabName]) $(btnMap[tabName]).classList.add("active");

  if (tabName === "settings") renderSettingsProfiles();
}

// ========================================
// SETTINGS PROFILE (both views)
// ========================================
// Builds the profile block for whoever is signed in
function renderSettingsProfiles() {
  const u = appState.currentUser;
  if (!u) return;

  const coop = u.role === "coop";
  const disp = coop ? null : currentDispatcher();
  const name = coop ? u.name : disp.name;
  const subtitle = coop ? "Admin" : `${disp.badge} • Dispatcher`;
  const pic = appState.profilePics[u.email];
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("");
  const avatarStyle = pic ? `background-image:url('${pic}')` : "";

  const nameRow = coop
    ? `<div class="setting-row-vertical">
         <span class="setting-label">Name</span>
         <div class="assign-row">
           <input type="text" id="coopNameInput" value="${esc(name)}" maxlength="${DQMS_DATA.maxNameLength}" autocomplete="off">
           <button class="btn-primary-sm" onclick="saveCoopName()">Save</button>
         </div>
       </div>`
    : `<div class="setting-row"><span>Name</span><span class="setting-value">${esc(name)}</span></div>`;

  const html = `
    <div class="settings-group">
      <div class="settings-group-title">PROFILE</div>
      <div class="profile-head">
        <div class="avatar-wrap">
          <div class="profile-avatar" style="${avatarStyle}">${pic ? "" : initials}</div>
          <label class="avatar-edit" title="Change profile picture">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>
            <input type="file" accept="image/*" class="hidden" onchange="handleAvatar(this)">
          </label>
        </div>
        <div>
          <div class="profile-name">${esc(name)}</div>
          <div class="text-muted-sm">${subtitle}</div>
        </div>
      </div>
      ${nameRow}
      <div class="setting-row">
        <span>Email</span>
        <span class="setting-value-row"><span class="setting-value">${esc(u.email)}</span><button class="btn-outline-sm" onclick="comingSoon()">Edit</button></span>
      </div>
      <div class="setting-row">
        <span>Phone Number</span>
        <span class="setting-value-row"><span class="setting-value">${maskPhone(u.phone)}</span><button class="btn-outline-sm" onclick="comingSoon()">Edit</button></span>
      </div>
      <div class="setting-row">
        <span>Password</span>
        <span class="setting-value-row"><span class="setting-value">••••••••</span><button class="btn-outline-sm" onclick="comingSoon()">Edit</button></span>
      </div>
      ${coop ? "" : `<div class="text-muted-sm">Only the Admin can change dispatcher and driver names.</div>`}
    </div>`;

  $(coop ? "coopProfileSection" : "dispProfileSection").innerHTML = html;
  $(coop ? "dispProfileSection" : "coopProfileSection").innerHTML = "";
}

function maskPhone(phone) {
  return "*".repeat(Math.max(0, phone.length - 4)) + phone.slice(-4);
}

// Profile picture changer
function handleAvatar(input) {
  const file = input.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showBanner("Please choose an image file", "error");
    input.value = "";
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    showBanner("Image must be under 2 MB", "error");
    input.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    appState.profilePics[appState.currentUser.email] = reader.result;
    renderSettingsProfiles();
    saveSession();
    showBanner("Profile picture updated", "success");
  };
  reader.readAsDataURL(file);
}

// Coop officer edits their own name (dispatchers cannot)
function saveCoopName() {
  const v = $("coopNameInput").value.trim();
  if (!v) { showBanner("Input all required fields", "error"); return; }
  const err = validateName(v);
  if (err) { showBanner(err, "error"); return; }

  appState.currentUser.name = v;
  saveSession();
  showBanner("Name updated", "success");
  renderSettingsProfiles();
}

// ========================================
// SESSION (survives a page reload in the same tab)
// ========================================
// Everything lives in memory, so a reload used to drop the user back to sign-in.
// The state is saved to sessionStorage so the same tab picks it up again. Passwords are never saved.
const SESSION_KEY = "dqms-session";

function saveSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      version: DQMS_DATA.version,
      jeepEvents: appState.jeepEvents,
      obstructions: appState.obstructions,
      routeState: appState.routeState,
      currentEmail: appState.currentUser ? appState.currentUser.email : null,
      coopName: appState.accounts.find(a => a.role === "coop").name,
      queues: appState.queues,
      incidents: appState.incidents,
      drivers: appState.drivers,
      dispatchers: appState.dispatchers,
      tripLogs: appState.tripLogs,
      coopLogs: appState.coopLogs,
      profilePics: appState.profilePics
    }));
  } catch (e) {
    // storage full or blocked: the app still works, it just will not survive a reload
  }
}

function restoreSession() {
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { saved = null; }
  // A saved session from an older data version is ignored, so new presets always win
  if (!saved || saved.version !== DQMS_DATA.version) return;

  appState.jeepEvents = saved.jeepEvents || [];
  appState.obstructions = saved.obstructions || [];
  appState.routeState = saved.routeState || {};
  appState.queues = saved.queues || appState.queues;
  appState.incidents = saved.incidents || appState.incidents;
  appState.drivers = saved.drivers || appState.drivers;
  appState.dispatchers = saved.dispatchers || appState.dispatchers;
  appState.tripLogs = saved.tripLogs || appState.tripLogs;
  appState.coopLogs = saved.coopLogs || appState.coopLogs;
  appState.profilePics = saved.profilePics || {};
  if (saved.coopName) appState.accounts.find(a => a.role === "coop").name = saved.coopName;
  appState.currentUser = saved.currentEmail
    ? (appState.accounts.find(a => a.email === saved.currentEmail) || null)
    : null;
}

// ========================================
// SMALL HELPERS
// ========================================
const unitStatus = i => (i === 0 ? "LOADING" : i === 1 ? "NEXT" : "WAITING");
const dispatcherOf = place => appState.dispatchers.find(d => d.places.includes(place));
const dispatcherById = id => appState.dispatchers.find(d => d.id === id);
const destName = idx => DQMS_DATA.destinations[idx].name;
const shortName = name => name.split(" (")[0];

const matchesSearch = (d, q) => {
  q = q.trim().toLowerCase();
  return !q || d.name.toLowerCase().includes(q) || d.province.toLowerCase().includes(q);
};
const matchesDriver = (d, q) => {
  q = q.trim().toLowerCase();
  return !q || d.name.toLowerCase().includes(q) || d.plate.toLowerCase().includes(q);
};
const matchesDispatcher = (d, q) => {
  q = q.trim().toLowerCase();
  return !q || d.name.toLowerCase().includes(q) || d.badge.toLowerCase().includes(q);
};

// Timestamp display, e.g. "Oct 21, 5:40 AM"
function fmtTs(ts) {
  const d = new Date(ts);
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${day}, ${h}:${m} ${ampm}`;
}

// "Filed by Steven Gerrard (DSP-001)"
function filedByLabel(inc) {
  const d = dispatcherById(inc.filedBy);
  return d ? `${d.name} (${d.badge})` : "Unknown dispatcher";
}

// Validation helpers (messages go to the top banner)
function validateName(name) {
  if (!name) return "Input all required fields";
  if (name.length > DQMS_DATA.maxNameLength) return `Name can be up to ${DQMS_DATA.maxNameLength} characters`;
  if (!NAME_RE.test(name)) return "Name can only use letters, spaces, periods, apostrophes and hyphens";
  return "";
}

// "abc 1234" or "ABC-1234" both become "ABC-1234"
function normPlate(v) {
  return v.trim().toUpperCase().replace(/\s+/g, "-");
}

function validatePlate(plate) {
  if (!plate) return "Input all required fields";
  if (!PLATE_RE.test(plate)) return "Plate must be 3 letters, a dash or space, then 4 numbers (e.g. ABC-1234)";
  return "";
}

function locLine(inc) {
  const l = inc.location;
  return l ? `<div class="incident-loc">${PIN_SVG}<span><strong>${l.city}, ${l.province}</strong> &mdash; ${esc(l.address)}</span></div>` : "";
}

// ========================================
// MOBILE TERMINAL VIEW (also the dispatcher's Terminal tab)
// ========================================
// Each unit has its own seat limit (set per driver in the fleet)
function capacityOfPlate(plate) {
  const d = appState.drivers.find(x => x.plate === plate);
  return d && d.capacity ? d.capacity : DQMS_DATA.maxCapacity;
}

function renderTerminalMobile() {
  const dests = DQMS_DATA.destinations.filter(d => matchesSearch(d, appState.terminalSearch));

  $("terminalQueues").innerHTML = dests.length === 0
    ? `<div class="empty-queue">No matching destination</div>`
    : dests.map(d => {
        const q = appState.queues[d.name];
        let body;
        if (q.length === 0) {
          body = `<div class="empty-queue">No available jeeps</div>`;
        } else {
          const cur = q[0];
          const cap = capacityOfPlate(cur.plate);
          body = `
            <div class="card loading-card">
              <div class="card-top-row">
                <span class="badge badge-green">NOW LOADING</span>
                <span class="pos-label">POS #1</span>
              </div>
              <div class="driver-line">DRIVER: <strong>${cur.driver}</strong></div>
              <div class="plate-number">${cur.plate}</div>
              <div class="capacity-line ${cur.pax > cap ? "over" : ""}">Capacity: ${cur.pax}/${cap} Pax</div>
            </div>`;
          if (q.length > 1) {
            body += `<div class="section-label">NEXT IN LINE</div><div class="queue-list">` +
              q.slice(1, 4).map((u, i) => `
                <div class="queue-item">
                  <div class="queue-left">
                    <span class="queue-pos">#${i + 2}</span>
                    <div>
                      <div class="queue-plate">${u.plate}</div>
                      <div class="queue-driver">${u.driver}</div>
                    </div>
                  </div>
                  <span class="queue-pax-tag">${u.pax}/${capacityOfPlate(u.plate)}</span>
                </div>`).join("") + `</div>`;
          }
          if (q.length > 4) {
            body += `<div class="upcoming-box">+${q.length - 4} more: ${q.slice(4).map((u, i) => `#${i + 5}${u.plate}`).join(" • ")}</div>`;
          }
        }
        return `<div class="dest-section">${destHeader(d, q.length)}${body}</div>`;
      }).join("");
}

function destHeader(d, count, extra = "") {
  return `
    <div class="dest-header">
      <div>
        <div class="dest-name">${d.name}</div>
        <div class="dest-prov">${d.province}${extra}</div>
      </div>
      <span class="dest-count">${count} ${count === 1 ? "unit" : "units"}</span>
    </div>`;
}

// ========================================
// DISPATCHER QUEUE
// ========================================
function visibleDispatchDests() {
  let list = DQMS_DATA.destinations.filter(d => matchesSearch(d, appState.dispatchSearch));
  if (appState.viewAs !== "all") {
    const disp = dispatcherById(appState.viewAs);
    list = list.filter(d => disp && disp.places.includes(d.name));
  }
  return list;
}

// Every dispatcher can see every place, but only the owner of a place gets the counter and dispatch button
function renderDispatcherQueues() {
  const dests = visibleDispatchDests();
  let emptyMsg = "No matching destination";
  if (appState.viewAs !== "all" && !appState.dispatchSearch.trim()) emptyMsg = "No places assigned to this dispatcher yet";

  $("dispatchDestList").innerHTML = dests.length === 0
    ? `<div class="empty-queue">${emptyMsg}</div>`
    : dests.map(d => {
        const idx = DQMS_DATA.destinations.indexOf(d);
        const q = appState.queues[d.name];
        const owner = dispatcherOf(d.name);
        const mine = canControlPlace(d.name);
        const tag = ` &bull; <span class="${owner ? "dest-owner" : "dest-unassigned"}">${owner ? owner.name : "Unassigned"}</span>`
          + (mine ? ` &bull; <span class="dest-owner">Your place</span>` : "");
        let body;

        if (q.length === 0) {
          body = `<div class="empty-queue">No jeeps queued for this destination</div>`;
        } else {
          const cur = q[0];
          const cap = capacityOfPlate(cur.plate);
          const over = cur.pax > cap;

          if (mine) {
            body = `
              <div class="dq-first ${over ? "over" : ""}">
                <div class="dq-first-top">
                  <div class="dq-first-main">
                    <span class="queue-pos">#1</span>
                    <div>
                      <div class="queue-plate">${cur.plate} (${cur.driver})${strikeTag(cur)}</div>
                      <div class="dq-status">LOADING &bull; ${cur.pax}/${cap}</div>
                    </div>
                  </div>
                  <div class="dq-counter">
                    <button class="btn-counter-square btn-blue" onclick="adjustPax(${idx}, 1)">+</button>
                    <button class="btn-counter-square" onclick="adjustPax(${idx}, -1)">-</button>
                  </div>
                </div>
                ${over ? `<div class="dq-warning">OVERLOADING: ${cur.pax - cap} over the ${cap}-seat capacity. Remove ${cur.pax - cap} passenger${cur.pax - cap > 1 ? "s" : ""} before dispatch.</div>` : ""}
                <button class="btn-dispatch-action ${over ? "over" : ""}" onclick="dispatchUnit(${idx})">${over ? "Dispatch Anyway (Overloaded)" : "Dispatch Unit"}</button>
              </div>`;
          } else {
            const note = owner ? `View only. Handled by ${owner.name}` : "View only. No dispatcher assigned yet";
            body = `
              <div class="dq-first view-only">
                <div class="dq-first-top">
                  <div class="dq-first-main">
                    <span class="queue-pos">#1</span>
                    <div>
                      <div class="queue-plate">${cur.plate} (${cur.driver})${strikeTag(cur)}</div>
                      <div class="dq-status">LOADING &bull; ${cur.pax}/${cap}</div>
                    </div>
                  </div>
                </div>
                <div class="view-only-note">${note}</div>
              </div>`;
          }

          body += q.slice(1, 4).map((u, i) => `
            <div class="queue-item">
              <div class="queue-left">
                <span class="queue-pos">#${i + 2}</span>
                <div>
                  <div class="queue-plate">${u.plate} (${u.driver})</div>
                  <div class="queue-driver" style="color:var(--accent-green);">${unitStatus(i + 1)} &bull; ${u.pax}/${capacityOfPlate(u.plate)}</div>
                </div>
              </div>
            </div>`).join("");
          if (q.length > 4) body += `<div class="upcoming-box">+${q.length - 4} more waiting</div>`;
        }
        return `<div class="dest-section">${destHeader(d, q.length, tag)}${body}</div>`;
      }).join("");
}

// Small tag when the unit on POS #1 has strikes on record
function strikeTag(unit) {
  const drv = appState.drivers.find(d => d.plate === unit.plate);
  if (!drv || drv.strikes === 0) return "";
  return ` <span class="badge-strike strike-tag">${drv.strikes} STRIKE${drv.strikes > 1 ? "S" : ""}</span>`;
}

// Counter: +/- on POS #1 (32 passenger ceiling). Overload is checked against the unit's own capacity.
function adjustPax(idx, delta) {
  const name = destName(idx);
  if (!canControlPlace(name)) {
    showBanner("View only. This place is handled by another dispatcher", "error");
    return;
  }
  const unit = appState.queues[name][0];
  if (!unit || unit.pax + delta < 0) return;
  if (unit.pax + delta > appState.maxCounter) {
    showBanner(`Maximum of ${appState.maxCounter} passengers per unit`, "error");
    return;
  }
  unit.pax += delta;

  const cap = capacityOfPlate(unit.plate);
  if (delta > 0 && unit.pax > cap) {
    showBanner(`OVERLOADING: ${unit.plate} is over its ${cap}-seat capacity (${unit.pax}/${cap})`, "error");
  }
  renderApp();
}

// Dispatch: confirm first. An overloaded unit also needs a reason (120 characters max).
function dispatchUnit(idx) {
  const name = destName(idx);
  if (!canControlPlace(name)) {
    showBanner("View only. This place is handled by another dispatcher", "error");
    return;
  }
  const unit = appState.queues[name][0];
  if (!unit) return;
  const cap = capacityOfPlate(unit.plate);
  const over = unit.pax > cap;

  const overBox = over ? `
      <div class="form-error">This unit is over its ${cap}-seat capacity. Give a reason. It goes to the Admin list automatically.</div>
      <textarea id="overNote" class="form-textarea" rows="3" maxlength="120" placeholder="Why was the overload allowed?" oninput="updateOverNoteCount()"></textarea>
      <div class="label-row"><span class="text-muted-sm">Required</span><span class="char-count" id="overNoteCount">0/120</span></div>` : "";

  openModal({
    title: over ? "Dispatch overloaded unit?" : "Dispatch unit?",
    body: `
      <p class="modal-text">Dispatch <strong>${unit.plate}</strong> (${unit.driver}) to <strong>${shortName(name)}</strong> with <strong>${unit.pax}</strong> passenger${unit.pax === 1 ? "" : "s"}?</p>
      ${overBox}`,
    confirmLabel: over ? "Dispatch anyway" : "Dispatch",
    onConfirm: () => {
      let note = "";
      if (over) {
        note = ($("overNote").value || "").trim();
        if (!note) {
          showBanner("Enter a reason for the overload (120 characters max)", "error");
          return false;
        }
      }
      doDispatch(idx, note);
      return true;
    }
  });
}

function updateOverNoteCount() {
  const v = $("overNote").value;
  $("overNoteCount").textContent = `${v.length}/120`;
}

// Check-out is recorded in the jeep event log. An overloaded unit also drops into the Admin list.
function doDispatch(idx, note = "") {
  const name = destName(idx);
  const q = appState.queues[name];
  if (q.length === 0) return;

  const unit = q.shift();
  const cap = capacityOfPlate(unit.plate);
  const over = unit.pax > cap;
  const now = Date.now();
  const nextPrevLoadedTs = q[0] ? q[0].loadedTs : undefined;
  const dispatcher = currentDispatcher();
  const dest = DQMS_DATA.destinations.find(d => d.name === name);
  const trip = {
    id: "trip" + now,
    driver: unit.driver,
    plate: unit.plate,
    capacity: cap,
    destination: shortName(name),
    dispatcherId: dispatcher ? dispatcher.id : null,
    arrivedTs: unit.arrivedTs,
    loadedTs: unit.loadedTs || unit.arrivedTs,
    dispatchedTs: now,
    pax: unit.pax,
    overNote: over ? note : "",
    voided: false
  };
  appState.tripLogs.unshift(trip);
  appState.jeepEvents.unshift({
    type: "check-out", plate: unit.plate, driver: unit.driver,
    destination: shortName(name), ts: now, voided: false, tripId: trip.id
  });

  let incidentId = null;
  if (over) {
    const inc = {
      id: now,
      driver: unit.driver,
      plate: unit.plate,
      type: "Overloading",
      ts: now,
      occurredTs: now,
      location: { city: shortName(name), province: dest ? dest.province : "", address: "Dispatched from Metro PUV Terminal" },
      notes: note,
      status: "pending",
      decidedTs: null,
      filedBy: dispatcher ? dispatcher.id : null,
      media: "No media",
      source: "overload",
      tripId: trip.id
    };
    appState.incidents.unshift(inc);
    trip.incidentId = inc.id;
    incidentId = inc.id;
  }

  // The next unit starts loading now, so its loading time starts too
  if (q[0]) q[0].loadedTs = now;

  appState.lastDispatch = { name, unit, tripId: trip.id, nextPrevLoadedTs, incidentId };
  showBanner(`${unit.plate} dispatched to ${shortName(name)}${over ? " (overloaded, sent to Admin)" : ""}`,
    over ? "error" : "success",
    { label: "Undo", seconds: 5, run: undoDispatch });
  renderApp();
}

// Undo within 5 seconds. The trip is kept and marked VOIDED, so no record is erased.
function undoDispatch() {
  const last = appState.lastDispatch;
  if (!last) return;

  const trip = appState.tripLogs.find(t => t.id === last.tripId);
  if (trip) { trip.voided = true; trip.voidedTs = Date.now(); }

  const ev = appState.jeepEvents.find(e => e.tripId === last.tripId);
  if (ev) ev.voided = true;

  if (last.incidentId) {
    const inc = appState.incidents.find(i => i.id === last.incidentId);
    if (inc) { inc.status = "voided"; inc.decidedTs = Date.now(); }
  }

  const q = appState.queues[last.name];
  if (q[0]) q[0].loadedTs = last.nextPrevLoadedTs;
  q.unshift(last.unit);

  appState.lastDispatch = null;
  showBanner(`Dispatch undone. ${last.unit.plate} is back at POS #1. The trip is kept as VOIDED.`, "success");
  renderApp();
}

// ========================================
// JEEP STATUS, CHECK-OUT AND TIME-IN
// ========================================
// Status comes from the event log: the newest valid event decides.
function jeepStatus(plate) {
  const ev = appState.jeepEvents.find(e => e.plate === plate && !e.voided);
  return ev && ev.type === "check-out" ? "DISPATCHED" : "STANDBY";
}

function lastCheckOut(plate) {
  return appState.jeepEvents.find(e => e.plate === plate && e.type === "check-out" && !e.voided) || null;
}

// Time-in: the jeep is back in the terminal and on standby
function recordTimeIn(plate) {
  if (jeepStatus(plate) !== "DISPATCHED") {
    showBanner("This jeep is not out on a trip", "error");
    return;
  }
  const drv = appState.drivers.find(d => d.plate === plate);
  appState.jeepEvents.unshift({ type: "time-in", plate, driver: drv ? drv.name : "", destination: "", ts: Date.now(), voided: false });
  showBanner(`${plate} is back in the terminal`, "success");
  renderApp();
}

// Driver overview on the dispatcher side: in the terminal vs in transit
function renderDriverOverview() {
  const standby = [];
  const out = [];
  appState.drivers.forEach(d => (jeepStatus(d.plate) === "DISPATCHED" ? out : standby).push(d));

  $("countStandbyD").textContent = standby.length;
  $("countDispatchedD").textContent = out.length;

  const queuePos = plate => {
    for (const [dest, q] of Object.entries(appState.queues)) {
      const i = q.findIndex(u => u.plate === plate);
      if (i !== -1) return { dest, pos: i + 1 };
    }
    return null;
  };

  $("driversStandby").innerHTML = standby.length === 0
    ? `<div class="empty-queue">No jeeps in the terminal right now</div>`
    : standby.map(d => {
        const qp = queuePos(d.plate);
        const where = qp ? `In queue for ${shortName(qp.dest)} (POS #${qp.pos})` : "In the terminal, not queued";
        return `
        <div class="trip-row">
          <div class="trip-top">
            <div><div class="trip-driver">${esc(d.name)}</div><div class="trip-plate">${d.plate}</div></div>
            <span class="badge-clean">STANDBY</span>
          </div>
          <div class="trip-dest">${where}</div>
        </div>`;
      }).join("");

  $("driversDispatched").innerHTML = out.length === 0
    ? `<div class="empty-queue">No jeeps are out on a trip</div>`
    : out.map(d => {
        const co = lastCheckOut(d.plate);
        return `
        <div class="trip-row">
          <div class="trip-top">
            <div><div class="trip-driver">${esc(d.name)}</div><div class="trip-plate">${d.plate}</div></div>
            <span class="badge-strike">DISPATCHED</span>
          </div>
          <div class="trip-dest">Out to ${co ? esc(co.destination) : "-"}</div>
          <div class="trip-times">
            <div class="trip-time-cell"><span>CHECKED OUT</span><strong>${co ? fmtTs(co.ts) : "-"}</strong></div>
          </div>
          <button class="btn-primary-sm" onclick="recordTimeIn('${d.plate}')">Record time-in</button>
        </div>`;
      }).join("");
}

// Admin fleet breakdown: standby vs dispatched
function renderFleetBreakdown() {
  const out = appState.drivers.filter(d => jeepStatus(d.plate) === "DISPATCHED");
  $("fleetStandbyCount").textContent = appState.drivers.length - out.length;
  $("fleetDispatchedCount").textContent = out.length;
  $("fleetDispatchedList").innerHTML = out.length === 0
    ? "No jeeps are dispatched right now."
    : "Dispatched now: " + out.map(d => {
        const co = lastCheckOut(d.plate);
        return `${esc(d.name)} (${d.plate}), checked out ${co ? fmtTs(co.ts) : "-"}`;
      }).join(" • ");
}

// Admin time log: every check-out and time-in, per plate
function renderTimeLog() {
  const rows = appState.jeepEvents;
  $("timeLogList").innerHTML = rows.length === 0
    ? `<div class="empty-queue">No check-outs or time-ins recorded yet</div>`
    : rows.map(e => {
        const isOut = e.type === "check-out";
        const label = e.voided ? "VOIDED" : (isOut ? "CHECK-OUT" : "TIME-IN");
        const css = e.voided ? "badge-strike" : (isOut ? "badge-strike" : "badge-clean");
        return `
        <div class="trip-row">
          <div class="trip-top">
            <div><div class="trip-driver">${esc(e.driver || "-")}</div><div class="trip-plate">${e.plate}</div></div>
            <span class="${css}">${label}</span>
          </div>
          <div class="trip-times">
            <div class="trip-time-cell"><span>${isOut ? "CHECKED OUT" : "TIMED IN"}</span><strong>${fmtTs(e.ts)}</strong></div>
            ${e.destination ? `<div class="trip-time-cell"><span>DESTINATION</span><strong>${esc(e.destination)}</strong></div>` : ""}
          </div>
        </div>`;
      }).join("");
}

// ========================================
// ROUTE MAP (SIMULATED ROAD NETWORK)
// ========================================
// A small road network. Obstructions block road segments. A route that hits a
// blocked segment switches to the next best route on its own.
const ROAD_NODES = {
  T:  { label: "Metro PUV Terminal", x: 70,  y: 330 },
  J1: { label: "Junction 1",         x: 70,  y: 230 },
  J2: { label: "Junction 2",         x: 150, y: 230 },
  J3: { label: "Junction 3",         x: 150, y: 140 },
  J4: { label: "Junction 4",         x: 260, y: 140 },
  J5: { label: "Junction 5",         x: 230, y: 240 },
  M:  { label: "Marilao",            x: 140, y: 330, dest: "Marilao" },
  Y:  { label: "Meycauayan",         x: 210, y: 350, dest: "Meycauayan" },
  C:  { label: "Calumpit",           x: 290, y: 330, dest: "Calumpit" },
  A:  { label: "Apalit",             x: 310, y: 220, dest: "Apalit" },
  H:  { label: "Hagonoy",            x: 300, y: 60,  dest: "Hagonoy" }
};

// [from, to, length]. Lengths are relative distances on the map.
const ROAD_EDGES = [
  ["T", "J1", 1], ["J1", "J2", 1], ["J2", "J3", 1], ["J3", "J4", 1], ["J4", "H", 1],
  ["J2", "J5", 1.2], ["J5", "J4", 1.2], ["T", "M", 1.4], ["M", "C", 1.2], ["C", "J5", 1.5],
  ["M", "Y", 1.1], ["Y", "J5", 1.3], ["C", "A", 1.6], ["A", "H", 2.0]
];

const MAP_DESTS = ["Hagonoy", "Calumpit", "Marilao", "Meycauayan", "Apalit"];

const edgeKey = (a, b) => [a, b].sort().join("|");

function edgeLength(a, b) {
  const e = ROAD_EDGES.find(([x, y]) => edgeKey(x, y) === edgeKey(a, b));
  return e ? e[2] : Infinity;
}

// Shortest route that avoids blocked road segments (Dijkstra on a small graph)
function shortestRoute(from, to, blocked) {
  const dist = {};
  const prev = {};
  const done = {};
  Object.keys(ROAD_NODES).forEach(n => { dist[n] = Infinity; });
  dist[from] = 0;

  while (true) {
    let u = null;
    Object.keys(dist).forEach(n => {
      if (!done[n] && dist[n] < Infinity && (u === null || dist[n] < dist[u])) u = n;
    });
    if (u === null || u === to) break;
    done[u] = true;

    ROAD_EDGES.forEach(([a, b, w]) => {
      if (blocked.has(edgeKey(a, b))) return;
      let v = null;
      if (a === u) v = b;
      else if (b === u) v = a;
      if (v === null || done[v]) return;
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        prev[v] = u;
      }
    });
  }

  if (dist[to] === Infinity) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev[path[0]]);
  return { path, length: dist[to] };
}

const routeEdges = path => path.slice(0, -1).map((a, i) => edgeKey(a, path[i + 1]));
const routeLength = path => path.slice(0, -1).reduce((sum, a, i) => sum + edgeLength(a, path[i + 1]), 0);
const blockedSet = () => new Set(appState.obstructions.map(o => edgeKey(o.a, o.b)));
const destNodeId = name => Object.keys(ROAD_NODES).find(id => ROAD_NODES[id].dest === name);

// Recomputes every destination's route. A route that touches a blocked segment is replaced automatically.
// Returns the list of switch messages.
function recomputeRoutes() {
  const blocked = blockedSet();
  const notices = [];

  MAP_DESTS.forEach(dest => {
    const to = destNodeId(dest);
    const cur = appState.routeState[dest];
    const curPath = cur ? cur.path : null;
    const hitBlocked = curPath ? routeEdges(curPath).find(k => blocked.has(k)) : null;

    if (curPath && !hitBlocked) return;   // still clear, keep it

    const best = shortestRoute("T", to, blocked);
    const newPath = best ? best.path : null;
    if (curPath && newPath && hitBlocked) {
      const [a, b] = hitBlocked.split("|");
      const ob = appState.obstructions.find(o => edgeKey(o.a, o.b) === hitBlocked);
      notices.push(`Route to ${dest} switched automatically. ${ROAD_NODES[a].label} to ${ROAD_NODES[b].label} is blocked (${ob ? ob.type : "obstruction"}).`);
    } else if (curPath && !newPath) {
      notices.push(`No clear route to ${dest} right now.`);
    }
    appState.routeState[dest] = { path: newPath, previous: curPath && hitBlocked ? curPath : (cur ? cur.previous : null) };
  });

  appState.routeNotice = notices.join(" ");
  return notices;
}

function ensureRoutes() {
  if (Object.keys(appState.routeState).length === 0) recomputeRoutes();
}

function drawRoute(path, cls) {
  const pts = path.map(id => `${ROAD_NODES[id].x},${ROAD_NODES[id].y}`).join(" ");
  return `<polyline points="${pts}" class="${cls}"/>`;
}

function renderRouteMap() {
  ensureRoutes();
  const sel = $("mapDestSelect");
  if (sel.options.length === 0) sel.innerHTML = MAP_DESTS.map(d => `<option value="${d}">${d}</option>`).join("");
  const edgeSel = $("obsEdge");
  if (edgeSel.options.length === 0) {
    edgeSel.innerHTML = ROAD_EDGES.map(([a, b]) => `<option value="${edgeKey(a, b)}">${ROAD_NODES[a].label} to ${ROAD_NODES[b].label}</option>`).join("");
  }

  const dest = appState.mapDest || "Hagonoy";
  sel.value = dest;
  const st = appState.routeState[dest] || { path: null, previous: null };

  const parts = [];
  ROAD_EDGES.forEach(([a, b]) => {
    const A = ROAD_NODES[a];
    const B = ROAD_NODES[b];
    parts.push(`<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" class="road"/>`);
  });
  if (st.previous) parts.push(drawRoute(st.previous, "route-old"));
  if (st.path) parts.push(drawRoute(st.path, "route-new"));
  appState.obstructions.forEach(o => {
    const A = ROAD_NODES[o.a];
    const B = ROAD_NODES[o.b];
    parts.push(`<circle cx="${(A.x + B.x) / 2}" cy="${(A.y + B.y) / 2}" r="9" class="obstruction"><title>${esc(o.type)}</title></circle>`);
  });
  Object.entries(ROAD_NODES).forEach(([id, n]) => {
    parts.push(`<circle cx="${n.x}" cy="${n.y}" r="${n.dest ? 5 : 4}" class="${n.dest ? "node-dest" : "node"}"/>`);
    if (n.dest || id === "T") parts.push(`<text x="${n.x + 8}" y="${n.y - 8}" class="node-label">${n.label}</text>`);
  });
  $("routeMap").innerHTML = parts.join("");

  $("routeStatus").innerHTML = st.path
    ? `Active route to <strong>${dest}</strong>: ${st.path.map(id => esc(ROAD_NODES[id].label)).join(" &gt; ")} (est. ${Math.round(routeLength(st.path) * 2)} min)`
    : `No clear route to <strong>${dest}</strong> right now.`;

  const notice = $("routeNotice");
  notice.textContent = appState.routeNotice || "";
  notice.classList.toggle("hidden", !appState.routeNotice);
}

function setMapDest(name) {
  appState.mapDest = name;
  renderRouteMap();
}

function placeObstruction() {
  const key = $("obsEdge").value;
  const type = $("obsType").value;
  const [a, b] = key.split("|");
  if (!ROAD_NODES[a] || !ROAD_NODES[b]) {
    showBanner("Choose a road from the list", "error");
    return;
  }
  if (appState.obstructions.some(o => edgeKey(o.a, o.b) === key)) {
    showBanner("That road already has an obstruction", "error");
    return;
  }
  appState.obstructions.push({ a, b, type, ts: Date.now() });
  const notices = recomputeRoutes();
  if (notices.length) showBanner(notices[0], "success");
  else showBanner(`${type} reported on ${ROAD_NODES[a].label} to ${ROAD_NODES[b].label}`, "info");
  renderApp();
}

function clearObstructions() {
  appState.obstructions = [];
  recomputeRoutes();
  showBanner("All obstructions cleared", "success");
  renderApp();
}

// ========================================
// TRIP HISTORY (ADMIN LOGS)
// ========================================
// Trip log rows carry the capacity they were dispatched with
const isOverloaded = t => (t.pax > (t.capacity || DQMS_DATA.maxCapacity) ? 1 : 0);

function renderTripLogs() {
  let rows = appState.tripLogs.filter(t => !appState.logDriver || t.driver === appState.logDriver);
  const from = $("tripFrom").value ? new Date($("tripFrom").value).getTime() : -Infinity;
  const to = $("tripTo").value ? new Date($("tripTo").value).getTime() : Infinity;
  rows = rows.filter(t => t.dispatchedTs >= from && t.dispatchedTs <= to);
  const sort = $("tripLogSort").value;

  if (sort === "date-asc") rows.sort((a, b) => a.dispatchedTs - b.dispatchedTs);
  else if (sort === "driver") rows.sort((a, b) => a.driver.localeCompare(b.driver) || b.dispatchedTs - a.dispatchedTs);
  else if (sort === "overloaded") rows.sort((a, b) => (isOverloaded(b) - isOverloaded(a)) || b.dispatchedTs - a.dispatchedTs);
  else rows.sort((a, b) => b.dispatchedTs - a.dispatchedTs);

  $("tripLogSummary").innerHTML = appState.logDriver
    ? `Showing <strong>${rows.length}</strong> trip${rows.length === 1 ? "" : "s"} for ${esc(appState.logDriver)}`
    : `Showing all <strong>${rows.length}</strong> logged trips`;

  $("tripLogList").innerHTML = rows.length === 0
    ? `<div class="empty-queue">No trips match this filter. Try another driver, or clear the date window</div>`
    : rows.map(t => {
        const cap = t.capacity || DQMS_DATA.maxCapacity;
        return `
      <div class="trip-row">
        <div class="trip-top">
          <div>
            <div class="trip-driver">${t.driver}</div>
            <div class="trip-plate">${t.plate}</div>
          </div>
          <span class="${isOverloaded(t) ? "badge-strike" : "badge-clean"}">${t.voided ? "VOIDED • " : ""}${t.pax}/${cap} PAX${isOverloaded(t) ? " • OVERLOADED" : ""}</span>
        </div>
        <div class="trip-dest">${t.destination}</div>
        <div class="trip-times">
          <div class="trip-time-cell"><span>ARRIVED</span><strong>${fmtTs(t.arrivedTs)}</strong></div>
          <div class="trip-time-cell"><span>LOADING</span><strong>${fmtTs(t.loadedTs)}</strong></div>
          <div class="trip-time-cell"><span>DISPATCHED</span><strong>${fmtTs(t.dispatchedTs)}</strong></div>
        </div>
      </div>`;
      }).join("");
}

// Warn once when the trip window is backwards
function onTripWindowChange() {
  const from = $("tripFrom").value;
  const to = $("tripTo").value;
  if (from && to && new Date(from) > new Date(to)) showBanner("The FROM date must be before the TO date", "error");
  renderTripLogs();
}

function clearTripWindow() {
  $("tripFrom").value = "";
  $("tripTo").value = "";
  renderTripLogs();
}

// Driver picker for the trip log (same searchable dropdown style as fleet)
function onLogDriverSearch(v) {
  $("logDriverClear").classList.toggle("hidden", !v);
  renderLogDriverDropdown();
}

function renderLogDriverDropdown() {
  const q = $("logDriverSearch").value;
  const matches = appState.drivers.filter(d => matchesDriver(d, q));

  const allRow = !q.trim() ? `
    <div class="search-item" onclick="selectLogDriver(-1)">
      <div class="search-avatar">ALL</div>
      <div class="search-info">
        <div class="search-name">All drivers</div>
        <div class="search-plate">Full trip history</div>
      </div>
    </div>` : "";

  const rows = matches.map(m => {
    const initials = m.name.split(" ").map(w => w[0]).slice(0, 2).join("");
    return `
      <div class="search-item" onclick="selectLogDriver(${appState.drivers.indexOf(m)})">
        <div class="search-avatar">${initials}</div>
        <div class="search-info">
          <div class="search-name">${m.name}</div>
          <div class="search-plate">${m.plate}</div>
        </div>
      </div>`;
  }).join("");

  $("logDriverDropdown").innerHTML = allRow + rows + (!allRow && matches.length === 0 ? `<div class="search-empty">No driver found</div>` : "");
  $("logDriverDropdown").classList.remove("hidden");
}

// index -1 = show all drivers
function selectLogDriver(index) {
  const d = appState.drivers[index];
  appState.logDriver = d ? d.name : "";
  $("logDriverSearch").value = d ? d.name : "";
  $("logDriverClear").classList.toggle("hidden", !d);
  $("logDriverDropdown").classList.add("hidden");
  renderTripLogs();
}

function clearLogDriver() {
  selectLogDriver(-1);
}

// ========================================
// TV DISPLAY
// ========================================
function tvPanelHtml(d) {
  const q = appState.queues[d.name];
  const head = `
    <div class="tv-dest">
      <div class="tv-dest-label">DESTINATION</div>
      <div class="tv-dest-name">${d.name}</div>
      <div class="tv-dest-prov">${d.province}</div>
    </div>`;

  if (q.length === 0) {
    return `<div class="tv-panel">${head}
      <div class="tv-empty">
        <div class="tv-empty-title">NO AVAILABLE JEEPS</div>
        <div class="tv-empty-sub">Please check the other destinations</div>
      </div></div>`;
  }

  const cur = q[0];
  const cap = capacityOfPlate(cur.plate);
  const next = q.slice(1, 4);
  return `<div class="tv-panel">${head}
    <div class="tv-now">
      <div class="tv-now-head"><span class="badge badge-green">NOW LOADING</span><span class="tv-pos-tag">POS #1</span></div>
      <div class="tv-plate-sm">${cur.plate}</div>
      <div class="tv-driver-line">DRIVER: <strong>${cur.driver}</strong></div>
      <div class="tv-capacity ${cur.pax > cap ? "over" : ""}">Capacity: ${cur.pax}/${cap} Pax</div>
    </div>
    <div class="tv-next-title">NEXT IN LINE</div>
    <div class="tv-next-items">
      ${next.length ? next.map((u, i) => `
        <div class="tv-next-row"><span class="queue-pos">#${i + 2}</span><span class="tv-next-plate">${u.plate}</span></div>`).join("")
        : `<div class="tv-more">No other units waiting</div>`}
    </div>
    ${q.length > 4 ? `<div class="tv-more">+${q.length - 4} more:${q.slice(4).map((u, i) => `#${i + 5} ${u.plate}`).join(" • ")}</div>` : ""}
  </div>`;
}

function renderTv() {
  const groups = DQMS_DATA.tvGroups;
  const idx = appState.tvIndex % groups.length;
  const dests = groups[idx].map(n => DQMS_DATA.destinations.find(d => d.name === n)).filter(Boolean);

  const panels = $("tvPanels");
  panels.style.gridTemplateColumns = `repeat(${dests.length}, 1fr)`;
  panels.innerHTML = dests.map(tvPanelHtml).join("");

  $("tvDots").innerHTML = groups.map((_, i) => `<span class="tv-dot ${i === idx ? "active" : ""}"></span>`).join("");

  // Announcement: who is next for each destination on this screen
  const nexts = dests.filter(d => appState.queues[d.name][1]).map(d => `${appState.queues[d.name][1].plate} IS NEXT FOR ${shortName(d.name).toUpperCase()}`);
  $("tvAnnouncementText").textContent = nexts.length
    ? `PLEASE PROCEED TO BAY 01: ${nexts.join(" • ")}`
    : "PLEASE CHECK THE NEXT SCREEN FOR OTHER DESTINATIONS";
}

// Fade to the next group of nearby destinations, then loop back to the first
function toggleTvMode(enable) {
  appState.isTvMode = enable;
  const overlay = $("tvDisplayOverlay");
  const viewport = $("appViewport");

  if (enable) {
    viewport.classList.add("tv-mode-expanded");
    overlay.classList.add("active");
    appState.tvIndex = 0;
    renderTv();
    startTvRotation();
  } else {
    viewport.classList.remove("tv-mode-expanded");
    overlay.classList.remove("active");
    clearInterval(appState.tvTimer);
  }
}

function startTvRotation() {
  clearInterval(appState.tvTimer);
  appState.tvTimer = setInterval(() => {
    const panels = $("tvPanels");
    panels.classList.add("fade-out");
    setTimeout(() => {
      appState.tvIndex = (appState.tvIndex + 1) % DQMS_DATA.tvGroups.length;
      renderTv();
      panels.classList.remove("fade-out");
    }, 350);
  }, appState.tvDelay * 1000);
}

// Admin setting: seconds per TV screen
function setTvDelay(sec) {
  appState.tvDelay = Number(sec);
  if (appState.isTvMode) startTvRotation();
}

// ========================================
// ADMIN: DISPATCHERS
// ========================================
function renderCoopDispatchers() {
  const assigned = new Set(appState.dispatchers.flatMap(d => d.places));
  const free = DQMS_DATA.destinations.filter(d => !assigned.has(d.name));
  const max = DQMS_DATA.maxPlacesPerDispatcher;
  $("unassignedBadge").textContent = `${free.length} UNASSIGNED`;

  const list = appState.dispatchers.filter(d => matchesDispatcher(d, appState.dispatcherSearch));

  $("coopDispatcherList").innerHTML = list.length === 0
    ? `<div class="empty-queue">No matching dispatcher</div>`
    : list.map(disp => {
        const initials = disp.name.split(" ").map(w => w[0]).slice(0, 2).join("");
        const full = disp.places.length >= max;
        const chips = disp.places.length
          ? disp.places.map(p => `<span class="place-chip">${shortName(p)}<button onclick="unassignPlace('${disp.id}', ${DQMS_DATA.destinations.findIndex(d => d.name === p)})" title="Remove">&times;</button></span>`).join("")
          : `<span class="text-muted-sm">No places assigned yet</span>`;

        let assignRow;
        if (full) assignRow = `<div class="text-muted-sm">Maximum of ${max} places reached</div>`;
        else if (!free.length) assignRow = `<div class="text-muted-sm">Every place already has a dispatcher</div>`;
        else assignRow = `
          <div class="assign-row">
            <select id="assign-${disp.id}" class="form-select-sm">${free.map(d => `<option value="${DQMS_DATA.destinations.indexOf(d)}">${d.name}</option>`).join("")}</select>
            <button class="btn-primary-sm" onclick="assignPlace('${disp.id}')">Assign</button>
          </div>`;

        return `
          <div class="disp-card">
            <div class="disp-card-head">
              <div class="search-avatar">${initials}</div>
              <div class="search-info">
                <div class="search-name">${disp.name}</div>
                <div class="search-plate">${disp.badge} &bull; DISPATCHER</div>
              </div>
              <button class="btn-edit-driver" onclick="openEditName('dispatcher', '${disp.id}')">Edit</button>
              <span class="${full ? "badge-strike" : "badge-clean"}">${disp.places.length}/${max} PLACES</span>
            </div>
            <div class="place-chips">${chips}</div>
            ${assignRow}
          </div>`;
      }).join("");
}

function onDispatcherSearch(v) {
  appState.dispatcherSearch = v;
  $("dispatcherSearchClear").classList.toggle("hidden", !v);
  renderDispatcherDropdown();
  renderCoopDispatchers();
}

function clearDispatcherSearch() {
  $("dispatcherSearchInput").value = "";
  onDispatcherSearch("");
  $("dispatcherSearchDropdown").classList.add("hidden");
}

function renderDispatcherDropdown() {
  const matches = appState.dispatchers.filter(d => matchesDispatcher(d, appState.dispatcherSearch));
  $("dispatcherSearchDropdown").innerHTML = matches.length === 0
    ? `<div class="search-empty">No dispatcher found</div>`
    : matches.map(m => {
        const initials = m.name.split(" ").map(w => w[0]).slice(0, 2).join("");
        return `
        <div class="search-item" onclick="selectDispatcherSearch(${appState.dispatchers.indexOf(m)})">
          <div class="search-avatar">${initials}</div>
          <div class="search-info">
            <div class="search-name">${m.name}</div>
            <div class="search-plate">${m.badge}</div>
          </div>
          <span class="badge-clean">${m.places.length}/${DQMS_DATA.maxPlacesPerDispatcher}</span>
        </div>`;
      }).join("");
  $("dispatcherSearchDropdown").classList.remove("hidden");
}

function selectDispatcherSearch(index) {
  const d = appState.dispatchers[index];
  $("dispatcherSearchInput").value = d.name;
  appState.dispatcherSearch = d.name;
  $("dispatcherSearchClear").classList.remove("hidden");
  $("dispatcherSearchDropdown").classList.add("hidden");
  renderCoopDispatchers();
}

function assignPlace(dispId) {
  const disp = dispatcherById(dispId);
  const sel = $(`assign-${dispId}`);
  if (!disp || !sel) return;
  const place = destName(Number(sel.value));
  const max = DQMS_DATA.maxPlacesPerDispatcher;

  if (disp.places.length >= max) { showBanner(`${disp.name} already has ${max} places`, "error"); return; }
  const owner = dispatcherOf(place);
  if (owner) { showBanner(`${shortName(place)} is already handled by ${owner.name}`, "error"); return; }

  disp.places.push(place);
  addCoopLog("PLACE", `${shortName(place)} assigned to ${disp.name} (${disp.badge}).`);
  showBanner(`${disp.name} now handles ${shortName(place)}`, "success");
  renderApp();
}

function unassignPlace(dispId, destIdx) {
  const disp = dispatcherById(dispId);
  if (!disp) return;
  const place = destName(destIdx);
  disp.places = disp.places.filter(p => p !== place);
  addCoopLog("PLACE", `${shortName(place)} removed from ${disp.name} (${disp.badge}).`);
  renderApp();
}

// Add Dispatcher form: the badge number is assigned automatically, in order
function nextBadge() {
  const nums = appState.dispatchers.map(d => parseInt(d.badge.split("-")[1], 10)).filter(n => !isNaN(n));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `DSP-${String(n).padStart(3, "0")}`;
}

function toggleAddDispatcherForm(show) {
  $("newDispatcherFormBox").classList.toggle("hidden", !show);
  if (show) $("badgePreview").textContent = nextBadge();
}

function saveNewDispatcher() {
  const name = $("newDispatcherName").value.trim();
  if (!name) { showBanner("Input all required fields", "error"); return; }
  const err = validateName(name);
  if (err) { showBanner(err, "error"); return; }

  const badge = nextBadge();
  appState.dispatchers.push({ id: `disp${Date.now()}`, name, badge, places: [] });
  $("newDispatcherName").value = "";
  toggleAddDispatcherForm(false);
  addCoopLog("STAFF", `${name} (${badge}) added as dispatcher.`);
  showBanner(`${name} added as ${badge}`, "success");
  renderApp();
}

// ========================================
// ADMIN: NAME EDITING (drivers and dispatchers)
// ========================================
// Only the admin can edit drivers (name, plate, capacity) and dispatcher names
// kind = 'driver' (key = driver id) or 'dispatcher' (key = dispatcher id)
function openEditName(kind, key) {
  if (!isCoop()) {
    showBanner("Only the Admin can edit this", "error");
    return;
  }

  const driver = kind === "driver" ? appState.drivers.find(d => d.id === key) : null;
  const disp = kind === "dispatcher" ? dispatcherById(key) : null;
  const current = driver ? driver.name : disp.name;
  const driverFields = driver ? `
      <div class="form-label">PLATE NUMBER</div>
      <input type="text" id="modalPlate" maxlength="8" value="${esc(driver.plate)}" autocomplete="off">
      <div class="text-muted-sm">Format: ABC-1234 (3 letters, a dash or space, 4 numbers)</div>
      <div class="form-label">JEEP CAPACITY (SEATS)</div>
      <input type="number" id="modalCapacity" min="1" max="${appState.maxCounter}" value="${driver.capacity || DQMS_DATA.maxCapacity}" inputmode="numeric">
      <div class="text-muted-sm">Whole number from 1 to ${appState.maxCounter}</div>` : "";

  openModal({
    title: driver ? "Edit driver" : "Edit dispatcher name",
    body: `
      <div class="form-label">NAME</div>
      <input type="text" id="modalInput" maxlength="${DQMS_DATA.maxNameLength}" value="${esc(current)}" autocomplete="off">
      ${driverFields}`,
    confirmLabel: "Save",
    onConfirm: () => {
      const name = $("modalInput").value.trim();
      if (!name) { showBanner("Input all required fields", "error"); return false; }
      const nameErr = validateName(name);
      if (nameErr) { showBanner(nameErr, "error"); return false; }

      if (driver) {
        const plate = normPlate($("modalPlate").value);
        const plateErr = validatePlate(plate);
        if (plateErr) { showBanner(plateErr, "error"); return false; }

        const capRaw = $("modalCapacity").value.trim();
        const capacity = Number(capRaw);
        if (!capRaw) { showBanner("Input all required fields", "error"); return false; }
        if (!Number.isInteger(capacity) || capacity < 1 || capacity > appState.maxCounter) {
          showBanner(`Capacity must be a whole number from 1 to ${appState.maxCounter}`, "error");
          return false;
        }

        const oldName = driver.name;
        const oldPlate = driver.plate;
        const oldCap = driver.capacity || DQMS_DATA.maxCapacity;
        const plateChanged = plate !== oldPlate;

        if (plateChanged && appState.drivers.some(d => d.plate === plate)) {
          showBanner(`Plate ${plate} is already registered`, "error");
          return false;
        }
        if (plateChanged && Object.values(appState.queues).some(q => q.some(u => u.plate === oldPlate))) {
          showBanner("This unit is still in a queue. Dispatch it first", "error");
          return false;
        }

        driver.name = name;
        if (plateChanged) {
          driver.plate = plate;
          // open reports follow the corrected plate; past trip history keeps what was recorded at the time
          appState.incidents.forEach(i => { if (i.plate === oldPlate) i.plate = plate; });
          addCoopLog("DRIVER", `Plate for ${name} changed from ${oldPlate} to ${plate}.`);
        }
        driver.capacity = capacity;
        if (capacity !== oldCap) addCoopLog("DRIVER", `Capacity for ${name} (${plate}) changed from ${oldCap} to ${capacity} seats.`);
        if (name !== oldName) addCoopLog("DRIVER", `Driver name changed from ${oldName} to ${name} (${plate}).`);
      } else {
        const oldName = disp.name;
        disp.name = name;
        addCoopLog("STAFF", `Dispatcher name changed from ${oldName} to ${name} (${disp.badge}).`);
      }

      showBanner("Changes saved", "success");
      renderApp();
      return true;
    }
  });
  setTimeout(() => { const i = $("modalInput"); if (i) { i.focus(); i.select(); } }, 60);
}

// ========================================
// ADMIN: LOGS (cooperation actions + trip history, with flairs)
// ========================================
const FLAIR_LABELS = { STAFF: "Staff", STRIKE: "Strike", DRIVER: "Driver", PLACE: "Place", DISPATCH: "Dispatch" };
const flairHtml = f => `<span class="flair flair-${f.toLowerCase()}">${FLAIR_LABELS[f]}</span>`;

function addCoopLog(flair, text) {
  appState.coopLogs.unshift({ ts: Date.now(), flair, text });
}

// Cooperation actions + every dispatcher trip, merged into one list
function allCoopLogEntries() {
  const trips = appState.tripLogs.map(t => {
    const disp = dispatcherById(t.dispatcherId);
    return {
      ts: t.dispatchedTs,
      flair: "DISPATCH",
      text: `${t.plate} (${t.driver}) dispatched to ${t.destination} with ${t.pax} pax${isOverloaded(t) ? " (overloaded)" : ""}${disp ? `, by ${disp.name}` : ""}.`
    };
  });
  return appState.coopLogs.concat(trips);
}

function renderCoopLogs() {
  const sort = $("coopLogSort").value;
  let rows = allCoopLogEntries().slice();

  if (sort === "oldest") rows.sort((a, b) => a.ts - b.ts);
  else if (FLAIR_LABELS[sort]) rows.sort((a, b) => ((a.flair === sort ? 0 : 1) - (b.flair === sort ? 0 : 1)) || b.ts - a.ts);
  else rows.sort((a, b) => b.ts - a.ts);

  $("coopLogCountBadge").textContent = `${rows.length} ENTRIES`;
  $("coopLogList").innerHTML = rows.length === 0
    ? `<div class="empty-queue">No actions logged yet</div>`
    : rows.map(l => `
      <div class="log-entry">
        <div class="log-entry-top">
          ${flairHtml(l.flair)}
          <span class="log-entry-time">${fmtTs(l.ts)}</span>
        </div>
        <div class="log-entry-text">${esc(l.text)}</div>
      </div>`).join("");
}

// ========================================
// ADMIN: DOWNLOADS (.txt, admin only)
// ========================================
function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fileDate = () => new Date().toISOString().slice(0, 10);
const RULE = "----------------------------------------------------";

function buildStatsReport() {
  const pending = appState.incidents.filter(i => i.status === "pending").length;
  const approved = appState.incidents.filter(i => i.status === "approved").length;
  const rejected = appState.incidents.filter(i => i.status === "rejected").length;
  const util = fleetUtilization();
  const today = new Date().toDateString();
  const tripsToday = appState.tripLogs.filter(t => !t.voided && new Date(t.dispatchedTs).toDateString() === today).length;
  const liveTrips = appState.tripLogs.filter(t => !t.voided).length;

  const lines = [
    "METRO PUV TERMINAL - BAY 01",
    "ADMIN STATS REPORT",
    `Generated: ${fmtTs(Date.now())}`,
    "",
    "SUMMARY",
    RULE,
    `Trips today:                ${tripsToday}`,
    `Registered jeeps:           ${util.total}`,
    `Pending review:             ${pending}`,
    `Registered dispatchers:     ${appState.dispatchers.length}`,
    `Trips logged (not voided):  ${liveTrips}`,
    "",
    "PASSENGER THROUGHPUT BY DESTINATION",
    RULE
  ];
  const throughput = passengersByDestination();
  if (throughput.length === 0) lines.push("No trips dispatched yet.");
  throughput.forEach(([dest, pax]) => lines.push(`${dest.padEnd(34)} ${pax} pax`));

  lines.push("", "FLEET UTILIZATION", RULE,
    `Active (in queue or in transit): ${util.active} of ${util.total} (${util.pct}%)`,
    `  In queue:    ${util.queued}`,
    `  In transit:  ${util.transit}`,
    `  Idle:        ${util.idle}`,
    "",
    "INCIDENT REPORTS", RULE,
    `Awaiting review: ${pending}`,
    `Strike issued:   ${approved}`,
    `Dismissed:       ${rejected}`,
    "",
    "STRIKE WATCH", RULE);
  appState.drivers.forEach(d => lines.push(`${d.name.padEnd(22)} ${d.plate.padEnd(10)} ${d.status}`));
  return lines.join("\n");
}

function downloadStatsReport() {
  downloadTextFile(`stats-report-${fileDate()}.txt`, buildStatsReport());
  showBanner("Stats report downloaded", "success");
}

function downloadCoopLogs() {
  const lines = [
    "METRO PUV TERMINAL - BAY 01",
    "ADMIN ACTIVITY LOGS",
    `Generated: ${fmtTs(Date.now())}`,
    "Other terminal logs: coming soon",
    RULE
  ];
  allCoopLogEntries().sort((a, b) => b.ts - a.ts)
    .forEach(l => lines.push(`[${fmtTs(l.ts)}] [${FLAIR_LABELS[l.flair]}] ${l.text}`));
  downloadTextFile(`coop-logs-${fileDate()}.txt`, lines.join("\n"));
  showBanner("Logs downloaded", "success");
}

// ========================================
// ANALYTICS CHARTS (bar charts with axis, values, and a highlighted peak)
// ========================================
// ========================================
// ANALYTICS (ADMIN)
// ========================================
// Passengers per destination, from the live trip log (voided trips are excluded)
function passengersByDestination() {
  const totals = {};
  appState.tripLogs.filter(t => !t.voided).forEach(t => {
    totals[t.destination] = (totals[t.destination] || 0) + (Number(t.pax) || 0);
  });
  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

// Fleet utilization: active = in a queue or in transit; idle = in the terminal and not queued
function fleetUtilization() {
  const queuedPlates = new Set();
  Object.values(appState.queues).forEach(q => q.forEach(u => queuedPlates.add(u.plate)));
  let queued = 0;
  let transit = 0;
  let idle = 0;
  appState.drivers.forEach(d => {
    if (jeepStatus(d.plate) === "DISPATCHED") transit++;
    else if (queuedPlates.has(d.plate)) queued++;
    else idle++;
  });
  const total = appState.drivers.length;
  const active = queued + transit;
  return { total, queued, transit, idle, active, pct: total ? Math.round((active / total) * 100) : 0 };
}

function renderThroughput() {
  const rows = passengersByDestination();
  const max = rows.length ? rows[0][1] : 0;
  $("throughputList").innerHTML = rows.length === 0
    ? `<div class="text-muted-sm">No trips dispatched yet. Totals appear here after a dispatch.</div>`
    : rows.map(([dest, pax]) => `
      <div class="hbar-row">
        <div class="hbar-label"><span>${esc(dest)}</span><strong>${pax} pax</strong></div>
        <div class="hbar-track"><div class="hbar-fill" style="width:${max ? (pax / max) * 100 : 0}%"></div></div>
      </div>`).join("");
}

function renderUtilization() {
  const u = fleetUtilization();
  $("utilPct").textContent = `${u.pct}%`;
  const line = (label, n, cls) => `
      <div class="hbar-row">
        <div class="hbar-label"><span>${label}</span><strong>${n} of ${u.total}</strong></div>
        <div class="hbar-track"><div class="hbar-fill ${cls}" style="width:${u.total ? (n / u.total) * 100 : 0}%"></div></div>
      </div>`;
  $("utilBreakdown").innerHTML =
    line("In queue (active)", u.queued, "fill-queue") +
    line("In transit (active)", u.transit, "fill-transit") +
    line("Idle in terminal", u.idle, "fill-idle");
}

function renderAnalytics() {
  const today = new Date().toDateString();
  $("coopStatTripsCount").textContent =
    appState.tripLogs.filter(t => !t.voided && new Date(t.dispatchedTs).toDateString() === today).length;
  renderThroughput();
  renderUtilization();
}

// Severity follows the violation type. Admin can later change it.
const SEVERITY = {
  "Refusal to Load / Bypass": "Major",
  "Overloading": "Major",
  "Fare Overcharging": "Minor",
  "Reckless Driving": "Critical",
  "Unauthorized Departure": "Major"
};

function severityOf(inc) {
  return inc.severity || SEVERITY[inc.type] || "Minor";
}

// Who filed the report
const filedByText = inc => {
  if (inc.source === "public") return `Passenger report`;
  if (inc.source === "overload") return "Dispatcher overload note";
  const d = dispatcherById(inc.filedBy);
  return d ? `${d.name} (${d.badge})` : "Unknown dispatcher";
};

function renderIncidentViews() {
  const pending = appState.incidents.filter(i => i.status === "pending").length;
  $("coopStatPendingCount").textContent = pending;
  $("coopHeaderReviewBadge").textContent = `${pending} TO REVIEW`;
  renderHistory();
  renderViolationsTable();
}

function setIncStatus(v) {
  appState.incStatus = v;
  document.querySelectorAll(".inc-filter").forEach(b => b.classList.toggle("active", b.dataset.v === v));
  renderHistory();
}

// Admin incident list: status filter, date window, and six sort options
function renderHistory() {
  const sort = $("incSort").value;
  const filter = appState.incStatus || "all";
  const from = $("historyFrom").value ? new Date($("historyFrom").value).getTime() : -Infinity;
  const to = $("historyTo").value ? new Date($("historyTo").value).getTime() : Infinity;

  let rows = appState.incidents.filter(i => {
    if (filter === "pending") return i.status === "pending";
    if (filter === "resolved") return i.status !== "pending";
    return true;
  });
  rows = rows.filter(i => i.ts >= from && i.ts <= to);
  $("historyFilterNote").textContent = from > to
    ? "Start is after end"
    : `${rows.length} report${rows.length === 1 ? "" : "s"} shown`;

  const rank = { Critical: 3, Major: 2, Minor: 1 };
  const hasMedia = i => (i.media && i.media !== "No media" ? 1 : 0);
  const pendingFirst = i => (i.status === "pending" ? 0 : 1);

  if (sort === "type") rows.sort((a, b) => a.type.localeCompare(b.type) || b.ts - a.ts);
  else if (sort === "media-yes") rows.sort((a, b) => hasMedia(b) - hasMedia(a) || b.ts - a.ts);
  else if (sort === "media-no") rows.sort((a, b) => hasMedia(a) - hasMedia(b) || b.ts - a.ts);
  else if (sort === "severity") rows.sort((a, b) => rank[severityOf(b)] - rank[severityOf(a)] || b.ts - a.ts);
  else if (sort === "status-pending") rows.sort((a, b) => pendingFirst(a) - pendingFirst(b) || b.ts - a.ts);
  else if (sort === "status-resolved") rows.sort((a, b) => pendingFirst(b) - pendingFirst(a) || b.ts - a.ts);
  else if (sort === "plate") rows.sort((a, b) => a.plate.localeCompare(b.plate) || b.ts - a.ts);
  else rows.sort((a, b) => b.ts - a.ts);

  $("incidentList").innerHTML = rows.length === 0
    ? `<div class="text-muted-sm" style="padding:10px 0;">No reports here yet. Passenger reports appear after they are submitted from the landing page.</div>`
    : rows.map(incidentCardHtml).join("");
}

function incidentCardHtml(inc) {
  const sev = severityOf(inc);
  const isPending = inc.status === "pending";
  const label = inc.status === "voided" ? "VOIDED"
    : isPending ? (inc.source === "overload" ? "AWAITING CONFIRMATION" : "AWAITING REVIEW")
    : inc.status === "approved" ? "STRIKE ISSUED" : "DISMISSED";
  const css = isPending ? "pending" : inc.status === "approved" ? "approved" : "rejected";
  const tag = inc.reporterId ? `<span class="reporter-tag">${inc.reporterId}</span>` : "";
  const actions = isPending ? `
        <div class="btn-action-row">
          <button class="btn-approve" onclick="reviewIncident(${inc.id}, 'approve')">Approve</button>
          <button class="btn-reject" onclick="reviewIncident(${inc.id}, 'reject')">Reject</button>
        </div>` : "";
  return `
      <div class="report-card ${css}">
        <div class="report-head">
          <span>${esc(inc.type)} <span class="sev-pill sev-${sev.toLowerCase()}">${sev}</span></span>
          <span>${label}</span>
        </div>
        <div class="report-driver">${esc(inc.driver)} (${inc.plate})</div>
        <div class="filed-by">${esc(filedByText(inc))} ${tag}</div>
        <div class="incident-meta">Happened ${fmtTs(inc.occurredTs || inc.ts)} • Reported ${fmtTs(inc.ts)}${inc.decidedTs ? " • Decided " + fmtTs(inc.decidedTs) : ""}</div>
        ${locLine(inc)}
        ${inc.notes ? `<div class="report-notes">${esc(inc.notes)}</div>` : ""}
        <button class="btn-outline-sm media-btn" onclick="viewMedia(${inc.id})">View attached media</button>
        ${actions}
      </div>`;
}

// Violations table (Analytics tab): exact time it happened, time it was reported, and the key details
function statusShort(inc) {
  if (inc.status === "voided") return "Voided";
  if (inc.status === "pending") return inc.source === "overload" ? "Awaiting confirmation" : "Pending";
  return inc.status === "approved" ? "Strike issued" : "Dismissed";
}

function renderViolationsTable() {
  const rows = [...appState.incidents].sort((a, b) => (b.occurredTs || b.ts) - (a.occurredTs || a.ts));
  $("violationsBody").innerHTML = rows.length === 0
    ? `<tr><td colspan="6">No violations recorded</td></tr>`
    : rows.map(i => `<tr><td>${fmtTs(i.occurredTs || i.ts)}</td><td>${fmtTs(i.ts)}</td><td>${i.plate}</td><td>${esc(i.driver)}</td><td>${esc(i.type)}</td><td>${statusShort(i)}</td></tr>`).join("");
}

// Each media preset becomes the file names a dispatcher would have attached,
// e.g. 2026_img_cmr_1042.jpg. Passenger uploads use their own file names.
const MEDIA_PARTS = {
  "1 JPG": [["img", "jpg"]],
  "1 PNG": [["scr", "png"]],
  "1 MP4": [["vid", "mp4"]],
  "Combination of MP4 and PNG": [["vid", "mp4"], ["scr", "png"]],
  "Combination of JPEG and PNG": [["img", "jpeg"], ["scr", "png"]]
};

function mediaFileNames(inc) {
  if (inc.files && inc.files.length) {
    return inc.files.map(name => ({ name, ext: (name.split(".").pop() || "").toUpperCase() }));
  }
  return (MEDIA_PARTS[inc.media] || []).map(([kind, ext], idx) => {
    const n = String(1000 + ((inc.id * 37 + idx * 113) % 9000));
    return { name: `2026_${kind}_cmr_${n}.${ext}`, ext: ext.toUpperCase() };
  });
}

// Media viewer: file names, then a sample photo with a credit line (or "Coming Soon" if the photo is missing)
function viewMedia(id) {
  const inc = appState.incidents.find(i => i.id === id);
  if (!inc) return;
  const files = mediaFileNames(inc);
  const sample = DQMS_DATA.mediaSample;

  if (files.length === 0) {
    openModal({
      title: "Attached media",
      small: true,
      cancelLabel: "Close",
      body: `<div class="modal-media"><strong>No media attached</strong></div>`
    });
    return;
  }

  const list = `<div class="file-list">${files.map(f => `
      <div class="file-row"><span class="file-ext">${f.ext}</span><span class="file-name">${f.name}</span></div>`).join("")}
    </div>`;
  const photo = `<div class="media-frame">
      <img src="${sample.file}" alt="Sample photo of a jeepney" onerror="this.parentElement.innerHTML='<div class=&quot;modal-media&quot;><strong>Coming Soon</strong></div>'">
      <div class="media-credit">${sample.credit}</div>
    </div>`;

  openModal({
    title: "Attached media",
    cancelLabel: "Close",
    body: list + photo
  });
}

function reviewIncident(id, decision) {
  const inc = appState.incidents.find(i => i.id === id);
  if (!inc) return;

  inc.status = decision === "approve" ? "approved" : "rejected";
  inc.decidedTs = Date.now();

  if (decision === "approve") {
    const driver = appState.drivers.find(d => d.plate === inc.plate);
    if (driver) {
      driver.strikes += 1;
      driver.status = `${driver.strikes} Strike${driver.strikes > 1 ? "s" : ""}`;
    }
  }

  addCoopLog("STRIKE", `${inc.type} report for ${inc.driver} (${inc.plate}) ${decision === "approve" ? "approved. Strike issued." : "dismissed."}`);
  renderApp();
}

// Warn once when the date window is backwards, instead of on every redraw
function onHistoryFilterChange() {
  const from = $("historyFrom").value;
  const to = $("historyTo").value;
  if (from && to && new Date(from) > new Date(to)) showBanner("The FROM date must be before the TO date", "error");
  renderHistory();
}

function clearHistoryFilter() {
  $("historyFrom").value = "";
  $("historyTo").value = "";
  renderHistory();
}

// Strike Watch: search + sort by name or strikes
function onStrikeSearch(v) {
  appState.strikeSearch = v;
  $("strikeSearchClear").classList.toggle("hidden", !v);
  renderStrikeWatch();
}

function clearStrikeSearch() {
  $("strikeSearchInput").value = "";
  onStrikeSearch("");
}

function renderStrikeWatch() {
  const sort = $("strikeSort").value;
  let list = appState.drivers.filter(d => matchesDriver(d, appState.strikeSearch));
  if (sort === "strikes") list.sort((a, b) => b.strikes - a.strikes || a.name.localeCompare(b.name));
  else if (sort === "standing") list.sort((a, b) => (a.strikes > 0) - (b.strikes > 0) || a.name.localeCompare(b.name));
  else list.sort((a, b) => a.name.localeCompare(b.name));

  $("coopStrikeWatchList").innerHTML = list.length === 0
    ? `<div class="empty-queue">No matching driver</div>`
    : list.map(d => `
      <div class="strike-item">
        <span>${d.name} <small style="color:var(--text-muted);">${d.plate}</small></span>
        <span class="${d.strikes > 0 ? "badge-strike" : "badge-clean"}">${d.status}</span>
      </div>`).join("");
}

// ========================================
// ADMIN: FLEET
// ========================================
function toggleAddDriverForm(show) {
  $("newDriverFormBox").classList.toggle("hidden", !show);
}

// Strict input check: name rules, plate format, and no duplicate plates
function saveNewDriver() {
  const name = $("newDriverName").value.trim();
  const plate = normPlate($("newDriverPlate").value);

  if (!name || !plate) { showBanner("Input all required fields", "error"); return; }

  const nameErr = validateName(name);
  if (nameErr) { showBanner(nameErr, "error"); return; }

  const plateErr = validatePlate(plate);
  if (plateErr) { showBanner(plateErr, "error"); return; }

  if (appState.drivers.some(d => d.plate === plate)) {
    showBanner(`Plate ${plate} is already registered`, "error");
    return;
  }

  const capRaw = $("newDriverCapacity").value.trim();
  if (!capRaw) { showBanner("Input all required fields", "error"); return; }
  const capacity = Number(capRaw);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > appState.maxCounter) {
    showBanner(`Capacity must be a whole number from 1 to ${appState.maxCounter}`, "error");
    return;
  }

  appState.drivers.push({ id: "drv" + Date.now(), name, plate, capacity, status: "In Good Standing", strikes: 0, addedTs: Date.now() });
  $("newDriverCapacity").value = "";
  addCoopLog("DRIVER", `${name} (${plate}) added to fleet.`);
  $("newDriverName").value = "";
  $("newDriverPlate").value = "";
  toggleAddDriverForm(false);
  showBanner(`${name} added to fleet`, "success");
  renderApp();
}

// Remove a driver: confirm in a centered modal, and not while the unit is in a queue
function removeDriver(id) {
  const d = appState.drivers.find(x => x.id === id);
  if (!d) return;

  const queued = Object.values(appState.queues).some(q => q.some(u => u.plate === d.plate));
  if (queued) {
    showBanner(`${d.name} is still in a queue. Dispatch the unit first`, "error");
    return;
  }

  openModal({
    title: "Remove driver?",
    body: `<p class="modal-text"><strong>${d.name}</strong> (${d.plate}) will be removed from the fleet. Their trip history stays in the logs.</p>`,
    confirmLabel: "Remove",
    danger: true,
    onConfirm: () => {
      appState.drivers = appState.drivers.filter(x => x.id !== d.id);
      addCoopLog("DRIVER", `${d.name} (${d.plate}) removed from fleet.`);
      showBanner(`${d.name} removed from the fleet`, "success");
      renderApp();
      return true;
    }
  });
}

function onFleetSearch(v) {
  appState.fleetSearch = v;
  $("fleetSearchClear").classList.toggle("hidden", !v);
  renderFleetDropdown();
  renderFleet();
}

function clearFleetSearch() {
  $("fleetSearchInput").value = "";
  onFleetSearch("");
  $("fleetSearchDropdown").classList.add("hidden");
}

function renderFleetDropdown() {
  const matches = appState.drivers.filter(d => matchesDriver(d, appState.fleetSearch));
  $("fleetSearchDropdown").innerHTML = matches.length === 0
    ? `<div class="search-empty">No driver found</div>`
    : matches.map(m => {
        const initials = m.name.split(" ").map(w => w[0]).slice(0, 2).join("");
        return `
        <div class="search-item" onclick="selectFleetDriver(${appState.drivers.indexOf(m)})">
          <div class="search-avatar">${initials}</div>
          <div class="search-info">
            <div class="search-name">${m.name}</div>
            <div class="search-plate">${m.plate}</div>
          </div>
          <span class="${m.strikes > 0 ? "badge-strike" : "badge-clean"}">${m.status}</span>
        </div>`;
      }).join("");
  $("fleetSearchDropdown").classList.remove("hidden");
}

function selectFleetDriver(index) {
  const d = appState.drivers[index];
  $("fleetSearchInput").value = d.name;
  appState.fleetSearch = d.name;
  $("fleetSearchClear").classList.remove("hidden");
  $("fleetSearchDropdown").classList.add("hidden");
  renderFleet();
}

// Fleet list: filtered by the search, sorted by name, recently added, or amount of strikes
function renderFleet() {
  const sort = $("fleetSort").value;
  let list = appState.drivers.filter(d => matchesDriver(d, appState.fleetSearch));
  if (sort === "recent") list.sort((a, b) => (b.addedTs || 0) - (a.addedTs || 0));
  else if (sort === "strikes") list.sort((a, b) => b.strikes - a.strikes || a.name.localeCompare(b.name));
  else list.sort((a, b) => a.name.localeCompare(b.name));

  $("coopFleetRosterList").innerHTML = list.length === 0
    ? `<div class="empty-queue">${appState.drivers.length === 0 ? "No drivers yet. Add your first driver with the button above" : "No matching driver"}</div>`
    : list.map(d => `
      <div class="fleet-item">
        <div>
          <div>${d.name}</div>
          <div style="font-size:11px; color:var(--text-muted);">${d.plate} • ${d.capacity || DQMS_DATA.maxCapacity} seats • Added ${d.addedTs ? fmtTs(d.addedTs) : "-"}</div>
        </div>
        <div class="fleet-actions">
          <span class="${d.strikes > 0 ? "badge-strike" : "badge-clean"}">${d.status}</span>
          <button class="btn-edit-driver" onclick="openEditName('driver', '${d.id}')" title="Edit driver">Edit</button>
          <button class="btn-remove-driver" onclick="removeDriver('${d.id}')" title="Remove driver">Remove</button>
        </div>
      </div>`).join("");

  $("fleetDriverCountBadge").textContent = `${appState.drivers.length} DRIVERS`;
  $("coopStatFleetCount").textContent = appState.drivers.length;
  renderFleetBreakdown();
}

// ========================================
// INCIDENT FORM (dispatcher)
// ========================================
function populateViolationTypes() {
  const select = $("pubType");
  DQMS_DATA.violationTypes.forEach(t => select.add(new Option(t, t)));
}

function updatePubReasonCount() {
  const v = $("pubReason").value;
  $("pubReasonCount").textContent = `${v.length}/300`;
}

function onPubFiles(input) {
  const list = [...input.files].map(f => `${esc(f.name)} (${Math.round(f.size / 1024)} KB)`);
  $("pubFileList").innerHTML = list.join("<br>");
}

// Reporter ID for a passenger report, e.g. RPT-K7MQ-4821 (unique in this session)
function generateReporterId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id;
  do {
    let s = "";
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    id = `RPT-${s}-${Math.floor(1000 + Math.random() * 9000)}`;
  } while (appState.incidents.some(i => i.reporterId === id));
  return id;
}

// Passenger report from the landing page: no account needed
function submitPublicReport() {
  const plate = normPlate($("pubPlate").value);
  const when = $("pubWhen").value;
  const type = $("pubType").value;
  const reason = $("pubReason").value.trim();
  const input = $("pubFiles");

  if (!plate || !when || !type || !reason) {
    showBanner("Input all required fields", "error");
    return;
  }
  const plateErr = validatePlate(plate);
  if (plateErr) {
    showBanner(plateErr, "error");
    return;
  }
  const occurred = new Date(when).getTime();
  if (occurred > Date.now()) {
    showBanner("The time of the incident cannot be in the future", "error");
    return;
  }
  const files = [...input.files];
  if (files.some(f => f.size > 25 * 1024 * 1024)) {
    showBanner("Each file must be 25 MB or smaller", "error");
    return;
  }

  const drv = appState.drivers.find(d => d.plate === plate);
  const reporterId = generateReporterId();
  const now = Date.now();
  appState.incidents.unshift({
    id: now,
    reporterId,
    driver: drv ? drv.name : "Unknown driver",
    plate,
    type,
    ts: now,
    occurredTs: occurred,
    location: null,
    notes: reason,
    status: "pending",
    decidedTs: null,
    filedBy: null,
    source: "public",
    media: files.length ? "Attached" : "No media",
    files: files.map(f => f.name),
    severity: SEVERITY[type] || "Minor"
  });

  input.value = "";
  $("pubFileList").innerHTML = "";
  $("pubPlate").value = "";
  $("pubWhen").value = "";
  $("pubReason").value = "";
  $("pubType").selectedIndex = 0;
  updatePubReasonCount();

  $("pubReporterId").textContent = reporterId;
  $("pubReporterCard").classList.remove("hidden");
  showBanner("Report submitted to the Admin", "success");
  renderApp();
}

function onTerminalSearch(v) {
  appState.terminalSearch = v;
  $("terminalSearchClear").classList.toggle("hidden", !v);
  renderTerminalMobile();
}

function clearTerminalSearch() {
  $("terminalSearchInput").value = "";
  onTerminalSearch("");
}

function onDispatchSearch(v) {
  appState.dispatchSearch = v;
  $("dispatchSearchClear").classList.toggle("hidden", !v);
  renderDispatcherQueues();
}

function clearDispatchSearch() {
  $("dispatchSearchInput").value = "";
  onDispatchSearch("");
}

// "Show places of" filter, rebuilt so new dispatchers show up
function populateViewAs() {
  const sel = $("viewAsSelect");
  sel.innerHTML = `<option value="all">All places</option>` +
    appState.dispatchers.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
  sel.value = appState.viewAs;
}

function setViewAs(id) {
  appState.viewAs = id;
  renderDispatcherQueues();
}

function selectPill(btn) {
  btn.parentElement.querySelectorAll(".pill-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}

// ========================================
// CLOCK
// ========================================
function initClock() {
  function update() {
    const now = new Date();
    let h = now.getHours();
    const m = now.getMinutes().toString().padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    $("liveClock").textContent = `${h}:${m} ${ampm}`;
  }
  update();
  setInterval(update, 1000);
}

// Theme Switcher (Dark/Light)
function toggleTheme() {
  appState.theme = appState.theme === "dark" ? "light" : "dark";
  document.body.setAttribute("data-theme", appState.theme);
  $("themeIconMoon").classList.toggle("hidden", appState.theme === "light");
  $("themeIconSun").classList.toggle("hidden", appState.theme === "dark");

  document.querySelectorAll(".dark-mode-toggle").forEach(chk => {
    chk.checked = appState.theme === "dark";
  });
}

// ========================================
// MASTER RENDER
// ========================================
function renderApp() {
  renderTerminalMobile();
  renderDispatcherQueues();
  renderCoopDispatchers();
  renderTv();
  renderTripLogs();
  renderCoopLogs();
  renderIncidentViews();
  renderStrikeWatch();
  renderFleet();
  renderAnalytics();
  renderTimeLog();
  renderDriverOverview();
  renderRouteMap();
  populateViewAs();
  saveSession();
}
