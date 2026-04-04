// ==UserScript==
// @name         LeetCode Copy Helper
// @namespace    https://your-local-project.dev
// @version      1.0.0
// @description  Copy LeetCode problem as Markdown
// @author       galaxywk223
// @match        https://leetcode.cn/problems/*
// @match        https://leetcode.com/problems/*
// @grant        GM_setClipboard
// @run-at       document-idle
// @license      MIT
// @supportURL   https://github.com/galaxywk223/leetcode-copy-script/issues
// ==/UserScript==

(function () {
  "use strict";

  const BUTTON_ID = "lc-copy-helper-button";
  const TOAST_ID = "lc-copy-helper-toast";
  const APP_FLAG = "__LC_COPY_HELPER_INSTALLED__";

  if (window[APP_FLAG]) return;
  window[APP_FLAG] = true;

  let mutationObserver = null;
  let ensureButtonTimer = null;
  let lastUrl = location.href;

  function isProblemPage() {
    return /^\/problems\/[^/]+(?:\/.*)?$/.test(location.pathname);
  }

  function getProblemSlug() {
    const parts = location.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("problems");
    return idx >= 0 ? parts[idx + 1] || "" : "";
  }

  function getCanonicalProblemUrl() {
    const slug = getProblemSlug();
    if (!slug) return location.href.split("?")[0].split("#")[0];
    return `${location.origin}/problems/${slug}/`;
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return el.getClientRects().length > 0;
  }

  function unique(arr) {
    return [...new Set(arr)];
  }

  function showToast(message, isError = false) {
    const oldToast = document.getElementById(TOAST_ID);
    if (oldToast) oldToast.remove();

    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.textContent = message;
    toast.style.position = "fixed";
    toast.style.top = "60px";
    toast.style.right = "16px";
    toast.style.zIndex = "999999";
    toast.style.padding = "8px 12px";
    toast.style.background = isError ? "#cf1322" : "#222";
    toast.style.color = "#fff";
    toast.style.fontSize = "14px";
    toast.style.borderRadius = "8px";
    toast.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.2)";
    toast.style.maxWidth = "360px";
    toast.style.wordBreak = "break-word";

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 2200);
  }

  function fallbackCopyText(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  async function copyText(text) {
    if (typeof GM_setClipboard === "function") {
      GM_setClipboard(text, "text");
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    fallbackCopyText(text);
  }

  function normalizeWhitespace(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ");
  }

  function collapseInlineWhitespace(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ");
  }

  function escapeInlineCode(text) {
    return String(text || "").replace(/`/g, "\\`");
  }

  function renderCodeInline(node) {
    let out = "";

    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += collapseInlineWhitespace(child.textContent || "");
        continue;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const tag = child.tagName.toLowerCase();

      if (tag === "sup") {
        out += "^" + renderCodeInline(child).trim();
        continue;
      }

      if (tag === "sub") {
        out += "_" + renderCodeInline(child).trim();
        continue;
      }

      out += renderCodeInline(child);
    }

    return out;
  }

  function findTitleElement() {
    const selectors = [
      '[data-cy="question-title"]',
      "div.text-title-large",
      "h1",
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && isVisible(el) && el.textContent.trim()) {
        return el;
      }
    }

    return null;
  }

  function getProblemTitle() {
    const titleEl = findTitleElement();
    if (titleEl) {
      const text = titleEl.textContent.trim();
      if (text) return text;
    }

    const meta = document.querySelector('meta[property="og:title"]');
    if (meta) {
      const content = (meta.getAttribute("content") || "").trim();
      if (content) {
        return content.replace(/\s*-\s*LeetCode.*$/i, "").trim();
      }
    }

    const title = document.title.replace(/\s*-\s*LeetCode.*$/i, "").trim();
    if (title) return title;

    return "未识别到题目标题";
  }

  function getDifficulty() {
    const difficultyWords = ["简单", "中等", "困难", "Easy", "Medium", "Hard"];
    const titleEl = findTitleElement();

    const searchRoots = [];
    if (titleEl) {
      let p = titleEl.parentElement;
      let depth = 0;
      while (p && depth < 5) {
        searchRoots.push(p);
        p = p.parentElement;
        depth += 1;
      }
    }
    searchRoots.push(document.body);

    for (const root of searchRoots) {
      const nodes = root.querySelectorAll("span, div, a, button");
      for (const el of nodes) {
        if (!isVisible(el)) continue;
        const text = (el.textContent || "").trim();
        if (difficultyWords.includes(text)) return text;
      }
    }

    return "";
  }

  function looksLikeTopicTag(text) {
    const t = (text || "").trim();
    if (!t) return false;

    if (t.length > 12) return false;
    if (/^\d+\.\s/.test(t)) return false;

    // 纯数字、比例、统计
    if (/^[\d,.]+([kKmMbBwW万亿])?$/.test(t)) return false;
    if (/^[\/%.\d\s]+$/.test(t)) return false;
    if (/^\d+(\.\d+)?%$/.test(t)) return false;

    // 公司次数 / 题频
    if (/[A-Za-z\u4e00-\u9fa5]+\d+$/.test(t)) return false;

    // 明显不是标签
    const blocked = new Set([
      "相关标签",
      "Related Topics",
      "标签",
      "Topics",
      "相关企业",
      "Companies",
      "简单",
      "中等",
      "困难",
      "Easy",
      "Medium",
      "Hard",
      "收藏",
      "分享",
    ]);
    if (blocked.has(t)) return false;

    // 题目名常见特征：有编号、连字符、罗马数字尾巴
    if (/\bI{1,3}\b$/.test(t)) return false;
    if (/[：:]/.test(t)) return false;
    if (/\s-\s/.test(t)) return false;

    return true;
  }

  function getTags() {
    const headingWords = ["相关标签", "Related Topics", "标签", "Topics"];
    const headings = [
      ...document.querySelectorAll("h2, h3, h4, h5, div, span"),
    ];

    for (const heading of headings) {
      const headingText = (heading.textContent || "").trim();
      if (!headingWords.includes(headingText)) continue;

      // 只在“标题的最近区域”里找，不再扫太大的父容器
      const scope =
        heading.parentElement || heading.closest("section, div") || heading;

      if (!scope) continue;

      const candidates = [...scope.querySelectorAll("a, button, span")];
      const tags = [];

      for (const el of candidates) {
        if (!isVisible(el)) continue;

        const text = (el.textContent || "").trim();
        if (!looksLikeTopicTag(text)) continue;

        const href = el.getAttribute("href") || "";

        // 明确排除题目链接、公司链接、其他跳转
        if (href && /\/problems\//.test(href)) continue;
        if (href && /company|interview|study-plan/i.test(href)) continue;

        // 优先收真正标签链接；button/span 作为兜底
        if (el.tagName.toLowerCase() === "a") {
          if (!/tag|topic/i.test(href) && href !== "") continue;
        }

        tags.push(text);
      }

      const cleaned = unique(tags).slice(0, 6);
      if (cleaned.length) return cleaned;
    }

    return [];
  }

  function scoreDescriptionNode(el) {
    if (!el || !isVisible(el)) return -Infinity;

    const text = normalizeWhitespace(el.innerText || "").trim();
    if (text.length < 80) return -Infinity;

    let score = text.length;

    const keywords = [
      "示例 1",
      "示例1",
      "Example 1",
      "Example1",
      "约束",
      "Constraints",
      "提示",
      "Hints",
      "输入",
      "Input",
      "输出",
      "Output",
    ];

    for (const keyword of keywords) {
      if (text.includes(keyword)) score += 800;
    }

    if (text.includes("提交记录")) score -= 1500;
    if (text.includes("Submissions")) score -= 1500;
    if (text.includes("题解")) score -= 1500;
    if (text.includes("Solutions")) score -= 1500;

    const blockCount = el.querySelectorAll(
      "p, pre, code, ul, ol, li, table, h1, h2, h3, h4",
    ).length;
    score += blockCount * 20;

    return score;
  }

  function getProblemContentNode() {
    const directSelectors = [
      '[data-track-load="description_content"]',
      '[data-cy="question-content"]',
      'div[data-key="description-content"]',
      "article",
    ];

    for (const selector of directSelectors) {
      const nodes = document.querySelectorAll(selector);
      for (const node of nodes) {
        if (scoreDescriptionNode(node) > 500) {
          return node;
        }
      }
    }

    const titleEl = findTitleElement();
    if (titleEl) {
      let current = titleEl.parentElement;
      let depth = 0;
      let bestNode = null;
      let bestScore = -Infinity;

      while (current && depth < 6) {
        const candidates = current.querySelectorAll("div, section, article");
        for (const node of candidates) {
          const score = scoreDescriptionNode(node);
          if (score > bestScore) {
            bestScore = score;
            bestNode = node;
          }
        }
        current = current.parentElement;
        depth += 1;
      }

      if (bestNode) return bestNode;
    }

    const main = document.querySelector("main");
    if (main) {
      let bestNode = null;
      let bestScore = -Infinity;
      const candidates = main.querySelectorAll("div, section, article");
      for (const node of candidates) {
        const score = scoreDescriptionNode(node);
        if (score > bestScore) {
          bestScore = score;
          bestNode = node;
        }
      }
      if (bestNode) return bestNode;
    }

    return null;
  }

  function cleanupDescriptionNode(node) {
    const clone = node.cloneNode(true);

    const removeSelectors = [
      "button",
      "svg",
      "style",
      "script",
      "noscript",
      "form",
      "textarea",
      "input",
      "video",
      "canvas",
    ];

    clone
      .querySelectorAll(removeSelectors.join(","))
      .forEach((el) => el.remove());

    clone.querySelectorAll('[aria-hidden="true"]').forEach((el) => el.remove());

    return clone;
  }

  function renderInline(node) {
    if (!node) return "";

    if (node.nodeType === Node.TEXT_NODE) {
      return collapseInlineWhitespace(node.textContent || "");
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const tag = node.tagName.toLowerCase();

    if (tag === "br") return "\n";
    if (tag === "code") {
      return "`" + escapeInlineCode(renderCodeInline(node).trim()) + "`";
    }
    if (tag === "sup") {
      const text = renderChildrenInline(node).trim();
      return text ? `^${text}` : "";
    }

    if (tag === "sub") {
      const text = renderChildrenInline(node).trim();
      return text ? `~${text}~` : "";
    }
    if (tag === "strong" || tag === "b") {
      const text = renderChildrenInline(node).trim();
      if (!text) return "";
      if (text.includes("`") || text.includes("**") || text.includes("*")) {
        return text;
      }
      return `**${text}**`;
    }

    if (tag === "em" || tag === "i") {
      const text = renderChildrenInline(node).trim();
      if (!text) return "";
      if (text.includes("`") || text.includes("**") || text.includes("*")) {
        return text;
      }
      return `*${text}*`;
    }
    if (tag === "a") {
      const text =
        renderChildrenInline(node).trim() || (node.textContent || "").trim();
      const href = node.getAttribute("href") || "";
      if (!href) return text;
      const fullHref = href.startsWith("http")
        ? href
        : new URL(href, location.origin).href;
      return `[${text}](${fullHref})`;
    }
    if (tag === "img") {
      const alt = (node.getAttribute("alt") || "").trim();
      const src = node.getAttribute("src") || "";
      if (!src) return alt || "";
      const fullSrc = src.startsWith("http")
        ? src
        : new URL(src, location.origin).href;
      return `![${alt}](${fullSrc})`;
    }

    return renderChildrenInline(node);
  }

  function renderChildrenInline(node) {
    let out = "";
    for (const child of node.childNodes) {
      out += renderInline(child);
    }
    return out.replace(/ *\n */g, "\n");
  }

  function renderList(listEl, depth = 0) {
    const ordered = listEl.tagName.toLowerCase() === "ol";
    const items = [...listEl.children].filter(
      (el) => el.tagName && el.tagName.toLowerCase() === "li",
    );

    let out = "";
    items.forEach((li, index) => {
      let main = "";
      let nested = "";

      for (const child of li.childNodes) {
        if (
          child.nodeType === Node.ELEMENT_NODE &&
          ["ul", "ol"].includes(child.tagName.toLowerCase())
        ) {
          nested += renderList(child, depth + 1);
        } else {
          main += renderNode(child, depth + 1, true);
        }
      }

      const prefix = ordered ? `${index + 1}. ` : "- ";
      const indent = "  ".repeat(depth);
      out += `${indent}${prefix}${main.trim()}\n`;
      if (nested.trim()) out += nested;
    });

    return out + "\n";
  }

  function tableToMarkdown(table) {
    const rows = [...table.querySelectorAll("tr")]
      .map((tr) =>
        [...tr.children]
          .filter((cell) => /^(td|th)$/i.test(cell.tagName))
          .map((cell) =>
            renderChildrenInline(cell).replace(/\|/g, "\\|").trim(),
          ),
      )
      .filter((row) => row.length);

    if (!rows.length) return "";

    const colCount = Math.max(...rows.map((row) => row.length));
    const normalized = rows.map((row) =>
      Array.from({ length: colCount }, (_, i) => row[i] || ""),
    );

    const header = normalized[0];
    const separator = Array.from({ length: colCount }, () => "---");

    const lines = [`| ${header.join(" | ")} |`, `| ${separator.join(" | ")} |`];

    normalized.slice(1).forEach((row) => {
      lines.push(`| ${row.join(" | ")} |`);
    });

    return lines.join("\n");
  }

  function renderBlockquote(node, depth = 0) {
    const inner = renderChildren(node, depth).trim();
    if (!inner) return "";

    return (
      inner
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n") + "\n\n"
    );
  }

  function renderNode(node, depth = 0, inlineOnly = false) {
    if (!node) return "";

    if (node.nodeType === Node.TEXT_NODE) {
      return inlineOnly
        ? collapseInlineWhitespace(node.textContent || "")
        : collapseInlineWhitespace(node.textContent || "");
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const tag = node.tagName.toLowerCase();

    if (inlineOnly) {
      return renderInline(node);
    }

    if (tag === "pre") {
      const code = (node.innerText || node.textContent || "").replace(
        /\n+$/,
        "",
      );
      return code ? `\n\`\`\`\n${code}\n\`\`\`\n\n` : "";
    }

    if (tag === "code") {
      return "`" + escapeInlineCode((node.textContent || "").trim()) + "`";
    }

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      const text = renderChildrenInline(node).trim();
      return text ? `\n${"#".repeat(level)} ${text}\n\n` : "";
    }

    if (tag === "p") {
      const text = renderChildrenInline(node).trim();
      return text ? `\n${text}\n\n` : "";
    }

    if (tag === "ul" || tag === "ol") {
      return "\n" + renderList(node, depth);
    }

    if (tag === "blockquote") {
      return "\n" + renderBlockquote(node, depth);
    }

    if (tag === "table") {
      const text = tableToMarkdown(node);
      return text ? `\n${text}\n\n` : "";
    }

    if (tag === "hr") {
      return "\n---\n\n";
    }

    if (tag === "br") {
      return "\n";
    }

    return renderChildren(node, depth);
  }

  function renderChildren(node, depth = 0) {
    let out = "";
    for (const child of node.childNodes) {
      out += renderNode(child, depth);
    }
    return out;
  }

  function cleanupMarkdown(markdown) {
    let text = normalizeWhitespace(markdown);

    text = text
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/`(\d{2,})(\d)`/g, (m, a, b) => {
        // 104 -> 10^4, 109 -> 10^9
        if (/^10$/.test(a)) return "`10^" + b + "`";
        return m;
      })
      .replace(/`O\(([^`()]*)n(\d)\)`/g, "`O($1n^$2)`")
      .replace(/\*\*\*`([^`]+)`\*/g, "`$1`")
      .replace(/\*`([^`]+)`\*/g, "`$1`")
      .replace(/\*\*`([^`]+)`\*\*/g, "`$1`")
      .replace(/^\n+/, "")
      .replace(/\n+$/, "");

    return text.trim();
  }

  function getProblemDescriptionMarkdown() {
    const contentNode = getProblemContentNode();
    if (!contentNode) return "";

    const cleaned = cleanupDescriptionNode(contentNode);
    const markdown = cleanupMarkdown(renderChildren(cleaned));

    const title = getProblemTitle();
    const titleRegex = new RegExp(
      "^#{1,6}\\s*" + title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\n?",
      "i",
    );

    return markdown.replace(titleRegex, "").trim();
  }

  function buildProblemMarkdown() {
    const title = getProblemTitle();
    const url = getCanonicalProblemUrl();
    const difficulty = getDifficulty();
    const tags = getTags();
    const description = getProblemDescriptionMarkdown();

    const lines = [`# ${title}`, "", `链接：${url}`];

    if (difficulty) {
      lines.push(`难度：${difficulty}`);
    }

    if (tags.length) {
      lines.push(`标签：${tags.join(" / ")}`);
    }

    lines.push("", "## 题目内容", "");

    if (description) {
      lines.push(description);
    } else {
      lines.push("（未提取到题面正文，可以调整选择器后再试）");
    }

    return cleanupMarkdown(lines.join("\n"));
  }

  async function handleCopy() {
    if (!isProblemPage()) {
      showToast("当前不是题目页面", true);
      return;
    }

    const button = document.getElementById(BUTTON_ID);
    if (button) {
      button.disabled = true;
      button.textContent = "复制中...";
      button.style.opacity = "0.75";
    }

    try {
      const markdown = buildProblemMarkdown();
      await copyText(markdown);
      console.log("[LeetCode Copy Helper] copied markdown:\n", markdown);
      showToast("题目已复制为 Markdown");
    } catch (error) {
      console.error("[LeetCode Copy Helper] copy failed:", error);
      showToast("复制失败，请打开 Console 查看错误", true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "复制题目";
        button.style.opacity = "1";
      }
    }
  }

  function findToolbarContainer() {
    const titleEl = findTitleElement();
    if (!titleEl) return null;

    // 先在标题附近找你截图里的那排按钮
    let current = titleEl.parentElement;
    for (
      let depth = 0;
      current && depth < 6;
      depth += 1, current = current.parentElement
    ) {
      const candidates = current.querySelectorAll("div.flex.gap-1");

      for (const el of candidates) {
        if (!isVisible(el)) continue;

        const text = (el.textContent || "").trim();

        // 这排里一般会带这些文字
        if (
          text.includes("相关标签") ||
          text.includes("Related Topics") ||
          text.includes("提示") ||
          text.includes("Hints")
        ) {
          return el;
        }
      }
    }

    return null;
  }

  function createButton() {
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "复制题目";

    // 不再 fixed
    button.style.display = "inline-flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.style.gap = "6px";
    button.style.padding = "4px 10px";
    button.style.border = "none";
    button.style.borderRadius = "9999px";
    button.style.background = "var(--fill-secondary, #f3f4f6)";
    button.style.color = "var(--text-secondary-foreground, #262626)";
    button.style.fontSize = "12px";
    button.style.lineHeight = "20px";
    button.style.cursor = "pointer";
    button.style.whiteSpace = "nowrap";

    button.addEventListener("mouseenter", () => {
      button.style.filter = "brightness(0.96)";
    });

    button.addEventListener("mouseleave", () => {
      button.style.filter = "none";
    });

    button.addEventListener("click", handleCopy);

    return button;
  }

  function ensureButton() {
    const oldButton = document.getElementById(BUTTON_ID);

    if (!isProblemPage()) {
      if (oldButton) oldButton.remove();
      return;
    }

    const toolbar = findToolbarContainer();
    if (!toolbar) return;

    if (oldButton && toolbar.contains(oldButton)) return;
    if (oldButton) oldButton.remove();

    const wrapper = document.createElement("div");
    wrapper.style.display = "inline-flex";
    wrapper.style.alignItems = "center";

    const button = createButton();
    wrapper.appendChild(button);

    const children = [...toolbar.children];
    const hintItem = children.find((el) => {
      const text = (el.textContent || "").trim();
      return text.includes("提示") || text.includes("Hints");
    });

    if (hintItem) {
      if (hintItem.nextSibling) {
        toolbar.insertBefore(wrapper, hintItem.nextSibling);
      } else {
        toolbar.appendChild(wrapper);
      }
    } else {
      toolbar.appendChild(wrapper);
    }
  }

  function scheduleEnsureButton() {
    clearTimeout(ensureButtonTimer);
    ensureButtonTimer = setTimeout(() => {
      ensureButton();
    }, 120);
  }

  function patchHistory() {
    if (window.__LC_COPY_HELPER_HISTORY_PATCHED__) return;
    window.__LC_COPY_HELPER_HISTORY_PATCHED__ = true;

    const rawPushState = history.pushState;
    const rawReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const result = rawPushState.apply(this, args);
      window.dispatchEvent(new Event("lc-copy-helper:urlchange"));
      return result;
    };

    history.replaceState = function (...args) {
      const result = rawReplaceState.apply(this, args);
      window.dispatchEvent(new Event("lc-copy-helper:urlchange"));
      return result;
    };
  }

  function watchRouteChange() {
    patchHistory();

    window.addEventListener("popstate", () => {
      scheduleEnsureButton();
    });

    window.addEventListener("lc-copy-helper:urlchange", () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        scheduleEnsureButton();
      }
    });

    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        scheduleEnsureButton();
      }
    }, 800);
  }

  function watchDom() {
    if (mutationObserver) return;
    if (!document.body) return;

    mutationObserver = new MutationObserver(() => {
      scheduleEnsureButton();
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function init() {
    ensureButton();
    watchRouteChange();
    watchDom();
  }

  window.addEventListener("load", init);
  setTimeout(init, 1000);
})();
