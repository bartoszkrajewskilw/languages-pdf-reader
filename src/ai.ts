import type { Settings } from "./settings";

const API_URL = "https://api.openai.com/v1/chat/completions";

// Translate a single WORD as used in its SENTENCE. The sentence is context only
// — it is not translated. Returns just the translation (one word, rarely two).
// Calls the OpenAI Chat Completions API directly from the browser.
export async function translateWord(
  word: string,
  sentence: string,
  _sourceLang: string,
  settings: Settings,
): Promise<string> {
  if (!settings.apiKey) {
    throw new Error("No API key set. Add VITE_OPENAI_API_KEY to .env.");
  }

  const prompt =
    `Co oznacza słowo „${word}" w zdaniu „${sentence}"? ` +
    `Odpowiedz jednym lub dwoma słowami, bez wyjaśnień.`;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      max_completion_tokens: 1000,
      reasoning_effort: "low",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  // Strip surrounding quotes/whitespace and keep it to the translation itself.
  return text
    .trim()
    .replace(/^["'“”„«»]+|["'“”„«».]+$/g, "")
    .trim();
}
