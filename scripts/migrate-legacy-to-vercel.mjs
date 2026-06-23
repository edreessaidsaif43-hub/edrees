const baseUrl = String(process.env.VERCEL_BASE_URL || "").replace(/\/+$/, "");
const token = String(process.env.EDU_MIGRATION_TOKEN || "");

if (!baseUrl) {
  console.error("Missing VERCEL_BASE_URL. Example: https://your-project.vercel.app");
  process.exit(1);
}

const url = new URL("/api/edu", baseUrl);
url.searchParams.set("action", "migrateLegacy");
if (token) url.searchParams.set("token", token);

const response = await fetch(url, { method: "POST" });
const text = await response.text();

let payload;
try {
  payload = JSON.parse(text);
} catch {
  payload = { raw: text };
}

console.log(JSON.stringify(payload, null, 2));

if (!response.ok || payload.success !== true) {
  process.exit(1);
}
