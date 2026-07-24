/* ============================================================
   render.js — Data-driven rendering for soniadua.github.io
   Reads assets/data.json and fills in the dynamic sections of
   the page.

   Everything a section needs to regenerate itself lives in
   Portfolio.templates so devmode.js (Developer Mode) can reuse
   the exact same markup when the user adds a new item.
   ============================================================ */
(function () {
  "use strict";

  function escText(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escAttr(s) {
    return escText(s).replace(/"/g, "&quot;");
  }
  // richHTML: used ONLY for fields that intentionally carry inline markup
  // (currently just <strong> emphasis in bio/about copy). Still strips
  // <script>/event-handler attributes as a safety net.
  function richHTML(s) {
    const div = document.createElement("div");
    div.innerHTML = String(s ?? "");
    div.querySelectorAll("script").forEach((n) => n.remove());
    div.querySelectorAll("*").forEach((n) => {
      [...n.attributes].forEach((a) => {
        if (/^on/i.test(a.name)) n.removeAttribute(a.name);
      });
    });
    return div.innerHTML;
  }

  // The 3 CSS classes a "Currently Building" status pill can carry (see the
  // .status-live/.status-progress/.status-active rules in index.html) —
  // shared between the template (initial render) and devmode.js's status-dot
  // click-to-cycle handler + serialize()'s read-back below.
  const STATUS_CLASSES = ["status-live", "status-progress", "status-active"];

  /* ---------------- templates (shared with devmode.js) ---------------- */

  const templates = {
    statBlock(s) {
      return `<div class="stat-block" data-repeat-item>
        <div class="stat-num" data-field="target" data-target="${escAttr(s.target)}">0</div>
        <div class="stat-label" data-field="label" contenteditable="false">${escText(s.label)}</div>
      </div>`;
    },
    // Text lives in an inner data-field span, not directly on the
    // data-repeat-item element — see the comment on cv-render.js's tag()
    // template. Without this, augmentDOM() (which only ever flips
    // [data-field] elements editable) can never reach these, so they look
    // permanently frozen regardless of clicking/typing.
    chip(text) {
      return `<span class="chip" data-repeat-item><span data-field="text" contenteditable="false">${escText(text)}</span></span>`;
    },
    aboutPara(text) {
      return `<p data-repeat-item><span data-field="text" contenteditable="false">${richHTML(text)}</span></p>`;
    },
    skillCard(cat) {
      const tags = (cat.tags || []).map((t) => templates.skillTag(t)).join("");
      return `<div class="glass skill-card reveal" data-repeat-item>
        <div class="spotlight"></div>
        <div class="skill-card-icon" data-field="icon" contenteditable="false">${escText(cat.icon)}</div>
        <div class="skill-cat" data-field="category" contenteditable="false">${escText(cat.category)}</div>
        <div class="skill-tags" data-repeat-container="skill.tags">${tags}</div>
      </div>`;
    },
    skillTag(text) {
      return `<span class="skill-tag" data-repeat-item><span data-field="text" contenteditable="false">${escText(text)}</span></span>`;
    },
    expCard(item) {
      const bullets = (item.bullets || []).map((b) => templates.expBullet(b)).join("");
      const tags = (item.tags || []).map((t) => templates.expTag(t)).join("");
      return `<div class="tl-item reveal" data-repeat-item>
        <div class="tl-dot"></div>
        <div class="glass exp-card">
          <div class="spotlight"></div>
          <div class="exp-header">
            <div><span class="exp-role" data-field="role" contenteditable="false">${escText(item.role)}</span> · <span class="exp-company" data-field="company" contenteditable="false">${escText(item.company)}</span></div>
            <span class="exp-date" data-field="dates" contenteditable="false">${escText(item.dates)}</span>
          </div>
          <div class="exp-loc">📍 <span data-field="location" contenteditable="false">${escText(item.location)}</span></div>
          <ul class="exp-bullets" data-repeat-container="exp.bullets">${bullets}</ul>
          <div class="exp-tags" data-repeat-container="exp.tags">${tags}</div>
        </div>
      </div>`;
    },
    expBullet(b) {
      return `<li data-repeat-item><strong data-field="lead" contenteditable="false">${escText(b.lead)}</strong> <span data-field="text" contenteditable="false">${escText(b.text)}</span></li>`;
    },
    expTag(text) {
      return `<span class="exp-tag" data-repeat-item><span data-field="text" contenteditable="false">${escText(text)}</span></span>`;
    },
    eduCard(e) {
      return `<div class="glass edu-card reveal" data-repeat-item>
        <div class="spotlight"></div>
        <div class="edu-degree" data-field="degree" contenteditable="false">${escText(e.degree)}</div>
        <div class="edu-school" data-field="school" contenteditable="false">${escText(e.school)}</div>
        <div class="edu-meta" data-field="meta" contenteditable="false">${richHTML(e.meta)}</div>
        <div class="edu-score" data-field="score" contenteditable="false">${escText(e.score)}</div>
      </div>`;
    },
    certCard(c) {
      // Same pattern as the CV's certItem: credUrl rides as a data attribute
      // rather than a visible/editable field, and the name only becomes a
      // link when a credUrl exists (no href="" self-link fallback).
      const nameField = `<div class="cert-name" data-field="name" contenteditable="false">${escText(c.name)}</div>`;
      const nameInner = c.credUrl
        ? `<a href="${escAttr(c.credUrl)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${nameField}</a>`
        : nameField;
      return `<div class="glass cert-card reveal" data-repeat-item data-cred-url="${escAttr(c.credUrl || "")}">
        <div class="spotlight"></div>
        <div class="cert-icon">📜</div>
        <div>
          ${nameInner}
          <div class="cert-meta" data-field="meta" contenteditable="false">${escText(c.meta)}</div>
        </div>
      </div>`;
    },
    aiCard(a) {
      return `<div class="glass ai-card reveal" data-repeat-item>
        <div class="spotlight"></div>
        <div class="ai-name" data-field="name" contenteditable="false">${escText(a.name)} <span class="freq-badge" data-field="freq" contenteditable="false">${escText(a.freq)}</span></div>
        <div class="ai-desc" data-field="desc" contenteditable="false">${escText(a.desc)}</div>
      </div>`;
    },
    achCard(a) {
      return `<div class="glass ach-card reveal" data-repeat-item>
        <div class="spotlight"></div>
        <div class="ach-title" data-field="title" contenteditable="false">${escText(a.title)}</div>
        <div class="ach-text" data-field="text" contenteditable="false">${escText(a.text)}</div>
      </div>`;
    },
    projCard(p) {
      // Same conditional-href pattern as certCard/CV's projectItem — omit
      // href entirely when there's no link yet, rather than href="" which
      // would self-link back to this page.
      const hrefAttr = p.link ? ` href="${escAttr(p.link)}" target="_blank" rel="noopener"` : "";
      return `<div class="glass proj-card reveal" data-repeat-item>
        <div class="spotlight"></div>
        <div class="proj-title" data-field="title" contenteditable="false">${escText(p.title)}</div>
        <div class="proj-desc" data-field="desc" contenteditable="false">${escText(p.desc)}</div>
        <div class="proj-link"><a data-field="link" contenteditable="false"${hrefAttr}>${escText(p.link)}</a></div>
      </div>`;
    },
    // Freeform extra header badges (relocation note, a certification, or
    // anything custom) — added via the "+Add" menu next to the contact
    // panel's fixed rows. icon (emoji) + text, both directly editable.
    contactExtra(e) {
      return `<div class="contact-row" data-repeat-item>
        <div class="contact-icon" data-field="icon" contenteditable="false">${escText(e.icon)}</div>
        <div><div class="contact-val" data-field="text" contenteditable="false">${escText(e.text)}</div></div>
      </div>`;
    },
    // "Currently Building" cards + the bento stat cards directly below them
    // used to be hand-written static HTML with zero data-field/data-repeat
    // wiring — not part of this data-driven system at all, so Dev Mode had
    // nothing to make editable no matter how thoroughly augmentDOM() ran.
    // That's the actual root cause behind "UKG section not editable": the
    // whole section was invisible to the editing system, not broken by it.
    buildingCard(b) {
      const tags = (b.tags || []).map((t) => templates.buildTag(t)).join("");
      const cls = STATUS_CLASSES.includes(b.statusClass) ? b.statusClass : "status-live";
      return `<div class="glass build-card reveal" data-repeat-item>
        <div class="spotlight"></div>
        <div class="build-status ${cls}"><span class="status-dot" title="Click to cycle status color"></span><span data-field="statusText" contenteditable="false">${escText(b.statusText)}</span></div>
        <div class="build-title" data-field="title" contenteditable="false">${escText(b.title)}</div>
        <div class="build-desc" data-field="desc" contenteditable="false">${escText(b.desc)}</div>
        <div class="build-tech" data-repeat-container="buildingNow.tags">${tags}</div>
      </div>`;
    },
    buildTag(text) {
      return `<span class="build-tag" data-repeat-item><span data-field="text" contenteditable="false">${escText(text)}</span></span>`;
    },
    // "wide" (grid-column span) is a layout choice, not click-toggleable —
    // it round-trips through data.json untouched so publishing never loses
    // it, but changing it currently requires editing data.json directly.
    bentoCard(b) {
      const wideClass = b.wide ? " wide" : "";
      return `<div class="glass bento-card${wideClass}" data-repeat-item data-wide="${b.wide ? "1" : "0"}">
        <span class="bento-icon" data-field="icon" contenteditable="false">${escText(b.icon)}</span>
        <div class="bento-num" data-field="num" contenteditable="false">${escText(b.num)}</div>
        <div class="bento-label" data-field="label" contenteditable="false">${escText(b.label)}</div>
        <span class="bento-tag" data-field="tag" contenteditable="false">${escText(b.tag)}</span>
      </div>`;
    },
    langCard(l) {
      const pct = Math.max(0, Math.min(100, +l.cefr || 0));
      return `<div class="glass lang-card reveal" data-repeat-item>
        <div class="spotlight"></div>
        <div class="lang-name" data-field="name" contenteditable="false">${escText(l.name)}</div>
        <div class="lang-level" data-field="level" contenteditable="false">${escText(l.level)}</div>
        <div class="lang-bar"><div class="lang-bar-fill" data-field="cefr" data-cefr="${escAttr(pct)}" style="width:${pct}%"></div></div>
      </div>`;
    },
  };

  /* ---------------- render ---------------- */

  function renderInto(container, items, tplFn) {
    if (!container) return;
    container.innerHTML = items.map(tplFn).join("");
  }

  function renderAll(data) {
    window.__PORTFOLIO_DATA = data;

    // Hero
    const heroName = document.querySelector("[data-field='hero.name']");
    if (heroName) heroName.textContent = data.hero.name;
    const heroBio = document.querySelector("[data-field='hero.bio']");
    if (heroBio) heroBio.innerHTML = richHTML(data.hero.bio);
    const availBadge = document.querySelector("[data-field='hero.availBadge']");
    if (availBadge) availBadge.textContent = data.hero.availBadge;
    renderInto(document.getElementById("heroStats"), data.hero.stats, templates.statBlock);

    const visaBadge = document.getElementById("heroVisaBadge");
    if (visaBadge) visaBadge.textContent = "🌍 " + data.status.visaNote;

    const locationBadge = document.getElementById("heroLocationBadge");
    if (locationBadge) locationBadge.textContent = "📍 " + data.status.currentLocation + " · Open to relocate: " + data.status.relocateTo;

    // About
    renderInto(document.getElementById("aboutParas"), data.about.paragraphs, templates.aboutPara);
    renderInto(document.getElementById("aboutChips"), data.about.chips, templates.chip);

    // Core Competencies (plain string list, same chip template as about.chips)
    renderInto(document.getElementById("competenciesList"), data.coreCompetencies || [], templates.chip);

    // Currently Building + bento stats
    renderInto(document.getElementById("buildingGrid"), data.buildingNow || [], templates.buildingCard);
    renderInto(document.getElementById("bentoGrid"), data.bentoStats || [], templates.bentoCard);

    // Skills
    renderInto(document.getElementById("skillsGrid"), data.skills, templates.skillCard);

    // Experience
    renderInto(document.getElementById("expTimeline"), data.experience, templates.expCard);

    // Key Achievements
    renderInto(document.getElementById("achList"), data.achievements || [], templates.achCard);

    // Projects
    renderInto(document.getElementById("projectsList"), data.projects || [], templates.projCard);

    // Education
    renderInto(document.getElementById("eduGrid"), data.education, templates.eduCard);

    // Certifications
    renderInto(document.getElementById("certList"), data.certifications, templates.certCard);

    // AI tools
    renderInto(document.getElementById("aiGrid"), data.aiTools, templates.aiCard);

    // Languages
    renderInto(document.getElementById("langGrid"), data.languages, templates.langCard);

    // Contact info
    const c = data.contact;
    setText("[data-field='contact.email']", c.email);
    setText("[data-field='contact.location']", c.location);
    setText("[data-field='contact.phone']", c.phone);
    const li = document.querySelector("[data-field='contact.linkedinLabel']");
    if (li) { li.textContent = c.linkedinLabel; li.href = c.linkedinUrl; }
    const lc = document.querySelector("[data-field='contact.leetcodeLabel']");
    if (lc) { lc.textContent = c.leetcodeLabel; lc.href = c.leetcodeUrl; }
    const gh = document.querySelector("[data-field='contact.githubLabel']");
    if (gh) { gh.textContent = c.githubLabel; gh.href = c.githubUrl; }
    renderInto(document.getElementById("contactExtrasList"), c.extras || [], templates.contactExtra);

    // Status panel
    const st = data.status;
    setText("[data-field='status.openBadge']", st.openBadge);
    setText("[data-field='status.lookingFor']", st.lookingFor);
    setText("[data-field='status.workType']", st.workType);
    setText("[data-field='status.currentLocation']", st.currentLocation);
    setText("[data-field='status.relocateTo']", st.relocateTo);
    setText("[data-field='status.coreStack']", st.coreStack);
    setText("[data-field='status.bestVia']", st.bestVia);
    setText("[data-field='status.visaNote']", st.visaNote);

    // Re-init interactive bindings for anything newly injected
    if (window.__initReveal) window.__initReveal();
    if (window.__initSpotlight) window.__initSpotlight();
    if (window.__initCursorTargets) window.__initCursorTargets();
    if (window.__initCounters) window.__initCounters(document.getElementById("heroStats"));

    document.dispatchEvent(new CustomEvent("portfolio:rendered", { detail: { data } }));
  }

  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.textContent = value ?? "";
  }

  /* ---------------- serialize (DOM -> data.json shape) ---------------- */
  // Used by Developer Mode's Publish action. Lives here (not devmode.js)
  // so the shape always matches renderAll()'s expectations exactly.

  function collectRepeat(container, fieldReader) {
    if (!container) return [];
    return [...container.children].map(fieldReader);
  }

  function fieldText(root, name) {
    const el = root.querySelector(`[data-field='${name}']`);
    return el ? el.textContent.trim() : "";
  }
  function fieldHTML(root, name) {
    const el = root.querySelector(`[data-field='${name}']`);
    return el ? el.innerHTML.trim() : "";
  }
  // Tag/chip items nest their text in an inner [data-field='text'] span (see
  // templates.chip/skillTag/expTag). Reading .textContent on the OUTER
  // [data-repeat-item] instead — which is what the ✕ remove button also
  // lives inside, once Dev Mode has injected it — picks up the "✕" glyph
  // too and bakes it into the saved value. Always read the inner span.
  function chipText(el) {
    const inner = el.querySelector("[data-field='text']");
    return (inner || el).textContent.trim();
  }

  function serialize() {
    const d = window.__PORTFOLIO_DATA || {};
    const heroStats = collectRepeat(document.getElementById("heroStats"), (el) => ({
      target: +el.querySelector("[data-field='target']").dataset.target || 0,
      label: fieldText(el, "label"),
    }));
    const aboutParas = [...document.getElementById("aboutParas").children].map((p) => {
      const inner = p.querySelector("[data-field='text']");
      return (inner || p).innerHTML.trim();
    });
    const aboutChips = [...document.getElementById("aboutChips").children].map(chipText);
    const coreCompetencies = [...document.getElementById("competenciesList").children].map(chipText);
    const buildingNow = collectRepeat(document.getElementById("buildingGrid"), (el) => {
      const pill = el.querySelector(".build-status");
      const statusClass = (pill && STATUS_CLASSES.find((c) => pill.classList.contains(c))) || "status-live";
      return {
        statusText: fieldText(el, "statusText"),
        statusClass,
        title: fieldText(el, "title"),
        desc: fieldText(el, "desc"),
        tags: [...el.querySelectorAll(".build-tech [data-repeat-item]")].map(chipText),
      };
    });
    const bentoStats = collectRepeat(document.getElementById("bentoGrid"), (el) => ({
      icon: fieldText(el, "icon"),
      num: fieldText(el, "num"),
      label: fieldText(el, "label"),
      tag: fieldText(el, "tag"),
      wide: el.dataset.wide === "1",
    }));
    const skills = collectRepeat(document.getElementById("skillsGrid"), (el) => ({
      icon: fieldText(el, "icon"),
      category: fieldText(el, "category"),
      tags: [...el.querySelectorAll(".skill-tags [data-repeat-item]")].map(chipText),
    }));
    const experience = collectRepeat(document.getElementById("expTimeline"), (el) => ({
      role: fieldText(el, "role"),
      company: fieldText(el, "company"),
      dates: fieldText(el, "dates"),
      location: fieldText(el, "location"),
      bullets: [...el.querySelectorAll(".exp-bullets > li")].map((li) => ({
        lead: fieldText(li, "lead"),
        text: fieldText(li, "text"),
      })),
      tags: [...el.querySelectorAll(".exp-tags [data-repeat-item]")].map(chipText),
    }));
    const achievements = collectRepeat(document.getElementById("achList"), (el) => ({
      title: fieldText(el, "title"),
      text: fieldText(el, "text"),
    }));
    const projects = collectRepeat(document.getElementById("projectsList"), (el) => ({
      title: fieldText(el, "title"),
      desc: fieldText(el, "desc"),
      link: fieldText(el, "link"),
    }));
    const education = collectRepeat(document.getElementById("eduGrid"), (el) => ({
      degree: fieldText(el, "degree"),
      school: fieldText(el, "school"),
      meta: fieldHTML(el, "meta"),
      score: fieldText(el, "score"),
    }));
    const certifications = collectRepeat(document.getElementById("certList"), (el) => ({
      name: fieldText(el, "name"),
      meta: fieldText(el, "meta"),
      credUrl: el.dataset.credUrl || "",
    }));
    const aiTools = collectRepeat(document.getElementById("aiGrid"), (el) => ({
      name: fieldText(el, "name"),
      freq: fieldText(el, "freq"),
      desc: fieldText(el, "desc"),
    }));
    const languages = collectRepeat(document.getElementById("langGrid"), (el) => ({
      name: fieldText(el, "name"),
      level: fieldText(el, "level"),
      cefr: +el.querySelector("[data-field='cefr']").dataset.cefr || 0,
    }));
    const contactExtras = collectRepeat(document.getElementById("contactExtrasList"), (el) => ({
      icon: fieldText(el, "icon"),
      text: fieldText(el, "text"),
    }));

    // Reads the LIVE href off a contact link — set directly by the "✎" edit
    // button (see devmode.js) — falling back to whatever was last loaded if
    // that link isn't on the page. This used to always fall back to the old
    // value no matter what, silently discarding any URL edit even though
    // the visible label text did save correctly.
    function liveHref(fieldName, fallbackKey) {
      const el = document.querySelector(`[data-field='${fieldName}']`);
      return (el && el.getAttribute("href")) || (d.contact && d.contact[fallbackKey]) || "";
    }

    return {
      // Spread the last-loaded data first so fields this page doesn't render
      // (e.g. "profile", which only cv.html manages — this page has its own
      // "about" narrative instead) survive a publish from here instead of
      // being silently dropped. Every section below now does the same
      // Object.assign(base, overrides) pattern (not a plain object literal)
      // so any field added later that this page doesn't explicitly manage —
      // like contact.extras before this fix — can't be silently wiped out
      // by a publish from here.
      ...d,
      hero: Object.assign({}, d.hero, {
        name: document.querySelector("[data-field='hero.name']").textContent.trim(),
        availBadge: document.querySelector("[data-field='hero.availBadge']").textContent.trim(),
        bio: document.querySelector("[data-field='hero.bio']").innerHTML.trim(),
        stats: heroStats,
      }),
      status: Object.assign({}, d.status, {
        openBadge: document.querySelector("[data-field='status.openBadge']").textContent.trim(),
        lookingFor: document.querySelector("[data-field='status.lookingFor']").textContent.trim(),
        workType: document.querySelector("[data-field='status.workType']").textContent.trim(),
        currentLocation: document.querySelector("[data-field='status.currentLocation']").textContent.trim(),
        relocateTo: document.querySelector("[data-field='status.relocateTo']").textContent.trim(),
        coreStack: document.querySelector("[data-field='status.coreStack']").textContent.trim(),
        bestVia: document.querySelector("[data-field='status.bestVia']").textContent.trim(),
        visaNote: document.querySelector("[data-field='status.visaNote']").textContent.trim(),
      }),
      about: Object.assign({}, d.about, { paragraphs: aboutParas, chips: aboutChips }),
      coreCompetencies,
      buildingNow,
      bentoStats,
      skills,
      experience,
      achievements,
      projects,
      education,
      certifications,
      aiTools,
      languages,
      contact: Object.assign({}, d.contact, {
        email: fieldText(document, "contact.email"),
        location: fieldText(document, "contact.location"),
        phone: fieldText(document, "contact.phone"),
        linkedinLabel: fieldText(document, "contact.linkedinLabel"),
        linkedinUrl: liveHref("contact.linkedinLabel", "linkedinUrl"),
        leetcodeLabel: fieldText(document, "contact.leetcodeLabel"),
        leetcodeUrl: liveHref("contact.leetcodeLabel", "leetcodeUrl"),
        githubLabel: fieldText(document, "contact.githubLabel"),
        githubUrl: liveHref("contact.githubLabel", "githubUrl"),
        extras: contactExtras,
      }),
    };
  }

  /* ---------------- boot ---------------- */

  async function loadAndRender(dataOverride) {
    let data = dataOverride;
    if (!data) {
      try {
        const res = await fetch("assets/data.json?_=" + Date.now());
        if (!res.ok) throw new Error("HTTP " + res.status);
        data = await res.json();
      } catch (err) {
        // fetch() cannot load local files over file:// (no CORS support), so
        // double-clicking index.html on disk always lands here. Fall back to
        // the snapshot embedded in the page itself so the site still renders
        // correctly (and is fully Dev-Mode editable) offline. This snapshot
        // is only as fresh as the last time this HTML file was generated —
        // once published via GitHub, live visitors always get the current
        // assets/data.json over https, where this fetch succeeds normally.
        const embedded = document.getElementById("siteData");
        if (embedded) {
          try { data = JSON.parse(embedded.textContent); } catch (_) {}
        }
        if (!data) { console.error("Portfolio: failed to load site data.", err); return; }
        console.warn("Portfolio: live assets/data.json fetch failed (viewing via file:// or offline) — rendering from the embedded snapshot instead. Edits here won't reflect the latest published content.");
      }
    }
    renderAll(data);
  }

  window.Portfolio = {
    templates,
    escText,
    escAttr,
    richHTML,
    renderAll,
    serialize,
    loadAndRender,
    get data() {
      return window.__PORTFOLIO_DATA;
    },
  };

  loadAndRender();
})();
