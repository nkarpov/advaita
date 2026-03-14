const MODEL_QUERY_STOP_PATTERNS = [
  /\s+[,.!?;:]\s*$/,
  /\s+then\s+/i,
  /\s+and\s+then\s+/i,
  /\s+but\s+/i,
];

const MODEL_QUERY_PREFIX_PATTERNS = [
  /\b(?:using|with|w\/|w)\s+(.+)$/i,
  /\buse\s+(.+)$/i,
  /^\s*\/model\s+(.+)$/i,
];

function trimModelQuery(raw: string): string {
  let text = raw.trim();
  for (const pattern of MODEL_QUERY_STOP_PATTERNS) {
    const match = text.match(pattern);
    if (match?.index !== undefined && match.index > 0) {
      text = text.slice(0, match.index).trim();
    }
  }
  return text.replace(/^the\s+model\s+/i, "").trim();
}

export function extractRequestedModelQuery(text: string): string | null {
  for (const pattern of MODEL_QUERY_PREFIX_PATTERNS) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const trimmed = trimModelQuery(match[1]);
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
}
