/* ============================================================
   devmode.js — Developer Mode: in-browser editing + publish
   straight to the GitHub repo via the Contents API.

   Activate with Ctrl+Alt+E (or ?dev=1 / #dev in the URL) — there
   is deliberately no visible on-page button, so it isn't an open
   invitation to casual visitors. The first activation in a tab
   asks for a passcode (see PASSCODE_HASH below).

   IMPORTANT — this is a deterrent, not real security. It's a
   client-side hash check in a public JS file on a static site
   with no backend/auth; anyone who reads this source can see the
   hash and brute-force short passcodes offline. The actual
   security boundary is the GitHub token: without a valid
   repo-scoped token (never stored anywhere but this tab's
   sessionStorage), nobody can publish changes — someone who
   guesses the passcode can only fiddle with their own local view,
   which resets on reload. Change the passcode any time by asking
   for a new PASSCODE_HASH (sha256 hex of the new passcode).
   ============================================================ */
(function () {
  "use strict";

  const OWNER = "soniadua54";
  const REPO = "soniadua.github.io";
  const DATA_PATH = "assets/data.json";
  const SESSION_FLAG = "pf_devmode";
  const SESSION_TOKEN = "pf_gh_token"; // sessionStorage only — cleared when the tab closes

  // sha256("sonia-dev-2026") — ask to have this regenerated for a new passcode.
  const PASSCODE_HASH = "5936822dc86b6664926db41e2cb6638fbf7b7f10fd730bc567b636b178f6924f";

  async function sha256Hex(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function verifyPasscode() {
    const input = window.prompt("Developer Mode passcode:");
    if (input === null) return false;
    const hex = await sha256Hex(input);
    if (hex === PASSCODE_HASH) return true;
    window.alert("Incorrect passcode.");
    return false;
  }

  function isDevRequested() {
    const params = new URLSearchParams(location.search);
    return params.get("dev") === "1" || location.hash === "#dev" || sessionStorage.getItem(SESSION_FLAG) === "1";
  }

  let active = false;

  /* ---------------- add/remove item catalogue ---------------- */
  // Keyed by the exact data-repeat-container value used in render.js templates.
  function kindMap() {
    const T = window.Portfolio.templates;
    return {
      "hero.stats": { t: T.statBlock, blank: () => ({ target: 0, label: "New stat" }) },
      "about.paragraphs": { t: T.aboutPara, blank: () => "New paragraph text." },
      "about.chips": { t: T.chip, blank: () => "New skill" },
      coreCompetencies: { t: T.chip, blank: () => "New competency" },
      buildingNow: {
        t: T.buildingCard,
        blank: () => ({
          statusText: "NEW",
          statusClass: "status-live",
          title: "Project Title",
          desc: "Describe what you're working on.",
          tags: ["Tech"],
        }),
      },
      "buildingNow.tags": { t: T.buildTag, blank: () => "Tech" },
      bentoStats: {
        t: T.bentoCard,
        blank: () => ({ icon: "⭐", num: "0", label: "New stat", tag: "", wide: false }),
      },
      skills: { t: T.skillCard, blank: () => ({ icon: "🔧", category: "New Category", tags: ["Skill"] }) },
      "skill.tags": { t: T.skillTag, blank: () => "New tag" },
      experience: {
        t: T.expCard,
        // Experience is reverse-chronological — a newly added role is
        // virtually always the most recent one, so it belongs at the TOP,
        // not appended after the oldest entry. Use the ▲/▼ buttons on any
        // item afterward for manual fine-tuning.
        insertAt: "start",
        blank: () => ({
          role: "Role Title",
          company: "Company",
          dates: "Mon YYYY – Present",
          location: "City, Country",
          bullets: [{ lead: "Highlight:", text: "Describe the impact here." }],
          tags: ["Tech"],
        }),
      },
      "exp.bullets": { t: T.expBullet, blank: () => ({ lead: "Highlight:", text: "Describe the impact here." }) },
      "exp.tags": { t: T.expTag, blank: () => "Tech" },
      achievements: { t: T.achCard, blank: () => ({ title: "Achievement title", text: "Describe the impact." }) },
      projects: {
        t: T.projCard,
        blank: () => ({ title: "Project Title", desc: "Describe what it does, the problem it solves, and your specific role.", link: "" }),
      },
      education: { t: T.eduCard, blank: () => ({ degree: "Degree", school: "School / University", meta: "YYYY – YYYY &nbsp;·&nbsp; City", score: "Score" }) },
      certifications: { t: T.certCard, blank: () => ({ name: "Certification title", meta: "Provider · Year" }) },
      aiTools: { t: T.aiCard, blank: () => ({ name: "Tool name", freq: "DAILY", desc: "How you use it." }) },
      languages: { t: T.langCard, blank: () => ({ name: "Language", level: "A1 — Beginner", cefr: 15 }) },
      // The "+Add" button next to the contact panel's fixed rows shows a
      // menu (see ADD_MENUS below) instead of inserting this blank
      // directly — kept here only as the fallback shape.
      "contact.extras": { t: T.contactExtra, blank: () => ({ icon: "➕", text: "New info" }) },
    };
  }

  // Repeat-containers whose items get ONLY a remove button (see augmentDOM's
  // step 3 below), not the full ▲/▼/✕ cluster:
  // - skill.tags / exp.tags / about.chips: short chips narrower than the
  //   3-button cluster itself, which would fully cover their text.
  // - exp.bullets: full-width WRAPPING text, not a fixed box — the cluster
  //   anchors to the item's top-right corner, which for a 2-line bullet
  //   lands mid-sentence on the first line's tail end, visually overlapping
  //   (and blocking clicks on) real words. Bullet order is also rarely
  //   something worth reordering compared to whole experience entries.
  const COMPACT_KINDS = new Set(["skill.tags", "exp.tags", "about.chips", "coreCompetencies", "exp.bullets", "buildingNow.tags"]);

  // Repeat-containers that need the full ▲/▼/✕ cluster (reordering matters
  // here) but whose items are free-text pills that can run right up to the
  // item's own edge — an absolute-positioned overlay would clip the tail of
  // the text. These get the full cluster laid out in normal flow, appended
  // AFTER the text instead of overlaid on top of it.
  const INLINE_END_KINDS = new Set(["contact.extras"]);

  // Must match STATUS_CLASSES in render.js — the 3 color presets a
  // "Currently Building" status pill can cycle through by clicking its dot.
  const STATUS_CLASSES = ["status-live", "status-progress", "status-active"];

  // Repeat-containers that offer a menu of preset starting points instead of
  // one generic blank when "+Add" is clicked. Keyed the same as kindMap().
  const ADD_MENUS = {
    "contact.extras": [
      { label: "🌍 Relocation note", make: () => ({ icon: "🌍", text: "Open to relocate: <city, country>" }) },
      { label: "🎓 Certification / language badge", make: () => ({ icon: "🎓", text: "German B1 (certified)" }) },
      { label: "➕ Custom", make: () => ({ icon: "➕", text: "New info" }) },
    ],
  };

  /* ---------------- DOM augmentation ---------------- */

  function augmentDOM() {
    if (!active) return;

    // 1. Make every bound field editable
    document.querySelectorAll("[data-field]").forEach((el) => {
      el.contentEditable = "true";
      el.classList.add("pf-editable");
    });

    // 2. Add "+" buttons after every repeat container
    const kinds = kindMap();
    document.querySelectorAll("[data-repeat-container]").forEach((container) => {
      const key = container.dataset.repeatContainer;
      if (!kinds[key]) return;
      let btn = container.nextElementSibling;
      if (!(btn && btn.classList && btn.classList.contains("pf-add-btn") && btn.dataset.for === key)) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pf-add-btn pf-devui";
        btn.dataset.for = key;
        btn.textContent = "+ Add";
        container.insertAdjacentElement("afterend", btn);
      }
    });

    // 3. Add remove ("✕") + reorder ("▲"/"▼") buttons on every repeated item,
    // grouped in one positioned wrapper so they can never land on top of a
    // different item's controls (see cv-devmode.js for how that happened).
    // Small single-word items (tags/chips) skip the ▲/▼ pair entirely: the
    // three-button cluster is ~60px wide, wider than a short tag like "Java"
    // itself, and would sit directly on top of — and swallow every click
    // meant for — the tag's own text. Reordering individual tags isn't a
    // real need anyway; they keep just the ✕, as before.
    document.querySelectorAll("[data-repeat-item]").forEach((item) => {
      item.classList.add("pf-item");
      if (item.querySelector(":scope > .pf-item-controls")) return;
      const parentKind = item.parentElement && item.parentElement.dataset.repeatContainer;
      const compact = COMPACT_KINDS.has(parentKind);
      const inlineEnd = INLINE_END_KINDS.has(parentKind);
      const controls = document.createElement("div");
      controls.className = "pf-item-controls pf-devui" + (compact ? " pf-item-controls-compact" : inlineEnd ? " pf-item-controls-inline-end" : "");

      if (compact) {
        const rmBtn = document.createElement("button");
        rmBtn.type = "button";
        rmBtn.className = "pf-remove-btn pf-devui";
        rmBtn.title = "Remove this item";
        rmBtn.textContent = "✕";
        controls.appendChild(rmBtn);
        item.prepend(controls);
        return;
      }

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "pf-move-btn pf-devui";
      upBtn.title = "Move up";
      upBtn.textContent = "▲";
      upBtn.dataset.dir = "up";

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "pf-move-btn pf-devui";
      downBtn.title = "Move down";
      downBtn.textContent = "▼";
      downBtn.dataset.dir = "down";

      const rmBtn = document.createElement("button");
      rmBtn.type = "button";
      rmBtn.className = "pf-remove-btn pf-devui";
      rmBtn.title = "Remove this item";
      rmBtn.textContent = "✕";

      controls.append(upBtn, downBtn, rmBtn);
      if (inlineEnd) item.appendChild(controls);
      else item.prepend(controls);
    });
    refreshMoveButtonStates();

    // Every card template (experience, skills, education, certifications,
    // AI tools, languages) carries a "reveal" class for the scroll-in
    // animation — it starts at opacity:0 and only becomes visible once an
    // IntersectionObserver (set up once, at page load, in index.html) has
    // observed it scroll into view. That observer only ever saw the cards
    // that existed at initial page load. A card inserted afterward by "+Add"
    // was never handed to it — so the new card sat in the DOM, fully
    // correct and fully editable, but permanently invisible (opacity:0
    // forever), which is exactly what looked like "not giving a template /
    // acting weird": nothing visibly appeared where the new entry should
    // have been. Re-running the observer setup after every augmentDOM()
    // pass (safe to call repeatedly — already-revealed elements just get
    // re-observed and instantly re-confirmed as visible) picks up anything
    // new and reveals it immediately.
    if (window.__initReveal) window.__initReveal();
  }

  // ▲/▼ only make sense relative to an item's actual siblings (the other
  // items in the SAME repeat-container) — grey out (disable) the ▲ on
  // whichever item is currently first and the ▼ on whichever is currently
  // last, per container, so it's obvious when there's nowhere left to go.
  function refreshMoveButtonStates() {
    const groups = new Map();
    document.querySelectorAll("[data-repeat-item]").forEach((item) => {
      const parent = item.parentElement;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(item);
    });
    groups.forEach((items) => {
      items.forEach((item, i) => {
        const up = item.querySelector(":scope > .pf-item-controls > .pf-move-btn[data-dir='up']");
        const down = item.querySelector(":scope > .pf-item-controls > .pf-move-btn[data-dir='down']");
        if (up) up.disabled = i === 0;
        if (down) down.disabled = i === items.length - 1;
      });
    });
  }

  // Small floating menu used by "+Add" buttons that offer more than one
  // preset starting point (currently just the contact panel's extras
  // add button — see ADD_MENUS above).
  function showAddMenu(anchorEl, options, onPick) {
    document.querySelectorAll(".pf-add-menu").forEach((m) => m.remove());
    const menu = document.createElement("div");
    menu.className = "pf-add-menu pf-devui";
    options.forEach((opt) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = opt.label;
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        menu.remove();
        onPick(opt.make);
      });
      menu.appendChild(b);
    });
    document.body.appendChild(menu);
    const rect = anchorEl.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.top = rect.bottom + 4 + "px";
    menu.style.left = rect.left + "px";
    const closeOnOutside = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener("click", closeOnOutside, true);
      }
    };
    setTimeout(() => document.addEventListener("click", closeOnOutside, true), 0);
  }

  // "experience" inserts new entries at the TOP of the list (see kindMap),
  // but the "+Add" button itself sits at the BOTTOM of the container —
  // where you'd naturally be scrolled to after reading the existing
  // entries and deciding to add one. Without this, the new card appears
  // off-screen above the current scroll position: the reveal animation
  // fires correctly (see augmentDOM's __initReveal call) but you'd have to
  // already know to scroll up to see it, which looks exactly like nothing
  // happened. A brief highlight flash makes it unambiguous which card is new.
  function scrollToNewItem(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("pf-just-added");
    setTimeout(() => el.classList.remove("pf-just-added"), 1600);
  }

  function setEditable(on) {
    document.querySelectorAll("[data-field]").forEach((el) => {
      el.contentEditable = on ? "true" : "false";
    });
    document.querySelectorAll(".pf-devui").forEach((el) => (el.style.display = on ? "" : "none"));
    document.body.classList.toggle("pf-devmode-on", on);
  }

  /* ---------------- delegated events ---------------- */

  document.addEventListener("click", (e) => {
    if (!active) return;

    const addBtn = e.target.closest(".pf-add-btn");
    if (addBtn) {
      e.preventDefault();
      const container = addBtn.previousElementSibling;
      const key = addBtn.dataset.for;
      const kind = kindMap()[key];
      if (!container || !kind) return;
      const menu = ADD_MENUS[key];
      if (menu) {
        showAddMenu(addBtn, menu, (make) => {
          container.insertAdjacentHTML("beforeend", kind.t(make()));
          augmentDOM();
          scrollToNewItem(container.lastElementChild);
          log("Added a new contact item.");
        });
        return;
      }
      const pos = kind.insertAt === "start" ? "afterbegin" : "beforeend";
      container.insertAdjacentHTML(pos, kind.t(kind.blank()));
      augmentDOM();
      scrollToNewItem(pos === "afterbegin" ? container.firstElementChild : container.lastElementChild);
      log(`Added a new ${key.split(".").pop()}.`);
      return;
    }

    // Click the small colored dot on a "Currently Building" status pill to
    // cycle its color (LIVE green -> IN PROGRESS yellow -> ACTIVE purple ->
    // back to LIVE). The label text next to it is separately editable via
    // its own [data-field] span, so typing a custom label doesn't fight
    // with clicking the dot for color.
    const statusDot = e.target.closest(".build-status .status-dot");
    if (statusDot) {
      e.preventDefault();
      const pill = statusDot.closest(".build-status");
      const cur = STATUS_CLASSES.find((c) => pill.classList.contains(c));
      const next = STATUS_CLASSES[(STATUS_CLASSES.indexOf(cur) + 1 + STATUS_CLASSES.length) % STATUS_CLASSES.length];
      if (cur) pill.classList.remove(cur);
      pill.classList.add(next);
      return;
    }

    const rmBtn = e.target.closest(".pf-remove-btn");
    if (rmBtn) {
      e.preventDefault();
      const item = rmBtn.closest("[data-repeat-item]");
      if (item) item.remove();
      refreshMoveButtonStates();
      return;
    }

    const moveBtn = e.target.closest(".pf-move-btn");
    if (moveBtn) {
      e.preventDefault();
      if (moveBtn.disabled) return;
      const item = moveBtn.closest("[data-repeat-item]");
      if (!item || !item.parentElement) return;
      if (moveBtn.dataset.dir === "up") {
        const prev = item.previousElementSibling;
        if (prev) item.parentElement.insertBefore(item, prev);
      } else {
        const next = item.nextElementSibling;
        if (next) item.parentElement.insertBefore(item, next.nextElementSibling);
      }
      refreshMoveButtonStates();
      return;
    }

    // Edit the actual href behind a contact link (LinkedIn/LeetCode/GitHub).
    // The visible label text was already editable via contenteditable, but
    // the underlying URL had no edit UI at all — if the label text changed
    // (e.g. a new LinkedIn username) the link itself silently kept pointing
    // at the old address forever, since nothing ever wrote to .href.
    const linkEditBtn = e.target.closest(".pf-link-edit-btn");
    if (linkEditBtn) {
      e.preventDefault();
      const link = document.querySelector(`[data-field='${linkEditBtn.dataset.hrefOf}']`);
      if (link) {
        const next = window.prompt("New URL:", link.getAttribute("href") || "");
        if (next !== null && next.trim()) {
          link.setAttribute("href", next.trim());
          log(`Updated the ${linkEditBtn.dataset.hrefOf.split(".").pop()} link.`);
        }
      }
      return;
    }
  });

  // Keep the animated hero counters' underlying data-target in sync with
  // whatever the person actually typed, since serialize() reads the
  // attribute (not the mid-animation text) when publishing.
  document.addEventListener("focusout", (e) => {
    if (!active) return;
    const el = e.target;
    if (el.matches && el.matches("[data-field='target']")) {
      const n = parseInt(String(el.textContent).replace(/[^\d-]/g, ""), 10) || 0;
      el.dataset.target = n;
      el.textContent = n;
      return;
    }
    // Tags/chips/about-paragraphs are single-field repeat-items — their
    // only data-field IS this "text" span. If someone clears all the text
    // and clicks away, drop the now-empty item outright instead of leaving
    // a ghost entry: a blank chip still eats a flex slot, and in the CV's
    // comma-separated tag list a leftover item still triggers its
    // decorative CSS ::after comma even with no text inside — which is
    // impossible to "backspace away" since it isn't real text.
    // Multi-field items (exp bullets have lead+text, languages have
    // name+level, etc.) are left alone: only remove when this item's ONE
    // AND ONLY data-field is the text that just went empty.
    if (el.matches && el.matches("[data-field='text']") && el.textContent.trim() === "") {
      const item = el.closest("[data-repeat-item]");
      if (item && item.querySelectorAll("[data-field]").length === 1) {
        item.remove();
        refreshMoveButtonStates();
      }
    }
  });

  /* ---------------- UTF-8 safe base64 ---------------- */

  function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
  }

  /* ---------------- GitHub publish ---------------- */

  async function ghRequest(path, opts) {
    const token = sessionStorage.getItem(SESSION_TOKEN);
    const headers = Object.assign(
      { Accept: "application/vnd.github+json" },
      token ? { Authorization: "token " + token } : {},
      (opts && opts.headers) || {}
    );
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/${path}`, Object.assign({}, opts, { headers }));
    if (!res.ok) {
      let msg = res.status + " " + res.statusText;
      try {
        const body = await res.json();
        if (body && body.message) msg = body.message;
      } catch (_) {}
      throw new Error(msg);
    }
    return res.json();
  }

  async function publish() {
    const token = sessionStorage.getItem(SESSION_TOKEN);
    if (!token) {
      log("Paste a GitHub token first.", true);
      return;
    }
    try {
      log("Reading current file…");
      const current = await ghRequest(`contents/${DATA_PATH}`);
      const newContent = JSON.stringify(window.Portfolio.serialize(), null, 2);
      log("Committing changes…");
      const result = await ghRequest(`contents/${DATA_PATH}`, {
        method: "PUT",
        body: JSON.stringify({
          message: "Update site content via Developer Mode",
          content: toBase64(newContent),
          sha: current.sha,
        }),
      });
      log(
        "Published. GitHub Pages will redeploy in a minute or two — " +
          "commit: " + (result.commit && result.commit.html_url ? result.commit.html_url : "done")
      );
    } catch (err) {
      log("Publish failed: " + err.message, true);
    }
  }

  function log(msg, isError) {
    const box = document.getElementById("pfDevLog");
    if (!box) return;
    box.textContent = msg;
    box.classList.toggle("pf-devlog-error", !!isError);
  }

  /* ---------------- toolbar ---------------- */

  function buildToolbar() {
    if (document.getElementById("pfDevToolbar")) return;
    const bar = document.createElement("div");
    bar.id = "pfDevToolbar";
    bar.innerHTML = `
      <div class="pf-devbar-inner">
        <span class="pf-devbar-title">🛠 Developer Mode</span>
        <span class="pf-devbar-hint">Click any text to edit it. Use + / ✕ to add or remove entries.</span>
        <a href="cv.html?dev=1" class="pf-devbtn" style="text-decoration:none;">✏️ Edit CV</a>
        <input type="password" id="pfTokenInput" placeholder="GitHub token (repo-scoped)" autocomplete="off">
        <button type="button" id="pfConnectBtn" class="pf-devbtn">Connect</button>
        <button type="button" id="pfPublishBtn" class="pf-devbtn pf-devbtn-primary">Publish to GitHub</button>
        <button type="button" id="pfDiscardBtn" class="pf-devbtn">Discard &amp; reload</button>
        <button type="button" id="pfExitBtn" class="pf-devbtn pf-devbtn-danger">Exit Dev Mode</button>
        <span id="pfDevLog" class="pf-devlog"></span>
      </div>`;
    document.body.appendChild(bar);

    // The toolbar is fixed to the bottom of the viewport and can wrap to
    // multiple lines on narrow windows. Two separate problems this fixes:
    // 1) content at the very END of the page needs room so it isn't rendered
    //    underneath the toolbar (body padding-bottom).
    // 2) the browser's native "scroll this into view" (used by focus(),
    //    scrollIntoView(), and any click that has to auto-scroll a target
    //    into range) has no idea a fixed-position bar covers the bottom of
    //    the viewport, so it can happily park a target right behind it.
    //    scroll-padding-bottom on the scrolling element fixes that class of
    //    problem site-wide, for any element, without per-element markup.
    const fitPadding = () => {
      const h = bar.offsetHeight + 16;
      document.body.style.paddingBottom = h + "px";
      document.documentElement.style.scrollPaddingBottom = h + "px";
    };
    fitPadding();
    new ResizeObserver(fitPadding).observe(bar);

    const tokenInput = document.getElementById("pfTokenInput");
    const existing = sessionStorage.getItem(SESSION_TOKEN);
    if (existing) tokenInput.value = existing;

    document.getElementById("pfConnectBtn").addEventListener("click", () => {
      const v = tokenInput.value.trim();
      if (!v) { log("Paste a token first.", true); return; }
      sessionStorage.setItem(SESSION_TOKEN, v);
      log("Token stored for this browser tab only.");
    });
    document.getElementById("pfPublishBtn").addEventListener("click", publish);
    document.getElementById("pfDiscardBtn").addEventListener("click", () => {
      if (!confirmTwice("pfDiscardBtn", "Discard & reload")) return;
      location.reload();
    });
    document.getElementById("pfExitBtn").addEventListener("click", () => {
      if (!confirmTwice("pfExitBtn", "Exit Dev Mode")) return;
      sessionStorage.removeItem(SESSION_FLAG);
      const url = new URL(location.href);
      url.searchParams.delete("dev");
      url.hash = "";
      location.href = url.toString();
    });
  }

  const armedButtons = new Map();
  function confirmTwice(id, label) {
    if (armedButtons.get(id)) {
      armedButtons.delete(id);
      return true;
    }
    armedButtons.set(id, true);
    const btn = document.getElementById(id);
    const original = label;
    btn.textContent = "Click again to confirm";
    setTimeout(() => {
      if (armedButtons.get(id)) {
        armedButtons.delete(id);
        btn.textContent = original;
      }
    }, 3500);
    return false;
  }

  /* ---------------- boot ---------------- */

  function activate() {
    active = true;
    sessionStorage.setItem(SESSION_FLAG, "1");
    buildToolbar();
    setEditable(true);
    augmentDOM();
  }

  function armAfterRender() {
    // Check whether renderAll() has actually run yet — NOT whether heroStats
    // "has children", since the static no-JS fallback markup already has
    // children at parse time (before any data has loaded). Checking child
    // count made this fire on that stale fallback on every cold `?dev=1`
    // load, before the real data replaced it — which is exactly why
    // existing stats (and other repeat-item sections) looked un-editable:
    // augmentDOM() ran against untagged placeholder markup that had no
    // data-field/data-repeat-item attributes yet.
    if (window.Portfolio && window.Portfolio.data) {
      activate();
    } else {
      document.addEventListener("portfolio:rendered", activate, { once: true });
    }
  }

  function toggleOff() {
    sessionStorage.removeItem(SESSION_FLAG);
    const url = new URL(location.href);
    url.searchParams.delete("dev");
    url.hash = "";
    location.href = url.toString();
  }

  function requestToggleOn() {
    verifyPasscode().then((ok) => {
      if (ok) armAfterRender();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey && e.altKey && (e.key === "e" || e.key === "E"))) return;
    if (isDevRequested()) toggleOff();
    else requestToggleOn();
  });

  function init() {
    const toggleBtn = document.getElementById("devModeToggle");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        if (isDevRequested()) toggleOff();
        else requestToggleOn();
      });
    }
    // Already unlocked earlier this tab (or arrived via a ?dev=1/#dev link
    // after a previous successful passcode entry) — no need to re-prompt.
    if (sessionStorage.getItem(SESSION_FLAG) === "1") {
      armAfterRender();
      return;
    }
    // A bare ?dev=1/#dev link (e.g. shared or bookmarked) still requires the
    // passcode the first time — it's not itself the credential.
    const params = new URLSearchParams(location.search);
    if (params.get("dev") === "1" || location.hash === "#dev") {
      verifyPasscode().then((ok) => {
        if (ok) armAfterRender();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
