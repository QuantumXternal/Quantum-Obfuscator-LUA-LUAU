export const WATERMARK_LINE = "--[[ Protected by Quantum Obfuscator | https://quantum.dev ]]";

export function prependOutputHeader(output: string, nativePrefix = "", watermark = true): string {
  const prefix = nativePrefix.length > 0 && !nativePrefix.endsWith("\n") ? nativePrefix + "\n" : nativePrefix;
  if (!watermark) return prefix + output;
  return WATERMARK_LINE + "\n" + prefix + output;
}
