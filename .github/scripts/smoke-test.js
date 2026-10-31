// index.html を実ブラウザ(headless Chromium)で読み込み、
// 主要な操作フローでコンソールエラーが出ないことを確認するスモークテスト。
// ビルド不要な単一HTMLアプリのため、ユニットテストの代わりにこの形で検証する。
const fs = require("fs");
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

// 進捗管理シートの値(data/progress.json)の模擬。取得先が未作成のままだと404でコンソールエラーになるため、テストでは差し替える。
function progressMockBody(overrides) {
  return JSON.stringify(
    Object.assign(
      {
        updatedAt: "2026-10-18T01:05:00+09:00",
        baselineDate: "2026-09-27",
        subjects: [{ subject: "行政学", done: 4, total: 22 }],
        importedIds: [],
      },
      overrides || {}
    )
  );
}

// 週の計画・月の計画(data/plan.json)の模擬。今週の月曜〜日曜と、今月を、実行日から作る。
function ymd(d) {
  const pad2 = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}
function planMockBody(opts) {
  opts = opts || {};
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + (opts.weekOffset || 0) * 7);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    days.push(
      i === 6
        ? { date: ymd(d), isRestDay: true, items: [] }
        : { date: ymd(d), items: i === 0 ? ["行政学 講義1コマ", "<b>数的処理</b> 解き直し"] : ["政治学 講義1コマ"] }
    );
  }
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const month = opts.monthOffset ? new Date(now.getFullYear(), now.getMonth() + opts.monthOffset, 1) : now;
  return JSON.stringify({
    updatedAt: "2026-10-18T06:20:00+09:00",
    week: { start: ymd(monday), end: ymd(sunday), days },
    month: {
      month: ymd(month).slice(0, 7),
      goals: ["行政学 全22回を完走", "数的処理 解き直し3周"],
      summary: ["総合論文の論点づくりを優先"],
      weeks: [{ start: ymd(monday), end: ymd(sunday), focus: "行政学・政治学", items: ["講義を各2コマ"] }],
    },
  });
}

// 一問一答のデータ(data/ichimon/)の模擬。file:// のページからはfetchできないため、ページ内のfetchを差し替えて返す。
const ICHIMON_FIXTURE = {
  "data/minitests/index.json": { version: 1, tests: [{ id: "t_mt", date: "2026-10-30", name: "水曜A", title: "テスト2問", file: "t_mt.json" }] },   // 問題文つきミニテストの目次
  "data/minitests/t_mt.json": { id: "t_mt", date: "2026-10-30", name: "水曜A", title: "テスト2問", questions: [
    { q: 1, subject: "時事", field: "時事", stem: "選択肢の問題", options: ["あ", "い", "う"], answer: 2, explain: "1 × あ\n→ 誤り。あの解説\n2 ○ い\n→ 正しい。いの解説\n3 × う\n→ 誤り。うの解説\n押さえる知識：補足の文" },
    { q: 2, subject: "時事", field: "時事", stem: "記述の問題", answer: "答え", explain: "記述の解説" } ] },
  "data/ichimon/index.json": {
    version: 1,
    decks: [
      { id: "t_ox", title: "テストOX", type: "ox", file: "data/ichimon/ichimon_t_ox.json", count: 2 },
      { id: "t_fl", title: "テストめくり", type: "flash", file: "ichimon_t_fl.json", count: 2 },
      { id: "t_big", title: "テスト多数", type: "ox", file: "data/ichimon/ichimon_t_big.json", count: 25 },   // フォルダ名なしのfileも読めること
    ],
  },
  "data/ichimon/ichimon_t_ox.json": {
    id: "t_ox", title: "テストOX", type: "ox",
    cards: [
      { id: "ox:1", type: "ox", group: "時事(国内)", src: "Ⅰ-1", topic: "テスト", ask: "最も妥当なもの", s: "文1", ok: true, r: "理由1", provisional: true },
      { id: "ox:3-2", type: "ox", group: "時事(国際)", src: "Ⅰ-2", topic: "テスト", ask: "次のア～エの記述のうち、妥当なものはどれか", s: "前半の文2。後半の文", ok: false, r: "理由2", errs: [{ wrong: "文2", right: "文二", why: "誤りの解説テキスト" }] },
    ],
  },
  "data/ichimon/ichimon_t_big.json": {
    id: "t_big", title: "テスト多数", type: "ox",
    cards: Array.from({ length: 25 }, (_, i) => ({ id: "big:" + (i + 1), type: "ox", group: "区分", src: "出典", topic: "t", ask: "a", s: "文" + (i + 1), ok: true, r: "理由" })),
  },
  "data/ichimon/ichimon_t_fl.json": {
    id: "t_fl", title: "テストめくり", type: "flash",
    cards: [
      { id: "fl:1", type: "flash", group: "基本", src: "", q: "問1", a: "｜外局《がいきょく》の答え" },
      { id: "fl:2", type: "flash", group: "基本", src: "", q: "問2", a: "答え2" },
    ],
  },
};
function stubIchimonFetch(fixture) {
  const orig = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const key = typeof input === "string" ? input : input && input.url;
    if (key && Object.prototype.hasOwnProperty.call(fixture, key)) {
      return Promise.resolve(new Response(JSON.stringify(fixture[key]), { status: 200, headers: { "Content-Type": "application/json" } }));
    }
    return orig(input, init);
  };
}

