/*
 * script.js
 * Handles UI interactions for the L'Oréal Smart Product Advisor.
 * Captures user input, preserves conversation history & user details across turns,
 * routes every API request through the deployed Cloudflare Worker, and renders
 * distinct conversational bubbles for user and assistant messages.
 */

// 1. Grab DOM elements
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const resetBtn = document.getElementById("resetBtn");
const chatWindow = document.getElementById("chatWindow");
const sessionContextLabel = document.getElementById("sessionContextLabel");
const quickPromptsContainer = document.querySelector(".quick-prompts");
const infoDialog = document.getElementById("infoDialog");
const infoDialogTitle = document.getElementById("infoDialogTitle");
const infoDialogBody = document.getElementById("infoDialogBody");
const closeDialogBtn = document.getElementById("closeDialogBtn");
const footerButtons = document.querySelectorAll(".footer-link-btn");

// 2. Access helper functions loaded from advisor.js
const {
  QUICK_PROMPTS,
  summarizeConversationContext,
  buildRequestMessages,
  parseFormattedSegments,
  extractAssistantReply,
} = globalThis.LorealAdvisor;

// Live Cloudflare Worker URL for all OpenAI Chat Completions requests
const WORKER_URL = "https://loreal-worker.cbarco21.workers.dev/";

// Session storage key so conversation context survives accidental page reloads
const HISTORY_STORAGE_KEY = "loreal_advisor_history_v1";

// 3. Track conversation history for multi-turn context
let conversationHistory = [];
let isSending = false;

// Initial greeting shown on first load and after resetting the chat
const INITIAL_GREETING =
  "Welcome to L’Oréal Smart Product Advisor. Ask me about skincare, haircare, makeup, or fragrance—or select a topic below to begin.";

// Informational copy for the footer links
const FOOTER_INFO = {
  privacy: {
    title: "Privacy Policy",
    body: "Messages entered in this Smart Product Advisor are used only to generate beauty product and routine recommendations during your active browser session.",
  },
  terms: {
    title: "Terms of Use",
    body: "Product and routine recommendations are provided for informational and cosmetic guidance purposes. Always review ingredient labels for individual sensitivities.",
  },
  contact: {
    title: "Contact L’Oréal Advisor",
    body: "For personalized product shade matching or salon locator inquiries, visit your regional L’Oréal Paris or L’Oréal Luxe boutique concierge.",
  },
};

// Format a subtle local timestamp for message metadata
function formatMessageTime(isoOrDate = new Date()) {
  const date = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// 4. Save and restore conversation context in sessionStorage
function saveConversationHistory() {
  try {
    sessionStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(conversationHistory)
    );
  } catch {
    // Ignore storage quota/availability issues
  }
}

function loadConversationHistory() {
  try {
    const raw = sessionStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry) =>
        entry &&
        (entry.role === "user" || entry.role === "assistant") &&
        typeof entry.content === "string" &&
        entry.content.trim().length > 0
    );
  } catch {
    return [];
  }
}

// Update the quiet consultation header text with the user's name if introduced
function updateSessionContextLabel() {
  if (!sessionContextLabel) {
    return;
  }
  const { userName } = summarizeConversationContext(conversationHistory);
  sessionContextLabel.textContent = userName
    ? `Consultation for ${userName}`
    : "Tailored Routine Guidance";
}

// Safely render **bold** and _italic_ spans inside a message bubble without innerHTML
function renderBubbleContent(bubble, text) {
  const segments = parseFormattedSegments(text);
  if (segments.length === 0) {
    bubble.textContent = text;
    return;
  }

  for (const seg of segments) {
    if (seg.type === "strong") {
      const strong = document.createElement("strong");
      strong.textContent = seg.value;
      bubble.appendChild(strong);
    } else if (seg.type === "em") {
      const em = document.createElement("em");
      em.textContent = seg.value;
      bubble.appendChild(em);
    } else {
      bubble.appendChild(document.createTextNode(seg.value));
    }
  }
}

// 5. Append a distinct conversational bubble row to the chat window
function appendMessage(role, text, options = {}) {
  const { isLoading = false, timestamp = null } = options;
  const isUser = role === "user";

  const msgWrapper = document.createElement("div");
  msgWrapper.className = `msg ${isUser ? "user" : "ai"}${
    isLoading ? " loading" : ""
  }`;

  if (!isUser) {
    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = "L’";
    msgWrapper.appendChild(avatar);
  }

  const contentColumn = document.createElement("div");
  contentColumn.className = "msg-content";

  const metaRow = document.createElement("div");
  metaRow.className = "msg-meta";

  const roleLabel = document.createElement("span");
  roleLabel.className = "msg-role";
  const { userName } = summarizeConversationContext(conversationHistory);
  roleLabel.textContent = isUser ? userName || "You" : "L’Oréal Advisor";
  metaRow.appendChild(roleLabel);

  if (timestamp && !isLoading) {
    const dot = document.createElement("span");
    dot.setAttribute("aria-hidden", "true");
    dot.textContent = "·";
    const timeEl = document.createElement("span");
    timeEl.className = "msg-time";
    timeEl.textContent = formatMessageTime(timestamp);
    metaRow.appendChild(dot);
    metaRow.appendChild(timeEl);
  }

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";

  if (isLoading) {
    bubble.setAttribute("aria-label", "L’Oréal Advisor is typing");
    const dots = document.createElement("span");
    dots.className = "typing-indicator";
    for (let i = 0; i < 3; i += 1) {
      const dot = document.createElement("span");
      dot.className = "typing-dot";
      dots.appendChild(dot);
    }
    bubble.appendChild(dots);
  } else {
    renderBubbleContent(bubble, text);
  }

  contentColumn.appendChild(metaRow);
  contentColumn.appendChild(bubble);
  msgWrapper.appendChild(contentColumn);
  chatWindow.appendChild(msgWrapper);

  // Scroll smoothly to the newest message
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return msgWrapper;
}

