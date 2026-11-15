/*
 * advisor.js
 * Pure helper functions and L'Oréal product knowledge for the Smart Product Advisor.
 * Written without import/export so it works directly when linked from index.html
 * and can also be tested in Node.js.
 */

// Default placeholder URL from AGENTS.md — replace with your deployed Cloudflare Worker URL
const DEFAULT_WORKER_URL = "https://loreal-chatbot.your-subdomain.workers.dev/";

// System instruction sent to OpenAI so the advisor ONLY answers L'Oréal product, routine, and recommendation questions
const LOREAL_SYSTEM_PROMPT = [
  "You are the L’Oréal Smart Product Advisor.",
  "Only answer questions related to L’Oréal products, beauty routines, and personalized product recommendations across skincare, haircare, makeup, and fragrance.",
  "Ask brief clarifying questions (such as skin type, hair concern, or finish preference) when helpful, and give clear, practical application steps.",
  "If a user asks about anything unrelated to L’Oréal products, beauty routines, or recommendations, politely decline and invite them to ask about L’Oréal skincare, haircare, makeup, or fragrance instead.",
].join(" ");

// Curated starter prompts shown above the chat input
const QUICK_PROMPTS = [
  {
    id: "skincare",
    label: "Hydrating skincare routine",
    prompt: "Can you recommend a simple hydrating morning skincare routine?",
  },
  {
    id: "haircare",
    label: "Dry hair repair",
    prompt: "What L'Oréal haircare products help repair dry or damaged hair?",
  },
  {
    id: "makeup",
    label: "Natural everyday makeup",
    prompt: "Suggest a lightweight everyday complexion and lip look.",
  },
  {
    id: "fragrance",
    label: "Signature fragrance",
    prompt: "Help me choose a signature fragrance for evening wear.",
  },
];

// Check if the user has replaced the placeholder Cloudflare Worker URL with a real endpoint
function isWorkerConfigured(workerUrl) {
  if (typeof workerUrl !== "string") {
    return false;
  }
  const trimmed = workerUrl.trim();
  return (
    trimmed.length > 0 &&
    !trimmed.includes("your-subdomain.workers.dev") &&
    trimmed.startsWith("http")
  );
}

// Build the OpenAI-compatible messages array for the Cloudflare Worker or /api/chat request
function buildRequestMessages(history, userText) {
  const cleanText = typeof userText === "string" ? userText.trim() : "";
  if (!cleanText) {
    throw new Error("Message cannot be empty.");
  }

  const safeHistory = Array.isArray(history) ? history : [];

  return [
    { role: "system", content: LOREAL_SYSTEM_PROMPT },
    ...safeHistory.filter(
      (entry) =>
        entry &&
        (entry.role === "user" || entry.role === "assistant") &&
        typeof entry.content === "string" &&
        entry.content.trim().length > 0
    ),
    { role: "user", content: cleanText },
  ];
}

// Safely extract the assistant's reply from the OpenAI JSON response
function extractAssistantReply(data) {
  if (
    data &&
    Array.isArray(data.choices) &&
    data.choices.length > 0 &&
    data.choices[0].message &&
    typeof data.choices[0].message.content === "string"
  ) {
    return data.choices[0].message.content.trim();
  }
  throw new Error("Unexpected response format from assistant service.");
}

