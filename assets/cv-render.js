/* ============================================================
   cv-render.js — renders cv.html from the SAME assets/data.json
   the portfolio (index.html) reads. Shared fields (hero.name,
   skills, experience, education, certifications, aiTools,
   contact) stay in sync automatically since both pages read/
   write the one file. "profile" and "achievements" only exist
   for this page.
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

  const templates = {
    // The visible text lives in an inner data-field span (not directly on
    // the data-repeat-item element) so Dev Mode's augmentDOM() — which only
    // ever makes [data-field] elements editable — actually reaches it. A
    // bare `contenteditable="false"` with no data-field, as this used to be,
    // can never be flipped to editable by anything, which is why tags looked
    // permanently frozen no matter how you clicked or typed into them.
    tag(text) {
      return `<span data-repeat-item><span data-field="text" contenteditable="false">${escText(text)}</span></span>`;
    },
    skillCat(cat) {
      const tags = (cat.tags || []).map((t) => templates.tag(t)).join("");
      return `<div class="glass skill-cat pf-item" data-repeat-item>
        <h4><span data-field="category" contenteditable="false">${escText(cat.category)}</span></h4>
        <div class="items-text tag-list" data-repeat-container="skill.tags">${tags}</div>
      </div>`;
    },
    expItem(item) {
      const bullets = (item.bullets || []).map((b) => templates.bullet(b)).join("");
      const tags = (item.tags || []).map((t) => templates.tag(t)).join("");
      return `<div class="exp-item pf-item" data-repeat-item>
        <div class="exp-title-line"><b data-field="company" contenteditable="false">${escText(item.company)}</b>, <b data-field="role" contenteditable="false">${escText(item.role)}</b></div>
        <div class="exp-meta">- <span data-field="dates" contenteditable="false">${escText(item.dates)}</span> | <span data-field="location" contenteditable="false">${escText(item.location)}</span></div>
        <ul class="bullets" data-repeat-container="exp.bullets">${bullets}</ul>
        <div class="tech-line"><b>Technologies:</b> <span class="tag-list" data-repeat-container="exp.tags">${tags}</span></div>
      </div>`;
    },
    bullet(b) {
      return `<li class="pf-item" data-repeat-item><b data-field="lead" contenteditable="false">${escText(b.lead)}</b> <span data-field="text" contenteditable="false">${escText(b.text)}</span></li>`;
    },
    eduItem(e) {
      return `<div class="edu-item pf-item" data-repeat-item>
        <div class="edu-degree" data-field="degree" contenteditable="false">${escText(e.degree)}</div>
        <div class="edu-school" data-field="school" contenteditable="false">${escText(e.school)}</div>
        <div class="edu-meta" data-field="meta" contenteditable="false">${richHTML(e.meta)}</div>
        <div class="edu-details" data-field="score" contenteditable="false">${escText(e.score)}</div>
      </div>`;
    },
    certItem(c) {
      // credUrl rides as a data attribute (same pattern as lang.cefr below)
      // rather than a visible/editable text field — we want the cert name
      // clickable without printing a raw verify-URL string on the page.
      // Omit href entirely when there's no link, same reasoning as
      // projectItem: href="" would self-link back to this page.
      const nameField = `<span data-field="name" contenteditable="false">${escText(c.name)}</span>`;
      const titleInner = c.credUrl
        ? `<a href="${escAttr(c.credUrl)}" target="_blank" rel="noopener">${nameField}</a>`
        : nameField;
      return `<div class="cert-item pf-item" data-repeat-item data-cred-url="${escAttr(c.credUrl || "")}">
        <div class="cert-title">${titleInner}</div>
        <div class="cert-meta" data-field="meta" contenteditable="false">${escText(c.meta)}</div>
      </div>`;
    },
    // No CEFR progress bar here (that's a portfolio-page visual flourish) —
    // this is the ATS/print-facing document, so it's a plain text line. The
    // cefr number still round-trips via data-cefr so publishing from either
    // page keeps the portfolio's language bars in sync. Rendered as one
    // compact inline chip ("Name (Level)") so the whole Languages section
    // reads as a single flowing line instead of a stacked block per language.
    langItem(l) {
      return `<span class="lang-item pf-item" data-repeat-item data-cefr="${escAttr(l.cefr)}"><span class="lang-name" data-field="name" contenteditable="false">${escText(l.name)}</span> <span class="lang-level">(<span data-field="level" contenteditable="false">${escText(l.level)}</span>)</span></span>`;
    },
    achItem(a) {
      return `<div class="ach-item pf-item" data-repeat-item>
        <div class="ach-title" data-field="title" contenteditable="false">${escText(a.title)}</div>
        <div class="ach-text" data-field="text" contenteditable="false">${escText(a.text)}</div>
      </div>`;
    },
    // One flowing line per tool (name + frequency badge + short description
    // all inline) instead of a name header on its own line with the
    // description below it — collapses the whole section to ~2-3 lines
    // total for 2 tools instead of ~4-6.
    aiItem(a) {
      return `<div class="ai-item pf-item" data-repeat-item><b data-field="name" contenteditable="false">${escText(a.name)}</b> <span class="ai-freq" data-field="freq" contenteditable="false">${escText(a.freq)}</span> — <span data-field="desc" contenteditable="false">${escText(a.desc)}</span></div>`;
    },
    // Projects: title + short description + a link. The link field's text
    // IS the URL (both the visible label and the href source) — there's no
    // separate "edit the real href" control like the portfolio's contact
    // links have, so editing the text and republishing is what updates
    // where it points. Simple by design; revisit only if that's ever
    // actually limiting.
    projectItem(p) {
      // Omit href entirely when there's no link yet — href="" would
      // self-link back to this same page, which is worse than no link.
      const hrefAttr = p.link ? ` href="${escAttr(p.link)}" target="_blank" rel="noopener"` : "";
      return `<div class="proj-item pf-item" data-repeat-item>
        <div class="proj-title" data-field="title" contenteditable="false">${escText(p.title)}</div>
        <div class="proj-desc" data-field="desc" contenteditable="false">${escText(p.desc)}</div>
        <div class="proj-link"><a data-field="link" contenteditable="false"${hrefAttr}>${escText(p.link)}</a></div>
      </div>`;
    },
    contact(icon, fieldKey, value, href) {
      if (href) {
        return `<div class="contact-item"><span class="icon">${icon}</span> <a data-field="${fieldKey}" contenteditable="false" href="${escAttr(href)}" target="_blank" rel="noopener">${escText(value)}</a></div>`;
      }
      return `<div class="contact-item"><span class="icon">${icon}</span> <span data-field="${fieldKey}" contenteditable="false">${escText(value)}</span></div>`;
    },
    // Freeform extra header badges (relocation note, a certification, or
    // anything custom) — added via the "+Add" menu next to the contact row.
    // Single-field-per-icon: icon (emoji) + text, both directly editable.
    contactExtra(e) {
      return `<div class="contact-item pf-item" data-repeat-item><span class="icon" data-field="icon" contenteditable="false">${escText(e.icon)}</span> <span data-field="text" contenteditable="false">${escText(e.text)}</span></div>`;
    },
    // Freeform section you add yourself (Publications, Volunteering, etc.).
    // The section itself is a data-repeat-item (removable as a whole via the
    // same ✕ button every other item gets) that contains its own nested
    // data-repeat-container of items.
    customItem(it) {
      return `<div class="ach-item pf-item" data-repeat-item>
        <div class="ach-title" data-field="heading" contenteditable="false">${escText(it.heading)}</div>
        <div class="ach-text" data-field="text" contenteditable="false">${escText(it.text)}</div>
      </div>`;
    },
    customSection(sec) {
      const items = (sec.items || []).map((it) => templates.customItem(it)).join("");
      return `<section class="block custom-section pf-item" data-repeat-item data-sec-id="${escAttr(sec.id)}">
        <div class="sec-title">
          <span class="sec-icon" data-field="icon" contenteditable="false">${escText(sec.icon)}</span>
          <h2 data-field="title" contenteditable="false">${escText(sec.title)}</h2>
          <hr>
        </div>
        <div data-repeat-container="customSection.items">${items}</div>
      </section>`;
    },
  };

  function renderInto(container, items, tplFn) {
    if (!container) return;
    container.innerHTML = items.map(tplFn).join("");
  }

  function renderAll(data) {
    window.__CV_DATA = data;

    document.querySelector("[data-field='hero.name']").textContent = data.hero.name;
    document.querySelector("[data-field='profile']").textContent = data.profile || "";

    // hero.title / hero.yearsBadgeText are independently editable fields —
    // NOT derived from experience[0].role / hero.stats. They used to be
    // auto-computed from those on every render, which meant they had no
    // editable UI of their own (clicking them in Dev Mode did nothing) and
    // silently went stale between edits and the next full render. Direct
    // fields are simpler and match everything else on the page: what you
    // click is what you edit.
    const roleEl = document.querySelector("[data-field='hero.title']");
    if (roleEl) roleEl.textContent = data.hero.title || "";
    const badgeEl = document.querySelector("[data-field='hero.yearsBadgeText']");
    if (badgeEl) badgeEl.textContent = data.hero.yearsBadgeText || "";

    const c = data.contact || {};
    document.getElementById("contactRow").innerHTML =
      templates.contact("✉", "contact.email", c.email) +
      templates.contact("☎", "contact.phone", c.phone) +
      templates.contact("📍", "contact.location", c.location) +
      templates.contact("🔗", "contact.linkedinLabel", c.linkedinLabel, c.linkedinUrl) +
      templates.contact("⌨", "contact.leetcodeLabel", c.leetcodeLabel, c.leetcodeUrl) +
      templates.contact("🌐", "contact.portfolioLabel", c.portfolioLabel, c.portfolioUrl) +
      // GitHub deliberately dropped from the CV (kept on the portfolio) —
      // githubUrl/githubLabel still round-trip untouched via serialize()'s
      // base spread, so this doesn't delete that data, just doesn't show it
      // here.
      // display:contents so these badges sit inline in the same flex row as
      // the fixed contact items above, instead of wrapping onto their own line.
      `<span id="contactExtras" data-repeat-container="contact.extras" style="display:contents">` +
      (c.extras || []).map(templates.contactExtra).join("") +
      `</span>`;

    renderInto(document.getElementById("competenciesList"), data.coreCompetencies || [], templates.tag);
    renderInto(document.getElementById("skillsList"), data.skills, templates.skillCat);
    renderInto(document.getElementById("experienceList"), data.experience, templates.expItem);
    renderInto(document.getElementById("achList"), data.achievements || [], templates.achItem);
    renderInto(document.getElementById("projectsList"), data.projects || [], templates.projectItem);
    renderInto(document.getElementById("langList"), data.languages || [], templates.langItem);
    renderInto(document.getElementById("eduList"), data.education, templates.eduItem);
    renderInto(document.getElementById("certList"), data.certifications, templates.certItem);
    renderInto(document.getElementById("aiList"), data.aiTools, templates.aiItem);
    renderInto(document.getElementById("customSectionsList"), data.customSections || [], templates.customSection);

    document.dispatchEvent(new CustomEvent("cv:rendered", { detail: { data } }));
  }

  function fieldText(root, name) {
    const el = root.querySelector(`[data-field='${name}']`);
    return el ? el.textContent.trim() : "";
  }
  function fieldHTML(root, name) {
    const el = root.querySelector(`[data-field='${name}']`);
    return el ? el.innerHTML.trim() : "";
  }
  function collectRepeat(container, fieldReader) {
    if (!container) return [];
    return [...container.children].map(fieldReader);
  }
  // Same fix as render.js's chipText(): tag text lives in an inner
  // [data-field='text'] span, not directly on the [data-repeat-item] — the
  // outer element also holds the ✕ remove button once Dev Mode injects it,
  // so reading its raw .textContent bakes "✕" into the saved value.
  function tagList(root, selector) {
    const el = root.querySelector(selector);
    if (!el) return [];
    return [...el.children].map((t) => {
      const inner = t.querySelector("[data-field='text']");
      return (inner || t).textContent.trim();
    });
  }

  function serialize() {
    const d = window.__CV_DATA || {};

    const skills = collectRepeat(document.getElementById("skillsList"), (el) => ({
      category: fieldText(el, "category"),
      tags: tagList(el, "[data-repeat-container='skill.tags']"),
    }));
    const experience = collectRepeat(document.getElementById("experienceList"), (el) => ({
      role: fieldText(el, "role"),
      company: fieldText(el, "company"),
      dates: fieldText(el, "dates"),
      location: fieldText(el, "location"),
      bullets: [...el.querySelectorAll("[data-repeat-container='exp.bullets'] > li")].map((li) => ({
        lead: fieldText(li, "lead"),
        text: fieldText(li, "text"),
      })),
      tags: tagList(el, "[data-repeat-container='exp.tags']"),
    }));
    const education = collectRepeat(document.getElementById("eduList"), (el) => ({
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
    const aiTools = collectRepeat(document.getElementById("aiList"), (el) => ({
      name: fieldText(el, "name"),
      freq: fieldText(el, "freq"),
      desc: fieldText(el, "desc"),
    }));
    const languages = collectRepeat(document.getElementById("langList"), (el) => ({
      name: fieldText(el, "name"),
      level: fieldText(el, "level"),
      cefr: +el.dataset.cefr || 0,
    }));
    const customSections = collectRepeat(document.getElementById("customSectionsList"), (el) => ({
      id: el.dataset.secId || "",
      icon: fieldText(el, "icon"),
      title: fieldText(el, "title"),
      items: [...el.querySelectorAll("[data-repeat-container='customSection.items'] > [data-repeat-item]")].map((it) => ({
        heading: fieldText(it, "heading"),
        text: fieldText(it, "text"),
      })),
    }));
    const contactExtras = collectRepeat(document.getElementById("contactExtras"), (el) => ({
      icon: fieldText(el, "icon"),
      text: fieldText(el, "text"),
    }));
    const coreCompetencies = tagList(document, "#competenciesList");
    const achievements = collectRepeat(document.getElementById("achList"), (el) => ({
      title: fieldText(el, "title"),
      text: fieldText(el, "text"),
    }));
    const projects = collectRepeat(document.getElementById("projectsList"), (el) => ({
      title: fieldText(el, "title"),
      desc: fieldText(el, "desc"),
      link: fieldText(el, "link"),
    }));

    return {
      // Preserve everything this page doesn't manage (status, about, hero.bio/
      // stats/availBadge, achievements) so publishing from cv.html never wipes
      // it out. "achievements" isn't rendered/edited here anymore (cut from
      // the CV to reclaim space) but stays untouched in data.json via this
      // spread since it's not re-listed below. "languages" is shared — both
      // pages edit and write it, like skills/experience/education/etc.
      ...d,
      hero: Object.assign({}, d.hero, {
        name: fieldText(document, "hero.name"),
        title: fieldText(document, "hero.title"),
        yearsBadgeText: fieldText(document, "hero.yearsBadgeText"),
      }),
      profile: fieldText(document, "profile"),
      coreCompetencies,
      skills,
      experience,
      achievements,
      projects,
      education,
      certifications,
      aiTools,
      languages,
      customSections,
      // githubLabel/githubUrl intentionally NOT read here — the GitHub
      // contact item was removed from this page's markup, so there's no
      // [data-field='contact.githubLabel'] element to read anymore.
      // Reading it anyway would call fieldText() against a missing element,
      // which returns "" — that would silently blank out the portfolio's
      // GitHub link on every publish from the CV. Leaving it out of this
      // override object entirely means Object.assign's base spread
      // (d.contact) carries the existing value through untouched instead.
      contact: Object.assign({}, d.contact, {
        email: fieldText(document, "contact.email"),
        phone: fieldText(document, "contact.phone"),
        location: fieldText(document, "contact.location"),
        linkedinLabel: fieldText(document, "contact.linkedinLabel"),
        leetcodeLabel: fieldText(document, "contact.leetcodeLabel"),
        portfolioLabel: fieldText(document, "contact.portfolioLabel"),
        extras: contactExtras,
      }),
    };
  }

  async function loadAndRender(dataOverride) {
    let data = dataOverride;
    if (!data) {
      try {
        const res = await fetch("assets/data.json?_=" + Date.now());
        if (!res.ok) throw new Error("HTTP " + res.status);
        data = await res.json();
      } catch (err) {
        // Same file://-can't-fetch-local-files limitation as render.js — fall
        // back to the embedded snapshot so cv.html always shows your real,
        // existing content to edit instead of empty sections.
        const embedded = document.getElementById("siteData");
        if (embedded) {
          try { data = JSON.parse(embedded.textContent); } catch (_) {}
        }
        if (!data) { console.error("CV: failed to load site data.", err); return; }
        console.warn("CV: live assets/data.json fetch failed (viewing via file:// or offline) — rendering from the embedded snapshot instead. Edits here won't reflect the latest published content.");
      }
    }
    renderAll(data);
  }

  window.CV = {
    templates,
    escText,
    escAttr,
    richHTML,
    renderAll,
    serialize,
    loadAndRender,
    get data() {
      return window.__CV_DATA;
    },
  };

  loadAndRender();
})();
