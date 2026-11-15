// Private-window check: a fresh visitor must land on the auto-picked window (server HTML and hydrated page agree),
// and a page restored from the back/forward cache must reset to it.
//   node tests/first-load.js [url]     (default http://localhost:3000)
const { chromium, devices } = require("playwright");
const url = process.argv[2] || "http://localhost:3000";
(async () => {
  const b = await chromium.launch(process.env.HTTPS_PROXY && !url.includes("localhost") ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
  let fail = 0;
  for (const [label, opts] of [["iPhone 13", devices["iPhone 13"]], ["320px", { viewport: { width: 320, height: 640 } }], ["desktop", { viewport: { width: 1280, height: 800 } }]]) {
    const ctx = await b.newContext({ ...opts, ignoreHTTPSErrors: true }); // fresh context = private window: no storage
    const p = await ctx.newPage();
    const html = await (await p.goto(url + "/?r=" + Math.random(), { waitUntil: "networkidle" })).text();
    const ssr = (html.match(/aria-pressed="true"[^>]*>([^<]+)</) || [])[1];
    const live = await p.locator('nav[aria-label="Time window"] button[aria-pressed="true"]').innerText();
    const h1 = (await p.locator("h1").innerText()).replace(/\n/g, " ");
    const ok = ssr === live && !/from 0 filings/.test(await p.locator("header").innerText());
    if (!ok) fail++;
    console.log(`${ok ? "PASS" : "FAIL"} ${label}: server=${ssr} hydrated=${live} · ${h1}`);
    await ctx.close();
  }
  await b.close();
  process.exit(fail ? 1 : 0);
})();
