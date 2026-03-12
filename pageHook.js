(() => {
  const PAGE_HOOK_NAMESPACE = "chatgpt-toolkit-page";
  const REQUEST_TYPE = `${PAGE_HOOK_NAMESPACE}:request`;
  const RESPONSE_TYPE = `${PAGE_HOOK_NAMESPACE}:response`;
  const READ_CHAT_RPC_ID = "hNvQHb";
  const INITIAL_READ_LIMIT = 1000;
  const MAX_READ_LIMIT = 16000;
  const READ_TIME_BUDGET_MS = 12000;

  if (window.__CHATGPT_TOOLKIT_PAGE_HOOK_READY__) {
    return;
  }
  window.__CHATGPT_TOOLKIT_PAGE_HOOK_READY__ = true;

  const normalizeText = (value) =>
    typeof value === "string"
      ? value
        .replace(/\r\n/g, "\n")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
      : "";

  const isIdentifierLike = (value) => {
    const text = normalizeText(value);
    if (!text) {
      return false;
    }

    if (/^(c|r|rc)_[A-Za-z0-9_-]+$/.test(text)) {
      return true;
    }

    if (/^(c|r|rc)_[A-Za-z0-9_-]+(?:[\s,|]+(c|r|rc)_[A-Za-z0-9_-]+)+$/.test(text)) {
      return true;
    }

    return false;
  };

  const sanitizeMessageText = (role, value) => {
    const text = normalizeText(value);
    if (!text) {
      return "";
    }

    if (isIdentifierLike(text)) {
      return "";
    }

    if (role === "assistant" && /^([A-Za-z0-9_-]{16,}|true|false|null)$/.test(text)) {
      return "";
    }

    return text;
  };

  const safeJsonParse = (value) => {
    if (typeof value !== "string") {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  };

  const deepJsonParse = (value, maxDepth = 4) => {
    let current = value;

    for (let depth = 0; depth < maxDepth && typeof current === "string"; depth += 1) {
      const parsed = safeJsonParse(current);
      if (parsed === null) {
        break;
      }
      current = parsed;
    }

    return current;
  };

  const getGeminiAtToken = () => {
    const input = document.querySelector('input[name="at"]');
    if (input instanceof HTMLInputElement && input.value) {
      return input.value;
    }

    if (window.WIZ_global_data && typeof window.WIZ_global_data.SNlM0e === "string") {
      return window.WIZ_global_data.SNlM0e;
    }

    return "";
  };

  const getRouteFromLocation = () => {
    const path = window.location.pathname || "";

    let match = path.match(/^\/u\/(\d+)\/app\/([^/?#]+)/);
    if (match) {
      return {
        basePrefix: `/u/${match[1]}`,
        sourcePath: `/u/${match[1]}/app/${match[2]}`,
        chatId: match[2],
      };
    }

    match = path.match(/^\/app\/([^/?#]+)/);
    if (match) {
      return {
        basePrefix: "",
        sourcePath: `/app/${match[1]}`,
        chatId: match[1],
      };
    }

    match = path.match(/^\/u\/(\d+)\/gem\/([^/]+)\/([^/?#]+)/);
    if (match) {
      return {
        basePrefix: `/u/${match[1]}`,
        sourcePath: `/u/${match[1]}/gem/${match[2]}/${match[3]}`,
        chatId: match[3],
      };
    }

    match = path.match(/^\/gem\/([^/]+)\/([^/?#]+)/);
    if (match) {
      return {
        basePrefix: "",
        sourcePath: `/gem/${match[1]}/${match[2]}`,
        chatId: match[2],
      };
    }

    return null;
  };

  const normalizeConversationId = (value) => {
    const text = normalizeText(value);
    if (!text) {
      return "";
    }
    return text.startsWith("c_") ? text : `c_${text}`;
  };

  const getBatchUrl = (route) =>
    `${route.basePrefix}/_/BardChatUi/data/batchexecute` +
    `?rpcids=${READ_CHAT_RPC_ID}` +
    `&source-path=${encodeURIComponent(route.sourcePath)}` +
    `&hl=${encodeURIComponent(document.documentElement.lang || navigator.language || "en")}` +
    "&rt=c";

  const parseJsonArrayAt = (text, startIndex) => {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = startIndex; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "[") {
        depth += 1;
        continue;
      }

      if (char === "]") {
        depth -= 1;
        if (depth === 0) {
          return safeJsonParse(text.slice(startIndex, index + 1));
        }
      }
    }

    return null;
  };

  const extractFramesByTokenSearch = (rawText) => {
    const matches = [];
    const token = `["wrb.fr","${READ_CHAT_RPC_ID}"`;
    let searchIndex = 0;

    while (searchIndex < rawText.length) {
      const matchIndex = rawText.indexOf(token, searchIndex);
      if (matchIndex === -1) {
        break;
      }

      const parsed = parseJsonArrayAt(rawText, matchIndex);
      if (Array.isArray(parsed) && parsed[0] === "wrb.fr" && parsed[1] === READ_CHAT_RPC_ID) {
        matches.push(parsed);
      }

      searchIndex = matchIndex + token.length;
    }

    return matches;
  };

  const extractPayloadCandidatesFromEntry = (entryPayload) => {
    const parsed = deepJsonParse(entryPayload, 5);
    const candidates = [];
    const seen = new WeakSet();

    const pushCandidate = (value) => {
      if (!Array.isArray(value) || seen.has(value)) {
        return;
      }
      seen.add(value);
      candidates.push(value);
    };

    pushCandidate(parsed);
    pushCandidate(parsed?.[0]);
    pushCandidate(parsed?.[0]?.[0]);
    pushCandidate(parsed?.[0]?.[1]);
    pushCandidate(parsed?.[0]?.[2]);
    pushCandidate(parsed?.[0]?.[0]?.[1]);
    pushCandidate(parsed?.[0]?.[0]?.[2]);
    pushCandidate(parsed?.[0]?.[0]?.[1]?.[0]);
    pushCandidate(parsed?.[0]?.[1]?.[0]);
    pushCandidate(parsed?.[0]?.[2]?.[0]);

    return candidates;
  };

  const parseBatchExecute = (rawText) => {
    const lines = String(rawText || "")
      .replace(/^\)\]\}'\n?/, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const payloads = [];

    lines.forEach((line) => {
      if (/^\d+$/.test(line)) {
        return;
      }

      const segment = safeJsonParse(line);
      if (!Array.isArray(segment)) {
        return;
      }

      segment.forEach((entry) => {
        if (!Array.isArray(entry) || entry[0] !== "wrb.fr" || entry[1] !== READ_CHAT_RPC_ID) {
          return;
        }

        extractPayloadCandidatesFromEntry(entry[2]).forEach((payload) => {
          payloads.push(payload);
        });
      });
    });

    if (payloads.length === 0) {
      extractFramesByTokenSearch(String(rawText || ""))
        .forEach((entry) => {
          extractPayloadCandidatesFromEntry(entry[2]).forEach((payload) => {
            payloads.push(payload);
          });
        });
    }

    return payloads;
  };

  const detectBlock = (node) => {
    if (!Array.isArray(node)) {
      return null;
    }

    const userParts = Array.isArray(node[0]) ? node[0].filter((part) => typeof part === "string") : [];
    const userKind = node[1];
    const userText = (userKind === 1 || userKind === 2) ? sanitizeMessageText("user", userParts.join("\n")) : "";

    const assistantText =
      Array.isArray(node[1]) && typeof node[1][0] === "string"
        ? sanitizeMessageText("assistant", node[1][0])
        : "";

    const thoughts =
      Array.isArray(node[2]) && typeof node[2][0] === "string"
        ? sanitizeMessageText("assistant", node[2][0])
        : "";

    const timestamp =
      Number.isFinite(Number(node[4]))
        ? Number(node[4])
        : Number.isFinite(Number(node[5]))
          ? Number(node[5])
          : 0;

    if (!userText && !assistantText && !thoughts) {
      return null;
    }

    return {
      timestamp,
      userText,
      assistantText,
      thoughts,
    };
  };

  const extractBlocksFromTree = (root) => {
    const blocks = [];
    const seen = new WeakSet();

    const walk = (node) => {
      if (!Array.isArray(node) || seen.has(node)) {
        return;
      }
      seen.add(node);

      const block = detectBlock(node);
      if (block) {
        blocks.push(block);
      }

      node.forEach((child) => {
        if (Array.isArray(child)) {
          walk(child);
        }
      });
    };

    walk(root);
    return blocks;
  };

  const blocksToMessages = (blocks) => {
    // Gemini 的会话树通常按“新到旧”返回，且当前解析到的时间位并不稳定，
    // 直接按遍历结果反转更接近真实的对话先后顺序。
    const orderedBlocks = [...blocks].reverse();

    const messages = [];

    orderedBlocks.forEach((block) => {
      if (block.userText) {
        messages.push({
          role: "user",
          text: block.userText,
        });
      }

      const assistantMessage = block.assistantText || block.thoughts;
      if (assistantMessage) {
        messages.push({
          role: "assistant",
          text: assistantMessage,
        });
      }
    });

    return messages;
  };

  const dedupeMessages = (messages) => {
    const result = [];

    messages.forEach((message) => {
      const role = message?.role === "user" ? "user" : "assistant";
      const text = sanitizeMessageText(role, message?.text);
      if (!text) {
        return;
      }

      const previous = result[result.length - 1];
      if (previous && previous.role === role && previous.text === text) {
        return;
      }

      result.push({
        role,
        text,
      });
    });

    return result;
  };

  const normalizeConversationRoleOrder = (messages) => {
    if (!Array.isArray(messages) || messages.length < 2) {
      return Array.isArray(messages) ? messages : [];
    }

    let reversedPairs = 0;
    let forwardPairs = 0;
    let mixedPairs = 0;

    for (let index = 0; index < messages.length - 1; index += 2) {
      const firstRole = messages[index]?.role;
      const secondRole = messages[index + 1]?.role;

      if (firstRole === "assistant" && secondRole === "user") {
        reversedPairs += 1;
        continue;
      }

      if (firstRole === "user" && secondRole === "assistant") {
        forwardPairs += 1;
        continue;
      }

      mixedPairs += 1;
    }

    if (reversedPairs === 0 || reversedPairs < forwardPairs || messages[0]?.role !== "assistant") {
      return messages;
    }

    if (forwardPairs > 0 && reversedPairs < forwardPairs + mixedPairs) {
      return messages;
    }

    const normalized = [];

    for (let index = 0; index < messages.length; index += 2) {
      const first = messages[index];
      const second = messages[index + 1];

      if (first?.role === "assistant" && second?.role === "user") {
        normalized.push(second, first);
        continue;
      }

      if (first) {
        normalized.push(first);
      }

      if (second) {
        normalized.push(second);
      }
    }

    return normalized;
  };

  const scoreMessages = (messages) => {
    let alternationScore = 0;
    let suspiciousPenalty = 0;
    for (let index = 1; index < messages.length; index += 1) {
      if (messages[index].role !== messages[index - 1].role) {
        alternationScore += 1;
      }
    }

    messages.forEach((message) => {
      if (isIdentifierLike(message.text)) {
        suspiciousPenalty += 5000;
      }
    });

    return (
      (messages.length * 1000) +
      (alternationScore * 100) +
      messages.reduce((sum, message) => sum + Math.min(message.text.length, 500), 0) -
      suspiciousPenalty
    );
  };

  const extractMessagesFromPayload = (payload) => {
    const candidates = [];
    const seen = new WeakSet();

    const pushCandidate = (node) => {
      if (!Array.isArray(node) || seen.has(node)) {
        return;
      }
      seen.add(node);

      const messages = normalizeConversationRoleOrder(
        dedupeMessages(blocksToMessages(extractBlocksFromTree(node)))
      );
      if (messages.length > 0) {
        candidates.push(messages);
      }
    };

    pushCandidate(payload?.[0]?.[0]?.[1]?.[0]);
    pushCandidate(payload?.[0]?.[1]?.[0]);
    pushCandidate(payload?.[0]?.[2]?.[0]);
    pushCandidate(payload);

    return candidates.sort((left, right) => scoreMessages(right) - scoreMessages(left))[0] || [];
  };

  const selectBestConversationFromPayloads = (payloads) => {
    const candidates = payloads
      .map((payload) => extractMessagesFromPayload(payload))
      .filter((messages) => messages.length > 0);

    const bestMessages =
      candidates.sort((left, right) => scoreMessages(right) - scoreMessages(left))[0] || [];

    return {
      messages: bestMessages,
      candidateCount: candidates.length,
    };
  };

  const fetchReadChat = async ({ route, conversationId, limit, atToken }) => {
    const innerArgs = [conversationId, limit, null, 1, [1], [4], null, 1];
    const body = new URLSearchParams();
    body.set(
      "f.req",
      JSON.stringify([
        [[READ_CHAT_RPC_ID, JSON.stringify(innerArgs), null, "generic"]],
      ])
    );
    body.set("at", atToken);

    const response = await fetch(getBatchUrl(route), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "X-Same-Domain": "1",
      },
      body: `${body.toString()}&`,
    });

    const rawText = await response.text();
    if (!response.ok) {
      const snippet = normalizeText(rawText).slice(0, 180);
      throw new Error(`Gemini read_chat request failed with ${response.status}${snippet ? `: ${snippet}` : ""}`);
    }

    return rawText;
  };

  const fetchGeminiConversationMessages = async ({ conversationId }) => {
    const route = getRouteFromLocation();
    if (!route?.chatId) {
      throw new Error("Gemini route not detected.");
    }

    const normalizedConversationId = normalizeConversationId(conversationId || route.chatId);
    if (!normalizedConversationId) {
      throw new Error("Gemini conversation id is missing.");
    }

    const atToken = getGeminiAtToken();
    if (!atToken) {
      throw new Error("Gemini at token is missing.");
    }

    let limit = INITIAL_READ_LIMIT;
    let previousCount = -1;
    let bestMessages = [];
    let debug = {
      payloadCount: 0,
      limit,
    };
    let lastRawHead = "";
    const startedAt = Date.now();

    while (Date.now() - startedAt < READ_TIME_BUDGET_MS && limit <= MAX_READ_LIMIT) {
      const rawText = await fetchReadChat({
        route,
        conversationId: normalizedConversationId,
        limit,
        atToken,
      });
      lastRawHead = normalizeText(String(rawText || "").slice(0, 220));

      const payloads = parseBatchExecute(rawText);
      const selection = selectBestConversationFromPayloads(payloads);
      const messages = normalizeConversationRoleOrder(dedupeMessages(selection.messages));

      debug = {
        payloadCount: payloads.length,
        candidateCount: selection.candidateCount,
        limit,
      };

      if (messages.length > bestMessages.length) {
        bestMessages = messages;
      }

      if (messages.length === 0 || messages.length <= previousCount) {
        break;
      }

      previousCount = messages.length;
      limit *= 2;
    }

    if (bestMessages.length === 0) {
      throw new Error(
        `Gemini conversation parser returned no messages. payloadCount=${debug.payloadCount} candidateCount=${debug.candidateCount || 0} limit=${debug.limit}${lastRawHead ? ` rawHead=${lastRawHead}` : ""}`
      );
    }

    return {
      messages: bestMessages,
      debug,
    };
  };

  const postSuccess = (requestId, payload) => {
    window.postMessage(
      {
        source: PAGE_HOOK_NAMESPACE,
        type: RESPONSE_TYPE,
        requestId,
        ok: true,
        payload,
      },
      "*"
    );
  };

  const postFailure = (requestId, error) => {
    window.postMessage(
      {
        source: PAGE_HOOK_NAMESPACE,
        type: RESPONSE_TYPE,
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error || "Unknown error"),
      },
      "*"
    );
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }

    const data = event.data;
    if (
      !data ||
      data.source !== PAGE_HOOK_NAMESPACE ||
      data.type !== REQUEST_TYPE ||
      !data.requestId ||
      data.payload?.action !== "gemini-export"
    ) {
      return;
    }

    void fetchGeminiConversationMessages(data.payload)
      .then((result) => {
        postSuccess(data.requestId, result);
      })
      .catch((error) => {
        postFailure(data.requestId, error);
      });
  });
})();
