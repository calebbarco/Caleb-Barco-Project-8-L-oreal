/*
 * script.js
 * Handles UI interactions for the L'Oréal Smart Product Advisor.
 * Sends chat messages to the configured Cloudflare Worker URL (if set)
 * or uses curated L'Oréal product guidance when running locally without a worker.
 */

// 1. Grab DOM elements
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const resetBtn = document.getElementById("resetBtn");
const chatWindow = document.getElementById("chatWindow");
const quickPromptsContainer = document.querySelector(".quick-prompts");
const infoDialog = document.getElementById("infoDialog");
const infoDialogTitle = document.getElementById("infoDialogTitle");
const infoDialogBody = document.getElementById("infoDialogBody");
const closeDialogBtn = document.getElementById("closeDialogBtn");
const footerButtons = document.querySelectorAll(".footer-link-btn");

// 2. Access helper functions loaded from advisor.js
const {
  DEFAULT_WORKER_URL,
  QUICK_PROMPTS,
  isWorkerConfigured,
  buildRequestMessages,
  extractAssistantReply,
} = globalThis.LorealAdvisor;

// Replace this with your live Cloudflare Worker URL when deploying with OpenAI
const WORKER_URL = DEFAULT_WORKER_URL;

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
    body: "Messages entered in this Smart Product Advisor are used only to generate beauty product and routine recommendations during your active session.",
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

// 4. Append a styled message row to the chat window
function appendMessage(role, text, extraClass = "") {
  const msgWrapper = document.createElement("div");
  msgWrapper.className = `msg ${role === "user" ? "user" : "ai"}${
    extraClass ? ` ${extraClass}` : ""
  }`;

  const roleLabel = document.createElement("span");
  roleLabel.className = "msg-role";
  roleLabel.textContent = role === "user" ? "You" : "L’Oréal Advisor";

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = text;

  msgWrapper.appendChild(roleLabel);
  msgWrapper.appendChild(bubble);
  chatWindow.appendChild(msgWrapper);

  // Scroll smoothly to the newest message
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return msgWrapper;
}

// 5. Reset the chat window to its initial greeting
function resetConversation(shouldFocus = false) {
  conversationHistory = [];
  chatWindow.innerHTML = "";
  appendMessage("assistant", INITIAL_GREETING);
  userInput.value = "";
  userInput.classList.remove("input-error");
  if (shouldFocus) {
    userInput.focus();
  }
}

// 6. Render one-click quick prompt buttons
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

// 7. Send messages to OpenAI Chat Completions API via our secure server proxy (/api/chat) or Cloudflare Worker
async function fetchAdvisorResponse(userText) {
  const messages = buildRequestMessages(conversationHistory, userText);

  // Use the deployed Cloudflare Worker if configured; otherwise route safely through /api/chat
  const endpoint = isWorkerConfigured(WORKER_URL) ? WORKER_URL : "/api/chat";

  // Standard OpenAI Chat Completions POST payload (model + messages)
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1",
      messages,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const detail = data?.error || `Advisor service returned status ${response.status}`;
    throw new Error(detail);
  }

  // Extract data.choices[0].message.content
  return extractAssistantReply(data);
}

// 8. Capture user input, send the Chat Completions request, and display the assistant reply
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

  // Display the user's message immediately in the chat window
  appendMessage("user", cleanText);
  userInput.value = "";

  // Show a temporary thinking message while awaiting the API response
  const loadingNode = appendMessage(
    "assistant",
    "Curating your L’Oréal recommendation…",
    "loading"
  );

  try {
    const reply = await fetchAdvisorResponse(cleanText);
    loadingNode.remove();
    appendMessage("assistant", reply);

    // Save both turns into conversation history for follow-up context
    conversationHistory.push({ role: "user", content: cleanText });
    conversationHistory.push({ role: "assistant", content: reply });
  } catch (error) {
    loadingNode.remove();
    appendMessage(
      "assistant",
      "We could not reach the advisor service right now. Please verify your API configuration and try again."
    );
    console.error("Advisor error:", error);
  } finally {
    isSending = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
}

// 9. Wire up form, input, reset, and footer dialog events
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

// 10. Initialize the advisor on page load
renderQuickPrompts();
resetConversation();
