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

  // 共有部屋: 実Firebaseには接続せず、同じAPI形のインメモリ偽物で入室・表示・退室を検証する。
  const sharedPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  sharedPage.on("console", (msg) => {
    if (msg.type() === "error") errors.push("console.error(shared): " + msg.text());
  });
  sharedPage.on("pageerror", (err) => errors.push("pageerror(shared): " + err.message));
  await sharedPage.route("**/today_tasks.json*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ date: todayStr(), isRestDay: true, tasks: [] }) })
  );
  await sharedPage.addInitScript(() => {
    const members = {};            // uid -> data
    const listeners = [];
    const snap = (v) => ({ val: () => v });
    const notify = () => listeners.forEach((cb) => cb(snap(JSON.parse(JSON.stringify(members)))));
    const resolve = (d) => {
      const o = {};
      for (const k in d) o[k] = d[k] === "__TS__" ? Date.now() : d[k];
      return o;
    };
    function ref(path) {
      return {
        on(evt, cb) {
          if (path === ".info/serverTimeOffset") cb(snap(0));
          else if (path === ".info/connected") cb(snap(true));
          else if (path.endsWith("/members")) { listeners.push(cb); cb(snap(JSON.parse(JSON.stringify(members)))); }
        },
        off() {},
        child(uid) { return ref(path + "/" + uid); },
        set(d) { members[path.split("/").pop()] = resolve(d); notify(); return Promise.resolve(); },
        update(d) { const k = path.split("/").pop(); members[k] = Object.assign(members[k] || {}, resolve(d)); notify(); return Promise.resolve(); },
        remove() { delete members[path.split("/").pop()]; notify(); return Promise.resolve(); },
        onDisconnect() { return { update() { return Promise.resolve(); }, cancel() { return Promise.resolve(); } }; },
      };
    }
    const db = { ref };
    const database = () => db;
    database.ServerValue = { TIMESTAMP: "__TS__" };
    window.firebase = {
      apps: [],
      initializeApp() { this.apps.push({}); },
      auth: () => ({ signInAnonymously: () => Promise.resolve({ user: { uid: "me" } }) }),
      database,
    };
    window.__fb = {
      members,
      addFriend(uid, data) { members[uid] = resolve(data); notify(); },
    };
  });

  await sharedPage.goto("file://" + INDEX_HTML);
  await sharedPage.waitForSelector("#room-shared");
  assert((await sharedPage.locator("#room-shared").innerText()).includes("友だちと同じ部屋に入る"), "shared card should offer joining a room");

  // 不正な合言葉は入室させない
  await sharedPage.fill("#shared-room-input", "abc");
  await sharedPage.fill("#shared-name-input", "しんしん");
  await sharedPage.click('[data-action="shared-join"]');
  assert((await sharedPage.locator("#room-shared").innerText()).includes("友だちと同じ部屋に入る"), "too-short room code must be rejected");

  await sharedPage.fill("#shared-room-input", "test-room-01");
  await sharedPage.click('[data-action="shared-join"]');
  await sharedPage.waitForTimeout(500);
  const joinedText = await sharedPage.locator("#room-shared").innerText();
  assert(joinedText.includes("接続中・友だち 0人"), "should show connected state with 0 friends, got: " + joinedText);

  // 友だちが勉強中で入ってくる
  await sharedPage.evaluate(() => {
    window.__fb.addFriend("friend1", {
      name: "テスト友", status: "studying", startedAt: Date.now() - 5 * 60000,
      date: "2000-01-01", todayMinutes: 20, weekKey: "2000-01-03", weekMinutes: 60, updatedAt: "__TS__",
    });
  });
  await sharedPage.waitForTimeout(200);
  const rosterShared = await sharedPage.locator("#room-roster").innerText();
  assert(rosterShared.includes("テスト友"), "friend should appear in the roster");
  assert(rosterShared.includes("勉強中（5分経過）"), "friend's elapsed minutes should be shown, got: " + rosterShared);
  assert((await sharedPage.locator("#room-shared").innerText()).includes("友だち 1人"), "friend count should update");

  // 自分が入室すると共有データに反映され、メモ・科目は含まれない
  await sharedPage.click('[data-action="choose-type"][data-type="assignment"]');
  await sharedPage.fill("#memo-input", "秘密のメモ");
  await sharedPage.click('[data-action="start-session"]');
  await sharedPage.waitForTimeout(500);
  const mine = await sharedPage.evaluate(() => window.__fb.members.me);
  assert(mine && mine.status === "studying" && mine.name === "しんしん", "own presence should be published as studying");
  assert(!JSON.stringify(mine).includes("秘密のメモ"), "memo must not be shared");

  // 架空ライバル表示のON/OFF
  assert((await sharedPage.locator("#room-roster").innerText()).includes("高橋 美咲"), "rivals should be shown by default");
  await sharedPage.locator('[data-action="shared-rivals"]').uncheck();
  await sharedPage.waitForTimeout(200);
  const rosterNoRivals = await sharedPage.locator("#room-roster").innerText();
  assert(!rosterNoRivals.includes("高橋 美咲") && rosterNoRivals.includes("テスト友"), "rivals hidden, friend kept");

  // 退室すると自分のデータが消える
  await sharedPage.click('[data-action="stop-session"]');
  await sharedPage.click('[data-action="close-modal"]');
  await sharedPage.click('[data-action="shared-leave"]');
  await sharedPage.waitForTimeout(300);
  assert(await sharedPage.evaluate(() => !("me" in window.__fb.members)), "leaving should remove own data from the room");
  assert((await sharedPage.locator("#room-roster").innerText()).includes("高橋 美咲"), "rivals return after leaving");

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
