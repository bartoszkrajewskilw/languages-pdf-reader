import type { Settings } from './settings';

export interface Translation {
  baseForm: string;
  partOfSpeech: string;
  meaning: string;
  sentenceTranslation: string;
}

const API_URL = 'https://api.anthropic.com/v1/messages';

// Translate a word *as used in its sentence* — not a generic dictionary dump.
// Calls the Claude API directly from the browser (key stays on-device).
export async function translateWord(
  word: string,
  sentence: string,
  sourceLang: string,
  settings: Settings,
): Promise<Translation> {
  if (!settings.apiKey) {
    throw new Error('No API key set. Open Settings and paste your Claude API key.');
  }

  const target = settings.defaultTargetLang || 'Polski';
  const src = sourceLang ? `The text is in ${sourceLang}.` : 'Detect the language of the text.';

  const system =
    `You are a precise language-learning assistant. ${src} ` +
    `The learner's language is ${target}. Given a WORD and the SENTENCE it appears in, ` +
    `explain the word AS USED IN THAT SENTENCE — its meaning in this specific context, ` +
    `not an exhaustive dictionary entry. Respond with ONLY a JSON object, no prose, no code ` +
    `fences, with exactly these keys: "baseForm" (dictionary/lemma form of the word), ` +
    `"partOfSpeech", "meaning" (the contextual meaning written in ${target}), ` +
    `"sentenceTranslation" (the whole sentence translated into ${target}). ` +
    `Write "meaning" and "sentenceTranslation" in ${target}.`;

  const userMsg = `WORD: ${word}\nSENTENCE: ${sentence}`;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      // Required to call the API directly from a browser.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Claude API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text: string = (data?.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('')
    .trim();

  return parseTranslation(text);
}

function parseTranslation(text: string): Translation {
  // Be forgiving: strip code fences and pull out the first JSON object.
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  const json = match ? match[0] : cleaned;
  let parsed: Partial<Translation>;
  try {
    parsed = JSON.parse(json);
  } catch {
    // Fall back to treating the whole response as the meaning.
    return { baseForm: '', partOfSpeech: '', meaning: text, sentenceTranslation: '' };
  }
  return {
    baseForm: parsed.baseForm ?? '',
    partOfSpeech: parsed.partOfSpeech ?? '',
    meaning: parsed.meaning ?? '',
    sentenceTranslation: parsed.sentenceTranslation ?? '',
  };
}
