import test from "node:test";
import assert from "node:assert/strict";
import "./advisor.js";

const {
  DEFAULT_WORKER_URL,
  isWorkerConfigured,
  buildRequestMessages,
  extractAssistantReply,
  getFallbackAdvisorReply,
} = (globalThis as unknown as { LorealAdvisor: any }).LorealAdvisor;

test("isWorkerConfigured rejects default placeholder URL", () => {
  assert.equal(isWorkerConfigured(DEFAULT_WORKER_URL), false);
  assert.equal(isWorkerConfigured(""), false);
  assert.equal(
    isWorkerConfigured("https://loreal-prod.example.workers.dev/"),
    true
  );
});

test("buildRequestMessages prepends system prompt and trims user input", () => {
  const history = [
    { role: "user", content: "Hi" },
    { role: "assistant", content: "Hello! How can I help?" },
  ];
  const messages = buildRequestMessages(history, "  Skincare advice  ");

  assert.equal(messages[0].role, "system");
  assert.equal(messages.length, 4);
  assert.deepEqual(messages[3], { role: "user", content: "Skincare advice" });
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

test("getFallbackAdvisorReply returns tailored category recommendations", () => {
  assert.match(getFallbackAdvisorReply("Recommend skincare"), /Hyaluronic Acid/);
  assert.match(getFallbackAdvisorReply("My hair is dry"), /Elvive/);
  assert.match(getFallbackAdvisorReply("Need lipstick and mascara"), /True Match/);
  assert.match(getFallbackAdvisorReply("Evening perfume"), /fragrance/i);
});
