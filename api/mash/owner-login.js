export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const password = process.env.MASH_OWNER_PASSWORD || "owner12345";
  if (String(req.body?.password || "") !== password) {
    res.status(401).json({ error: "كلمة مرور صاحب الموقع غير صحيحة" });
    return;
  }
  res.status(200).json({ token: password });
}
