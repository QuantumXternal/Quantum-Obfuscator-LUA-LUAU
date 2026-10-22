export class ApiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function request(path, payload, signal) {
  let response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    if (err && err.name === "AbortError") throw err;
    throw new ApiError("Local engine is unreachable. Is the server running on port 3000?");
  }

  const contentType = response.headers.get("content-type") || "";
  let body = null;
  if (contentType.includes("application/json")) {
    try {
      body = await response.json();
    } catch {
      throw new ApiError(`Invalid JSON response (HTTP ${response.status}).`, response.status);
    }
  } else {
    const text = await response.text();
    throw new ApiError(`HTTP ${response.status}: ${text.slice(0, 180) || response.statusText}`, response.status);
  }

  if (!response.ok) {
    throw new ApiError(body?.error || `Request failed (HTTP ${response.status})`, response.status, body?.details ?? body);
  }
  return body;
}

export function checkHealth(signal) {
  return fetch("/api/health", { signal, cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
}

export function analyzeCode(code, tier, signal) {
  return request("/api/analyze", { code, options: { tier } }, signal);
}

export function refactorIifes(code, tier, line, signal) {
  return request("/api/refactor-iifes", { code, line, options: { tier } }, signal);
}

export function hoistDoParent(code, tier, line, signal) {
  return request("/api/hoist-do-parent", { code, line, options: { tier } }, signal);
}

export function obfuscateCode(code, options, signal) {
  return request("/api/obfuscate", { code, options }, signal);
}