async function main() {
  const errors = [];
  const browser = await chromium.launch();
  const rawNewPage = browser.newPage.bind(browser);
  browser.newPage = async (...args) => {
    const pg = await rawNewPage(...args);
    await pg.addInitScript(stubIchimonFetch, ICHIMON_FIXTURE);
    // 一問一答の共有ファイル(raw)は、まだ無いので、空の内容を返す(404だとコンソールにエラーが出るため)
    await pg.route("https://raw.githubusercontent.com/**/ichimon_results.json*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version: 1, sessions: [] }) })
    );
    return pg;
  };
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
  await page.route("**/progress.json*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: progressMockBody() })
  );
  await page.route("**/plan.json*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: planMockBody() })
  );

  await page.goto("file://" + INDEX_HTML);
  await page.waitForSelector("#room-roster");

  // 部屋タブ: ライバルの初期表示を確認
  const rosterText = await page.locator("#room-roster").innerText();
  assert(rosterText.includes("人が勉強中"), "room roster should show studying count");

  // 全タブを一通り切り替え
  for (const tab of ["ranking", "data", "room"]) {
    await page.click(`nav.tabbar button[data-tab="${tab}"]`);
    await page.waitForTimeout(100);
    const visible = await page.locator(`section.tab[data-tab="${tab}"]`).isVisible();
    assert(visible, `tab ${tab} should become visible after click`);
  }

  // ランキングタブの「今週のふり返り」(勉強時間・日数・コマ数・タスク・正答率)
  await page.click('nav.tabbar button[data-tab="ranking"]');
  const wrText = await page.locator("#week-review").innerText();
  assert(wrText.includes("今週のふり返り") && wrText.includes("勉強時間") && wrText.includes("問題の正答率"), "the weekly review card should be shown, got: " + wrText);
  // ランキングは上位3人だけ(自分が4位以降なら自分の行も)。「全員を表示」で全部開く。今週のふり返りは、グラフより上
  assert((await page.locator("#rank-today .rank-row").count()) <= 4, "the today ranking should show only the top 3 (plus your own row)");
  const rkAll = await page.locator("#rank-today [data-action='rank-toggle']").count();
  assert(rkAll === 1, "a long ranking should have a 全員を表示 button");
  await page.click("#rank-today [data-action='rank-toggle']");
  assert((await page.locator("#rank-today .rank-row").count()) > 4, "全員を表示 should list everyone");
  await page.click("#rank-today [data-action='rank-toggle']");
  assert((await page.locator("#rank-today .rank-row").count()) <= 4, "the ranking should fold back to the top 3");
  const rkOrder = await page.evaluate(() => { const ids = [...document.querySelectorAll("#tab-ranking > *")].map((e) => e.id || (e.querySelector("#week-chart") ? "chart-card" : "")); return ids.indexOf("week-review") < ids.indexOf("chart-card"); });
  assert(rkOrder, "the weekly review card should come before the chart");
  assert((await page.locator("#week-subjects").innerText()).includes("教科別の勉強時間"), "the subject breakdown should be shown near the chart");
  await page.click('nav.tabbar button[data-tab="room"]');

  // ワンタップ入室 → 途中終了 → 完了モーダル → 閉じる のフローを確認
  // 勉強の開始は「資格の勉強」1本だけ(大学の課題の選択は削除済み)
  assert((await page.locator('[data-action="choose-type"]').count()) === 1, "only one start button (資格の勉強) should exist");
  assert((await page.locator('[data-action="choose-type"][data-type="assignment"]').count()) === 0, "the 大学の課題 start button should be gone");
  await page.click('[data-action="choose-type"][data-type="qualification"]');
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
  // 削除済み: 予定と実績・残り時間の警告(今日使える時間の設定)・文字サイズ切替
  assert((await page.locator(".task-actual, .task-week, .task-warn, .task-avail, #fontsize-card").count()) === 0, "removed task widgets should be gone");
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

  // 削除済みの機能が画面に残っていないことを確認(共有部屋・データの書き出し/読み込み・基準値の説明カード)
  await page.click('nav.tabbar button[data-tab="data"]');
  await page.waitForTimeout(100);
  assert((await page.locator("#btn-export, #btn-import-trigger, #file-import").count()) === 0, "export/import controls should be gone");
  assert((await page.locator("#baseline-note").count()) === 0, "the baseline note card should be gone");
  await page.click('nav.tabbar button[data-tab="room"]');
  assert((await page.locator("#room-shared, #shared-name-input, #shared-room-input").count()) === 0, "the shared-room card should be gone");

  // GitHubに保存: 記録の少ない端末で保存しても、リポジトリ上の過去の記録を消さずに統合する。
  const mergePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mergePage.on("pageerror", (err) => errors.push("pageerror(merge): " + err.message));
  await mergePage.route("**/today_tasks.json*", (route) =>
    route.fulfill({ status: 404, body: "" })
  );
  const mkRec = (id, date, units) => ({
    id, date, type: "qualification", plannedMinutes: 25, actualMinutes: 25, note: "", subject: "行政学",
    startedAt: date + "T01:00:00.000Z", endedAt: date + "T01:25:00.000Z",
    completedNatural: true, completedUnits: units, reviewTags: [],
  });
  const remoteExport = { version: 1, exportedAt: "2026-10-14T00:00:00.000Z", records: [
    mkRec("remote_keep", "2026-10-02", 1),
    mkRec("remote_deleted", "2026-10-03", 1),
    { id: "broken" },
  ] };
  let putBody = null;
  await mergePage.route("https://api.github.com/repos/**/contents/data/mokumoku_export.json*", async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ sha: "sha1", content: Buffer.from(JSON.stringify(remoteExport), "utf8").toString("base64") }),
      });
    }
    putBody = JSON.parse(req.postData());
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await mergePage.goto("file://" + INDEX_HTML);
  await mergePage.evaluate((local) => {
    localStorage.setItem("mokumoku_gh_token_v1", "github_pat_dummy");
    localStorage.setItem("mokumoku_records_v1", JSON.stringify([local]));
    localStorage.setItem("mokumoku_deleted_ids_v1", JSON.stringify(["remote_deleted"]));
  }, mkRec("local_new", "2026-10-16", 1));
  await mergePage.reload();
  await mergePage.click('nav.tabbar button[data-tab="tasks"]');
  await mergePage.click("#btn-github-save");
  await mergePage.waitForTimeout(800);
  assert(putBody, "saving to GitHub should send a PUT request");
  const saved = JSON.parse(Buffer.from(putBody.content, "base64").toString("utf8"));
  const savedIds = saved.records.map((r) => r.id).sort();
  assert(
    JSON.stringify(savedIds) === JSON.stringify(["local_new", "remote_keep"]),
    "merged export should keep remote and local records, drop deleted and invalid ones, got: " + savedIds.join(",")
  );
  const localIdsAfter = await mergePage.evaluate(() => JSON.parse(localStorage.getItem("mokumoku_records_v1")).map((r) => r.id).sort());
  assert(
    JSON.stringify(localIdsAfter) === JSON.stringify(["local_new", "remote_keep"]),
    "records from other devices should also be merged into this device, got: " + localIdsAfter.join(",")
  );

  // 科目別の進捗: シートの式と同じく「基準日(2026-09-27)より後」だけを基準済回数に足す(基準日当日は足さない)。
  const progressPage = await browser.newPage({ viewport: { width: 390, height: 900 } });
  progressPage.on("pageerror", (err) => errors.push("pageerror(progress): " + err.message));
  await progressPage.route("**/today_tasks.json*", (route) => route.fulfill({ status: 404, body: "" }));
  await progressPage.route("**/progress.json*", (route) => route.fulfill({ status: 404, body: "" }));
  await progressPage.goto("file://" + INDEX_HTML);
  const progRec = (id, date, units) => ({
    id, date, type: "qualification", plannedMinutes: 25, actualMinutes: 25, note: "", subject: "行政学",
    startedAt: date + "T01:00:00.000Z", endedAt: date + "T01:25:00.000Z",
    completedNatural: true, completedUnits: units, reviewTags: [],
  });
  await progressPage.evaluate((recs) => {
    localStorage.setItem("mokumoku_records_v1", JSON.stringify(recs));
  }, [progRec("p_base", "2026-09-27", 2), progRec("p_after", "2026-09-28", 1), progRec("p_before", "2026-09-26", 5)]);
  await progressPage.reload();
  await progressPage.click('nav.tabbar button[data-tab="data"]');
  await progressPage.waitForTimeout(300);
  const gyoseiRow = await progressPage
    .locator("#subject-progress .progress-row")
    .evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()).find((t) => t.startsWith("行政学")));
  assert(gyoseiRow === "行政学 2/22", "progress should be baseline(1) + units dated after 2026-09-27 only (1), got: " + gyoseiRow);

  // GitHubのトークンが無効(401)のとき、設定画面に「期限切れの可能性」と作り直しの案内・発行リンクを出す。
  const authPage = await browser.newPage({ viewport: { width: 390, height: 900 } });
  authPage.on("pageerror", (err) => errors.push("pageerror(auth): " + err.message));
  await authPage.route("**/today_tasks.json*", (route) => route.fulfill({ status: 404, body: "" }));
  await authPage.route("https://api.github.com/**", (route) =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "Bad credentials" }) })
  );
  await authPage.goto("file://" + INDEX_HTML);
  await authPage.evaluate(() => localStorage.setItem("mokumoku_gh_token_v1", "github_pat_expired"));
  await authPage.reload();
  await authPage.click('nav.tabbar button[data-tab="data"]');
  assert(
    !(await authPage.locator("#github-settings").innerText()).includes("有効期限が切れた可能性"),
    "the renewal notice should not show before any authentication failure"
  );
  // 保存ボタンは「タスク」タブにだけある(データタブには置かない)
  assert((await authPage.locator("#tab-data #btn-github-save").count()) === 0, "the data tab should no longer have a save button");
  await authPage.click('nav.tabbar button[data-tab="tasks"]');
  await authPage.click("#btn-github-save");
  await authPage.waitForTimeout(500);
  assert(
    (await authPage.locator("#github-save-card").innerText()).includes("有効期限が切れた可能性"),
    "401 should show the expired-token notice next to the save button"
  );
  await authPage.click('nav.tabbar button[data-tab="data"]');
  const authText = await authPage.locator("#github-settings").innerText();
  assert(authText.includes("有効期限が切れた可能性"), "401 should show the expired-token notice, got: " + authText);
  assert(authText.includes("トークンを作り直す"), "401 should offer a renewal button");
  const renewHref = await authPage.locator('#github-settings a[target="_blank"]').first().getAttribute("href");
  assert(
    renewHref && renewHref.startsWith("https://github.com/settings/personal-access-tokens/new?") && renewHref.includes("expires_in=365") && renewHref.includes("contents=write"),
    "renewal link should open the prefilled token page, got: " + renewHref
  );
  // トークンを削除すると、案内は消える
  authPage.on("dialog", (d) => d.accept());
  await authPage.click('[data-action="clear-gh-token"]');
  assert(
    !(await authPage.locator("#github-settings").innerText()).includes("有効期限が切れた可能性"),
    "the notice should disappear after deleting the token"
  );

  // 復習: 記録の科目が復習の対象科目なら、「復習として記録」を押した時点でその科目が選ばれている(二重に選ばせない)。
  const reviewPage = await browser.newPage({ viewport: { width: 390, height: 900 } });
  reviewPage.on("pageerror", (err) => errors.push("pageerror(review): " + err.message));
  await reviewPage.route("**/today_tasks.json*", (route) => route.fulfill({ status: 404, body: "" }));
  await reviewPage.goto("file://" + INDEX_HTML);
  const pressed = (page, action, tag) =>
    page.locator(`[data-action="${action}"][data-tag="${tag}"]`).getAttribute("aria-pressed");

  // タイマー: 科目「政治学」で開始 → 終了 → 復習をオン → 政治学が最初から選ばれている
  await reviewPage.click('[data-action="choose-type"][data-type="qualification"]');
  await reviewPage.selectOption("#subject-select", "政治学");
  await reviewPage.click('[data-action="start-session"]');
  await reviewPage.click('[data-action="stop-session"]');
  await reviewPage.click('[data-action="review-toggle"]');
  assert((await pressed(reviewPage, "review-tag", "政治学")) === "true", "review tag should be preselected from the session subject");
  assert((await pressed(reviewPage, "review-tag", "行政学")) === "false", "other review tags should stay unselected");
  assert((await reviewPage.locator("#modal-review").innerText()).includes("自動で選びました"), "should explain the automatic selection");
  await reviewPage.click('[data-action="close-modal"]');
  const reviewedTags = await reviewPage.evaluate(() => {
    const list = JSON.parse(localStorage.getItem("mokumoku_records_v1"));
    return list[list.length - 1].reviewTags;
  });
  assert(JSON.stringify(reviewedTags) === JSON.stringify(["政治学"]), "the record should be saved with the preselected review tag, got: " + JSON.stringify(reviewedTags));

  // 復習の対象外の科目(憲法)では、自動では選ばれない
  await reviewPage.click('[data-action="choose-type"][data-type="qualification"]');
  await reviewPage.selectOption("#subject-select", "憲法");
  await reviewPage.click('[data-action="start-session"]');
  await reviewPage.click('[data-action="stop-session"]');
  await reviewPage.click('[data-action="review-toggle"]');
  assert(
    (await reviewPage.locator('#modal-review [aria-pressed="true"][data-tag]').count()) === 0,
    "no review tag should be preselected for a non-review subject"
  );
  await reviewPage.click('[data-action="close-modal"]');

  // 数的処理も復習の対象: 科目「数的処理」で復習をオンにすると、数的処理が最初から選ばれる(演習 数的処理も数的処理として)
  await reviewPage.click('[data-action="choose-type"][data-type="qualification"]');
  await reviewPage.selectOption("#subject-select", "演習　数的処理");
  await reviewPage.click('[data-action="start-session"]');
  await reviewPage.click('[data-action="stop-session"]');
  await reviewPage.click('[data-action="review-toggle"]');
  assert((await pressed(reviewPage, "review-tag", "数的処理")) === "true", "数的処理 should be a review subject, preselected from 演習 数的処理");
  await reviewPage.click('[data-action="close-modal"]');

  // 手動追加: 科目「行政学」→ 復習をオンで行政学が選ばれ、科目を変えるとタグも追従する
  await reviewPage.click('nav.tabbar button[data-tab="data"]');
  await reviewPage.click('[data-action="manual-open"]');
  assert((await reviewPage.locator('[data-action="manual-type"]').count()) === 0, "the manual form has no 内容 chips (資格の勉強 only)");
  await reviewPage.selectOption("#manual-subject-select", "行政学");
  await reviewPage.click('[data-action="manual-review-toggle"]');
  assert((await pressed(reviewPage, "manual-review-tag", "行政学")) === "true", "manual form should preselect the review tag from the subject");
  await reviewPage.selectOption("#manual-subject-select", "人文科学");
  assert((await pressed(reviewPage, "manual-review-tag", "人文科学")) === "true", "review tag should follow the subject while it is still automatic");
  assert((await pressed(reviewPage, "manual-review-tag", "行政学")) === "false", "the previous automatic tag should be replaced");
  // 手で選び直したタグは、科目を変えても勝手に上書きしない
  await reviewPage.click('[data-action="manual-review-tag"][data-tag="自然科学"]');
  await reviewPage.selectOption("#manual-subject-select", "社会科学");
  assert(
    (await pressed(reviewPage, "manual-review-tag", "人文科学")) === "true" && (await pressed(reviewPage, "manual-review-tag", "自然科学")) === "true",
    "manually adjusted review tags must not be overwritten"
  );

  // 今日のタスク: 次のタスクが配信されるまでは、前日に届いたタスクを表示し続ける(「まだ届いていません」で隠さない)。
  const carryPage = await browser.newPage({ viewport: { width: 390, height: 900 } });
  carryPage.on("pageerror", (err) => errors.push("pageerror(carry): " + err.message));
  const yesterdayStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const pad2 = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  })();
  let carryMock = {
    date: yesterdayStr,
    isRestDay: false,
    tasks: [
      { id: "c1", text: "前日に届いたタスクA", subject: "行政学", done: false },
      { id: "c2", text: "前日に届いたタスクB", subject: "", done: false },
    ],
  };
  await carryPage.route("**/today_tasks.json*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(carryMock) })
  );
  await carryPage.goto("file://" + INDEX_HTML);
  await carryPage.click('nav.tabbar button[data-tab="tasks"]');
  await carryPage.waitForTimeout(300);
  const carryText = await carryPage.locator("#today-tasks").innerText();
  assert(carryText.includes("前日に届いたタスクA"), "yesterday's tasks should stay visible until the next delivery, got: " + carryText);
  assert(carryText.includes("次のタスクが届くまで"), "should explain that the tasks are carried over, got: " + carryText);
  assert(!carryText.includes("まだ届いていません"), "must not hide the last delivered tasks");
  await carryPage.locator('.task-row input[type="checkbox"]').first().click();
  assert((await carryPage.locator("#today-tasks").innerText()).includes("1/2 完了"), "carried-over tasks should be checkable");
  // 休養日(前日配信)も、案内つきで表示し続ける
  carryMock = { date: yesterdayStr, isRestDay: true, tasks: [] };
  await carryPage.reload();
  await carryPage.click('nav.tabbar button[data-tab="tasks"]');
  await carryPage.waitForTimeout(300);
  const carryRest = await carryPage.locator("#today-tasks").innerText();
  assert(carryRest.includes("休養日です") && carryRest.includes("次のタスクが届くまで"), "carried-over rest day should still be shown, got: " + carryRest);

  // 架空のライバル: どの時間に開いても、必ず2人以上が勉強中で表示される(深夜・早朝も含む)。
  for (const hour of [0, 2, 4, 6, 8, 11, 13, 15, 17, 20, 22, 23]) {
    const clockPage = await browser.newPage({ viewport: { width: 390, height: 900 } });
    clockPage.on("pageerror", (err) => errors.push("pageerror(clock): " + err.message));
    await clockPage.clock.install({ time: new Date(2026, 9, 17, hour, 30, 0) });
    await clockPage.route("**/today_tasks.json*", (route) => route.fulfill({ status: 404, body: "" }));
    await clockPage.goto("file://" + INDEX_HTML);
    await clockPage.waitForSelector("#room-roster .room-summary");
    const rosterAt = await clockPage.locator("#room-roster").innerText();
    const studyingRows = (rosterAt.match(/勉強中（/g) || []).length;
    assert(studyingRows >= 2, `at ${hour}:30 at least 2 rivals should be studying, got ${studyingRows}: ` + rosterAt.slice(0, 200));
    await clockPage.close();
  }

  // 自動更新: 古い版のコピーで起動しても、サーバー上の最新のコードと違えば、1回だけ再読み込みして最新にする。
  const realHtml = fs.readFileSync(INDEX_HTML, "utf8");
  const staleHtml = realHtml.replace("<script>\n(function(){", "<script>\n(function(){ window.__STALE_MARKER = 1;");
  assert(staleHtml !== realHtml, "test setup: the stale copy should differ from the real page");
  const updPage = await browser.newPage({ viewport: { width: 390, height: 900 } });
  updPage.on("pageerror", (err) => errors.push("pageerror(update): " + err.message));
  let pageRequests = 0;
  await updPage.route("http://app.test/**", (route) => {
    // 一問一答のデータ取得は、ページ本体の取得回数に数えない
    if (new URL(route.request().url()).pathname.startsWith("/data/")) return route.fulfill({ status: 404, body: "" });
    pageRequests++;
    // 1回目(ホーム画面のコピーを模す)は古い版、それ以降(キャッシュを更新する取得と再読み込み)は最新の版を返す
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: pageRequests === 1 ? staleHtml : realHtml });
  });
  await updPage.route("**/today_tasks.json*", (route) => route.fulfill({ status: 404, body: "" }));
  await updPage.goto("http://app.test/");
  await updPage.waitForTimeout(2000);
  assert(
    (await updPage.evaluate(() => typeof window.__STALE_MARKER)) === "undefined",
    "a stale copy should reload itself into the latest version"
  );
  // 1回目の読み込み＋最新の取得＋再読み込み＋再読み込み後の確認の取得、で4回。それ以上(繰り返し)にならないこと
  assert(pageRequests >= 3 && pageRequests <= 4, "the update check should reload at most once, requests: " + pageRequests);
  // 最新の版で起動したときは、再読み込みしない
  const requestsBefore = pageRequests;
  await updPage.goto("http://app.test/");
  await updPage.waitForTimeout(1500);
  assert(pageRequests - requestsBefore <= 2, "an up-to-date page must not reload, extra requests: " + (pageRequests - requestsBefore));

  // 保存ボタンは1つ(タスクタブ): 1回押すと、学習記録とタスクのチェック状態の両方をGitHubに保存する。
  const saveAllPage = await browser.newPage({ viewport: { width: 390, height: 900 } });
  saveAllPage.on("pageerror", (err) => errors.push("pageerror(saveAll): " + err.message));
  const saveAllTasks = {
    date: todayStr(), isRestDay: false,
    tasks: [{ id: "s1", text: "保存テスト用タスク1", subject: "", done: false }, { id: "s2", text: "保存テスト用タスク2", subject: "", done: false }],
  };
  await saveAllPage.route("**/today_tasks.json*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(saveAllTasks) })
  );
  const puts = {};
  await saveAllPage.route("https://api.github.com/repos/**/contents/data/*", async (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    puts[req.url().split("/").pop()] = JSON.parse(req.postData());
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await saveAllPage.goto("file://" + INDEX_HTML);
  await saveAllPage.evaluate(() => localStorage.setItem("mokumoku_gh_token_v1", "github_pat_dummy"));
  await saveAllPage.reload();
  await saveAllPage.click('nav.tabbar button[data-tab="tasks"]');
  await saveAllPage.waitForSelector(".task-row");
  await saveAllPage.locator('.task-row input[type="checkbox"]').first().click();
  await saveAllPage.click("#btn-github-save");
  await saveAllPage.waitForTimeout(800);
  assert(puts["mokumoku_export.json"], "one save should write the study records file");
  assert(puts["today_tasks_status.json"], "one save should also write the task check status file");
  const statusSaved = JSON.parse(Buffer.from(puts["today_tasks_status.json"].content, "base64").toString("utf8"));
  assert(
    statusSaved.date === todayStr() && JSON.stringify(statusSaved.checkedTaskIds) === JSON.stringify(["s1"]),
    "the saved task status should hold the checked task ids, got: " + JSON.stringify(statusSaved)
  );
  assert((await saveAllPage.locator("#btn-github-save").count()) === 1, "there should be exactly one save button");

  // 科目別の進捗: シートの値(progress.json)があれば、それに「まだシートに入っていない、この端末の記録」だけを足す。
  const sheetPage = await browser.newPage({ viewport: { width: 390, height: 900 } });
  sheetPage.on("pageerror", (err) => errors.push("pageerror(sheet): " + err.message));
  await sheetPage.route("**/today_tasks.json*", (route) => route.fulfill({ status: 404, body: "" }));
  let sheetBody = progressMockBody({
    subjects: [{ subject: "行政学", done: 10, total: 22 }, { subject: "政治学", done: 8, total: 22 }],
    importedIds: ["imp1"],
  });
  await sheetPage.route("**/progress.json*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: sheetBody }));
  await sheetPage.goto("file://" + INDEX_HTML);
  const sheetRec = (id, date, units, endedAt) => ({
    id, date, type: "qualification", plannedMinutes: 25, actualMinutes: 25, note: "", subject: "行政学",
    startedAt: date + "T01:00:00.000Z", endedAt: endedAt || date + "T01:25:00.000Z",
    completedNatural: true, completedUnits: units, reviewTags: [],
  });
  await sheetPage.evaluate((recs) => localStorage.setItem("mokumoku_records_v1", JSON.stringify(recs)), [
    sheetRec("imp1", "2026-10-02", 3),   // シートに取り込み済み(ID一致) → 足さない
    sheetRec("pend1", "2026-10-16", 2),  // まだシートに無い → 足す
    sheetRec("old1", "2026-09-26", 5),   // 基準日以前 → 足さない
  ]);
  const progressRow = async (page, name) =>
    page.locator("#subject-progress .progress-row").evaluateAll(
      (els, n) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()).find((x) => x.startsWith(n)),
      name
    );
  await sheetPage.reload();
  await sheetPage.click('nav.tabbar button[data-tab="data"]');
  await sheetPage.waitForFunction(() => /進捗管理シートの値/.test(document.getElementById("subject-progress-note").textContent));
  assert((await progressRow(sheetPage, "行政学")) === "行政学 12/22", "sheet value (10) + pending local units (2), got: " + (await progressRow(sheetPage, "行政学")));
  assert((await progressRow(sheetPage, "政治学")) === "政治学 8/22", "sheet value should be used as is");
  assert((await progressRow(sheetPage, "数的処理")) === "数的処理 29/42", "a subject missing from the sheet falls back to the built-in baseline");

  // 取り込み済みのIDが無いとき: シートの取り込み時刻より後に終わった記録だけを足す
  sheetBody = progressMockBody({ subjects: [{ subject: "行政学", done: 10, total: 22 }], importedIds: undefined });
  sheetBody = JSON.stringify(Object.assign(JSON.parse(sheetBody), { importedIds: undefined }));
  await sheetPage.evaluate((recs) => localStorage.setItem("mokumoku_records_v1", JSON.stringify(recs)), [
    sheetRec("a1", "2026-10-16", 4, "2026-10-17T10:00:00.000Z"),  // 取り込み時刻(10/17 16:05 UTC)より前 → シートに入っている
    sheetRec("a2", "2026-10-18", 1, "2026-10-18T09:00:00.000Z"),  // 取り込み時刻より後 → 足す
  ]);
  await sheetPage.reload();
  await sheetPage.click('nav.tabbar button[data-tab="data"]');
  await sheetPage.waitForFunction(() => /進捗管理シートの値/.test(document.getElementById("subject-progress-note").textContent));
  assert((await progressRow(sheetPage, "行政学")) === "行政学 11/22", "without importedIds, only records ended after the sheet time are added, got: " + (await progressRow(sheetPage, "行政学")));

  // 形が正しくない/取得できないときは、アプリ内の計算に戻る
  sheetBody = JSON.stringify({ updatedAt: "bad", subjects: "nope" });
  await sheetPage.reload();
  await sheetPage.click('nav.tabbar button[data-tab="data"]');
  await sheetPage.waitForFunction(() => /アプリ内の計算/.test(document.getElementById("subject-progress-note").textContent));
  assert((await progressRow(sheetPage, "政治学")) === "政治学 6/22", "an invalid progress.json must fall back to the built-in calculation");

  // 試験までのペース: 試験日を入れると、残りコマ数と必要なペースを表示する
  const examPage = await browser.newPage({ viewport: { width: 390, height: 900 } });
  examPage.on("pageerror", (err) => errors.push("pageerror(exam): " + err.message));
  await examPage.route("**/today_tasks.json*", (route) => route.fulfill({ status: 404, body: "" }));
  await examPage.route("**/progress.json*", (route) => route.fulfill({ status: 404, body: "" }));
  await examPage.goto("file://" + INDEX_HTML);
  await examPage.click('nav.tabbar button[data-tab="data"]');
  assert((await examPage.locator("#exam-pace").innerText()).trim() === "", "no pace is shown until the exam date is set");
  const plusDays = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    const pad2 = (x) => String(x).padStart(2, "0");
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  };
  await examPage.fill("#exam-date-input", plusDays(10));
  await examPage.locator("#exam-date-input").dispatchEvent("change");
  const paceText = await examPage.locator("#exam-pace").innerText();
  assert(paceText.includes("試験まで 10日") && paceText.includes("必要なペース") && paceText.includes("直近7日のペース"), "pace summary should be shown, got: " + paceText);
  await examPage.reload();
  assert((await examPage.inputValue("#exam-date-input")) === plusDays(10), "the exam date should be remembered");
  await examPage.click('nav.tabbar button[data-tab="data"]');
  await examPage.fill("#exam-date-input", plusDays(-3));
  await examPage.locator("#exam-date-input").dispatchEvent("change");
  assert((await examPage.locator("#exam-pace").innerText()).includes("過ぎています"), "a past exam date should be flagged");

  // 自動保存: 学習が終わったら、保存ボタンを押さなくても、GitHubに保存する(オフにもできる)。
  const autoPage = await browser.newPage({ viewport: { width: 390, height: 900 } });
  autoPage.on("pageerror", (err) => errors.push("pageerror(auto): " + err.message));
  await autoPage.route("**/today_tasks.json*", (route) => route.fulfill({ status: 404, body: "" }));
  await autoPage.route("**/progress.json*", (route) => route.fulfill({ status: 404, body: "" }));
  let exportPuts = 0;
  await autoPage.route("https://api.github.com/repos/**/contents/data/*", async (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    if (req.url().endsWith("mokumoku_export.json")) exportPuts++;
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await autoPage.goto("file://" + INDEX_HTML);
  const finishOneSession = async () => {
    await autoPage.click('nav.tabbar button[data-tab="room"]');
    await autoPage.click('[data-action="choose-type"][data-type="qualification"]');
    await autoPage.click('[data-action="start-session"]');
    await autoPage.click('[data-action="stop-session"]');
    await autoPage.click('[data-action="close-modal"]');
    await autoPage.waitForTimeout(800);
  };
  // トークンが無いときは、何もしない
  await finishOneSession();
  assert(exportPuts === 0, "no auto-save without a token");
  await autoPage.evaluate(() => localStorage.setItem("mokumoku_gh_token_v1", "github_pat_dummy"));
  await autoPage.reload();
  await finishOneSession();
  assert(exportPuts === 1, "finishing a session should save to GitHub automatically, puts: " + exportPuts);
  // オフにすると、保存しない
  await autoPage.click('nav.tabbar button[data-tab="tasks"]');
  await autoPage.locator("#autosave-check").uncheck();
  await finishOneSession();
  assert(exportPuts === 1, "no auto-save when it is switched off, puts: " + exportPuts);

  // タスクの表示: 文章ではなく、見出し＋箇条書きで表示する。
  //  ・details(配列)があれば、そのまま箇条書き
  //  ・無ければ、「。」で区切って、最初を見出し、残りを箇条書き(従来の長い文章も、読みやすくなる)
  const bulletPage = await browser.newPage({ viewport: { width: 390, height: 900 } });
  bulletPage.on("pageerror", (err) => errors.push("pageerror(bullet): " + err.message));
  await bulletPage.route("**/today_tasks.json*", (route) =>
    route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        date: todayStr(), isRestDay: false,
        tasks: [
          { id: "b1", text: "行政学 講義1コマ", details: ["約90分", "最優先", "終了後に要点を3つメモ"], subject: "行政学" },
          { id: "b2", text: "数的処理の解き直し（約1時間）。誤答から始める。理由を一言メモ。", subject: "数的処理" },
          { id: "b3", text: "ニュースの見方が分かる講義を1コマ", subject: "" },
        ],
      }),
    })
  );
  await bulletPage.goto("file://" + INDEX_HTML);
  await bulletPage.click('nav.tabbar button[data-tab="tasks"]');
  await bulletPage.waitForSelector(".task-row");
  const rowsInfo = await bulletPage.locator(".task-row").evaluateAll((rows) =>
    rows.map((r) => ({
      title: r.querySelector(".task-text").textContent.trim(),
      items: Array.from(r.querySelectorAll(".task-details li")).map((li) => li.textContent.trim()),
    }))
  );
  assert(
    rowsInfo[0].title === "行政学 講義1コマ" && JSON.stringify(rowsInfo[0].items) === JSON.stringify(["約90分", "最優先", "終了後に要点を3つメモ"]),
    "details should be shown as bullets, got: " + JSON.stringify(rowsInfo[0])
  );
  assert(
    rowsInfo[1].title === "数的処理の解き直し（約1時間）" && JSON.stringify(rowsInfo[1].items) === JSON.stringify(["誤答から始める", "理由を一言メモ"]),
    "a long sentence should be split into a title and bullets, got: " + JSON.stringify(rowsInfo[1])
  );
  assert(rowsInfo[2].items.length === 0, "a short task has no bullets");
  // チェックは、これまでどおり使える
  await bulletPage.locator('.task-row input[type="checkbox"]').first().click();
  assert((await bulletPage.locator("#today-tasks").innerText()).includes("1/3 完了"), "tasks should stay checkable");

  // 週の計画・月の計画の概要: タスクタブの「今日／今週／今月」で切り替えて見られる。
  const planPage = await browser.newPage({ viewport: { width: 390, height: 900 } });
  planPage.on("pageerror", (err) => errors.push("pageerror(plan): " + err.message));
  await planPage.route("**/today_tasks.json*", (route) => route.fulfill({ status: 404, body: "" }));
  let planBody = planMockBody();
  await planPage.route("**/plan.json*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: planBody }));
  await planPage.goto("file://" + INDEX_HTML);
  await planPage.click('nav.tabbar button[data-tab="tasks"]');
  assert((await planPage.locator("#plan-week").isVisible()) === false, "the plan is hidden while 'today' is selected");
  assert((await planPage.locator("#github-save-card").isVisible()) === true, "the save card is shown in every view");

  await planPage.click('[data-action="task-view"][data-view="week"]');
  await planPage.waitForSelector("#plan-week .plan-day");
  assert((await planPage.locator("#today-tasks").isVisible()) === false, "today's tasks are hidden in the week view");
  assert((await planPage.locator("#plan-week .plan-day").count()) === 7, "the week view should list 7 days");
  assert((await planPage.locator("#plan-week .plan-day.today").count()) === 1, "today should be highlighted once");
  assert((await planPage.locator("#plan-week .plan-today-tag").innerText()).trim() === "今日", "today should be tagged");
  const weekText = await planPage.locator("#plan-week").innerText();
  assert(weekText.includes("行政学 講義1コマ") && weekText.includes("休養日"), "week items and the rest day should be shown, got: " + weekText);
  assert(weekText.includes("<b>数的処理</b>"), "plan text must be shown as plain text (escaped)");
  assert((await planPage.locator("#plan-week b").count()) === 0, "plan text must not be rendered as HTML");

  await planPage.click('[data-action="task-view"][data-view="month"]');
  const monthText = await planPage.locator("#plan-month").innerText();
  assert(
    monthText.includes("今月の目標") && monthText.includes("行政学 全22回を完走") && monthText.includes("概要") && monthText.includes("週ごとの重点") && monthText.includes("行政学・政治学"),
    "the month view should show goals, summary and weekly focus, got: " + monthText
  );
  assert((await planPage.locator("#plan-month .plan-today-tag").count()) === 1, "the current week should be marked in the month view");

  // 選んだ表示は、開き直しても覚えている
  await planPage.reload();
  await planPage.click('nav.tabbar button[data-tab="tasks"]');
  assert((await planPage.locator("#plan-month").isVisible()) === true, "the selected view should be remembered");

  // 先週の計画が最後に届いたものなら、次の計画が届くまで表示し続け、案内を付ける
  planBody = planMockBody({ weekOffset: -1, monthOffset: -1 });
  await planPage.reload();
  await planPage.click('nav.tabbar button[data-tab="tasks"]');
  await planPage.click('[data-action="task-view"][data-view="week"]');
  await planPage.waitForSelector("#plan-week .plan-day");
  assert((await planPage.locator("#plan-week").innerText()).includes("次の計画が届くまで"), "an old week plan should stay visible with a note");
  assert((await planPage.locator("#plan-week .plan-day.today").count()) === 0, "no day is highlighted for an old week plan");

  // 計画が無い・形が正しくないときは、「まだ届いていません」と案内する
  planBody = JSON.stringify({ updatedAt: "bad", week: "nope" });
  await planPage.reload();
  await planPage.click('nav.tabbar button[data-tab="tasks"]');
  await planPage.click('[data-action="task-view"][data-view="week"]');
  await planPage.waitForFunction(() => /まだ届いていません/.test(document.getElementById("plan-week").textContent));
  assert((await planPage.locator("#plan-week").innerText()).includes("今週の計画は、まだ届いていません"), "an invalid plan should show the empty state");

  // 一問一答: ○×・めくり・時間・保存。結果は端末に残り、「間違えたカードだけ」に使われる。ミニテストや学習記録には送らない。
  const icPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  icPage.on("console", (msg) => { if (msg.type() === "error") errors.push("console.error(ichimon): " + msg.text()); });
  icPage.on("pageerror", (err) => errors.push("pageerror(ichimon): " + err.message));
  await icPage.route("**/today_tasks.json*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(todayTasksMock) }));
  await icPage.route("**/progress.json*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: progressMockBody() }));
  await icPage.route("**/plan.json*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: planMockBody() }));
  await icPage.goto("file://" + INDEX_HTML);
  await icPage.click('nav.tabbar button[data-tab="ichimon"]');
  await icPage.waitForSelector("#ichimon-card .ic-deck");
  assert((await icPage.locator("#ichimon-card .ic-deck").count()) === 3, "all ichimon decks in index.json should be listed (no auto mini-test deck)");
  // 問題つきミニテスト: 選択肢を押して答えると自動で採点し、正解と解説を出す
  await icPage.click('#ic-seg [data-ic-seg="mt"]');
  await icPage.waitForSelector('#mttest-card [data-mt-open="t_mt"]');
  await icPage.click('#mttest-card [data-mt-open="t_mt"]');
  await icPage.click('#mttest-card [data-mt-pick="1"][data-v="1"]');
  const mtq1 = await icPage.locator("#mttest-card").innerText();
  assert(mtq1.includes("不正解") && !mtq1.includes("あの解説"), "mini test: picking a wrong option should mark it, but keep the explanation hidden until asked");
  await icPage.click('#mttest-card [data-mt-exp="1"]');
  assert((await icPage.locator('#mttest-card .mt-optx').allInnerTexts()).join("|").includes("あの解説|") && (await icPage.locator('#mttest-card .mt-opt').first().evaluate(el => el.nextElementSibling.textContent)).includes("あの解説"), "mini test: the explanation button should show each option's explanation right under that option");
  assert((await icPage.locator("#mttest-card").innerText()).includes("補足の文"), "mini test: the closing note should be shown under the options");
  await icPage.click('#mttest-card [data-mt-exp="1"]');
  assert(!(await icPage.locator("#mttest-card").innerText()).includes("あの解説"), "mini test: the explanation button should toggle");
  assert((await icPage.locator('#mttest-card [data-mt-pick="1"]').first().isDisabled()), "mini test: options lock after answering");
  await icPage.click('#mttest-card [data-mt-repick="1"]');
  await icPage.click('#mttest-card [data-mt-pick="1"][data-v="2"]');
  assert((await icPage.locator("#mttest-card").innerText()).includes("正解　"), "mini test: picking the right option should be marked correct");
  assert((await icPage.locator('#mttest-card [data-mt-show="2"]').count()) === 1, "mini test: questions without options keep the show-answer and ○× buttons");
  // 絞り込み: 間違えた問題(前回×)だけを解き直せる
  await icPage.click('#mttest-card [data-mt-repick="1"]');
  await icPage.click('#mttest-card [data-mt-pick="1"][data-v="1"]');
  await icPage.click('#mttest-card [data-mt-tksave="1"]');
  await icPage.waitForSelector('#mttest-card .mt-wrong');
  assert((await icPage.locator("#mttest-card .mt-wrong").innerText()).includes("×1"), "mini test: the list should show how many questions were wrong last time");
  // 詳細は長押し(右クリック)のシートに出す: ×だけ解く
  await icPage.dispatchEvent('#mttest-card [data-ic-lp="mt:t_mt"]', "contextmenu");
  assert((await icPage.locator("#ic-sheet").innerText()).includes("前回×だけ解く（1問）"), "mini test: the detail sheet should offer the wrong-only mode");
  await icPage.click('#ic-sheet [data-ic-sheet-act="mt:t_mt:wrong"]');
  assert((await icPage.locator('#mttest-card [data-mt-pick]').first().getAttribute("data-mt-pick")) === "1" && (await icPage.locator('#mttest-card [data-mt-show="2"]').count()) === 0, "mini test: the wrong-only filter should show only the questions that were wrong");
  await icPage.click('#mttest-card [data-mt-filter="all"]');
  assert((await icPage.locator('#mttest-card [data-mt-show="2"]').count()) === 1, "mini test: the all filter should show every question");
  await icPage.click('#mttest-card [data-mt-back="1"]');
  await icPage.click('#ic-seg [data-ic-seg="deck"]');
  await icPage.evaluate(() => localStorage.removeItem("mokumoku_minitests_v1"));   // このあとの「一問一答はミニテストを作らない」確認のため、ここで作った記録を消す
  // 20枚だけ(ランダム): 多いデッキでは20枚に絞られ、少ないデッキではそのまま
  await icPage.click('[data-ic-deck="t_big"]');
  assert((await icPage.locator("[data-ic-start]").getAttribute("data-ic-count")) === "25", "big deck: all cards by default");
  await icPage.click('[data-ic-limit="20"]');
  assert((await icPage.locator("[data-ic-start]").getAttribute("data-ic-count")) === "20", "big deck: 20 random cards when limited");
  await icPage.click("[data-ic-start]");
  assert((await icPage.locator(".ic-progress").innerText()).includes("1 / 20"), "a limited session should have 20 cards");
  await icPage.click("[data-ic-quit]");   // 1問も答えずに終わると、結果は作らずメニューにもどる
  await icPage.click('[data-ic-limit=""]');
  // ○×: 1枚目は正解(○)、2枚目はわざと間違える(○)。キー操作でも進める
  await icPage.click('[data-ic-deck="t_ox"]');
  await icPage.selectOption("#ic-src", "Ⅰ-2");
  assert((await icPage.locator("[data-ic-start]").getAttribute("data-ic-count")) === "1", "ox: the src filter should narrow the cards");
  await icPage.selectOption("#ic-src", "");
  assert((await icPage.locator("[data-ic-start]").getAttribute("data-ic-count")) === "2", "ox: clearing the src filter should restore all cards");
  await icPage.click("[data-ic-start]");
  assert((await icPage.locator(".ic-label").count()) === 0, "ox: a numbered question should have no ア-エ label");
  await icPage.keyboard.press("o");
  assert((await icPage.locator(".ic-result").innerText()).includes("正解"), "ox: a correct answer should be marked");
  assert((await icPage.locator("#ichimon-card").innerText()).includes("正解は暫定"), "ox: provisional cards should say so");
  await icPage.keyboard.press("Enter");
  assert((await icPage.locator(".ic-label").first().innerText()) === "イ", "ox: card id suffix -2 of an ア～エ question should show イ");
  await icPage.keyboard.press("1");
  assert((await icPage.locator(".ic-result").innerText()).includes("不正解"), "ox: a wrong answer should be marked");
  // ×の文の誤り部分: 線を引き、何に直すと○か(right)と、その部分の解説(why)を出す
  assert((await icPage.locator(".ic-q .ic-fix").allInnerTexts()).join("|").includes("文二"), "the corrected text should be shown next to the statement");
  assert((await icPage.locator("u.ic-miss").allInnerTexts()).join("|") === "文2", "the wrong part of a × statement should be underlined");
  const icErrText = await icPage.locator(".ic-err").innerText();
  assert(icErrText.includes("誤りの解説テキスト") && !icErrText.includes("正しくは"), "the explanation box should show only the explanation (the fix is already in the statement), got: " + icErrText);
  await icPage.keyboard.press("Enter");
  assert((await icPage.locator(".ic-score").innerText()).replace(/\s/g, "").startsWith("1/2"), "ox: the result should show 1/2");
  assert((await icPage.locator("#ichimon-card").innerText()).includes("文2"), "ox: the missed card should be listed");
  await icPage.fill("#ic-minutes", "7");
  // めくり: 答えを見る → 覚えた / まだ。ルビが変換される
  await icPage.click("[data-ic-menu]");
  await icPage.click('[data-ic-deck="t_fl"]');
  await icPage.click("[data-ic-start]");
  await icPage.click("[data-ic-reveal]");
  await icPage.click('[data-ic-flash="1"]');
  await icPage.click("[data-ic-reveal]");
  await icPage.click('[data-ic-flash="0"]');
  assert((await icPage.locator(".ic-score").innerText()).replace(/\s/g, "").startsWith("1/2"), "flash: the result should show 1/2");
  // 保存: 再読み込み後も、履歴と「間違えたカードだけ」が残る
  await icPage.reload();
  await icPage.click('nav.tabbar button[data-tab="ichimon"]');
  await icPage.waitForSelector("#ichimon-card .ic-deck");
  await icPage.click('[data-ic-deck="t_ox"]');
  await icPage.click('[data-ic-filter="wrong"]');
  assert((await icPage.locator("[data-ic-start]").getAttribute("data-ic-count")) === "1", "wrong-only filter should keep the missed card after reload");
  await icPage.dispatchEvent(".ic-deck.selected", "contextmenu");
  assert((await icPage.locator("#ic-sheet").innerText()).includes("履歴をすべて見る"), "deck detail sheet should open on long-press / right-click");
  await icPage.click('#ic-sheet [data-ic-sheet-act^="hist:"]');
  assert((await icPage.locator("#ichimon-card").innerText()).includes("7分"), "history should show the edited minutes");
  const icStored = await icPage.evaluate(() => JSON.parse(localStorage.getItem("mokumoku_ichimon_v1")));
  assert(icStored.sessions.length === 2 && Object.keys(icStored.cards).length === 4, "ichimon results should be saved on this device");
  assert(
    (await icPage.evaluate(() => localStorage.getItem("mokumoku_records_v1"))) === null &&
      (await icPage.evaluate(() => localStorage.getItem("mokumoku_minitests_v1"))) === null,
    "ichimon must not create study records or minitests"
  );
  // 端末間の共有: 他の端末の結果を取り込み、終了時に統合して data/ichimon_results.json に保存する
  const icSyncPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  icSyncPage.on("console", (msg) => { if (msg.type() === "error") errors.push("console.error(ichimon sync): " + msg.text()); });
  icSyncPage.on("pageerror", (err) => errors.push("pageerror(ichimon sync): " + err.message));
  await icSyncPage.addInitScript(() => { localStorage.setItem("mokumoku_gh_token_v1", "test-token"); });
  await icSyncPage.route("**/today_tasks.json*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(todayTasksMock) }));
  await icSyncPage.route("**/progress.json*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: progressMockBody() }));
  await icSyncPage.route("**/plan.json*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: planMockBody() }));
  const icRemote = { version: 1, exportedAt: "2026-10-01T00:00:00.000Z", sessions: [
    { id: "ic_1000_aaaaaa", date: "2026-10-01", deckId: "t_ox", deckTitle: "テストOX", minutes: 3, rows: [{ cardId: "ox:1", ok: false }] },
    { id: "broken" },
  ] };
  await icSyncPage.route("https://raw.githubusercontent.com/**/ichimon_results.json*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(icRemote) })
  );
  let icPutBody = null;
  await icSyncPage.route("https://api.github.com/repos/**/contents/data/ichimon_results.json*", async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ sha: "icsha1", content: Buffer.from(JSON.stringify(icRemote), "utf8").toString("base64") }),
      });
    }
    icPutBody = JSON.parse(req.postData());
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await icSyncPage.goto("file://" + INDEX_HTML);
  await icSyncPage.click('nav.tabbar button[data-tab="ichimon"]');
  // 直近の結果は、デッキの長押し(右クリック)で開く詳細シートに出る。同期で取り込まれるまで待つ
  await icSyncPage.waitForFunction(() => {
    const b = document.querySelector('[data-ic-deck="t_ox"]');
    if(!b) return false;
    b.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const ok = /直近 0%（0\/1）/.test(document.getElementById("ic-sheet").textContent);
    const c = document.querySelector("#ic-sheet .btn[data-ic-sheet-close]"); if(c) c.click();
    return ok;
  });
  await icSyncPage.click('[data-ic-deck="t_ox"]');
  await icSyncPage.click("[data-ic-start]");
  await icSyncPage.keyboard.press("o");
  await icSyncPage.click("[data-ic-quit]");
  await icSyncPage.waitForFunction(() => document.getElementById("ic-minutes") !== null);
  await icSyncPage.waitForTimeout(1500);
  assert(icPutBody && icPutBody.message.includes("一問一答"), "ichimon results should be committed when a session ends");
  const icPutSessions = JSON.parse(Buffer.from(icPutBody.content, "base64").toString("utf8")).sessions;
  assert(icPutSessions.length === 2 && icPutSessions.some((x) => x.id === "ic_1000_aaaaaa"), "the saved file should merge the other device's session with this device's");
  const icSyncCards = await icSyncPage.evaluate(() => JSON.parse(localStorage.getItem("mokumoku_ichimon_v1")).cards);
  assert(icSyncCards["ox:1"].n === 2 && icSyncCards["ox:1"].ok === true, "card results should be rebuilt from all sessions (latest result wins)");

  // 国際関係ブリーフ: 一覧(欠番はタップ不可)・ブックマーク・まちがい集(解き直して正解すると消える)。
  const kkPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  kkPage.on("console", (msg) => { if (msg.type() === "error") errors.push("console.error(kokusai): " + msg.text()); });
  kkPage.on("pageerror", (err) => errors.push("pageerror(kokusai): " + err.message));
  await kkPage.route("**/today_tasks.json*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(todayTasksMock) }));
  await kkPage.route("**/progress.json*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: progressMockBody() }));
  await kkPage.route("**/plan.json*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: planMockBody() }));
  const kkIndex = { updated: "2026-10-24", items: [
    { n: 2, date: "2026-10-24", theme: "テスト第2回", file: "02.html" },
    { n: 1, date: "2026-10-23", theme: "テスト欠番", file: "01.html", missing: true },
  ] };
  const kkQuestions = { updated: "2026-10-24", items: [
    { id: "2-q0", n: 2, date: "2026-10-24", theme: "テスト第2回", kind: "本日の一問", no: 0, q: "テスト問題文", opts: { ア: "選択肢ア", イ: "選択肢イ", ウ: "選択肢ウ", エ: "選択肢エ" }, ans: "イ", exp: "テスト解説" },
  ] };
  await kkPage.route("https://raw.githubusercontent.com/**/data/briefs/kokusai/**", (route) => {
    const u = route.request().url();
    if (u.includes("index.json")) return route.fulfill({ status: 200, contentType: "text/plain", body: JSON.stringify(kkIndex) });
    if (u.includes("questions.json")) return route.fulfill({ status: 200, contentType: "text/plain", body: JSON.stringify(kkQuestions) });
    return route.fulfill({ status: 200, contentType: "text/plain", body: "<html><head></head><body><h1>テスト本文</h1></body></html>" });
  });
  await kkPage.goto("file://" + INDEX_HTML);
  await kkPage.evaluate(() => {
    // 第2回の本日の一問に、すでに1回不正解で答えている状態
    localStorage.setItem("kokusai_quiz_v1", JSON.stringify([{ qid: "2-q0", issue: 2, picked: "ア", ans: "イ", ok: false, ts: "2026-10-24T09:00:00+09:00" }]));
  });
  await kkPage.reload();
  await kkPage.click('nav.tabbar button[data-tab="kokusai"]');
  await kkPage.waitForSelector(".kk-item");
  assert((await kkPage.locator(".kk-item").count()) === 2, "the brief list should show both issues");
  // 部屋タブにも「今日の復習」が出る(端末に保存した問題で数える)。タップで復習が始まる
  await kkPage.click('nav.tabbar button[data-tab="room"]');
  assert((await kkPage.locator("#room-review").innerText()).includes("今日の復習"), "the room tab should offer today's review when something is due");
  await kkPage.click('[data-action="room-review"]');
  await kkPage.waitForSelector('[data-action="kk-review-pick"]');
  await kkPage.click('[data-action="kk-review-pick"][data-k="ア"]');
  assert((await kkPage.locator(".kk-rv-exp").count()) === 1 && !(await kkPage.locator(".kk-rv-exp").evaluate((d) => d.open)), "after answering, the explanation should be folded (closed) so the review fits on one screen");
  assert(await kkPage.locator('[data-action="kk-review-next"]').isVisible(), "the next button should be visible right after answering");
  await kkPage.click('[data-action="kk-to-list"]');
  // この確認で答えた分を取り消し、以降のテストは、元の「1回だけ×」の状態から始める
  await kkPage.evaluate(() => localStorage.setItem("kokusai_quiz_v1", JSON.stringify([{ qid: "2-q0", issue: 2, picked: "ア", ans: "イ", ok: false, ts: "2026-10-24T09:00:00+09:00" }])));
  await kkPage.reload();
  await kkPage.click('nav.tabbar button[data-tab="kokusai"]');
  await kkPage.waitForSelector(".kk-item");
  assert((await kkPage.locator(".kk-item.missing").count()) === 1, "a missing issue should be greyed out");
  assert((await kkPage.locator('.kk-item.missing [data-action="kk-open"], .kk-item.missing[data-action="kk-open"]').count()) === 0, "a missing issue must not be tappable");
  assert((await kkPage.locator(".kk-item.missing").innerText()).includes("欠番"), "a missing issue should be labelled 欠番");
  assert((await kkPage.locator(".kk-updated").innerText()).includes("2026-10-24"), "the updated date should be shown");
  // ブックマーク
  await kkPage.click('[data-action="kk-bm"][data-n="2"]');
  assert((await kkPage.locator('[data-action="kk-bm"][data-n="2"]').innerText()).trim() === "★", "tapping ☆ should bookmark the issue");
  // 本文: 全画面で開き、sandboxは allow-scripts のみ(allow-same-originは付けない)
  await kkPage.click('[data-action="kk-open"][data-n="2"]');
  await kkPage.waitForSelector("#kk-reader iframe");
  const sandbox = await kkPage.locator("#kk-reader iframe").getAttribute("sandbox");
  assert(sandbox === "allow-scripts", "the brief iframe must be sandboxed with allow-scripts only, got: " + sandbox);
  await kkPage.click('[data-action="kk-back"]');
  assert((await kkPage.locator("#kk-reader").count()) === 0, "back should return to the list");
  // まちがい集: ×の問題が出て、解き直して正解すると一覧から消える(履歴は残る)
  assert((await kkPage.locator('[data-action="kk-mistakes"]').innerText()).includes("(1)"), "the mistakes button should count 1 wrong question");
  await kkPage.click('[data-action="kk-mistakes"]');
  await kkPage.waitForSelector(".kk-mcard");
  assert((await kkPage.locator(".kk-mcard").count()) === 1, "the wrong question should be listed");
  // 苦手(2回以上の×)の絞り込み: 1回しか間違えていない問題は「苦手だけ」には出ない
  await kkPage.click('[data-action="kk-weak"]');
  assert((await kkPage.locator(".kk-mcard").count()) === 0, "a question wrong only once is not 苦手");
  await kkPage.click('[data-action="kk-weak"]');
  assert((await kkPage.locator(".kk-mcard").count()) === 1, "turning the 苦手 filter off should list it again");
  await kkPage.click('.kk-mcard [data-action="kk-resolve"]');
  await kkPage.click('.kk-mcard [data-action="kk-pick"][data-k="ア"]');
  assert((await kkPage.locator(".kk-mcard").count()) === 1, "a wrong re-answer keeps the card in the list");
  await kkPage.click('.kk-mcard [data-action="kk-pick"][data-k="イ"]');
  assert((await kkPage.locator(".kk-result").innerText()).includes("復習できました"), "a correct re-answer should show 復習できました");
  await kkPage.waitForTimeout(2000);
  assert((await kkPage.locator(".kk-mcard").count()) === 1, "the card must stay on screen after answering (no automatic screen switch)");
  await kkPage.click('.kk-mcard [data-action="kk-done"]');
  await kkPage.waitForFunction(() => document.querySelectorAll(".kk-mcard").length === 0, null, { timeout: 5000 });
  const kkHistory = await kkPage.evaluate(() => JSON.parse(localStorage.getItem("kokusai_quiz_v1")));
  assert(kkHistory.length === 3 && kkHistory[kkHistory.length - 1].ok === true, "answers should be appended as history, not overwritten, got: " + kkHistory.length);

  // タスクから勉強を始める: 科目・時間・題名を引き継いでタイマーが始まり、予定の時間までやり切るとタスクにチェックが付く。
  const tsPage = await browser.newPage({ viewport: { width: 390, height: 900 } });
  tsPage.on("pageerror", (err) => errors.push("pageerror(taskstart): " + err.message));
  await tsPage.route("**/today_tasks.json*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    date: todayStr(), isRestDay: false,
    tasks: [{ id: "ts1", text: "憲法 講義1コマ", subject: "憲法", minutes: 90 }, { id: "ts2", text: "英字ニュースを読む", subject: "", minutes: 20 }],
  }) }));
  await tsPage.goto("file://" + INDEX_HTML);
  await tsPage.click('nav.tabbar button[data-tab="tasks"]');
  await tsPage.waitForSelector(".task-start");
  assert((await tsPage.locator(".task-start").count()) === 2, "each unchecked task should have a start button");
  await tsPage.click(".task-row:nth-child(1) .task-start");
  assert(await tsPage.locator("#timer-clock").isVisible(), "starting from a task should open the timer on the room tab");
  const tsMeta = await tsPage.locator(".timer-meta").innerText();
  assert(tsMeta.includes("憲法") && tsMeta.includes("目標 90分"), "the timer should carry the task's subject and minutes, got: " + tsMeta);
  await tsPage.evaluate(() => {
    const a = JSON.parse(localStorage.getItem("mokumoku_active_v1"));
    a.startedAt = Date.now() - 95 * 60000;   // 予定の90分を、やり切った状態にする
    localStorage.setItem("mokumoku_active_v1", JSON.stringify(a));
  });
  await tsPage.reload();
  await tsPage.click('[data-action="stop-session"]');
  assert((await tsPage.locator('#modal-content [data-action="task-next"]').innerText()).includes("英字ニュース"), "the completion screen should offer the next unchecked task");
  await tsPage.click('[data-action="close-modal"]');
  await tsPage.click('nav.tabbar button[data-tab="tasks"]');
  assert((await tsPage.locator(".task-progress-line").innerText()).includes("1/2 完了"), "finishing the planned time should check the task");
  assert((await tsPage.locator(".task-start").count()) === 1, "a checked task has no start button");

  // 今日の復習: 一問一答で×にしたカードも、日数がたてば復習に出る(間隔反復)。解くと結果が一問一答の記録に残る。
  await kkPage.evaluate(() => {
    const old = Date.now() - 3 * 86400000;
    localStorage.setItem("mokumoku_ichimon_v1", JSON.stringify({
      sessions: [{ id: "ic_" + old + "_zzzzzz", date: "2026-10-20", deckId: "t_ox", deckTitle: "テストOX", minutes: 2, rows: [{ cardId: "ox:1", ok: false }] }],
      cards: { "ox:1": { ok: false, at: new Date(old).toISOString(), n: 1 } },
    }));
    localStorage.removeItem("kokusai_quiz_v1");
  });
  // GitHubへの保存は、1問ごとではなく、復習をやめる・終えたときにまとめて1回だけ行う
  let icReviewPuts = 0;
  await kkPage.evaluate(() => localStorage.setItem("mokumoku_gh_token_v1", "github_pat_dummy"));
  await kkPage.route("https://api.github.com/repos/**/contents/data/*", async (route) => {
    const req = route.request();
    const empty = req.url().includes("ichimon_results") ? { version: 1, sessions: [] } : { version: 1, attempts: [] };
    if (req.method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sha: "s1", content: Buffer.from(JSON.stringify(empty), "utf8").toString("base64") }) });
    }
    if (req.url().includes("ichimon_results")) icReviewPuts++;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ content: { sha: "s2" } }) });
  });
  await kkPage.reload();
  await kkPage.click('nav.tabbar button[data-tab="kokusai"]');
  await kkPage.waitForFunction(() => /一問一答1/.test((document.querySelector(".kk-review") || {}).textContent || ""), null, { timeout: 8000 });
  await kkPage.click('[data-action="kk-review-start"]');
  await kkPage.click('[data-action="kk-review-ic"][data-v="1"]');   // ox:1 の正解は○
  assert((await kkPage.locator(".kk-rv-res").innerText()).includes("正解"), "answering the due ichimon card correctly should be marked");
  assert((await kkPage.locator('#kokusai-card.kk-rv [data-action="kk-review-next"]').count()) === 1, "the review screen should have the review class and a next button");
  const icAfterReview = await kkPage.evaluate(() => JSON.parse(localStorage.getItem("mokumoku_ichimon_v1")));
  assert(icAfterReview.sessions.length === 2 && icAfterReview.cards["ox:1"].ok === true, "the review result should be recorded as an ichimon session");
  await kkPage.waitForTimeout(1500);
  assert(icReviewPuts === 0, "an answer during review must not be saved one by one, puts so far: " + icReviewPuts);
  await kkPage.click('[data-action="kk-to-list"]');   // 復習をやめると、たまった結果をまとめて保存する
  await kkPage.waitForFunction(() => true);
  await kkPage.waitForTimeout(2000);
  assert(icReviewPuts === 1, "leaving the review should save the results once, puts: " + icReviewPuts);
  // アプリを閉じる/隠すときの保存(visibilitychange と pagehide)は、変更がなければ、余分に保存しない
  await kkPage.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pagehide"));
  });
  await kkPage.waitForTimeout(2500);
  assert(icReviewPuts === 1, "hiding the app with nothing new must not save again, puts: " + icReviewPuts);

  // 「数的処理 解き直し」のタスクから始めて終えると、復習として記録する設定が最初からオンで、数的処理が選ばれている
  const rvPage = await browser.newPage({ viewport: { width: 390, height: 900 } });
  rvPage.on("pageerror", (err) => errors.push("pageerror(taskreview): " + err.message));
  await rvPage.route("**/today_tasks.json*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    date: todayStr(), isRestDay: false, tasks: [{ id: "rv1", text: "数的処理 解き直し", subject: "数的処理", minutes: 60 }],
  }) }));
  await rvPage.goto("file://" + INDEX_HTML);
  await rvPage.click('nav.tabbar button[data-tab="tasks"]');
  await rvPage.click(".task-start");
  await rvPage.click('[data-action="stop-session"]');
  assert((await rvPage.locator('#modal-review [data-action="review-tag"][data-tag="数的処理"]').getAttribute("aria-pressed")) === "true", "a 解き直し task should open the review tag 数的処理 already selected");
  await rvPage.click('[data-action="close-modal"]');
  const rvRec = await rvPage.evaluate(() => { const l = JSON.parse(localStorage.getItem("mokumoku_records_v1")); return l[l.length - 1].reviewTags; });
  assert(JSON.stringify(rvRec) === JSON.stringify(["数的処理"]), "the record should be saved as a 数的処理 review, got: " + JSON.stringify(rvRec));

  // 記録の手動追加: 前回の時間・科目を、次の初期値にする(日付とメモは毎回あたらしく)
  const manPage = await browser.newPage({ viewport: { width: 390, height: 900 } });
  manPage.on("pageerror", (err) => errors.push("pageerror(manual): " + err.message));
  await manPage.route("**/today_tasks.json*", (route) => route.fulfill({ status: 404, body: "" }));
  await manPage.route("**/progress.json*", (route) => route.fulfill({ status: 404, body: "" }));
  await manPage.goto("file://" + INDEX_HTML);
  await manPage.click('nav.tabbar button[data-tab="data"]');
  await manPage.click('[data-action="manual-open"]');
  const durValues = await manPage.locator("#manual-duration option").evaluateAll((os) => os.map((o) => o.value));
  assert(durValues.length <= 12, "the manual duration list should be short, got " + durValues.length);
  await manPage.selectOption("#manual-subject-select", "政治学");
  await manPage.selectOption("#manual-duration", "90");
  await manPage.fill("#manual-note", "前回のメモ");
  await manPage.click('[data-action="manual-submit"]');
  await manPage.click('[data-action="manual-open"]');
  assert((await manPage.inputValue("#manual-subject-select")) === "政治学", "the next manual entry should start with the last subject");
  assert((await manPage.inputValue("#manual-duration")) === "90", "the next manual entry should start with the last duration");
  assert((await manPage.inputValue("#manual-note")) === "", "the memo must start empty");
  // 記録の編集: 履歴の ✎ から時間とメモを直せる(idは変わらず、件数も増えない)
  await manPage.click('[data-action="manual-cancel"]');
  const editId = await manPage.evaluate(() => JSON.parse(localStorage.getItem("mokumoku_records_v1"))[0].id);
  await manPage.click('[data-action="edit-record"]');
  assert((await manPage.inputValue("#manual-note")) === "前回のメモ", "editing should load the record's memo");
  assert((await manPage.locator('[data-action="manual-submit"]').innerText()).includes("変更を保存"), "the submit button should say 変更を保存 while editing");
  await manPage.selectOption("#manual-duration", "45");
  await manPage.fill("#manual-note", "直したメモ");
  await manPage.click('[data-action="manual-submit"]');
  const editedRecs = await manPage.evaluate(() => JSON.parse(localStorage.getItem("mokumoku_records_v1")));
  assert(editedRecs.length === 1 && editedRecs[0].id === editId && editedRecs[0].actualMinutes === 45 && editedRecs[0].note === "直したメモ", "the record should be updated in place, got: " + JSON.stringify(editedRecs));

  // データが読み込めないときも、ほかの機能に影響しない
  const icFailPage = await rawNewPage({ viewport: { width: 390, height: 844 } });
  icFailPage.on("pageerror", (err) => errors.push("pageerror(ichimon fail): " + err.message));
  await icFailPage.route("**/*.json*", (route) => route.fulfill({ status: 404, body: "" }));
  await icFailPage.goto("file://" + INDEX_HTML);
  await icFailPage.click('nav.tabbar button[data-tab="ichimon"]');
  await icFailPage.waitForFunction(() => /データを読み込めませんでした/.test(document.getElementById("ichimon-card").textContent));
  await icFailPage.click('nav.tabbar button[data-tab="tasks"]');
  assert((await icFailPage.locator("#minitest-card").innerText()).includes("ミニテストを記録"), "other cards keep working when ichimon fails");
  assert(!(await icFailPage.locator("#minitest-card").innerText()).includes("問題つきミニテスト"), "question-based mini tests are no longer on the tasks tab");
  await icFailPage.click('nav.tabbar button[data-tab="ichimon"]');
  await icFailPage.click('#ic-seg [data-ic-seg="mt"]');
  assert((await icFailPage.locator("#mttest-card").innerText()).includes("問題つきミニテスト"), "question-based mini tests live on the ichimon tab");

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
