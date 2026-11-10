// Run on the VM: node scripts/check-vox-chat.mjs http://127.0.0.1:8081/api/
// Sends one short regular-chat request using the server's existing credentials.
const base = process.argv[2];
if (!base) throw new Error("Supply the API base URL, including /api/, as the first argument.");
const url = new URL("chat", base.endsWith("/") ? base : `${base}/`);
const start = performance.now();
const response = await fetch(url, {
  method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Reply in one short sentence confirming you are ready to help." }],
    clientMemoryProvided: true,
  }), signal: AbortSignal.timeout(30000),
});
if (!response.ok) throw new Error(`Chat HTTP ${response.status}`);
let buffer = "", first = false, content = "";
const decoder = new TextDecoder();
for await (const chunk of response.body) {
  buffer += decoder.decode(chunk, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") continue;
    const event = JSON.parse(raw);
    if (event.error) throw new Error(event.error);
    if (event.content) {
      if (!first) { console.log(`First text: ${Math.round(performance.now() - start)} ms`); first = true; }
      content += event.content;
    }
  }
}
if (!content.trim()) throw new Error("The API returned no answer.");
console.log(`Completed: ${Math.round(performance.now() - start)} ms`);
console.log(content);
