/*
 * AI Conversation Toolkit
 * - Optimize long conversations by collapsing older message DOM nodes.
 * - Export the current conversation in JSON with one click.
 */
(() => {
  const TOOLKIT_ID = "chatgpt-conversation-toolkit";
  const STATUS_ID = "chatgpt-conversation-toolkit-status";
  const MINIMIZED_ID = "chatgpt-conversation-toolkit-minimized";
  const EXPORT_MASK_ID = "chatgpt-toolkit-export-mask";
  const POSITION_KEY = "chatgpt-toolkit-position";
  const THEME_ATTR = "data-toolkit-theme";
  const PROMPT_MODAL_ID = "chatgpt-toolkit-prompt-modal";
  const PROMPT_FILE_INPUT_ID = "chatgpt-toolkit-prompt-file";
  const PROMPT_TOAST_ID = "chatgpt-toolkit-prompt-toast";
  const PROMPT_STORAGE_KEY = "chatgpt-toolkit-prompts-v1";
  const PROMPT_LOCAL_FALLBACK_KEY = "chatgpt-toolkit-prompts-fallback";
  const APP_LABEL = "AI 对话工具";
  const PAGE_HOOK_SCRIPT_ID = "chatgpt-toolkit-page-hook";
  const PAGE_HOOK_SOURCE =
    typeof chrome !== "undefined" && chrome?.runtime?.getURL
      ? chrome.runtime.getURL("pageHook.js")
      : "";
  const PAGE_HOOK_NAMESPACE = "chatgpt-toolkit-page";
  const PAGE_HOOK_REQUEST_TYPE = `${PAGE_HOOK_NAMESPACE}:request`;
  const PAGE_HOOK_RESPONSE_TYPE = `${PAGE_HOOK_NAMESPACE}:response`;
  const GEMINI_DIRECT_EXPORT_TIMEOUT_MS = 20000;

  if (document.getElementById(TOOLKIT_ID)) {
    return;
  }

  const PLATFORM_CONFIGS = {
    chatgpt: {
      id: "chatgpt",
      label: "ChatGPT",
      shortLabel: "GPT",
      rootSelectors: [
        "main",
        '[role="main"]',
      ],
      conversationPathPatterns: [/\/c\/([^/?#]+)/],
      conversationIdAttributes: [
        "data-conversation-id",
        "data-thread-id",
      ],
      messageSelectors: [
        "[data-message-author-role]",
        "article",
      ],
      messageContainerSelectors: [
        '[data-testid^="conversation-turn-"]',
        "[data-message-id]",
        "article",
      ],
      roleSelectors: [
        "[data-message-author-role]",
      ],
      roleAttributes: [
        "data-message-author-role",
        "data-author-role",
      ],
      textSelectors: [
        "[data-message-author-role]",
        ".markdown",
      ],
      assistantHints: ["chatgpt", "assistant", "openai"],
      userHints: ["user", "you"],
    },
    gemini: {
      id: "gemini",
      label: "Gemini",
      shortLabel: "G",
      rootSelectors: [
        "#chat-history",
        "#chat-history > .chat-history",
        ".conversation-container",
        "main",
        '[role="main"]',
      ],
      conversationPathPatterns: [
        /\/app\/([^/?#]+)/,
        /\/u\/\d+\/app\/([^/?#]+)/,
      ],
      conversationIdAttributes: [
        "data-conversation-id",
        "data-chat-id",
        "data-thread-id",
        "data-session-id",
      ],
      messageSelectors: [
        "user-query-content",
        "user-query",
        "model-response",
        "message-content",
        "query-text",
        "response-container",
        ".user-query-container",
        "message-content .markdown",
        "[data-turn-role]",
        "[data-message-author-role]",
        "[data-response-id]",
        "[data-message-id]",
        "article",
        '[role="listitem"]',
      ],
      messageContainerSelectors: [
        "user-query",
        ".user-query-container",
        "model-response",
        "response-container",
        "message-content",
        "user-query-content",
        "conversation-turn",
        "[data-turn-role]",
        "[data-message-id]",
        "[data-response-id]",
        '[data-test-id*="conversation"]',
        '[data-test-id*="chat"]',
        "article",
        '[role="listitem"]',
      ],
      roleSelectors: [
        "user-query-content",
        "user-query",
        "message-content",
        "model-response",
        "response-container",
        "[data-turn-role]",
        "[data-message-author-role]",
      ],
      roleAttributes: [
        "data-turn-role",
        "data-message-author-role",
        "data-author-role",
        "data-role",
      ],
      textSelectors: [
        "user-query-content",
        ".user-query-container",
        "message-content .markdown",
        "message-content",
        "query-text",
        "user-query",
        "model-response",
        "response-container",
        "[data-turn-role]",
        "[data-message-author-role]",
        "article",
      ],
      assistantHints: ["gemini", "google ai", "assistant", "model", "model-response", "response-container", "message-content"],
      userHints: ["user", "you", "prompt", "query", "user-query", "user-query-content", "query-text"],
    },
    generic: {
      id: "generic",
      label: "AI",
      shortLabel: "AI",
      rootSelectors: [
        "main",
        '[role="main"]',
      ],
      conversationPathPatterns: [],
      conversationIdAttributes: [
        "data-conversation-id",
        "data-chat-id",
        "data-thread-id",
        "data-session-id",
      ],
      messageSelectors: [
        "[data-message-author-role]",
        "[data-turn-role]",
        "article",
        '[role="listitem"]',
      ],
      messageContainerSelectors: [
        "[data-message-author-role]",
        "[data-turn-role]",
        "[data-message-id]",
        "article",
        '[role="listitem"]',
      ],
      roleSelectors: [
        "[data-message-author-role]",
        "[data-turn-role]",
      ],
      roleAttributes: [
        "data-message-author-role",
        "data-turn-role",
        "data-author-role",
        "data-role",
      ],
      textSelectors: [
        "[data-message-author-role]",
        "[data-turn-role]",
        "article",
      ],
      assistantHints: ["assistant", "ai", "model"],
      userHints: ["user", "you", "human", "prompt"],
    },
  };

  const detectPlatform = () => {
    const host = window.location.hostname.toLowerCase();
    if (host === "chat.openai.com" || host === "chatgpt.com") {
      return PLATFORM_CONFIGS.chatgpt;
    }
    if (host === "gemini.google.com") {
      return PLATFORM_CONFIGS.gemini;
    }
    return PLATFORM_CONFIGS.generic;
  };

  const platform = detectPlatform();

  const state = {
    isCollapsed: false,
    isMinimized: false,
    isExporting: false,
    keepLatest: 20,
    collapsedNodes: [],
    cachedNodes: [],
    conversationKey: null,
    anchorNode: null,
    anchorParent: null,
  };

  const promptState = {
    loaded: false,
    isOpen: false,
    items: [],
    filteredItems: [],
    selectedId: null,
    searchText: "",
    category: "all",
    sortBy: "updated-desc",
  };
  let promptToastTimer = null;
  let themeObserver = null;
  let themeMediaQuery = null;
  let bodyThemeObserved = false;
  let pageHookInjectionPromise = null;
  let pageHookListenerAttached = false;
  let pageHookRequestCounter = 0;
  const pageHookRequests = new Map();

  const themeAttributeFilter = ["class", "data-theme", "style"];
  const toDatasetKey = (attribute) =>
    attribute.replace(/^data-/, "").replace(/-([a-z])/g, (_, char) => char.toUpperCase());

  const getAttributeValue = (node, attribute) => {
    if (!(node instanceof Element)) {
      return null;
    }

    const attrValue = node.getAttribute(attribute);
    if (attrValue) {
      return attrValue;
    }

    const datasetKey = toDatasetKey(attribute);
    if (node.dataset && datasetKey in node.dataset) {
      return node.dataset[datasetKey] || null;
    }

    return null;
  };

  const joinSelectors = (selectors) => selectors.filter(Boolean).join(", ");

  const getSearchRoots = (root) => {
    if (!root) {
      return [];
    }

    const roots = [];
    const seen = new Set();
    const queue = [root];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || seen.has(current)) {
        continue;
      }

      seen.add(current);
      roots.push(current);

      if (typeof current.querySelectorAll !== "function") {
        continue;
      }

      current.querySelectorAll("*").forEach((element) => {
        if (element.shadowRoot) {
          queue.push(element.shadowRoot);
        }
      });
    }

    return roots;
  };

  const queryAllDeep = (root, selector) => {
    if (!root || !selector) {
      return [];
    }

    const matches = [];
    const seen = new Set();

    getSearchRoots(root).forEach((searchRoot) => {
      if (typeof searchRoot.querySelectorAll !== "function") {
        return;
      }

      searchRoot.querySelectorAll(selector).forEach((element) => {
        if (seen.has(element)) {
          return;
        }
        seen.add(element);
        matches.push(element);
      });
    });

    return matches;
  };

  const queryFirstDeep = (root, selector) => queryAllDeep(root, selector)[0] || null;

  const closestAcrossShadow = (node, selector) => {
    let current = node instanceof Element ? node : null;

    while (current) {
      const matched = current.closest(selector);
      if (matched) {
        return matched;
      }

      const rootNode = current.getRootNode();
      current = rootNode instanceof ShadowRoot ? rootNode.host : null;
    }

    return null;
  };

  const ignoredTextSelector =
    "button, nav, form, textarea, input, select, script, style, [aria-hidden='true']";

  const isIgnoredTextContainer = (element) =>
    element instanceof Element && Boolean(closestAcrossShadow(element, ignoredTextSelector));

  const extractTextContentDeep = (root) => {
    if (!(root instanceof Element || root instanceof ShadowRoot)) {
      return "";
    }

    const parts = [];
    const visited = new Set();

    const walk = (node) => {
      if (!node || visited.has(node)) {
        return;
      }
      visited.add(node);

      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        if (parent && isIgnoredTextContainer(parent)) {
          return;
        }

        const text = (node.textContent || "").replace(/\s+/g, " ").trim();
        if (text) {
          parts.push(text);
        }
        return;
      }

      if (!(node instanceof Element || node instanceof ShadowRoot)) {
        return;
      }

      if (node instanceof Element && isIgnoredTextContainer(node)) {
        return;
      }

      Array.from(node.childNodes).forEach(walk);

      if (node instanceof Element && node.shadowRoot) {
        walk(node.shadowRoot);
      }
    };

    walk(root);
    return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  };

  const hasMessageText = (node) => {
    if (!(node instanceof Element)) {
      return false;
    }

    if ((node.textContent || "").trim()) {
      return true;
    }

    return Boolean(extractTextContentDeep(node));
  };

  const getPlatformRoots = () => {
    const selectors = Array.isArray(platform.rootSelectors) && platform.rootSelectors.length > 0
      ? platform.rootSelectors
      : ["main", '[role="main"]'];

    const roots = [];
    const seen = new Set();

    selectors.forEach((selector) => {
      queryAllDeep(document, selector).forEach((root) => {
        if (seen.has(root)) {
          return;
        }
        seen.add(root);
        roots.push(root);
      });
    });

    if (roots.length > 0) {
      return roots;
    }

    return [document.body].filter(Boolean);
  };

  const parseRgbColor = (value) => {
    if (typeof value !== "string") {
      return null;
    }

    const matched = value.match(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i);
    if (!matched) {
      return null;
    }

    return [Number(matched[1]), Number(matched[2]), Number(matched[3])];
  };

  const isDarkBackground = (element) => {
    if (!element) {
      return false;
    }

    const backgroundColor = window.getComputedStyle(element).backgroundColor;
    const rgb = parseRgbColor(backgroundColor);
    if (!rgb) {
      return false;
    }

    const [red, green, blue] = rgb;
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    return luminance < 0.5;
  };

  const detectAppTheme = () => {
    const html = document.documentElement;
    const body = document.body;

    const explicitTheme = html?.getAttribute("data-theme") || body?.getAttribute("data-theme");
    if (explicitTheme === "dark" || explicitTheme === "light") {
      return explicitTheme;
    }

    if (html?.classList.contains("dark") || body?.classList.contains("dark")) {
      return "dark";
    }
    if (html?.classList.contains("light") || body?.classList.contains("light")) {
      return "light";
    }

    const colorScheme = (window.getComputedStyle(html).colorScheme || "").toLowerCase();
    if (colorScheme.includes("dark")) {
      return "dark";
    }
    if (colorScheme.includes("light")) {
      return "light";
    }

    if (isDarkBackground(body) || isDarkBackground(html)) {
      return "dark";
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  const applyToolkitTheme = (theme) => {
    const nodes = [
      document.getElementById(TOOLKIT_ID),
      document.getElementById(MINIMIZED_ID),
      document.getElementById(PROMPT_MODAL_ID),
      document.getElementById(EXPORT_MASK_ID),
    ];

    nodes.forEach((node) => {
      if (node) {
        node.setAttribute(THEME_ATTR, theme);
      }
    });
  };

  const syncToolkitTheme = () => {
    applyToolkitTheme(detectAppTheme());
  };

  const observeThemeOnBodyIfNeeded = () => {
    if (!themeObserver || bodyThemeObserved || !document.body) {
      return;
    }
    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: themeAttributeFilter,
    });
    bodyThemeObserved = true;
  };

  const setupThemeSync = () => {
    if (themeObserver) {
      observeThemeOnBodyIfNeeded();
      syncToolkitTheme();
      return;
    }

    themeObserver = new MutationObserver(() => {
      syncToolkitTheme();
    });

    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: themeAttributeFilter,
    });

    observeThemeOnBodyIfNeeded();

    themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    if (typeof themeMediaQuery.addEventListener === "function") {
      themeMediaQuery.addEventListener("change", syncToolkitTheme);
    } else if (typeof themeMediaQuery.addListener === "function") {
      themeMediaQuery.addListener(syncToolkitTheme);
    }

    syncToolkitTheme();
  };

  const getConversationKey = () => {
    for (const attribute of platform.conversationIdAttributes) {
      const node = queryFirstDeep(document, `[${attribute}]`);
      const value = getAttributeValue(node, attribute);
      if (value) {
        return value;
      }
    }

    for (const pattern of platform.conversationPathPatterns) {
      const match = window.location.pathname.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    const params = new URLSearchParams(window.location.search);
    for (const key of ["conversation", "chat", "thread", "session", "id"]) {
      const value = params.get(key);
      if (value) {
        return value;
      }
    }

    return `${window.location.pathname}${window.location.search}`;
  };

  const normalizeConversationTitleText = (value) =>
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

  const cleanGeminiConversationTitle = (value) => {
    const normalized = normalizeConversationTitleText(value);
    if (!normalized) {
      return "";
    }

    return normalizeConversationTitleText(
      normalized
        .replace(/\s+[|\-:]\s+Gemini(?:\s+Advanced)?$/i, "")
        .replace(/^Gemini(?:\s+Advanced)?\s+[|\-:]\s+/i, "")
        .replace(/\s+[|\-:]\s+Google Gemini$/i, "")
    );
  };

  const cleanChatGPTConversationTitle = (value) => {
    const normalized = normalizeConversationTitleText(value);
    if (!normalized) {
      return "";
    }

    return normalizeConversationTitleText(
      normalized
        .replace(/\s+[|\-:]\s+ChatGPT$/i, "")
        .replace(/^ChatGPT\s+[|\-:]\s+/i, "")
        .replace(/\s+[|\-:]\s+OpenAI$/i, "")
    );
  };

  const isMeaningfulConversationTitle = (value) => {
    const text = normalizeConversationTitleText(value);
    if (!text) {
      return false;
    }

    const normalized = text.toLowerCase();
    const ignoredTitles = new Set([
      "gemini",
      "google gemini",
      "gemini advanced",
      "new chat",
      "new conversation",
      "untitled",
      "新对话",
      "新的对话",
      "新聊天",
      "对话",
      "聊天",
      "conversations",
    ]);

    return text.length > 1 && !ignoredTitles.has(normalized);
  };

  const getElementTitleCandidates = (element) => {
    if (!(element instanceof Element)) {
      return [];
    }

    return [
      extractTextContentDeep(element),
      element.getAttribute("title") || "",
      element.getAttribute("aria-label") || "",
    ];
  };

  const isVisibleElement = (element) => {
    if (!(element instanceof Element)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width < 24 || rect.height < 14 || rect.bottom <= 0 || rect.top >= window.innerHeight) {
      return false;
    }

    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0.01;
  };

  const getGeminiTopHeaderTitle = () => {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportCenterX = viewportWidth / 2;
    const selectors = [
      "header *",
      "[role='banner'] *",
      "main h1",
      "main h2",
      "main [role='heading']",
      "main [aria-level='1']",
      "main [aria-level='2']",
      "main [class*='title']",
      "main [class*='Title']",
      "main [class*='header']",
      "main [class*='Header']",
    ];
    const seen = new Set();
    const candidates = [];

    selectors.forEach((selector) => {
      queryAllDeep(document, selector).forEach((element) => {
        if (!(element instanceof Element) || seen.has(element)) {
          return;
        }
        seen.add(element);

        if (!isVisibleElement(element)) {
          return;
        }

        if (closestAcrossShadow(element, `#${TOOLKIT_ID}, aside, nav, [role="navigation"]`)) {
          return;
        }

        const rect = element.getBoundingClientRect();
        if (rect.top < -8 || rect.bottom > 140) {
          return;
        }

        const centerDistance = Math.abs((rect.left + rect.width / 2) - viewportCenterX);
        if (centerDistance > Math.max(180, viewportWidth * 0.22)) {
          return;
        }

        getElementTitleCandidates(element).forEach((candidate) => {
          const title = cleanGeminiConversationTitle(candidate);
          if (!isMeaningfulConversationTitle(title) || title.length > 120) {
            return;
          }

          const isHeadingLike =
            /^H[1-2]$/.test(element.tagName) ||
            element.getAttribute("role") === "heading" ||
            ["1", "2"].includes(element.getAttribute("aria-level") || "");
          const score =
            (isHeadingLike ? 80 : 0) +
            Math.max(0, 120 - rect.top) +
            Math.max(0, 80 - centerDistance / 4) +
            Math.min(title.length, 48);

          candidates.push({
            title,
            score,
          });
        });
      });
    });

    return candidates.sort((left, right) => right.score - left.score)[0]?.title || "";
  };

  const getGeminiConversationTitle = () => {
    if (platform.id !== "gemini") {
      return "";
    }

    const topHeaderTitle = getGeminiTopHeaderTitle();
    if (isMeaningfulConversationTitle(topHeaderTitle)) {
      return topHeaderTitle;
    }

    const currentPath = window.location.pathname;
    const routeMatchedSelectors = [
      'nav a[href]',
      '[role="navigation"] a[href]',
      'aside a[href]',
      'a[href*="/app/"]',
      'a[href*="/gem/"]',
    ];

    for (const selector of routeMatchedSelectors) {
      const elements = queryAllDeep(document, selector);
      for (const element of elements) {
        if (!(element instanceof HTMLAnchorElement) || !element.href) {
          continue;
        }

        let hrefPath = "";
        try {
          hrefPath = new URL(element.href, window.location.origin).pathname;
        } catch (error) {
          hrefPath = "";
        }

        if (!hrefPath || hrefPath !== currentPath) {
          continue;
        }

        for (const candidate of getElementTitleCandidates(element)) {
          const title = cleanGeminiConversationTitle(candidate);
          if (isMeaningfulConversationTitle(title)) {
            return title;
          }
        }
      }
    }

    const selectors = [
      'nav [aria-current="page"]',
      '[role="navigation"] [aria-current="page"]',
      '[role="navigation"] [aria-selected="true"]',
      'nav [aria-selected="true"]',
      'a[aria-current="page"]',
      'button[aria-current="page"]',
      'button[aria-selected="true"]',
      '[data-test-id*="conversation"][aria-current="page"]',
      '[data-test-id*="conversation"][aria-selected="true"]',
    ];

    for (const selector of selectors) {
      const elements = queryAllDeep(document, selector);
      for (const element of elements) {
        for (const candidate of getElementTitleCandidates(element)) {
          const title = cleanGeminiConversationTitle(candidate);
          if (isMeaningfulConversationTitle(title)) {
            return title;
          }
        }
      }
    }

    const documentTitle = cleanGeminiConversationTitle(document.title);
    if (isMeaningfulConversationTitle(documentTitle)) {
      return documentTitle;
    }

    const fallbackSelectors = [
      'main h1',
      'header h1',
    ];

    for (const selector of fallbackSelectors) {
      const elements = queryAllDeep(document, selector);
      for (const element of elements) {
        for (const candidate of getElementTitleCandidates(element)) {
          const title = cleanGeminiConversationTitle(candidate);
          if (isMeaningfulConversationTitle(title)) {
            return title;
          }
        }
      }
    }

    return "";
  };

  const getChatGPTConversationTitle = () => {
    if (platform.id !== "chatgpt") {
      return "";
    }

    const documentTitle = cleanChatGPTConversationTitle(document.title);
    if (isMeaningfulConversationTitle(documentTitle)) {
      return documentTitle;
    }

    const currentPath = window.location.pathname;
    const routeMatchedSelectors = [
      'nav a[href^="/c/"]',
      'aside a[href^="/c/"]',
      'a[href^="/c/"]',
    ];

    for (const selector of routeMatchedSelectors) {
      const elements = queryAllDeep(document, selector);
      for (const element of elements) {
        if (!(element instanceof HTMLAnchorElement) || !element.href) {
          continue;
        }

        let hrefPath = "";
        try {
          hrefPath = new URL(element.href, window.location.origin).pathname;
        } catch (error) {
          hrefPath = "";
        }

        if (!hrefPath || hrefPath !== currentPath) {
          continue;
        }

        for (const candidate of getElementTitleCandidates(element)) {
          const title = cleanChatGPTConversationTitle(candidate);
          if (isMeaningfulConversationTitle(title)) {
            return title;
          }
        }
      }
    }

    const fallbackSelectors = [
      'nav [aria-current="page"]',
      '[role="navigation"] [aria-current="page"]',
      'main h1',
      '[role="main"] h1',
    ];

    for (const selector of fallbackSelectors) {
      const elements = queryAllDeep(document, selector);
      for (const element of elements) {
        for (const candidate of getElementTitleCandidates(element)) {
          const title = cleanChatGPTConversationTitle(candidate);
          if (isMeaningfulConversationTitle(title)) {
            return title;
          }
        }
      }
    }

    return "";
  };

  const sanitizeFilenamePart = (value) =>
    normalizeConversationTitleText(value)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
      .replace(/\.+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 96);

  const getExportFilename = () => {
    if (platform.id === "gemini") {
      const conversationTitle = sanitizeFilenamePart(getGeminiConversationTitle());
      if (conversationTitle) {
        return `${conversationTitle}.json`;
      }
    }

    if (platform.id === "chatgpt") {
      const conversationTitle = sanitizeFilenamePart(getChatGPTConversationTitle());
      if (conversationTitle) {
        return `${conversationTitle}.json`;
      }
    }

    const dateTag = new Date().toISOString().replace(/[:.]/g, "-");
    return `${platform.id}-session-${dateTag}.json`;
  };

  const resetConversationState = () => {
    state.isCollapsed = false;
    state.collapsedNodes = [];
    state.cachedNodes = [];
    state.anchorNode = null;
    state.anchorParent = null;
  };

  const ensureConversationState = () => {
    const nextKey = getConversationKey();
    if (state.conversationKey !== nextKey) {
      state.conversationKey = nextKey;
      resetConversationState();
    }
  };

  const attachPageHookMessageListener = () => {
    if (pageHookListenerAttached) {
      return;
    }

    window.addEventListener("message", (event) => {
      if (event.source !== window) {
        return;
      }

      const data = event.data;
      if (
        !data ||
        data.source !== PAGE_HOOK_NAMESPACE ||
        data.type !== PAGE_HOOK_RESPONSE_TYPE ||
        !data.requestId
      ) {
        return;
      }

      const pendingRequest = pageHookRequests.get(data.requestId);
      if (!pendingRequest) {
        return;
      }

      pageHookRequests.delete(data.requestId);
      window.clearTimeout(pendingRequest.timeoutId);

      if (data.ok) {
        pendingRequest.resolve(data.payload || null);
        return;
      }

      const errorMessage =
        typeof data.error === "string" && data.error.trim()
          ? data.error.trim()
          : "Gemini 页面脚本返回了未知错误。";
      pendingRequest.reject(new Error(errorMessage));
    });

    pageHookListenerAttached = true;
  };

  const ensurePageHookInjected = async () => {
    if (platform.id !== "gemini" || !PAGE_HOOK_SOURCE) {
      return false;
    }

    attachPageHookMessageListener();

    const existingScript = document.getElementById(PAGE_HOOK_SCRIPT_ID);
    if (existingScript?.dataset.loaded === "true") {
      return true;
    }

    if (pageHookInjectionPromise) {
      return pageHookInjectionPromise;
    }

    pageHookInjectionPromise = new Promise((resolve, reject) => {
      const script =
        existingScript instanceof HTMLScriptElement
          ? existingScript
          : document.createElement("script");

      const handleLoad = () => {
        script.dataset.loaded = "true";
        pageHookInjectionPromise = null;
        resolve(true);
      };

      const handleError = () => {
        pageHookInjectionPromise = null;
        reject(new Error("Gemini 页面注入脚本加载失败。"));
      };

      script.addEventListener("load", handleLoad, { once: true });
      script.addEventListener("error", handleError, { once: true });

      if (!(existingScript instanceof HTMLScriptElement)) {
        script.id = PAGE_HOOK_SCRIPT_ID;
        script.src = PAGE_HOOK_SOURCE;
        script.async = false;
        (document.head || document.documentElement || document.body)?.appendChild(script);
      }
    });

    return pageHookInjectionPromise;
  };

  const requestPageHook = async (payload, timeoutMs = GEMINI_DIRECT_EXPORT_TIMEOUT_MS) => {
    await ensurePageHookInjected();

    return new Promise((resolve, reject) => {
      const requestId = `page-hook-${Date.now()}-${pageHookRequestCounter += 1}`;
      const timeoutId = window.setTimeout(() => {
        pageHookRequests.delete(requestId);
        reject(new Error("Gemini 会话接口请求超时。"));
      }, timeoutMs);

      pageHookRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
      });

      window.postMessage(
        {
          source: PAGE_HOOK_NAMESPACE,
          type: PAGE_HOOK_REQUEST_TYPE,
          requestId,
          payload,
        },
        "*"
      );
    });
  };

  const requestGeminiConversationMessages = async () => {
    if (platform.id !== "gemini") {
      return null;
    }

    const conversationId = getConversationKey();
    if (!conversationId) {
      return null;
    }

    const response = await requestPageHook({
      action: "gemini-export",
      conversationId,
      sourcePath: `${window.location.pathname}${window.location.search}`,
      language: document.documentElement.lang || navigator.language || "zh-CN",
      url: window.location.href,
    });

    return buildPayloadFromExternalMessages(response?.messages);
  };

  const normalizeMessageNode = (node) => {
    if (!(node instanceof Element)) {
      return null;
    }

    for (const selector of platform.messageContainerSelectors) {
      const matched = closestAcrossShadow(node, selector);
      if (matched) {
        return matched;
      }
    }

    return closestAcrossShadow(node, "article") || node;
  };

  const getNodeConversationId = (node) => {
    if (!(node instanceof Element)) {
      return null;
    }

    for (const attribute of platform.conversationIdAttributes) {
      const directValue = getAttributeValue(node, attribute);
      if (directValue) {
        return directValue;
      }

      const nestedNode = queryFirstDeep(node, `[${attribute}]`);
      const nestedValue = getAttributeValue(nestedNode, attribute);
      if (nestedValue) {
        return nestedValue;
      }
    }

    return null;
  };

  const getMessageNodes = () => {
    const roots = getPlatformRoots();
    if (roots.length === 0) {
      return [];
    }

    const candidates = [];
    roots.forEach((root) => {
      platform.messageSelectors.forEach((selector) => {
        candidates.push(...queryAllDeep(root, selector));
      });
    });

    const normalized = candidates
      .map((node) => normalizeMessageNode(node))
      .filter((node) => node instanceof Element && hasMessageText(node));

    const filteredByConversation = (() => {
      if (!state.conversationKey) {
        return normalized;
      }
      const scoped = normalized.filter((node) => {
        const nodeConversationId = getNodeConversationId(node);
        return !nodeConversationId || nodeConversationId === state.conversationKey;
      });
      return scoped.length > 0 ? scoped : normalized;
    })();

    const uniqueNodes = [];
    const seen = new Set();
    filteredByConversation.forEach((node) => {
      const messageId =
        node.getAttribute("data-message-id") ||
        node.getAttribute("data-response-id") ||
        node.getAttribute("data-testid");
      const key = messageId || node;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      uniqueNodes.push(node);
    });

    uniqueNodes.sort((left, right) => {
      if (left === right) {
        return 0;
      }

      const position = left.compareDocumentPosition(right);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      }
      if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }

      return 0;
    });

    return uniqueNodes;
  };

  const normalizeRoleValue = (role) => {
    const value = String(role || "").trim().toLowerCase();
    if (!value) {
      return "unknown";
    }

    if (
      value === "assistant" ||
      value === "model" ||
      value === "bot" ||
      value === "ai" ||
      value.includes("assistant") ||
      value.includes("model") ||
      value.includes("gemini")
    ) {
      return "assistant";
    }

    if (
      value === "user" ||
      value === "human" ||
      value === "prompt" ||
      value === "query" ||
      value === "you" ||
      value.includes("user") ||
      value.includes("human") ||
      value.includes("prompt") ||
      value.includes("query")
    ) {
      return "user";
    }

    return value;
  };

  const findRoleNode = (node) => {
    if (!(node instanceof Element)) {
      return node;
    }

    const roleSelector = joinSelectors(platform.roleSelectors);
    if (!roleSelector) {
      return node;
    }

    if (node.matches(roleSelector)) {
      return node;
    }

    return queryFirstDeep(node, roleSelector) || node;
  };

  const detectRole = (node) => {
    const roleNode = findRoleNode(node);

    for (const attribute of platform.roleAttributes) {
      const explicitRole = getAttributeValue(roleNode, attribute) || getAttributeValue(node, attribute);
      const normalizedRole = normalizeRoleValue(explicitRole);
      if (normalizedRole !== "unknown") {
        return normalizedRole;
      }
    }

    const structuralHint = [
      roleNode instanceof Element ? roleNode.localName : "",
      node instanceof Element ? node.localName : "",
      roleNode instanceof Element ? roleNode.className : "",
      node instanceof Element ? node.className : "",
    ]
      .filter((value) => typeof value === "string" && value.trim())
      .join(" ")
      .toLowerCase();

    if (
      structuralHint.includes("model-response") ||
      structuralHint.includes("response-container") ||
      structuralHint.includes("message-content") ||
      structuralHint.includes("assistant")
    ) {
      return "assistant";
    }

    if (
      structuralHint.includes("user-query") ||
      structuralHint.includes("user-query-content") ||
      structuralHint.includes("user-query-container") ||
      structuralHint.includes("query-text") ||
      structuralHint.includes("user")
    ) {
      return "user";
    }

    const hintParts = [];
    [roleNode, node].forEach((element) => {
      if (!(element instanceof Element)) {
        return;
      }

      ["aria-label", "title"].forEach((attribute) => {
        const value = element.getAttribute(attribute);
        if (value) {
          hintParts.push(value);
        }
      });

      queryAllDeep(element, "img[alt], svg[aria-label], [title], [aria-label]").forEach((hintNode) => {
        const value =
          hintNode.getAttribute("alt") ||
          hintNode.getAttribute("aria-label") ||
          hintNode.getAttribute("title");
        if (value) {
          hintParts.push(value);
        }
      });
    });

    const textForHint = hintParts.join(" ").toLowerCase();

    if (platform.assistantHints.some((hint) => textForHint.includes(hint))) {
      return "assistant";
    }

    if (platform.userHints.some((hint) => textForHint.includes(hint))) {
      return "user";
    }

    if (queryFirstDeep(node, 'img[alt*="Gemini"], svg[aria-label*="Gemini"], img[alt*="ChatGPT"], svg[aria-label*="ChatGPT"], svg[aria-label*="Assistant"]')) {
      return "assistant";
    }

    if (queryFirstDeep(node, 'img[alt*="User"], svg[aria-label*="User"], svg[aria-label*="You"]')) {
      return "user";
    }

    return "unknown";
  };

  const extractMessageText = (node) => {
    if (!(node instanceof Element)) {
      return "";
    }

    const textSelector = joinSelectors(platform.textSelectors);
    const contentNode =
      (textSelector && node.matches(textSelector) ? node : null) ||
      (textSelector ? queryFirstDeep(node, textSelector) : null) ||
      node;

    return extractTextContentDeep(contentNode);
  };

  const getMessageRecord = (node, seenMessageIds, signatureOccurrences) => {
    const roleNode = findRoleNode(node);
    const messageId =
      roleNode?.getAttribute?.("data-message-id") ||
      roleNode?.getAttribute?.("data-response-id") ||
      node.getAttribute("data-message-id") ||
      node.getAttribute("data-response-id");

    if (messageId && seenMessageIds.has(messageId)) {
      return null;
    }
    if (messageId) {
      seenMessageIds.add(messageId);
    }

    const role = detectRole(roleNode);
    const text = extractMessageText(roleNode);
    if (!text) {
      return null;
    }

    const signature = messageId ? `id:${messageId}` : `${role}\u0000${text}`;
    const occurrence = (signatureOccurrences.get(signature) || 0) + 1;
    signatureOccurrences.set(signature, occurrence);

    return {
      key: messageId ? signature : `sig:${signature}\u0000${occurrence}`,
      messageId: messageId || null,
      role,
      text,
    };
  };

  const getMessageRecords = (nodes) => {
    const seenIds = new Set();
    const signatureOccurrences = new Map();

    return nodes
      .map((node) => getMessageRecord(node, seenIds, signatureOccurrences))
      .filter(Boolean);
  };

  const buildPayloadFromRecords = (records) =>
    records.map((message, index) => ({
      index: index + 1,
      role: message.role,
      text: message.text,
    }));

  const buildMessagePayload = (nodes) => buildPayloadFromRecords(getMessageRecords(nodes));

  const buildPayloadFromExternalMessages = (messages) =>
    (Array.isArray(messages) ? messages : [])
      .map((message) => {
        const role = normalizeRoleValue(message?.role);
        const text =
          typeof message?.text === "string"
            ? message.text
              .replace(/\r\n/g, "\n")
              .replace(/\u00a0/g, " ")
              .replace(/\n{3,}/g, "\n\n")
              .trim()
            : "";

        if (!text || (role !== "user" && role !== "assistant")) {
          return null;
        }

        return {
          role,
          text,
        };
      })
      .filter(Boolean)
      .reduce((result, message) => {
        const previous = result[result.length - 1];
        if (previous && previous.role === message.role && previous.text === message.text) {
          return result;
        }
        result.push(message);
        return result;
      }, [])
      .map((message, index) => ({
        index: index + 1,
        role: message.role,
        text: message.text,
      }));

  const createMessageAccumulator = () => ({
    orderedKeys: [],
    orderedKeySet: new Set(),
    recordsByKey: new Map(),
  });

  const mergeSnapshotMessages = (accumulator, snapshotRecords) => {
    if (!accumulator || snapshotRecords.length === 0) {
      return;
    }

    snapshotRecords.forEach((record) => {
      if (!accumulator.recordsByKey.has(record.key)) {
        accumulator.recordsByKey.set(record.key, record);
      }
    });

    const snapshotKeys = snapshotRecords.map((record) => record.key);

    if (accumulator.orderedKeys.length === 0) {
      snapshotKeys.forEach((key) => {
        accumulator.orderedKeys.push(key);
        accumulator.orderedKeySet.add(key);
      });
      return;
    }

    const pivotSnapshotIndex = snapshotKeys.findIndex((key) => accumulator.orderedKeySet.has(key));
    if (pivotSnapshotIndex === -1) {
      const prependKeys = snapshotKeys.filter((key) => !accumulator.orderedKeySet.has(key));
      if (prependKeys.length > 0) {
        accumulator.orderedKeys = [...prependKeys, ...accumulator.orderedKeys];
        prependKeys.forEach((key) => accumulator.orderedKeySet.add(key));
      }
      return;
    }

    const pivotKey = snapshotKeys[pivotSnapshotIndex];
    let insertAt = accumulator.orderedKeys.indexOf(pivotKey);

    const prefixKeys = snapshotKeys
      .slice(0, pivotSnapshotIndex)
      .filter((key) => !accumulator.orderedKeySet.has(key));
    if (prefixKeys.length > 0) {
      accumulator.orderedKeys.splice(insertAt, 0, ...prefixKeys);
      prefixKeys.forEach((key) => accumulator.orderedKeySet.add(key));
      insertAt += prefixKeys.length;
    }

    let cursor = accumulator.orderedKeys.indexOf(pivotKey) + 1;

    snapshotKeys.slice(pivotSnapshotIndex + 1).forEach((key) => {
      const existingIndex = accumulator.orderedKeys.indexOf(key);
      if (existingIndex !== -1) {
        cursor = existingIndex + 1;
        return;
      }

      accumulator.orderedKeys.splice(cursor, 0, key);
      accumulator.orderedKeySet.add(key);
      cursor += 1;
    });
  };

  const buildPayloadFromAccumulator = (accumulator) =>
    buildPayloadFromRecords(
      accumulator.orderedKeys
        .map((key) => accumulator.recordsByKey.get(key))
        .filter(Boolean)
    );

  const updateStatus = (message, tone = "info") => {
    const status = document.getElementById(STATUS_ID);
    if (!status) {
      return;
    }
    status.textContent = message;
    status.dataset.tone = tone;
  };

  const saveMinimizedPosition = (position) => {
    localStorage.setItem(POSITION_KEY, JSON.stringify(position));
  };

  const loadMinimizedPosition = () => {
    const stored = localStorage.getItem(POSITION_KEY);
    if (!stored) {
      return null;
    }
    try {
      return JSON.parse(stored);
    } catch (error) {
      return null;
    }
  };

  const snapToEdge = (button, savePosition = true) => {
    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const buttonWidth = rect.width;
    const buttonHeight = rect.height;

    // 计算按钮中心点到左右边缘的距离
    const centerX = rect.left + buttonWidth / 2;
    const distanceToLeft = centerX;
    const distanceToRight = viewportWidth - centerX;

    // 确定贴合到哪个边缘
    const edge = distanceToLeft <= distanceToRight ? 'left' : 'right';

    // 获取当前 top 值，并确保在可视区域内
    let top = rect.top;
    const margin = 16; // 边距

    // 确保 top 不会让按钮超出可视区域
    if (top < margin) {
      top = margin;
    } else if (top + buttonHeight > viewportHeight - margin) {
      top = viewportHeight - buttonHeight - margin;
    }

    // 应用贴合位置
    if (edge === 'left') {
      button.style.left = `${margin}px`;
      button.style.right = 'auto';
    } else {
      button.style.left = 'auto';
      button.style.right = `${margin}px`;
    }
    button.style.top = `${top}px`;
    button.style.bottom = 'auto';

    // 保存位置
    if (savePosition) {
      saveMinimizedPosition({ edge, top });
    }
  };

  const ensureButtonVisible = (button) => {
    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 16;

    let needsAdjustment = false;

    // 检查是否超出可视区域
    if (rect.left < 0 || rect.right > viewportWidth ||
      rect.top < 0 || rect.bottom > viewportHeight) {
      needsAdjustment = true;
    }

    if (needsAdjustment) {
      snapToEdge(button, true);
    }
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const getParentElementAcrossShadow = (node) => {
    if (!(node instanceof Node)) {
      return null;
    }

    if (node.parentElement) {
      return node.parentElement;
    }

    const rootNode = node.getRootNode();
    return rootNode instanceof ShadowRoot ? rootNode.host : null;
  };

  const isScrollableElement = (element) => {
    if (!(element instanceof Element)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    const overflowY = (style.overflowY || "").toLowerCase();
    return ["auto", "scroll", "overlay"].includes(overflowY) && element.scrollHeight - element.clientHeight > 48;
  };

  const findScrollableAncestor = (node) => {
    let current = node instanceof Element ? node : null;

    while (current) {
      if (isScrollableElement(current)) {
        return current;
      }
      current = getParentElementAcrossShadow(current);
    }

    return document.scrollingElement || document.documentElement || document.body;
  };

  const getScrollTop = (target) => {
    if (!target || target === document.body || target === document.documentElement || target === document.scrollingElement) {
      return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    }

    return target.scrollTop;
  };

  const setScrollTop = (target, nextTop) => {
    const safeTop = Math.max(0, nextTop);

    if (!target || target === document.body || target === document.documentElement || target === document.scrollingElement) {
      window.scrollTo(0, safeTop);
      return;
    }

    target.scrollTop = safeTop;
  };

  const scrollByOffset = (target, delta) => {
    if (!delta) {
      return;
    }

    if (!target || target === document.body || target === document.documentElement || target === document.scrollingElement) {
      window.scrollBy(0, delta);
      return;
    }

    target.scrollTop += delta;
  };

  const getVisibleMessageAnchor = () => {
    const visibleNodes = getMessageNodes();
    for (const node of visibleNodes) {
      const rect = node.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < window.innerHeight) {
        return {
          node,
          top: rect.top,
        };
      }
    }

    return null;
  };

  const restoreVisibleMessageAnchor = async (context) => {
    if (!context) {
      return;
    }

    const { anchor, scrollTarget, scrollTop } = context;

    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        if (anchor?.node?.isConnected) {
          const nextTop = anchor.node.getBoundingClientRect().top;
          scrollByOffset(scrollTarget, nextTop - anchor.top);
        } else {
          setScrollTop(scrollTarget, scrollTop);
        }

        requestAnimationFrame(resolve);
      });
    });
  };

  const ensureExportMask = () => {
    const existingMask = document.getElementById(EXPORT_MASK_ID);
    if (existingMask) {
      syncToolkitTheme();
      return existingMask;
    }

    if (!document.body) {
      return null;
    }

    const mask = document.createElement("section");
    mask.id = EXPORT_MASK_ID;
    mask.className = "chatgpt-toolkit-export-mask";
    mask.setAttribute("aria-live", "polite");
    mask.innerHTML = `
      <div class="chatgpt-toolkit-export-mask__backdrop"></div>
      <div class="chatgpt-toolkit-export-mask__panel">
        <strong>正在准备完整导出</strong>
        <p>插件正在通过 Gemini 会话接口读取完整记录。</p>
      </div>
    `;

    document.body.appendChild(mask);
    syncToolkitTheme();
    return mask;
  };

  const setExportMaskCopy = (title, description) => {
    const mask = ensureExportMask();
    if (!mask) {
      return;
    }

    const titleNode = mask.querySelector("strong");
    const descriptionNode = mask.querySelector("p");

    if (titleNode) {
      titleNode.textContent = title;
    }
    if (descriptionNode) {
      descriptionNode.textContent = description;
    }
  };

  const removeExportMask = () => {
    const mask = document.getElementById(EXPORT_MASK_ID);
    if (mask) {
      mask.remove();
    }
  };

  const clickHistoryExpansionControls = () => {
    let clickedCount = 0;

    queryAllDeep(document, 'button, [role="button"]').forEach((element) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }

      if (element.disabled || element.getAttribute("aria-disabled") === "true") {
        return;
      }

      const label = extractTextContentDeep(element).toLowerCase();
      const hint = `${element.getAttribute("aria-label") || ""} ${element.title || ""}`.toLowerCase();
      const text = `${label} ${hint}`;

      const shouldClick =
        text.includes("show more") ||
        text.includes("load more") ||
        text.includes("older") ||
        text.includes("earlier") ||
        text.includes("显示更多") ||
        text.includes("加载更多") ||
        text.includes("更多消息") ||
        text.includes("更早");

      if (!shouldClick) {
        return;
      }

      element.click();
      clickedCount += 1;
    });

    return clickedCount;
  };

  const prepareConversationForExport = async () => {
    if (platform.id !== "gemini") {
      return {
        viewportContext: null,
        messages: null,
      };
    }

    const roots = getPlatformRoots();
    const scrollTarget =
      roots.map((root) => findScrollableAncestor(root)).find(Boolean) ||
      document.scrollingElement ||
      document.documentElement ||
      document.body;

    if (!scrollTarget) {
      return {
        viewportContext: null,
        messages: null,
      };
    }

    const viewportContext = {
      anchor: getVisibleMessageAnchor(),
      scrollTarget,
      scrollTop: getScrollTop(scrollTarget),
    };

    const accumulator = createMessageAccumulator();
    const captureSnapshot = () => {
      const snapshotRecords = getMessageRecords(getMessageNodes());
      mergeSnapshotMessages(accumulator, snapshotRecords);
      return accumulator.orderedKeys.length;
    };

    let collectedCount = captureSnapshot();
    let lastProgressAt = Date.now();
    const startedAt = Date.now();

    updateStatus("正在加载 Gemini 历史消息...", "info");

    while (true) {
      const currentTop = getScrollTop(scrollTarget);
      if (currentTop <= 4) {
        setScrollTop(scrollTarget, 0);
      } else {
        const step = scrollTarget instanceof Element && scrollTarget.clientHeight > 0
          ? Math.max(320, Math.floor(scrollTarget.clientHeight * 0.9))
          : Math.max(320, Math.floor(window.innerHeight * 0.9));
        setScrollTop(scrollTarget, currentTop - step);
      }

      await sleep(260);

      const clickedCount = clickHistoryExpansionControls();

      await sleep(clickedCount > 0 ? 720 : 320);

      const nextTop = getScrollTop(scrollTarget);
      const nextCollectedCount = captureSnapshot();

      const madeProgress =
        clickedCount > 0 ||
        nextCollectedCount > collectedCount ||
        nextTop < currentTop - 4;

      if (madeProgress) {
        collectedCount = nextCollectedCount;
        lastProgressAt = Date.now();
      }

      const idleDuration = Date.now() - lastProgressAt;
      const totalDuration = Date.now() - startedAt;

      if (nextTop <= 4 && clickedCount === 0 && idleDuration >= 1800) {
        break;
      }

      if (totalDuration >= 45000) {
        break;
      }
    }

    await sleep(100);
    return {
      viewportContext,
      messages: buildPayloadFromAccumulator(accumulator),
    };
  };
  const collapseOldMessages = () => {
    ensureConversationState();
    const nodes = getMessageNodes();
    if (nodes.length === 0) {
      updateStatus(`未识别到可优化的 ${platform.label} 消息。`, "info");
      return;
    }
    if (nodes.length <= state.keepLatest) {
      updateStatus("当前消息数量较少，无需优化。", "info");
      return;
    }

    state.cachedNodes = nodes;
    const toCollapse = nodes.slice(0, nodes.length - state.keepLatest);

    // 记录第一个保留的节点作为锚点
    const firstKeptNode = nodes[nodes.length - state.keepLatest];
    state.anchorNode = firstKeptNode;
    state.anchorParent = firstKeptNode?.parentNode;

    state.collapsedNodes = toCollapse.map((node) => ({
      node,
      parent: node.parentNode,
    }));

    toCollapse.forEach((node) => node.remove());

    state.isCollapsed = true;
    updateStatus(`已优化：隐藏 ${toCollapse.length} 条旧消息。`, "success");
  };

  const restoreMessages = () => {
    ensureConversationState();
    if (!state.isCollapsed) {
      updateStatus("没有需要恢复的消息。", "info");
      return;
    }

    // 保存当前滚动位置：记录当前可见的第一个消息节点
    const visibleNodes = getMessageNodes();
    let anchorElement = null;
    let anchorOffsetTop = 0;

    if (visibleNodes.length > 0) {
      // 找到当前视口中可见的第一个消息节点（部分可见也算）
      for (const node of visibleNodes) {
        const rect = node.getBoundingClientRect();
        // 消息部分可见：底部在视口内 且 顶部在视口内或上方
        if (rect.bottom > 0 && rect.top < window.innerHeight) {
          anchorElement = node;
          anchorOffsetTop = rect.top;
          break;
        }
      }
      // 如果没找到，使用第一个节点
      if (!anchorElement) {
        anchorElement = visibleNodes[0];
        anchorOffsetTop = anchorElement.getBoundingClientRect().top;
      }
    }

    // 使用锚点恢复：将所有隐藏的节点按顺序插入到锚点之前
    state.collapsedNodes.forEach(({ node, parent }) => {
      if (state.anchorNode && state.anchorParent?.contains(state.anchorNode)) {
        state.anchorParent.insertBefore(node, state.anchorNode);
      } else if (parent) {
        // 如果锚点不存在，尝试添加到原父节点
        parent.appendChild(node);
      }
    });

    // 恢复后，滚动回之前可见的消息位置
    if (anchorElement) {
      requestAnimationFrame(() => {
        const newRect = anchorElement.getBoundingClientRect();
        const scrollDelta = newRect.top - anchorOffsetTop;
        window.scrollBy(0, scrollDelta);
      });
    }

    state.collapsedNodes = [];
    state.anchorNode = null;
    state.anchorParent = null;
    state.isCollapsed = false;
    updateStatus("已恢复所有消息。", "success");
  };

  const exportMessages = async () => {
    ensureConversationState();
    if (state.isExporting) {
      updateStatus("导出进行中，请稍候。", "info");
      return;
    }

    state.isExporting = true;
    let exportResult = {
      viewportContext: null,
      messages: null,
    };
    let directMessages = null;
    let usedDirectGeminiExport = false;
    let fellBackToDomExport = false;
    let directExportError = "";

    try {
      if (platform.id === "gemini") {
        setExportMaskCopy("正在准备完整导出", "插件正在通过 Gemini 会话接口读取完整记录。");
      }

      if (platform.id === "gemini") {
        try {
          updateStatus("正在通过 Gemini 会话接口读取完整记录...", "info");
          directMessages = await requestGeminiConversationMessages();
          usedDirectGeminiExport = Array.isArray(directMessages) && directMessages.length > 0;
        } catch (error) {
          console.warn("[AI Toolkit] Gemini direct export failed.", error);
          directExportError = error instanceof Error ? error.message : String(error || "");
          directMessages = null;
        }
      }

      if (!usedDirectGeminiExport) {
        if (platform.id === "gemini") {
          fellBackToDomExport = true;
          setExportMaskCopy("正在回退到页面扫描", "Gemini 会话接口未返回完整结果，插件正在尝试页面扫描。");
          updateStatus(
            directExportError
              ? `Gemini 会话接口失败，正在回退页面扫描：${directExportError}`
              : "Gemini 会话接口未返回完整结果，正在回退页面扫描。",
            "info"
          );
        }
        exportResult = await prepareConversationForExport();
      }

      const visibleNodes = getMessageNodes();
      const nodesForExport = state.isCollapsed
        ? [...state.cachedNodes, ...visibleNodes.filter((node) => !state.cachedNodes.includes(node))]
        : visibleNodes;
      const visibleMessages = buildMessagePayload(nodesForExport);
      const messages =
        Array.isArray(directMessages) && directMessages.length > 0
          ? directMessages
          : Array.isArray(exportResult.messages) && exportResult.messages.length > 0
          ? exportResult.messages
          : visibleMessages;

      if (messages.length === 0) {
        updateStatus(`未识别到可导出的 ${platform.label} 消息。`, "info");
        return;
      }

      const payload = {
        exportedAt: new Date().toISOString(),
        url: window.location.href,
        messageCount: messages.length,
        messages,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });

      const filename = getExportFilename();

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);

      if (usedDirectGeminiExport) {
        updateStatus(`导出已开始，共识别 ${messages.length} 条消息（Gemini 会话接口）。`, "success");
      } else if (fellBackToDomExport && platform.id === "gemini") {
        updateStatus(`导出已开始，共识别 ${messages.length} 条消息（页面扫描回退）。`, "success");
      } else {
        updateStatus(`导出已开始，共识别 ${messages.length} 条消息。`, "success");
      }
    } finally {
      await restoreVisibleMessageAnchor(exportResult.viewportContext);
      removeExportMask();
      state.isExporting = false;
    }
  };

  // ============ Prompt 指令库 ============

  const createPromptId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };

  const toSafeText = (value) => (typeof value === "string" ? value.trim() : "");
  const normalizeCategory = (value) => toSafeText(value) || "未分类";

  const getPromptStorageArea = () =>
    typeof chrome !== "undefined" && chrome?.storage?.local ? chrome.storage.local : null;

  const buildPromptStoragePayload = (items) => ({
    version: 1,
    updatedAt: new Date().toISOString(),
    prompts: items,
  });

  const normalizePromptItem = (raw) => {
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const content = toSafeText(raw.content ?? raw.text);
    if (!content) {
      return null;
    }

    const singleLineContent = content.replace(/\s+/g, " ").trim();
    const title = toSafeText(raw.title) || singleLineContent.slice(0, 24) || "未命名指令";
    const category = normalizeCategory(raw.category);
    const createdAt = Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now();
    const updatedAt = Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : createdAt;
    const id = toSafeText(raw.id) || createPromptId();

    return {
      id,
      title,
      category,
      content,
      createdAt,
      updatedAt,
    };
  };

  const extractPromptItems = (payload) => {
    const source = Array.isArray(payload)
      ? payload
      : payload && Array.isArray(payload.prompts)
        ? payload.prompts
        : [];

    return source
      .map((item) => normalizePromptItem(item))
      .filter(Boolean);
  };

  const readPromptPayloadFromLocal = () => {
    let raw = null;
    try {
      raw = localStorage.getItem(PROMPT_LOCAL_FALLBACK_KEY);
    } catch (error) {
      return null;
    }

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  };

  const writePromptPayloadToLocal = (payload) => {
    try {
      localStorage.setItem(PROMPT_LOCAL_FALLBACK_KEY, JSON.stringify(payload));
      return true;
    } catch (error) {
      return false;
    }
  };

  const readPromptPayload = async () => {
    const storage = getPromptStorageArea();
    if (storage) {
      return new Promise((resolve) => {
        storage.get([PROMPT_STORAGE_KEY], (result) => {
          if (chrome?.runtime?.lastError) {
            resolve(readPromptPayloadFromLocal());
            return;
          }
          const payload = result?.[PROMPT_STORAGE_KEY];
          if (payload !== undefined && payload !== null) {
            resolve(payload);
            return;
          }
          resolve(readPromptPayloadFromLocal());
        });
      });
    }

    return readPromptPayloadFromLocal();
  };

  const writePromptPayload = async (payload) => {
    const storage = getPromptStorageArea();
    if (storage) {
      const hasError = await new Promise((resolve) => {
        storage.set({ [PROMPT_STORAGE_KEY]: payload }, () => {
          resolve(Boolean(chrome?.runtime?.lastError));
        });
      });
      if (!hasError) {
        return;
      }
    }
    const saved = writePromptPayloadToLocal(payload);
    if (!saved) {
      console.warn("[AI Toolkit] Failed to persist prompt library.");
    }
  };

  const compareText = (left, right) => left.localeCompare(right, "zh-CN", { sensitivity: "base" });

  const applyPromptFilters = () => {
    const keyword = promptState.searchText.trim().toLowerCase();
    let result = [...promptState.items];

    if (keyword) {
      result = result.filter((item) =>
        `${item.title} ${item.category} ${item.content}`.toLowerCase().includes(keyword)
      );
    }

    if (promptState.category !== "all") {
      result = result.filter((item) => item.category === promptState.category);
    }

    if (promptState.sortBy === "updated-asc") {
      result.sort((a, b) => a.updatedAt - b.updatedAt);
    } else if (promptState.sortBy === "title-asc") {
      result.sort((a, b) => compareText(a.title, b.title));
    } else if (promptState.sortBy === "title-desc") {
      result.sort((a, b) => compareText(b.title, a.title));
    } else if (promptState.sortBy === "category-asc") {
      result.sort((a, b) => {
        const byCategory = compareText(a.category, b.category);
        if (byCategory !== 0) {
          return byCategory;
        }
        return b.updatedAt - a.updatedAt;
      });
    } else {
      result.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    promptState.filteredItems = result;
    if (!result.some((item) => item.id === promptState.selectedId)) {
      promptState.selectedId = result.length > 0 ? result[0].id : null;
    }
  };

  const savePromptItems = async (items) => {
    promptState.items = items;
    applyPromptFilters();
    await writePromptPayload(buildPromptStoragePayload(items));
  };

  const ensurePromptLibraryLoaded = async () => {
    if (promptState.loaded) {
      return;
    }

    const payload = await readPromptPayload();
    const items = extractPromptItems(payload);
    if (items.length === 0) {
      promptState.items = [];
      await writePromptPayload(buildPromptStoragePayload(promptState.items));
    } else {
      promptState.items = items;
    }

    promptState.loaded = true;
    applyPromptFilters();
  };

  const getPromptModalElements = () => {
    const modal = document.getElementById(PROMPT_MODAL_ID);
    if (!modal) {
      return null;
    }

    return {
      modal,
      toast: modal.querySelector(`#${PROMPT_TOAST_ID}`),
      searchInput: modal.querySelector("#chatgpt-toolkit-prompt-search"),
      categorySelect: modal.querySelector("#chatgpt-toolkit-prompt-category-filter"),
      sortSelect: modal.querySelector("#chatgpt-toolkit-prompt-sort"),
      listContainer: modal.querySelector("#chatgpt-toolkit-prompt-list"),
      emptyTip: modal.querySelector("#chatgpt-toolkit-prompt-empty"),
      countLabel: modal.querySelector("#chatgpt-toolkit-prompt-count"),
      addTitle: modal.querySelector("#chatgpt-toolkit-prompt-add-title"),
      addCategory: modal.querySelector("#chatgpt-toolkit-prompt-add-category"),
      addContent: modal.querySelector("#chatgpt-toolkit-prompt-add-content"),
      fileInput: modal.querySelector(`#${PROMPT_FILE_INPUT_ID}`),
    };
  };

  const hidePromptToast = () => {
    const elements = getPromptModalElements();
    const toast = elements?.toast;
    if (!(toast instanceof HTMLElement)) {
      return;
    }
    toast.classList.remove("is-visible");
    toast.textContent = "";
  };

  const showPromptToast = (message, tone = "success") => {
    const elements = getPromptModalElements();
    const toast = elements?.toast;
    if (!(toast instanceof HTMLElement)) {
      return;
    }

    if (promptToastTimer) {
      clearTimeout(promptToastTimer);
    }

    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.classList.add("is-visible");

    promptToastTimer = setTimeout(() => {
      toast.classList.remove("is-visible");
      promptToastTimer = null;
    }, 1600);
  };

  const renderPromptCategoryOptions = (categorySelect) => {
    if (!(categorySelect instanceof HTMLSelectElement)) {
      return;
    }

    const categories = Array.from(new Set(promptState.items.map((item) => item.category)))
      .filter(Boolean)
      .sort((a, b) => compareText(a, b));

    categorySelect.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "全部分类";
    categorySelect.appendChild(allOption);

    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
    });

    if (promptState.category !== "all" && !categories.includes(promptState.category)) {
      promptState.category = "all";
      applyPromptFilters();
    }

    categorySelect.value = promptState.category;
  };

  const formatPromptTime = (timestamp) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderPromptList = () => {
    const elements = getPromptModalElements();
    if (!elements) {
      return;
    }

    const {
      searchInput,
      categorySelect,
      sortSelect,
      listContainer,
      emptyTip,
      countLabel,
    } = elements;

    if (
      !(searchInput instanceof HTMLInputElement) ||
      !(categorySelect instanceof HTMLSelectElement) ||
      !(sortSelect instanceof HTMLSelectElement) ||
      !(listContainer instanceof HTMLElement) ||
      !(emptyTip instanceof HTMLElement) ||
      !(countLabel instanceof HTMLElement)
    ) {
      return;
    }

    searchInput.value = promptState.searchText;
    sortSelect.value = promptState.sortBy;
    renderPromptCategoryOptions(categorySelect);

    listContainer.innerHTML = "";

    if (promptState.filteredItems.length === 0) {
      emptyTip.style.display = "block";
      countLabel.textContent = `0 / ${promptState.items.length} 条`;
      return;
    }

    emptyTip.style.display = "none";
    countLabel.textContent = `${promptState.filteredItems.length} / ${promptState.items.length} 条`;

    promptState.filteredItems.forEach((item) => {
      const itemNode = document.createElement("article");
      itemNode.className = "chatgpt-toolkit-prompt-item";
      if (item.id === promptState.selectedId) {
        itemNode.classList.add("is-selected");
      }
      itemNode.dataset.promptId = item.id;

      const header = document.createElement("div");
      header.className = "chatgpt-toolkit-prompt-item-header";

      const title = document.createElement("h4");
      title.className = "chatgpt-toolkit-prompt-item-title";
      title.textContent = item.title;

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "chatgpt-toolkit-prompt-delete";
      deleteBtn.dataset.promptAction = "delete";
      deleteBtn.dataset.promptId = item.id;
      deleteBtn.textContent = "删除";

      header.appendChild(title);
      header.appendChild(deleteBtn);

      const meta = document.createElement("p");
      meta.className = "chatgpt-toolkit-prompt-item-meta";
      const timestamp = formatPromptTime(item.updatedAt);
      meta.textContent = `${item.category} · ${timestamp} · 单击复制`;

      const content = document.createElement("p");
      content.className = "chatgpt-toolkit-prompt-item-content";
      content.textContent = item.content;

      itemNode.appendChild(header);
      itemNode.appendChild(meta);
      itemNode.appendChild(content);

      listContainer.appendChild(itemNode);
    });
  };

  const copyTextToClipboard = async (text) => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        // Fallback below.
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();

    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (error) {
      copied = false;
    }

    textarea.remove();
    return copied;
  };

  const copyPromptById = async (promptId) => {
    const item = promptState.items.find((prompt) => prompt.id === promptId);
    if (!item) {
      updateStatus("复制失败：未找到对应 Prompt。", "info");
      showPromptToast("复制失败", "error");
      return;
    }

    promptState.selectedId = item.id;
    renderPromptList();

    const copied = await copyTextToClipboard(item.content);
    if (copied) {
      updateStatus(`已复制 Prompt：${item.title}`, "success");
      showPromptToast("复制成功", "success");
      return;
    }
    updateStatus("复制失败：浏览器不允许访问剪贴板。", "info");
    showPromptToast("复制失败", "error");
  };

  const addPromptFromModal = async () => {
    const elements = getPromptModalElements();
    if (!elements) {
      return;
    }

    const { addTitle, addCategory, addContent } = elements;
    if (
      !(addTitle instanceof HTMLInputElement) ||
      !(addCategory instanceof HTMLInputElement) ||
      !(addContent instanceof HTMLTextAreaElement)
    ) {
      return;
    }

    const content = toSafeText(addContent.value);
    if (!content) {
      updateStatus("新增失败：Prompt 内容不能为空。", "info");
      return;
    }

    const timestamp = Date.now();
    const title = toSafeText(addTitle.value) || content.replace(/\s+/g, " ").slice(0, 24) || "未命名指令";
    const category = normalizeCategory(addCategory.value);
    const newItem = {
      id: createPromptId(),
      title,
      category,
      content,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const nextItems = [newItem, ...promptState.items];
    await savePromptItems(nextItems);
    promptState.selectedId = newItem.id;
    renderPromptList();

    addTitle.value = "";
    addCategory.value = "";
    addContent.value = "";

    updateStatus("已新增 Prompt 指令。", "success");
  };

  const deletePromptById = async (promptId) => {
    const item = promptState.items.find((prompt) => prompt.id === promptId);
    if (!item) {
      return;
    }

    if (!window.confirm(`确认删除 Prompt「${item.title}」吗？`)) {
      return;
    }

    const nextItems = promptState.items.filter((prompt) => prompt.id !== promptId);
    await savePromptItems(nextItems);
    renderPromptList();
    updateStatus("已删除 Prompt 指令。", "success");
  };

  const exportPromptLibrary = () => {
    const payload = buildPromptStoragePayload(promptState.items);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const dateTag = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `ai-prompts-${dateTag}.json`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    updateStatus("Prompt 指令已导出为 JSON。", "success");
  };

  const mergeImportedPromptItems = (incomingItems) => {
    const existingSignature = new Set(
      promptState.items.map((item) =>
        `${item.title}\n${item.category}\n${item.content}`.toLowerCase()
      )
    );

    const merged = [...promptState.items];
    let addedCount = 0;

    incomingItems.forEach((item) => {
      const signature = `${item.title}\n${item.category}\n${item.content}`.toLowerCase();
      if (existingSignature.has(signature)) {
        return;
      }
      existingSignature.add(signature);
      merged.unshift({
        ...item,
        id: createPromptId(),
        updatedAt: Date.now(),
      });
      addedCount += 1;
    });

    return { merged, addedCount };
  };

  const importPromptLibrary = async (fileInput) => {
    if (!(fileInput instanceof HTMLInputElement) || !fileInput.files || fileInput.files.length === 0) {
      return;
    }

    const file = fileInput.files[0];
    try {
      const content = await file.text();
      const parsed = JSON.parse(content);
      const incomingItems = extractPromptItems(parsed);
      if (incomingItems.length === 0) {
        updateStatus("导入失败：JSON 文件中没有可用 Prompt。", "info");
        return;
      }

      const { merged, addedCount } = mergeImportedPromptItems(incomingItems);
      if (addedCount === 0) {
        updateStatus("导入完成：没有新增内容。", "info");
        return;
      }

      await savePromptItems(merged);
      renderPromptList();
      updateStatus(`导入完成：新增 ${addedCount} 条 Prompt。`, "success");
    } catch (error) {
      updateStatus("导入失败：请检查 JSON 格式。", "info");
    } finally {
      fileInput.value = "";
    }
  };

  const closePromptModal = () => {
    const modal = document.getElementById(PROMPT_MODAL_ID);
    if (!modal) {
      return;
    }
    if (promptToastTimer) {
      clearTimeout(promptToastTimer);
      promptToastTimer = null;
    }
    hidePromptToast();
    modal.classList.remove("is-visible");
    promptState.isOpen = false;
  };

  const handlePromptModalClick = async (event) => {
    const target = event.target;
    const actionTarget =
      target instanceof Element
        ? target.closest("[data-prompt-action]")
        : target instanceof Node && target.parentElement
          ? target.parentElement.closest("[data-prompt-action]")
          : null;

    if (actionTarget instanceof HTMLElement) {
      const action = actionTarget.dataset.promptAction;
      if (action === "close") {
        closePromptModal();
        return;
      }
      if (action === "add") {
        await addPromptFromModal();
        return;
      }
      if (action === "export") {
        exportPromptLibrary();
        return;
      }
      if (action === "import") {
        const elements = getPromptModalElements();
        const fileInput = elements?.fileInput;
        if (fileInput instanceof HTMLInputElement) {
          fileInput.click();
        }
        return;
      }
      if (action === "delete") {
        const promptId = actionTarget.dataset.promptId;
        if (promptId) {
          await deletePromptById(promptId);
        }
        return;
      }
    }

    const promptNode =
      target instanceof Element
        ? target.closest("[data-prompt-id]")
        : target instanceof Node && target.parentElement
          ? target.parentElement.closest("[data-prompt-id]")
          : null;

    if (!(promptNode instanceof HTMLElement)) {
      return;
    }

    const promptId = promptNode.dataset.promptId;
    if (promptId) {
      await copyPromptById(promptId);
    }
  };

  const ensurePromptModal = () => {
    const existingModal = document.getElementById(PROMPT_MODAL_ID);
    if (existingModal) {
      return existingModal;
    }

    if (!document.body) {
      return null;
    }

    const modal = document.createElement("section");
    modal.id = PROMPT_MODAL_ID;
    modal.className = "chatgpt-toolkit-prompt-modal";
    modal.innerHTML = `
      <div class="chatgpt-toolkit-prompt-backdrop" data-prompt-action="close"></div>
      <div class="chatgpt-toolkit-prompt-panel" role="dialog" aria-modal="true" aria-label="Prompt 指令列表">
        <div class="chatgpt-toolkit-prompt-header">
          <strong>Prompt 指令列表</strong>
          <button type="button" class="chatgpt-toolkit-prompt-close" data-prompt-action="close">关闭</button>
        </div>
        <div id="${PROMPT_TOAST_ID}" class="chatgpt-toolkit-prompt-toast" aria-live="polite"></div>
        <div class="chatgpt-toolkit-prompt-filters">
          <input id="chatgpt-toolkit-prompt-search" type="text" placeholder="搜索标题/内容/分类" />
          <select id="chatgpt-toolkit-prompt-category-filter">
            <option value="all">全部分类</option>
          </select>
          <select id="chatgpt-toolkit-prompt-sort">
            <option value="updated-desc">最近更新</option>
            <option value="updated-asc">最早更新</option>
            <option value="title-asc">标题 A-Z</option>
            <option value="title-desc">标题 Z-A</option>
            <option value="category-asc">分类排序</option>
          </select>
        </div>
        <div id="chatgpt-toolkit-prompt-list" class="chatgpt-toolkit-prompt-list"></div>
        <p id="chatgpt-toolkit-prompt-empty" class="chatgpt-toolkit-prompt-empty">暂无可用 Prompt。</p>
        <div class="chatgpt-toolkit-prompt-editor">
          <input id="chatgpt-toolkit-prompt-add-title" type="text" placeholder="标题（可选）" />
          <input id="chatgpt-toolkit-prompt-add-category" type="text" placeholder="分类（可选）" />
          <textarea id="chatgpt-toolkit-prompt-add-content" rows="4" placeholder="输入 Prompt 内容"></textarea>
          <button type="button" class="chatgpt-toolkit-prompt-add" data-prompt-action="add">添加 Prompt</button>
        </div>
        <div class="chatgpt-toolkit-prompt-footer">
          <span id="chatgpt-toolkit-prompt-count">0 / 0 条</span>
          <div class="chatgpt-toolkit-prompt-footer-actions">
            <button type="button" data-prompt-action="import">导入 JSON</button>
            <button type="button" data-prompt-action="export">导出 JSON</button>
          </div>
        </div>
        <input id="${PROMPT_FILE_INPUT_ID}" type="file" accept=".json,application/json" />
      </div>
    `;

    document.body.appendChild(modal);
    syncToolkitTheme();

    modal.addEventListener("click", (event) => {
      void handlePromptModalClick(event);
    });

    modal.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closePromptModal();
      }

      const target = event.target;
      const isSingleLineInput =
        target instanceof HTMLInputElement &&
        (target.id === "chatgpt-toolkit-prompt-add-title" || target.id === "chatgpt-toolkit-prompt-add-category");
      const isTextarea = target instanceof HTMLTextAreaElement && target.id === "chatgpt-toolkit-prompt-add-content";
      const isSubmitInTextarea = isTextarea && (event.ctrlKey || event.metaKey) && event.key === "Enter";

      if (isSingleLineInput && event.key === "Enter") {
        event.preventDefault();
        void addPromptFromModal();
      }

      if (isSubmitInTextarea) {
        event.preventDefault();
        void addPromptFromModal();
      }
    });

    const elements = getPromptModalElements();
    if (elements?.searchInput instanceof HTMLInputElement) {
      elements.searchInput.addEventListener("input", () => {
        promptState.searchText = elements.searchInput.value;
        applyPromptFilters();
        renderPromptList();
      });
    }

    if (elements?.categorySelect instanceof HTMLSelectElement) {
      elements.categorySelect.addEventListener("change", () => {
        promptState.category = elements.categorySelect.value || "all";
        applyPromptFilters();
        renderPromptList();
      });
    }

    if (elements?.sortSelect instanceof HTMLSelectElement) {
      elements.sortSelect.addEventListener("change", () => {
        promptState.sortBy = elements.sortSelect.value || "updated-desc";
        applyPromptFilters();
        renderPromptList();
      });
    }

    if (elements?.fileInput instanceof HTMLInputElement) {
      elements.fileInput.addEventListener("change", () => {
        void importPromptLibrary(elements.fileInput);
      });
    }

    return modal;
  };

  const openPromptModal = async () => {
    const modal = ensurePromptModal();
    if (!modal) {
      return;
    }

    await ensurePromptLibraryLoaded();
    syncToolkitTheme();
    applyPromptFilters();
    renderPromptList();

    promptState.isOpen = true;
    modal.classList.add("is-visible");
    hidePromptToast();
  };

  const buildToolbar = () => {
    const container = document.createElement("section");
    container.id = TOOLKIT_ID;
    container.innerHTML = `
      <div class="chatgpt-toolkit-header">
        <span class="chatgpt-toolkit-kicker">项目地址：https://github.com/9leaa/LLMs-from-scratch，感谢支持</span>
        <div class="chatgpt-toolkit-title-row">
          <div class="chatgpt-toolkit-heading">
            <strong>${APP_LABEL}</strong>
            <span class="chatgpt-toolkit-subtitle">${platform.label} 工作台</span>
          </div>
          <button type="button" class="chatgpt-toolkit-minimize" data-action="minimize" aria-label="收起工具">
            收起
          </button>
        </div>
      </div>
      <div class="chatgpt-toolkit-actions">
        <button type="button" class="chatgpt-toolkit-button" data-action="collapse">
          优化长会话
        </button>
        <button type="button" class="chatgpt-toolkit-button" data-action="restore">
          恢复隐藏消息
        </button>
        <button type="button" class="chatgpt-toolkit-button primary" data-action="export">
          导出全部记录
        </button>
        <button type="button" class="chatgpt-toolkit-button" data-action="prompt-library">
          Prompt 指令
        </button>
      </div>
      <p id="${STATUS_ID}" class="chatgpt-toolkit-status" data-tone="info">准备就绪。</p>
      <p class="chatgpt-toolkit-tip">
        <span class="chatgpt-toolkit-tip-label">导出说明</span>
        <span>优化会隐藏旧消息，导出时会自动包含隐藏内容。</span>
      </p>
    `;

    container.addEventListener("click", (event) => {
      const target = event.target;
      const actionTarget =
        target instanceof Element
          ? target.closest("[data-action]")
          : target instanceof Node && target.parentElement
            ? target.parentElement.closest("[data-action]")
            : null;

      if (!(actionTarget instanceof HTMLElement)) {
        return;
      }
      const action = actionTarget.dataset.action;
      if (!action) {
        return;
      }
      if (action === "minimize") {
        minimizeToolbar();
      }
      if (action === "collapse") {
        collapseOldMessages();
      }
      if (action === "restore") {
        restoreMessages();
      }
      if (action === "export") {
        void exportMessages();
      }
      if (action === "prompt-library") {
        void openPromptModal();
      }
    });

    return container;
  };

  const buildMinimizedButton = () => {
    const button = document.createElement("button");
    button.id = MINIMIZED_ID;
    button.type = "button";
    button.className = "chatgpt-toolkit-minimized";
    button.setAttribute("aria-label", `展开${APP_LABEL}`);
    button.innerHTML = `
      <span class="chatgpt-toolkit-minimized-mark">${platform.shortLabel}</span>
      <span class="chatgpt-toolkit-minimized-text">工具</span>
    `;
    return button;
  };

  const applyMinimizedPosition = (button) => {
    const position = loadMinimizedPosition();
    if (!position) {
      // 默认位置：右边缘
      snapToEdge(button, false);
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const buttonHeight = button.offsetHeight || 48;
    const margin = 16;

    // 新格式：edge + top
    if (position.edge && typeof position.top === "number") {
      let top = position.top;

      // 确保 top 在可视区域内
      if (top < margin) {
        top = margin;
      } else if (top + buttonHeight > viewportHeight - margin) {
        top = viewportHeight - buttonHeight - margin;
      }

      if (position.edge === 'left') {
        button.style.left = `${margin}px`;
        button.style.right = 'auto';
      } else {
        button.style.left = 'auto';
        button.style.right = `${margin}px`;
      }
      button.style.top = `${top}px`;
      button.style.bottom = 'auto';
      return;
    }

    // 兼容旧格式：left + top（迁移到新格式）
    if (typeof position.left === "number" && typeof position.top === "number") {
      let top = position.top;

      // 确保 top 在可视区域内
      if (top < margin) {
        top = margin;
      } else if (top + buttonHeight > viewportHeight - margin) {
        top = viewportHeight - buttonHeight - margin;
      }

      // 判断应该贴哪个边
      const centerX = position.left + 24; // 按钮宽度的一半
      const edge = centerX <= viewportWidth / 2 ? 'left' : 'right';

      if (edge === 'left') {
        button.style.left = `${margin}px`;
        button.style.right = 'auto';
      } else {
        button.style.left = 'auto';
        button.style.right = `${margin}px`;
      }
      button.style.top = `${top}px`;
      button.style.bottom = 'auto';

      // 保存为新格式
      saveMinimizedPosition({ edge, top });
    }
  };

  const ensureMinimizedButton = () => {
    const existingButton = document.getElementById(MINIMIZED_ID);
    if (existingButton) {
      return existingButton;
    }

    if (!document.body) {
      return null;
    }

    const button = buildMinimizedButton();
    document.body.appendChild(button);
    applyMinimizedPosition(button);
    enableDrag(button);
    syncToolkitTheme();
    return button;
  };

  const minimizeToolbar = () => {
    const toolbar = document.getElementById(TOOLKIT_ID);
    const minimized = ensureMinimizedButton();
    if (!toolbar || !minimized) {
      return;
    }
    toolbar.classList.add("is-hidden");
    minimized.classList.add("is-visible");
    state.isMinimized = true;
  };

  const expandToolbar = () => {
    const toolbar = document.getElementById(TOOLKIT_ID);
    const minimized = document.getElementById(MINIMIZED_ID);
    if (!toolbar || !minimized) {
      return;
    }
    toolbar.classList.remove("is-hidden");
    minimized.classList.remove("is-visible");
    state.isMinimized = false;
  };

  const enableDrag = (button) => {
    const DRAG_THRESHOLD = 5; // 拖拽阈值：超过5px才判定为拖拽
    let isDragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onMouseMove = (event) => {
      if (!isDragging) {
        return;
      }

      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;

      // 只有超过阈值才判定为拖拽
      if (!moved) {
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (distance < DRAG_THRESHOLD) {
          return; // 未超过阈值，不算拖拽
        }
        moved = true; // 超过阈值，标记为拖拽
      }

      const nextLeft = startLeft + deltaX;
      const nextTop = startTop + deltaY;

      button.style.left = `${nextLeft}px`;
      button.style.top = `${nextTop}px`;
      button.style.right = "auto";
      button.style.bottom = "auto";
    };

    const onMouseUp = () => {
      if (!isDragging) {
        return;
      }
      isDragging = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      // 只有实际拖动了才贴合边缘
      if (moved) {
        snapToEdge(button, true);
      }

      setTimeout(() => {
        moved = false;
      }, 0);
    };

    button.addEventListener("mousedown", (event) => {
      if (event.button !== 0) {
        return;
      }
      isDragging = true;
      moved = false;
      const rect = button.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      startX = event.clientX;
      startY = event.clientY;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });

    button.addEventListener("click", () => {
      if (moved) {
        return;
      }
      expandToolbar();
    });
  };
  const attachToolbar = () => {
    if (document.getElementById(TOOLKIT_ID)) {
      return;
    }
    if (!document.body) {
      return;
    }
    observeThemeOnBodyIfNeeded();
    const toolbar = buildToolbar();
    document.body.appendChild(toolbar);
    ensureMinimizedButton();
    syncToolkitTheme();
  };

  // 标志位：避免重复添加 resize 监听器
  let resizeListenerAdded = false;

  const setupResizeListener = () => {
    if (resizeListenerAdded) return;
    resizeListenerAdded = true;

    window.addEventListener('resize', () => {
      const btn = document.getElementById(MINIMIZED_ID);
      if (btn && btn.classList.contains('is-visible')) {
        ensureButtonVisible(btn);
      }
    });
  };

  setupThemeSync();
  attachToolbar();
  setupResizeListener();
  updateStatus(`已识别平台：${platform.label}。`, "info");
  if (platform.id === "gemini") {
    void ensurePageHookInjected().catch((error) => {
      console.warn("[AI Toolkit] Gemini page hook bootstrap failed.", error);
    });
  }

  const observer = new MutationObserver(() => {
    const toolbar = document.getElementById(TOOLKIT_ID);
    const minimizedButton = document.getElementById(MINIMIZED_ID);
    const promptModal = document.getElementById(PROMPT_MODAL_ID);

    if (!toolbar) {
      attachToolbar();
      observeThemeOnBodyIfNeeded();
      syncToolkitTheme();
      return;
    }

    if (!minimizedButton) {
      ensureMinimizedButton();
    }

    if (promptState.isOpen && !promptModal) {
      const restoredModal = ensurePromptModal();
      if (restoredModal) {
        restoredModal.classList.add("is-visible");
        renderPromptList();
      }
    }

    observeThemeOnBodyIfNeeded();
    syncToolkitTheme();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
