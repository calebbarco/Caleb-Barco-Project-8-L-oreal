import test from "node:test";
import assert from "node:assert/strict";
import "./advisor.js";

const {
  DEFAULT_WORKER_URL,
  LOREAL_SYSTEM_PROMPT,
  OFF_TOPIC_REFUSAL_MESSAGE,
  isWorkerConfigured,
  extractUserName,
  summarizeConversationContext,
  buildRequestMessages,
  parseFormattedSegments,
  extractAssistantReply,
  getFallbackAdvisorReply,
} = (globalThis as unknown as { LorealAdvisor: any }).LorealAdvisor;

test("parseFormattedSegments tokenizes bold and italic text safely", () => {
  const segments = parseFormattedSegments(
    "Try **Revitalift Serum** for _deep hydration_ today."
  );
  assert.deepEqual(segments, [
    { type: "text", value: "Try " },
    { type: "strong", value: "Revitalift Serum" },
    { type: "text", value: " for " },
    { type: "em", value: "deep hydration" },
    { type: "text", value: " today." },
  ]);
});

test("LOREAL_SYSTEM_PROMPT scopes assistant strictly to L'Oréal products and routines", () => {
  assert.match(LOREAL_SYSTEM_PROMPT, /Do not answer questions unrelated to L’Oréal or beauty/i);
  assert.match(LOREAL_SYSTEM_PROMPT, /politely refuse/i);
  assert.match(LOREAL_SYSTEM_PROMPT, /their name/i);
});

test("isWorkerConfigured rejects default placeholder URL", () => {
  assert.equal(isWorkerConfigured(DEFAULT_WORKER_URL), false);
  assert.equal(isWorkerConfigured(""), false);
  assert.equal(
    isWorkerConfigured("https://loreal-prod.example.workers.dev/"),
    true
  );
});

test("extractUserName detects explicit introductions without false positives", () => {
  assert.equal(extractUserName("Hi, my name is Maya and I have dry skin."), "Maya");
  assert.equal(extractUserName("You can call me Jordan."), "Jordan");
  assert.equal(extractUserName("Hi, I'm Caleb, looking for a serum"), "Caleb");
  assert.equal(extractUserName("I'm looking for a hydrating shampoo"), null);
  assert.equal(extractUserName("I'm dry and need a moisturizer"), null);
});

test("summarizeConversationContext tracks user name and past questions", () => {
  const summary = summarizeConversationContext([
    { role: "user", content: "My name is Elena. What serum helps dry skin?" },
    { role: "assistant", content: "Try Revitalift Hyaluronic Acid Serum." },
    { role: "user", content: "What shampoo pairs well with frizzy hair?" },
  ]);

  assert.equal(summary.userName, "Elena");
  assert.equal(summary.pastQuestions.length, 2);
});

test("buildRequestMessages prepends system prompt with tracked name and prior questions", () => {
  const history = [
    { role: "user", content: "My name is Caleb. Recommend a hydrating cleanser." },
    { role: "assistant", content: "Hello Caleb! Try Revitalift Glycolic Cleanser." },
  ];
  const messages = buildRequestMessages(history, "  And what moisturizer next?  ");

  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /User's name: Caleb\./);
  assert.match(messages[0].content, /Earlier questions in this conversation:/);
  assert.equal(messages.length, 4);
  assert.deepEqual(messages[3], { role: "user", content: "And what moisturizer next?" });
});

test("buildRequestMessages rejects empty or whitespace-only input", () => {
  assert.throws(() => buildRequestMessages([], "   "), /Message cannot be empty/);
});

test("extractAssistantReply reads OpenAI choices[0].message.content", () => {
  const reply = extractAssistantReply({
    choices: [{ message: { content: "  Try Revitalift Serum.  " } }],
  });
  assert.equal(reply, "Try Revitalift Serum.");
});

test("extractAssistantReply throws on malformed payload", () => {
  assert.throws(() => extractAssistantReply({}), /Unexpected response format/);
});

test("getFallbackAdvisorReply returns tailored category recommendations and refuses off-topic queries", () => {
  assert.match(getFallbackAdvisorReply("Should I apply vitamin C before SPF?"), /Hyaluronic Acid/);
  assert.match(getFallbackAdvisorReply("My hair is dry"), /Elvive/);
  assert.match(getFallbackAdvisorReply("Need lipstick and mascara"), /True Match/);
  assert.match(getFallbackAdvisorReply("Evening perfume"), /fragrance/i);
  assert.equal(
    getFallbackAdvisorReply("Write a Python sorting script"),
    OFF_TOPIC_REFUSAL_MESSAGE
  );
  assert.equal(
    getFallbackAdvisorReply("Who won the World Series in 2024?"),
    OFF_TOPIC_REFUSAL_MESSAGE
  );
});
