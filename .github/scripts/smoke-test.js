// index.html を実ブラウザ(headless Chromium)で読み込み、
// 主要な操作フローでコンソールエラーが出ないことを確認するスモークテスト。
// ビルド不要な単一HTMLアプリのため、ユニットテストの代わりにこの形で検証する。
const path = require("path");
const { chromium } = require("playwright");

const INDEX_HTML = path.resolve(__dirname, "..", "..", "index.html");

function assert(cond, message) {
  if (!cond) throw new Error("ASSERT FAILED: " + message);
}

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

async function main() {
  const errors = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push("console.error: " + msg.text());
  });
  page.on("pageerror", (err) => errors.push("pageerror: " + err.message));

  // 今日のタスク機能: 実際のGitHub上にはまだ today_tasks.json が存在しない可能性があるため、
  // 本番と同じ形式のJSONをこのテストの中でモックして検証する(実ネットワークには依存しない)。
  let todayTasksMock = {
    date: todayStr(),
    isRestDay: false,
    tasks: [
      { id: "t1", text: "数的処理：講義を1コマ進める", subject: "数的処理", done: false },
      { id: "t2", text: "英字新聞を1本読む", subject: "", done: false },
    ],
  };
  await page.route("**/today_tasks.json*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(todayTasksMock),
    })
  );

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

  // 今日のタスク: 正常系(今日の日付・タスクあり)の表示とチェックを確認
  const recordsBeforeTaskCheck = await page.evaluate(() => localStorage.getItem("mokumoku_records_v1"));

  await page.click('nav.tabbar button[data-tab="tasks"]');
  await page.waitForTimeout(300);
  const tasksText = await page.locator("#today-tasks").innerText();
  assert(tasksText.includes("数的処理：講義を1コマ進める"), "today's tasks should list the mocked task text");
  assert(tasksText.includes("0/2 完了"), "task progress line should start at 0/2");

  await page.locator('.task-row input[type="checkbox"]').first().click();
  await page.waitForTimeout(200);
  const tasksTextAfterCheck = await page.locator("#today-tasks").innerText();
  assert(tasksTextAfterCheck.includes("1/2 完了"), "task progress line should update to 1/2 after checking one task");

  // チェックが学習記録(タイマー機能)に一切影響しないことを確認(直前の記録件数から変化しないこと)
  const recordsAfterTaskCheck = await page.evaluate(() => localStorage.getItem("mokumoku_records_v1"));
  assert(
    recordsAfterTaskCheck === recordsBeforeTaskCheck,
    "checking a today-task must not create/modify study records"
  );

  // 今日のタスク: isRestDay:true の場合の表示を確認
  todayTasksMock = { date: todayStr(), isRestDay: true, tasks: [] };
  await page.reload();
  await page.waitForSelector("#room-roster");
  await page.click('nav.tabbar button[data-tab="tasks"]');
  await page.waitForTimeout(300);
  const restDayText = await page.locator("#today-tasks").innerText();
  assert(restDayText.includes("今日は休養日です"), "today-tasks should show rest-day message when isRestDay is true");

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