// Provide curated L'Oréal product & routine advice (and polite off-topic redirection) when running without a live API key
function getFallbackAdvisorReply(userText) {
  const query = (userText || "").toLowerCase();

  if (
    query.includes("skin") ||
    query.includes("hydrat") ||
    query.includes("serum") ||
    query.includes("moistur") ||
    query.includes("cleans") ||
    query.includes("spf") ||
    query.includes("sunscreen") ||
    query.includes("acne") ||
    query.includes("wrinkl") ||
    query.includes("anti-aging") ||
    query.includes("glycolic") ||
    query.includes("hyaluronic") ||
    query.includes("retinol") ||
    query.includes("routine")
  ) {
    return [
      "Here is a balanced L'Oréal Paris hydrating morning routine:",
      "1. Cleanse: Revitalift Derm Intensives 3.5% Glycolic Cleanser to gently refresh skin.",
      "2. Treat: Revitalift 1.5% Pure Hyaluronic Acid Serum on damp skin to plump fine lines.",
      "3. Moisturize & Protect: Revitalift Triple Power Day Lotion SPF 30 (or Bright Reveal UV Fluid SPF 50+) as your final step.",
      "Would you like me to tailor this for dry, oily, or sensitive skin?",
    ].join("\n");
  }

  if (
    query.includes("hair") ||
    query.includes("shampoo") ||
    query.includes("conditioner") ||
    query.includes("scalp") ||
    query.includes("damage") ||
    query.includes("frizz") ||
    query.includes("curl") ||
    query.includes("color") ||
    query.includes("elvive")
  ) {
    return [
      "For dry or stressed hair, try this two-step L'Oréal repair pairing:",
      "1. Cleanse & Rebuild: Elvive Total Repair 5 (or Elvive Bond Repair Pre-Shampoo + Shampoo) to reinforce weakened hair fibers.",
      "2. Lock in Moisture: Elvive Hyaluron Plump Wonder Water or Hydrating Conditioner on mid-lengths to ends for 72-hour bounce without heaviness.",
      "Finish with a small amount of Elvive Extraordinary Oil on damp ends before styling.",
    ].join("\n");
  }

  if (
    query.includes("makeup") ||
    query.includes("foundation") ||
    query.includes("concealer") ||
    query.includes("lip") ||
    query.includes("mascara") ||
    query.includes("blush") ||
    query.includes("brow") ||
    query.includes("eyeliner") ||
    query.includes("complexion") ||
    query.includes("cheek")
  ) {
    return [
      "For a luminous, everyday L'Oréal Paris look:",
      "• Complexion: True Match Nude Hyaluronic Tinted Serum for breathable, skin-like coverage.",
      "• Lashes: Telescopic Lift Mascara to lengthen and separate without flaking.",
      "• Lip: Colour Riche Satin Lipstick or Glow Paradise Balm-in-Lipstick for soft color and conditioning.",
      "Share your undertone or finish preference (dewy vs. matte) for exact shade ideas.",
    ].join("\n");
  }

  if (
    query.includes("fragrance") ||
    query.includes("perfume") ||
    query.includes("scent") ||
    query.includes("cologne") ||
    query.includes("parfum") ||
    query.includes("evening")
  ) {
    return [
      "Within the L'Oréal Luxe fragrance portfolio, consider these signature profiles for evening wear:",
      "• Warm Floral & Bold: YSL Libre Eau de Parfum Intense (orange blossom, lavender, warm vanilla).",
      "• Radiant Gourmand: Lancôme La Vie Est Belle (iris, patchouli, spun sugar).",
      "• Modern Woody Amber: Armani My Way Parfum or Maison Margiela Replica Jazz Club for rich depth.",
      "Do you prefer floral, warm vanilla, fresh citrus, or woody notes?",
    ].join("\n");
  }

  if (
    query.includes("l'oréal") ||
    query.includes("loreal") ||
    query.includes("product") ||
    query.includes("recommend") ||
    query.includes("beauty") ||
    query.includes("dry") ||
    query.includes("oily") ||
    query.includes("sensitive") ||
    /^(hi|hello|hey|help)\b/.test(query.trim())
  ) {
    return [
      "I can help you build a personalized L’Oréal routine across skincare, haircare, makeup, or fragrance.",
      "Tell me your primary goal—such as hydration, hair repair, everyday complexion, or choosing a scent—and your skin or hair type for tailored recommendations.",
    ].join("\n");
  }

  return "I’m the L’Oréal Smart Product Advisor, so I can only answer questions related to L’Oréal products, beauty routines, and personalized recommendations. Please ask about skincare, haircare, makeup, or fragrance!";
}

const LorealAdvisor = {
  DEFAULT_WORKER_URL,
  LOREAL_SYSTEM_PROMPT,
  QUICK_PROMPTS,
  isWorkerConfigured,
  buildRequestMessages,
  extractAssistantReply,
  getFallbackAdvisorReply,
};

// Expose globally for script.js in the browser
if (typeof globalThis !== "undefined") {
  globalThis.LorealAdvisor = LorealAdvisor;
}

// Export for Node.js unit tests
if (typeof module !== "undefined" && module.exports) {
  module.exports = LorealAdvisor;
}
