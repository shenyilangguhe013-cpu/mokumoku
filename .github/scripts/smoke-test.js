// index.html を実ブラウザ(headless Chromium)で読み込み、
// 主要な操作フローでコンソールエラーが出ないことを確認するスモークテスト。
// ビルド不要な単一HTMLアプリのため、ユニットテストの代わりにこの形で検証する。
const path = require("path");
const { chromium } = require("playwright");

const INDEX_HTML = path.resolve(__dirname, "..", "..", "index.html");

function assert(cond, message) {
  if (!cond) throw new Error("ASSERT FAILED: " + message);
}

async function main() {
  const errors = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push("console.error: " + msg.text());
  });
  page.on("pageerror", (err) => errors.push("pageerror: " + err.message));

  await page.goto("file://" + INDEX_HTML);
  await page.waitForSelector("#room-roster");

  // 部屋タブ: ライバルの初期表示を確認
  const rosterText = await page.locator("#room-roster").innerText();
  assert(rosterText.includes("人が勉強中"), "room roster should show studying count");

  // 全タブを一通り切り替え
  for (const tab of ["ranking", "week", "data", "room"]) {
    await page.click(`nav.tabbar button[data-tab="${tab}"]`);
    await page.waitForTimeout(100);
    const visible = await page.locator(`section.tab[data-tab="${tab}"]`).isVisible();
    assert(visible, `tab ${tab} should become visible after click`);
  }

  // ワンタップ入室 → 途中終了 → 完了モーダル → 閉じる のフローを確認
  await page.click('[data-action="choose-type"][data-type="assignment"]');
  await page.waitForTimeout(100);
  await page.click('[data-action="start-session"]');
  await page.waitForTimeout(300);
  assert(
    await page.locator("#timer-clock").isVisible(),
    "timer clock should be visible after starting a session"
  );

  await page.click('[data-action="stop-session"]');
  await page.waitForTimeout(200);
  assert(
    !(await page.locator("#modal-overlay").evaluate((el) => el.classList.contains("hidden"))),
    "completion modal should be visible after stopping a session"
  );

  await page.click('[data-action="close-modal"]');
  await page.waitForTimeout(200);
  assert(
    await page.locator("#modal-overlay").evaluate((el) => el.classList.contains("hidden")),
    "completion modal should close after tapping 閉じる"
  );

  // データの書き出しがダウンロードイベントを発生させることを確認
  await page.click('nav.tabbar button[data-tab="data"]');
  await page.waitForTimeout(100);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 5000 }),
    page.click("#btn-export"),
  ]);
  assert(download.suggestedFilename().endsWith(".json"), "export should download a .json file");

  await browser.close();

  if (errors.length) {
    console.error("ブラウザ内でエラーが検出されました:");
    errors.forEach((e) => console.error(" - " + e));
    process.exit(1);
  }

  console.log("smoke test OK: no console errors, main flows work as expected");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
