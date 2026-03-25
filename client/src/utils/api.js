const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

export function getToken() {
  return localStorage.getItem("jdl_token") || "";
}

export function setToken(t) {
  if (t) localStorage.setItem("jdl_token", t);
  else localStorage.removeItem("jdl_token");
}

export function extractAccessToken(respJson) {
  if (!respJson) return "";
  if (typeof respJson.token === "string") return respJson.token;
  if (respJson?.token?.access_token) return respJson.token.access_token;
  if (respJson?.token?.accessToken) return respJson.token.accessToken;
  if (respJson?.session?.access_token) return respJson.session.access_token;
  if (respJson?.data?.session?.access_token) return respJson.data.session.access_token;
  if (respJson?.access_token) return respJson.access_token;
  return "";
}

export async function apiFetch(path, { method = "GET", body, token, onInvalidToken } = {}) {
  const headers = { "Content-Type": "application/json" };
  const t = token ?? getToken();
  if (t) headers["Authorization"] = `Bearer ${t}`;

  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const err = new Error("Failed to fetch (API offline?)");
    err.cause = e;
    throw err;
  }

  const json = await res.json().catch(() => ({}));

  if (res.status === 401 || res.status === 403) {
    if (typeof onInvalidToken === "function") onInvalidToken();
  }

  if (!res.ok) {
    const msg = json?.error || json?.message || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = json;
    throw err;
  }

  return json;
}