// 6. Initialize or reset the chat window
function renderStoredConversation() {
  conversationHistory = loadConversationHistory();
  chatWindow.innerHTML = "";
  appendMessage("assistant", INITIAL_GREETING);

  for (const entry of conversationHistory) {
    appendMessage(entry.role, entry.content, {
      timestamp: entry.timestamp || null,
    });
  }

  updateSessionContextLabel();
}

function resetConversation(shouldFocus = false) {
  conversationHistory = [];
  saveConversationHistory();
  chatWindow.innerHTML = "";
  appendMessage("assistant", INITIAL_GREETING);
  updateSessionContextLabel();
  userInput.value = "";
  userInput.classList.remove("input-error");
  if (shouldFocus) {
    userInput.focus();
  }
}

// 7. Render one-click quick prompt buttons
function renderQuickPrompts() {
  quickPromptsContainer.innerHTML = "";

  for (const item of QUICK_PROMPTS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-prompt-btn";
    button.textContent = item.label;
    button.addEventListener("click", () => {
      submitQuestion(item.prompt);
    });
    quickPromptsContainer.appendChild(button);
  }
}

// 8. Send every chat request (with tracked conversation context) through the Cloudflare Worker
async function fetchAdvisorResponse(priorTurns, userText) {
  const messages = buildRequestMessages(priorTurns, userText);

  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1",
      messages,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const detail =
      data?.error?.message ||
      (typeof data?.error === "string" ? data.error : null) ||
      `Advisor service returned status ${response.status}`;
    throw new Error(detail);
  }

  // Extract data.choices[0].message.content
  return extractAssistantReply(data);
}

// 9. Capture user input, send the Chat Completions request, and display the assistant reply
async function submitQuestion(rawText) {
  if (isSending) {
    return;
  }

  const cleanText = rawText.trim();
  if (!cleanText) {
    userInput.classList.add("input-error");
    userInput.focus();
    return;
  }

  userInput.classList.remove("input-error");
  isSending = true;
  sendBtn.disabled = true;

  const userTime = new Date().toISOString();

  // Save user turn first so context label/name can render right away if introduced
  conversationHistory.push({
    role: "user",
    content: cleanText,
    timestamp: userTime,
  });
  saveConversationHistory();
  updateSessionContextLabel();

  // Display the user's message bubble immediately
  appendMessage("user", cleanText, { timestamp: userTime });
  userInput.value = "";

  // Show an animated typing bubble while awaiting the API response
  const loadingNode = appendMessage("assistant", "", { isLoading: true });

  try {
    // Pass prior turns (all except the just-pushed user turn) + current userText
    const priorTurns = conversationHistory.slice(0, -1);
    const reply = await fetchAdvisorResponse(priorTurns, cleanText);
    const replyTime = new Date().toISOString();
    loadingNode.remove();
    appendMessage("assistant", reply, { timestamp: replyTime });

    conversationHistory.push({
      role: "assistant",
      content: reply,
      timestamp: replyTime,
    });
    saveConversationHistory();
  } catch (error) {
    loadingNode.remove();
    appendMessage(
      "assistant",
      "We could not reach the advisor service right now. Please verify your Cloudflare Worker configuration and try again.",
      { timestamp: new Date().toISOString() }
    );
    console.error("Advisor error:", error);
  } finally {
    isSending = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
}

// 10. Wire up form, input, reset, and footer dialog events
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await submitQuestion(userInput.value);
});

userInput.addEventListener("input", () => {
  if (userInput.value.trim().length > 0) {
    userInput.classList.remove("input-error");
  }
});

resetBtn.addEventListener("click", () => {
  resetConversation(true);
});

for (const btn of footerButtons) {
  btn.addEventListener("click", () => {
    const key = btn.getAttribute("data-info");
    const info = FOOTER_INFO[key];
    if (!info) {
      return;
    }
    infoDialogTitle.textContent = info.title;
    infoDialogBody.textContent = info.body;
    infoDialog.showModal();
  });
}

closeDialogBtn.addEventListener("click", () => {
  infoDialog.close();
});

infoDialog.addEventListener("click", (e) => {
  if (e.target === infoDialog) {
    infoDialog.close();
  }
});

// 11. Initialize the advisor and restore any active session conversation on page load
renderQuickPrompts();
renderStoredConversation();
