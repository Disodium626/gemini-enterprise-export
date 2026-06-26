// ==UserScript==
// @name         Gemini Enterprise Chat Exporter (Codex++ jsonl)
// @namespace    gemini-enterprise-export
// @version      1.7.4
// @description  Export business.gemini.google chat history to Codex++ rollout jsonl. v1.7: document-order traversal across shadow roots.
// @author       github.com/Disodium626
// @match        https://business.gemini.google/*
// @grant        GM_download
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";
  var LOG = "[GEX]";
  function tag0(m) { return LOG + " " + m; }
  function log0() { var a = []; for (var i = 0; i < arguments.length; i++) a.push(arguments[i]); console.log(tag0("[log]"), a.length === 1 ? a[0] : a); }
  function warn0() { var a = []; for (var i = 0; i < arguments.length; i++) a.push(arguments[i]); console.warn(tag0("[warn]"), a.length === 1 ? a[0] : a); }
  function err0() { var a = []; for (var i = 0; i < arguments.length; i++) a.push(arguments[i]); console.error(tag0("[err]"), a.length === 1 ? a[0] : a); }
  var log = log0, warn = warn0, err = err0;
  var SCROLL_STABLE_TICKS = 3;
  var SCROLL_TICK_MS = 250;
  var MAX_SCROLL_MS = 5 * 60 * 1000;
  var NAVIGATE_AFTER_MS = 2000;
  var WAIT_FOR_LOAD_MS = 30000;
  var NAV_TIMEOUT_MS = 30000;
  var css = [
    "#gex-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;background:#1f2330;color:#e7e9ee;border:1px solid #3a3f50;border-radius:10px;padding:12px 14px;width:380px;font:13px/1.4 -apple-system,Segoe UI,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4)}",
    "#gex-panel h3{margin:0 0 8px;font-size:13px;color:#9aa3b2;font-weight:600;display:flex;justify-content:space-between;align-items:center}",
    "#gex-panel h3 .ver{color:#6ee787;font-weight:400;font-size:11px}",
    "#gex-panel .row{display:flex;gap:6px;margin:6px 0}",
    "#gex-panel button{flex:1;background:#3a86ff;color:#fff;border:0;border-radius:6px;padding:7px 8px;cursor:pointer;font-size:12px}",
    "#gex-panel button:disabled{background:#4a4f5c;cursor:not-allowed}",
    "#gex-panel button.secondary{background:#4a4f5c}",
    "#gex-panel button.scan{background:#059669;flex:0 0 auto;width:54px;font-size:11px}",
    "#gex-panel .status{font-size:11px;color:#9aa3b2;margin-top:6px;min-height:14px;word-break:break-all;max-height:240px;overflow:auto;background:#15171f;padding:6px;border-radius:4px;font-family:Menlo,Consolas,monospace;white-space:pre-wrap}",
    "#gex-panel .progress{height:4px;background:#2a2f3d;border-radius:2px;overflow:hidden;margin-top:6px}",
    "#gex-panel .progress>div{height:100%;background:#3a86ff;width:0%;transition:width .2s}",
    "#gex-banner{position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#1f2330;color:#9aa3b2;text-align:center;font:12px/1.6 -apple-system,Segoe UI,system-ui,sans-serif;padding:4px 10px;border-bottom:1px solid #3a3f50;pointer-events:none}",
    "#gex-banner.ok{color:#6ee787}",
    "#gex-banner.err{color:#ff7b72;background:#2a1517}"
  ].join("\n");
  function injectStyle() {
    if (document.getElementById("gex-style")) return;
    var s = document.createElement("style");
    s.id = "gex-style";
    s.appendChild(document.createTextNode(css));
    (document.head || document.documentElement).appendChild(s);
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function fmtIso(d) { return (d || new Date()).toISOString().replace(/[:.]/g, "-").replace(/Z$/, ""); }
  function slug(s) { return (s || "").replace(/[^A-Za-z0-9_\-]+/g, "_").slice(0, 60) || "session"; }
  function el(tagN, props, children) {
    var n = document.createElement(tagN);
    props = props || {}; children = children || [];
    for (var k in props) {
      if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
      if (k === "style" && typeof props[k] === "object") Object.assign(n.style, props[k]);
      else if (k === "text") n.textContent = props[k];
      else if (k.indexOf("on") === 0 && typeof props[k] === "function") n.addEventListener(k.slice(2), props[k]);
      else n.setAttribute(k, props[k]);
    }
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (c == null) continue;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return n;
  }
  var banner;
  function bannerSet(text, kind) {
    if (!banner) {
      injectStyle();
      banner = el("div", { id: "gex-banner" });
      (document.body || document.documentElement).appendChild(banner);
    }
    banner.textContent = text;
    banner.className = kind || "";
  }
  function setStatus(msg) { var e = document.getElementById("gex-status"); if (e) e.textContent = msg; }
  function setProgress(pct) { var e = document.getElementById("gex-bar"); if (e) e.style.width = Math.max(0, Math.min(100, pct)) + "%"; }
  function setBusy(b) { document.querySelectorAll("#gex-panel button[data-act]").forEach(function (x) { x.disabled = b; }); }
  function walkDocOrder(root, visit) {
    if (!root) return;
    function w(node) {
      if (node.nodeType === 1) {
        visit(node);
        if (node.shadowRoot) w(node.shadowRoot);
      }
      var kids = node.childNodes;
      for (var i = 0; i < kids.length; i++) w(kids[i]);
    }
    w(root);
  }
  function collectFastMarkdown() {
    var out = [];
    walkDocOrder(document.documentElement, function (n) {
      if (n.tagName && n.tagName.toLowerCase() === "ucs-fast-markdown") out.push(n);
    });
    return out;
  }  function getMdRoot(n) {
    if (!n) return null;
    var sr = n.shadowRoot; if (!sr) return null;
    var d = sr.querySelector(".markdown-document"); if (d) return d;
    return sr.querySelector("slot") || sr.firstElementChild || sr;
  }
  var NL = String.fromCharCode(10);
  function htmlToMd(root) {
    var out = [];
    function push(s) { out.push(s); }
    function walk(node) {
      if (!node) return;
      if (node.nodeType === 3) { push(node.nodeValue); return; }
      if (node.nodeType !== 1) return;
      var t = node.tagName.toLowerCase();
      if (t === "strong" || t === "b") { push("**"); for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]); push("**"); return; }
      if (t === "em" || t === "i")     { push("*");  for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]); push("*");  return; }
      if (t === "code") { push("`"); push(node.textContent); push("`"); return; }
      if (t === "pre") {
        var c = node.querySelector("code");
        var m = c && c.className && c.className.match(/language-([\w-]+)/);
        var lang = m ? m[1] : "";
        push(NL + "```" + lang + NL);
        push((c ? c.textContent : node.textContent).replace(/\n$/, ""));
        push(NL + "```" + NL);
        return;
      }
      if (t === "a") { var h = node.getAttribute("href") || ""; push("["); for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]); push("](" + h + ")"); return; }
      if (t === "br") { push(NL); return; }
      if (t === "p")  { for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]); push(NL + NL); return; }
      if (t === "h1") { push(NL + "# "); for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]); push(NL + NL); return; }
      if (t === "h2") { push(NL + "## "); for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]); push(NL + NL); return; }
      if (t === "h3") { push(NL + "### "); for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]); push(NL + NL); return; }
      if (t === "h4") { push(NL + "#### "); for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]); push(NL + NL); return; }
      if (t === "ul" || t === "ol") { for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]); push(NL); return; }
      if (t === "li") { push("- "); for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]); push(NL); return; }
      if (t === "blockquote") { push(NL + "> "); for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]); push(NL); return; }
      if (t === "hr") { push(NL + NL + "---" + NL + NL); return; }
      if (t === "ucs-code-block") {
        var cb = node.getAttribute("code") || "";
        var lang = node.getAttribute("language") || "";
        push(NL + "```" + lang + NL);
        push(cb.replace(/\n$/, ""));
        push(NL + "```" + NL);
        for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
        return;
      }
      if (t === "code-block" || t === "pre-code") {
        var c2 = node.getAttribute("code") || node.textContent || "";
        var lang2 = node.getAttribute("language") || "";
        push(NL + "```" + lang2 + NL);
        push(c2.replace(/\n$/, ""));
        push(NL + "```" + NL);
        return;
      }
      if (t === "img" || t === "ucs-image") {
        push("![" + (node.getAttribute("alt") || "") + "](" + (node.getAttribute("src") || "image") + ")");
        return;
      }
      if (t.indexOf("slot") === 0) { return; }
      if (t === "span" || t === "div") { for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]); return; }
      for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
    }
    for (var i = 0; i < root.childNodes.length; i++) walk(root.childNodes[i]);
    return out.join("").replace(/\n{3,}/g, NL + NL).trim();
  }
  function getMdFromEl(n) { var r = getMdRoot(n); if (!r) return ""; return htmlToMd(r); }
  function extractTurns() {
    var fm = collectFastMarkdown();
    log("extractTurns: " + fm.length + " ucs-fast-markdown in doc order");
    if (fm.length === 0) return [];
    var idxSeq = [];
    var turns = [];
    var pending = null;
    var u = 0, a = 0;
    for (var i = 0; i < fm.length; i++) {
      var e = fm[i];
      var idx = e.getAttribute("data-turn-index");
      idxSeq.push(idx);
      var md = getMdFromEl(e);
      var hasU = (idx !== null && idx !== undefined && idx !== "");
      if (hasU) {
        if (pending) turns.push(pending);
        pending = { user: md, agent: "", userIndex: idx };
        u++;
      } else {
        if (!pending) pending = { user: "", agent: md, userIndex: "?" };
        else pending.agent = pending.agent ? (pending.agent + NL + NL + md) : md;
        a++;
      }
    }
    if (pending) turns.push(pending);
    log("extractTurns: user=" + u + " agent=" + a + " turns=" + turns.length + " idxSeq=" + idxSeq.join(","));
    return turns.filter(function (t) { return t.user || t.agent; });
  }
  function deepScan() {
    log("=== DEEP SCAN start ===");
    var fm = collectFastMarkdown();
    var roles = { user: 0, agent: 0 };
    for (var i = 0; i < fm.length; i++) {
      var idx = fm[i].getAttribute("data-turn-index");
      if (idx !== null && idx !== undefined && idx !== "") roles.user++;
      else roles.agent++;
    }
    log("ucs-fast-markdown (doc order):", fm.length, "user=" + roles.user, "agent=" + roles.agent);
    log("idx sequence:", fm.map(function (e) { return e.getAttribute("data-turn-index"); }).join(","));
    var sessionAnchors = [];
    walkDocOrder(document.documentElement, function (n) {
      if (n.tagName && n.tagName.toLowerCase() === "a") {
        var h = n.getAttribute("href");
        if (h && h.indexOf("/session/") >= 0) sessionAnchors.push(h);
      }
    });
    log("sidebar session anchors:", sessionAnchors.length);
    if (sessionAnchors.length > 0) {
      for (var j = 0; j < Math.min(5, sessionAnchors.length); j++) log("  " + sessionAnchors[j]);
    }
    setStatus([
      "URL: " + location.pathname,
      "fm:" + fm.length + " (u:" + roles.user + " a:" + roles.agent + ")",
      "session links: " + sessionAnchors.length,
      "(see Console for full detail)"
    ].join("\n"));
    log("=== DEEP SCAN end ===");
  }
  async function waitForTurns() {
    var deadline = Date.now() + WAIT_FOR_LOAD_MS;
    while (Date.now() < deadline) {
      var n = collectFastMarkdown().length;
      if (n >= 2) { log("waitForTurns: ready, count=" + n); return true; }
      await sleep(300);
    }
    log("waitForTurns timed out");
    return false;
  }
  async function scrollToLoadAll() {
    var start = Date.now();
    var lastH = -1, stable = 0;
    window.scrollTo(0, 0);
    await sleep(200);
    while (Date.now() - start < MAX_SCROLL_MS) {
      var h = document.body.scrollHeight;
      window.scrollTo(0, h);
      await sleep(SCROLL_TICK_MS);
      var nh = document.body.scrollHeight;
      if (nh === lastH) {
        stable++;
        if (stable >= SCROLL_STABLE_TICKS) break;
      } else { stable = 0; lastH = nh; }
    }
    window.scrollTo(0, 0);
    await sleep(200);
  }
  function toRollout(turns, meta) {
    var lines = [];
    var ts0 = new Date(meta.timestamp).getTime();
    var CW = "CodexDesktop\\\\sessions";
    lines.push(JSON.stringify({
      timestamp: meta.timestamp,
      type: "session_meta",
      payload: {
        id: meta.thread_id,
        timestamp: meta.timestamp,
        cwd: CW,
        originator: "gemini-enterprise-export",
        cli_version: "0.0.0",
        source: "gemini-enterprise",
        model_provider: "gemini-enterprise",
        thread_source: "gemini-enterprise-export",
        title: meta.title || "",
        base_instructions: { text: "Imported from Google Gemini Enterprise on " + meta.timestamp + "." },
        dynamic_tools: []
      }
    }));
    for (var i = 0; i < turns.length; i++) {
      var t = turns[i];
      var ts = new Date(ts0 + i * 2000).toISOString();
      var ts2 = new Date(ts0 + i * 2000 + 500).toISOString();
      var turn_id = meta.thread_id + "-turn-" + i;
      lines.push(JSON.stringify({
        timestamp: ts, type: "turn_context",
        payload: {
          turn_id: turn_id, cwd: CW,
          model: "gemini-enterprise", model_provider: "gemini-enterprise",
          approval_mode: "never", sandbox_policy: { type: "dangerFullAccess" },
          origin: "gemini-enterprise-export"
        }
      }));
      if (t.user) {
        lines.push(JSON.stringify({
          timestamp: ts, type: "response_item",
          payload: { role: "user", content: [{ type: "input_text", text: t.user }] }
        }));
        lines.push(JSON.stringify({
          timestamp: ts, type: "event_msg",
          payload: { type: "user_message", turn_id: turn_id, message: t.user, images: [] }
        }));
      }
      if (t.agent) {
        lines.push(JSON.stringify({
          timestamp: ts2, type: "response_item",
          payload: { role: "assistant", content: [{ type: "output_text", text: t.agent }] }
        }));
        lines.push(JSON.stringify({
          timestamp: ts2, type: "event_msg",
          payload: { type: "agent_message", turn_id: turn_id, message: t.agent }
        }));
      }
    }
    return lines.join(NL) + NL;
  }
  function download(content, filename) {
    log("download: " + filename + " size=" + content.length);
    try {
      var blob = new Blob([content], { type: "application/x-ndjson" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      (document.body || document.documentElement).appendChild(a);
      log("download: a appended, clicking");
      a.click();
      log("download: clicked, scheduling cleanup");
      setTimeout(function () { try { a.remove(); } catch (e) {} URL.revokeObjectURL(url); log("download: cleaned up"); }, 1500);
    } catch (e) { err("download failed:", e && e.message); }
  }
  function getSessionInfo() {
    var url = location.href;
    var m = url.match(/\/session\/([^/?#]+)/);
    var sid = m ? m[1] : "unknown";
    return { url: url, thread_id: sid, title: (document.title || "").trim() };
  }
  function listSidebarSessions() {
    var seen = new Map();
    walkDocOrder(document.documentElement, function (n) {
      if (n.tagName && n.tagName.toLowerCase() === "a") {
        var href = n.getAttribute("href");
        if (!href) return;
        var m = href.match(/\/session\/([^/?#]+)/);
        if (!m) return;
        var sid = m[1];
        if (seen.has(sid)) return;
        var title = (n.textContent || "").trim().slice(0, 100);
        var abs = href.indexOf("http") === 0 ? href : (location.origin + href);
        seen.set(sid, { sid: sid, title: title, href: abs });
      }
    });
    var arr = Array.from(seen.values());
    log("listSidebarSessions:", arr.length);
    return arr;
  }
  async function exportCurrent() {
    log("exportCurrent click");
    setBusy(true);
    try {
      setStatus("waiting for conversation to load..."); setProgress(5);
      var ready = await waitForTurns();
      if (!ready) { setStatus("timeout waiting for conversation (30s). Open a session first."); bannerSet("timeout", "err"); return; }
      setStatus("scrolling to load all turns..."); setProgress(20);
      await scrollToLoadAll();
      await sleep(800);
      setStatus("extracting turns..."); setProgress(50);
      var turns = extractTurns();
      if (turns.length === 0) {
        setStatus("no turns extracted. Click [Scan] for DOM details.");
        bannerSet("no turns - click scan", "err");
        return;
      }
      var meta = getSessionInfo();
      meta.timestamp = new Date().toISOString();
      setStatus("got " + turns.length + " turns, building jsonl..."); setProgress(80);
      var jsonl = toRollout(turns, meta);
      var fname = "rollout-" + fmtIso(new Date(meta.timestamp)) + "-" + (slug(meta.title) || meta.thread_id) + ".jsonl";
      download(jsonl, fname);
      log("downloaded:", fname);
      setStatus("OK " + turns.length + " turns -> " + fname);
      bannerSet("exported " + turns.length + " turns", "ok");
      setProgress(100);
    } catch (e) {
      err("exportCurrent error:", e);
      setStatus("error: " + (e && e.message || e));
      bannerSet("export failed: " + (e && e.message || e), "err");
    } finally { setBusy(false); }
  }
  async function exportAll() {
    log("exportAll click");
    setBusy(true);
    try {
      var sessions = listSidebarSessions();
      if (sessions.length === 0) {
        setStatus("sidebar has no session links. Open the sidebar, wait, then retry.");
        bannerSet("no sidebar sessions", "err");
        return;
      }
      setStatus("found " + sessions.length + " sessions. Starting batch export...");
      bannerSet("batch: " + sessions.length, "ok");
      setProgress(0);
      var collected = [];
      var failed = [];
      for (var i = 0; i < sessions.length; i++) {
        var s = sessions[i];
        setStatus("(" + (i + 1) + "/" + sessions.length + ") " + (s.title || s.sid) + " ...");
        setProgress(Math.round((i / sessions.length) * 90));
        location.href = s.href;
        var navOk = false;
        var navDeadline = Date.now() + NAV_TIMEOUT_MS;
        while (Date.now() < navDeadline) {
          if (location.href.indexOf("/session/" + s.sid) >= 0) { navOk = true; break; }
          await sleep(200);
        }
        if (!navOk) { warn("nav timeout for:", s.sid); failed.push(s.sid); continue; }
        await sleep(NAVIGATE_AFTER_MS);
        var ready = await waitForTurns();
        if (!ready) { warn("turns did not appear for:", s.sid); failed.push(s.sid); continue; }
        await scrollToLoadAll();
        var turns = extractTurns();
        var meta = getSessionInfo();
        meta.timestamp = new Date().toISOString();
        meta.title = meta.title || s.title;
        var jsonl = toRollout(turns, meta);
        var fname = "rollout-" + fmtIso(new Date(meta.timestamp)) + "-" + (slug(meta.title) || s.sid) + ".jsonl";
        collected.push({ filename: fname, content: jsonl });
        log("queued", fname, "turns=", turns.length);
        setStatus("(" + (i + 1) + "/" + sessions.length + ") " + (s.title || s.sid) + " -> " + turns.length + " turns");
      }
      setStatus("packing zip (" + collected.length + " files)..."); setProgress(95);
      var blob = buildZip(collected);
      var zipName = "gemini-enterprise-archive-" + fmtIso() + ".zip";
      var url = URL.createObjectURL(blob);
      if (typeof GM_download === "function") {
        GM_download({ url: url, name: zipName, saveAs: false, onload: function () { URL.revokeObjectURL(url); } });
      } else {
        var a = document.createElement("a");
        a.style.display = "none"; document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      }
      setStatus("OK -> " + zipName + " (" + collected.length + (failed.length ? ", failed " + failed.length : "") + ")");
      bannerSet("batch done: " + collected.length, "ok");
      setProgress(100);
    } catch (e) {
      err("exportAll error:", e);
      setStatus("error: " + (e && e.message || e));
      bannerSet("batch failed: " + (e && e.message || e), "err");
    } finally { setBusy(false); }
  }
  function buildZip(files) {
    var enc = new TextEncoder();
    var localParts = [];
    var centralParts = [];
    var offset = 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!f.content) continue;
      var nameBytes = enc.encode(f.filename);
      var data = enc.encode(f.content);
      var crc = crc32(data);
      var size = data.length;
      var lfh = new Uint8Array(30 + nameBytes.length);
      var dv = new DataView(lfh.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0, true);
      dv.setUint16(8, 0, true);
      dv.setUint16(10, 0, true);
      dv.setUint16(12, 0, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, size, true);
      dv.setUint32(22, size, true);
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);
      lfh.set(nameBytes, 30);
      localParts.push(lfh, data);
      var cfh = new Uint8Array(46 + nameBytes.length);
      var cv = new DataView(cfh.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(42, offset, true);
      cfh.set(nameBytes, 46);
      centralParts.push(cfh);
      offset += lfh.length + data.length;
    }
    var centralSize = 0;
    for (var j = 0; j < centralParts.length; j++) centralSize += centralParts[j].length;
    var eocd = new Uint8Array(22);
    var ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    return new Blob(localParts.concat(centralParts, [eocd]), { type: "application/zip" });
  }
  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) {
      c ^= bytes[i];
      for (var k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (c ^ 0xffffffff) >>> 0;
  }
  function mountPanel() {
    log("mountPanel enter");
    if (document.getElementById("gex-panel")) { log("already mounted"); return; }
    injectStyle();
    var btnCurrent = el("button", { "data-act": "current", text: "Export" });
    var btnAll = el("button", { "data-act": "all", class: "secondary", text: "Batch" });
    var btnScan = el("button", { "data-act": "scan", class: "scan", text: "Scan" });
    btnCurrent.addEventListener("click", exportCurrent);
    btnAll.addEventListener("click", exportAll);
    btnScan.addEventListener("click", deepScan);
    var panel = el("div", { id: "gex-panel" }, [
      el("h3", null, [
        document.createTextNode("Gemini Enterprise Export"),
        el("span", { class: "ver", text: "v1.7" })
      ]),
      el("div", { class: "row" }, [btnCurrent, btnAll, btnScan]),
      el("div", { id: "gex-status", class: "status", text: "open a session then click [Export]" }),
      el("div", { class: "progress" }, [el("div", { id: "gex-bar" })])
    ]);
    (document.body || document.documentElement).appendChild(panel);
    log("mountPanel done");
    bannerSet("GEX v1.7 loaded", "ok");
  }
  function tryMount() {
    log("tryMount tick, body=", !!document.body);
    if (document.body) { mountPanel(); return; }
    document.addEventListener("DOMContentLoaded", function () { mountPanel(); }, { once: true });
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (document.body) { clearInterval(t); mountPanel(); }
      if (tries > 40) { clearInterval(t); log("tryMount gave up"); }
    }, 250);
  }
  log("userscript body parsed, v1.7.0");
  tryMount();
})();
