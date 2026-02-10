export const normalizeSingleLine = (value: string): string =>
  value
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const normalizeMultiline = (value: string): string =>
  value
    .replace(/\u00A0/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
