/* ============================================================
   cv-devmode.js — Developer Mode for cv.html. Same activation,
   same passcode, same token, same GitHub Contents API target
   (assets/data.json) as the portfolio's devmode.js — edits from
   either page publish to the one shared file, and unlocking one
   page unlocks the other for the rest of this tab.
   ============================================================ */
(function () {
  "use strict";

  const OWNER = "soniadua54";
  const REPO = "soniadua.github.io";
  const DATA_PATH = "assets/data.json";
  const SESSION_FLAG = "pf_devmode";
  const SESSION_TOKEN = "pf_gh_token";

  // Keep in sync with devmode.js — sha256("sonia-dev-2026").
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

  function kindMap() {
    const T = window.CV.templates;
    return {
      skills: { t: T.skillCat, blank: () => ({ category: "New Category", tags: ["Skill"] }) },
      "skill.tags": { t: T.tag, blank: () => "New tag" },
      experience: {
        t: T.expItem,
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
      "exp.bullets": { t: T.bullet, blank: () => ({ lead: "Highlight:", text: "Describe the impact here." }) },
      "exp.tags": { t: T.tag, blank: () => "Tech" },
      education: { t: T.eduItem, blank: () => ({ degree: "Degree", school: "School / University", meta: "YYYY – YYYY &nbsp;·&nbsp; City", score: "Score" }) },
      certifications: { t: T.certItem, blank: () => ({ name: "Certification title", meta: "Provider · Year" }) },
      // No "achievements" entry — that section was cut from this page (see
      // cv-render.js). The data survives untouched for a custom section or
      // a future re-add; it's just not editable from here right now.
      aiTools: { t: T.aiItem, blank: () => ({ name: "Tool name", freq: "DAILY", desc: "How you use it." }) },
      languages: { t: T.langItem, blank: () => ({ name: "Language", level: "A1, Beginner", cefr: 15 }) },
      customSections: {
        t: T.customSection,
        blank: () => ({
          id: "sec_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          icon: "📌",
          title: "New Section",
          items: [{ heading: "Item title", text: "Describe it here." }],
        }),
      },
      "customSection.items": { t: T.customItem, blank: () => ({ heading: "Item title", text: "Describe it here." }) },
      // The "+Add" button next to the header's contact row shows a menu
      // (see ADD_MENUS below) instead of inserting this blank directly —
      // it's kept here only as the fallback shape / for the generic
      // add-button-detection loop in augmentDOM().
      "contact.extras": { t: T.contactExtra, blank: () => ({ icon: "➕", text: "New info" }) },
    };
  }

  // Repeat-containers that offer a menu of preset starting points instead of
  // one generic blank when "+Add" is clicked. Keyed the same as kindMap().
  const ADD_MENUS = {
    "contact.extras": [
      { label: "🌍 Relocation note", make: () => ({ icon: "🌍", text: "Open to relocate: <city, country>" }) },
      { label: "🎓 Certification / language badge", make: () => ({ icon: "🎓", text: "German B1 (certified)" }) },
      { label: "➕ Custom", make: () => ({ icon: "➕", text: "New info" }) },
    ],
  };

  // Repeat-containers whose items get ONLY a remove button (see augmentDOM's
  // item loop below), not the full ▲/▼/✕ cluster:
  // - skill.tags / exp.tags: short chips narrower than the 3-button cluster
  //   itself, which would fully cover their text.
  // - languages: a short entry like "Hindi (Native)" is barely wider than
  //   the cluster, which then covers the "level" field specifically.
  // - exp.bullets: full-width WRAPPING text, not a fixed box — the cluster
  //   anchors to the item's top-right corner, which for a 2-line bullet
  //   lands mid-sentence on the first line's tail end, visually overlapping
  //   (and blocking clicks on) real words. Bullet order is also rarely
  //   something worth reordering compared to whole experience entries.
  const COMPACT_KINDS = new Set(["skill.tags", "exp.tags", "languages", "exp.bullets"]);

  // Repeat-containers that need the full ▲/▼/✕ cluster (reordering matters
  // here) but whose items are free-text pills that can run right up to the
  // item's own edge — an absolute-positioned overlay would clip the tail of
  // the text (this is exactly what happened to the relocation badge's
  // closing parenthesis). These get the full cluster laid out in normal
  // flow, appended AFTER the text instead of overlaid on top of it.
  const INLINE_END_KINDS = new Set(["contact.extras"]);

  function augmentDOM() {
    if (!active) return;
    document.querySelectorAll("[data-field]").forEach((el) => {
      el.contentEditable = "true";
    });
    const kinds = kindMap();
    document.querySelectorAll("[data-repeat-container]").forEach((container) => {
      const key = container.dataset.repeatContainer;
      if (!kinds[key]) return;
      let btn = container.nextElementSibling;
      if (!(btn && btn.classList && btn.classList.contains("pf-add-btn") && btn.dataset.for === key)) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pf-add-btn no-print";
        btn.dataset.for = key;
        btn.textContent = "+ Add";
        container.insertAdjacentElement("afterend", btn);
      }
    });
    document.querySelectorAll("[data-repeat-item]").forEach((item) => {
      // Every repeat-item needs its OWN positioning context, because
      // .pf-item-controls is position:absolute (top:2px; right:2px). Most
      // templates hardcode class="... pf-item" (which sets
      // position:relative) directly in their markup, but templates.tag()
      // does not — so a tag's controls, lacking a positioned ancestor of
      // their own, fell through to the nearest one that HAD it (the whole
      // exp-item), landing exactly on top of THAT item's own buttons and
      // stealing its clicks. Adding the class here unconditionally
      // (matching devmode.js's portfolio behavior) guarantees every item is
      // positioned regardless of what the template author remembered to
      // hardcode.
      item.classList.add("pf-item");
      if (item.querySelector(":scope > .pf-item-controls")) return;
      const parentKind = item.parentElement && item.parentElement.dataset.repeatContainer;
      const compact = COMPACT_KINDS.has(parentKind);
      const inlineEnd = INLINE_END_KINDS.has(parentKind);
      const controls = document.createElement("div");
      controls.className = "pf-item-controls no-print" + (compact ? " pf-item-controls-compact" : inlineEnd ? " pf-item-controls-inline-end" : "");

      if (compact) {
        const rmBtnOnly = document.createElement("button");
        rmBtnOnly.type = "button";
        rmBtnOnly.className = "pf-remove-btn no-print";
        rmBtnOnly.title = "Remove this item";
        rmBtnOnly.textContent = "✕";
        controls.appendChild(rmBtnOnly);
        item.prepend(controls);
        return;
      }

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "pf-move-btn no-print";
      upBtn.title = "Move up";
      upBtn.textContent = "▲";
      upBtn.dataset.dir = "up";

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "pf-move-btn no-print";
      downBtn.title = "Move down";
      downBtn.textContent = "▼";
      downBtn.dataset.dir = "down";

      const rmBtn = document.createElement("button");
      rmBtn.type = "button";
      rmBtn.className = "pf-remove-btn no-print";
      rmBtn.title = "Remove this item";
      rmBtn.textContent = "✕";

      controls.append(upBtn, downBtn, rmBtn);
      if (inlineEnd) item.appendChild(controls);
      else item.prepend(controls);
    });
    refreshMoveButtonStates();
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
  // preset starting point (currently just the header's contact-extras add
  // button — see ADD_MENUS above).
  function showAddMenu(anchorEl, options, onPick) {
    document.querySelectorAll(".pf-add-menu").forEach((m) => m.remove());
    const menu = document.createElement("div");
    menu.className = "pf-add-menu no-print";
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

  // "experience" inserts new entries at the TOP of the list, but the
  // "+Add" button sits at the BOTTOM of the container — where you'd
  // naturally be scrolled to after reading the existing entries. Without
  // this, the new card appears off-screen above the current scroll
  // position, which looks exactly like nothing happened.
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
    document.querySelectorAll(".pf-add-btn, .pf-item-controls").forEach((el) => (el.style.display = on ? "" : "none"));
    document.body.classList.toggle("pf-devmode-on", on);
  }

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
          log("Added a new header item.");
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
  });

  // See devmode.js for the full explanation: tags/chips are single-field
  // repeat-items, and the CV's tag list renders a decorative CSS comma
  // (`.tag-list [data-repeat-item]:not(:last-child)::after`) between
  // items. Clearing a tag's text to empty without this used to leave a
  // ghost item behind — with an unremovable comma still floating next to
  // it, since that comma is CSS, not real editable text. Auto-remove the
  // item the moment its one-and-only data-field goes empty on blur.
  // Multi-field items (languages: name+level, exp bullets: lead+text,
  // custom section items: heading+text) are untouched.
  document.addEventListener("focusout", (e) => {
    if (!active) return;
    const el = e.target;
    if (el.matches && el.matches("[data-field='text']") && el.textContent.trim() === "") {
      const item = el.closest("[data-repeat-item]");
      if (item && item.querySelectorAll("[data-field]").length === 1) {
        item.remove();
        refreshMoveButtonStates();
      }
    }
  });

  function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
  }

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
      const newContent = JSON.stringify(window.CV.serialize(), null, 2);
      log("Committing changes…");
      const result = await ghRequest(`contents/${DATA_PATH}`, {
        method: "PUT",
        body: JSON.stringify({
          message: "Update CV content via Developer Mode",
          content: toBase64(newContent),
          sha: current.sha,
        }),
      });
      log("Published. GitHub Pages will redeploy in a minute or two — commit: " + (result.commit && result.commit.html_url ? result.commit.html_url : "done"));
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

  function buildToolbar() {
    if (document.getElementById("pfDevToolbar")) return;
    const bar = document.createElement("div");
    bar.id = "pfDevToolbar";
    bar.className = "no-print";
    bar.innerHTML = `
      <div class="pf-devbar-inner">
        <span class="pf-devbar-title">🛠 Developer Mode — CV</span>
        <span class="pf-devbar-hint">Click any text to edit it. Use + / ✕ to add or remove entries.</span>
        <input type="password" id="pfTokenInput" placeholder="GitHub token (repo-scoped)" autocomplete="off">
        <button type="button" id="pfConnectBtn" class="pf-devbtn">Connect</button>
        <button type="button" id="pfPublishBtn" class="pf-devbtn pf-devbtn-primary">Publish to GitHub</button>
        <button type="button" id="pfPrintBtn" class="pf-devbtn">🖨 Print / Save PDF</button>
        <button type="button" id="pfDiscardBtn" class="pf-devbtn">Discard &amp; reload</button>
        <button type="button" id="pfExitBtn" class="pf-devbtn pf-devbtn-danger">Exit Dev Mode</button>
        <span id="pfDevLog" class="pf-devlog"></span>
      </div>`;
    document.body.appendChild(bar);

    // See devmode.js for why this sets both body padding AND scroll-padding
    // (the latter is what stops the fixed bar from hiding a target element
    // right after the browser auto-scrolls it "into view").
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
      log("Token stored for this browser tab only — also usable on the portfolio's Dev Mode.");
    });
    document.getElementById("pfPublishBtn").addEventListener("click", publish);
    document.getElementById("pfPrintBtn").addEventListener("click", () => window.print());
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
    btn.textContent = "Click again to confirm";
    setTimeout(() => {
      if (armedButtons.get(id)) {
        armedButtons.delete(id);
        btn.textContent = label;
      }
    }, 3500);
    return false;
  }

  function activate() {
    active = true;
    sessionStorage.setItem(SESSION_FLAG, "1");
    buildToolbar();
    setEditable(true);
    augmentDOM();
  }

  function armAfterRender() {
    // See devmode.js for why this checks window.CV.data (has renderAll()
    // actually run) instead of DOM child count — cv.html's containers also
    // start empty/static at parse time, and checking children.length races
    // against the async data load on a cold ?dev=1 open.
    if (window.CV && window.CV.data) {
      activate();
    } else {
      document.addEventListener("cv:rendered", activate, { once: true });
    }
  }

  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey && e.altKey && (e.key === "e" || e.key === "E"))) return;
    if (isDevRequested()) {
      sessionStorage.removeItem(SESSION_FLAG);
      const url = new URL(location.href);
      url.searchParams.delete("dev");
      url.hash = "";
      location.href = url.toString();
      return;
    }
    verifyPasscode().then((ok) => {
      if (ok) armAfterRender();
    });
  });

  function init() {
    // Unlocking dev mode on either page (Ctrl+Alt+E / passcode) unlocks the
    // other for the rest of this tab, same as the shared GitHub token.
    if (sessionStorage.getItem(SESSION_FLAG) === "1") {
      armAfterRender();
      return;
    }
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
