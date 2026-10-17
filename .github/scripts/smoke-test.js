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
          else if (path.endsWith("/members")) { window.__fb.paths.push(path); listeners.push(cb); cb(snap(JSON.parse(JSON.stringify(members)))); }
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
      paths: [],
      addFriend(uid, data) { members[uid] = resolve(data); notify(); },
    };
  });

  await sharedPage.goto("file://" + INDEX_HTML);
  await sharedPage.waitForSelector("#room-shared");
  assert((await sharedPage.locator("#room-shared").innerText()).includes("友だちと同じ部屋で勉強する"), "shared card should ask for a nickname first");
  assert(
    !(await sharedPage.locator("#shared-room-input").count()),
    "there must be no room-code input: everyone joins the fixed room automatically"
  );

  // 名前が空のままでは入れない
  await sharedPage.click('[data-action="shared-join"]');
  assert((await sharedPage.locator("#room-shared").innerText()).includes("この名前で入る"), "empty nickname must be rejected");

  // ニックネームを入れるだけで、固定の部屋に自動で入る
  await sharedPage.fill("#shared-name-input", "しんしん");
  await sharedPage.click('[data-action="shared-join"]');
  await sharedPage.waitForTimeout(500);
  const joinedText = await sharedPage.locator("#room-shared").innerText();
  assert(joinedText.includes("接続中・友だち 0人"), "should show connected state with 0 friends, got: " + joinedText);
  const joinedPath = await sharedPage.evaluate(() => window.__fb.paths[0] || "");
  assert(joinedPath.includes("rooms/mokumoku-room-2026/members"), "should join the fixed room, got: " + joinedPath);

  // 再読み込みしても、入力なしで自動的に同じ部屋へ入る
  await sharedPage.reload();
  await sharedPage.waitForSelector("#room-shared");
  await sharedPage.waitForTimeout(500);
  const autoText = await sharedPage.locator("#room-shared").innerText();
  assert(autoText.includes("接続中・友だち 0人") && autoText.includes("しんしん"), "should auto-join after reload without any input, got: " + autoText);

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

  // 「共有をやめる」と自分のデータが消え、「共有部屋に戻る」で再び自動接続する
  await sharedPage.click('[data-action="stop-session"]');
  await sharedPage.click('[data-action="close-modal"]');
  await sharedPage.click('[data-action="shared-leave"]');
  await sharedPage.waitForTimeout(300);
  assert(await sharedPage.evaluate(() => !("me" in window.__fb.members)), "leaving should remove own data from the room");
  assert((await sharedPage.locator("#room-shared").innerText()).includes("共有部屋に戻る"), "leave should offer a way back");
  assert((await sharedPage.locator("#room-roster").innerText()).includes("高橋 美咲"), "rivals return after leaving");
  await sharedPage.click('[data-action="shared-resume"]');
  await sharedPage.waitForTimeout(500);
  assert((await sharedPage.locator("#room-shared").innerText()).includes("接続中"), "should reconnect after tapping resume");
  assert(await sharedPage.evaluate(() => "me" in window.__fb.members), "own data should be published again after resume");

  // 「名前を変える」で入力欄に戻る
  await sharedPage.click('[data-action="shared-rename"]');
  assert((await sharedPage.locator("#room-shared").innerText()).includes("この名前で入る"), "rename should show the nickname form again");

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
  await mergePage.click('nav.tabbar button[data-tab="data"]');
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
  await authPage.click("#btn-github-save");
  await authPage.waitForTimeout(500);
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

  // 復習の対象外の科目(数的処理)では、自動では選ばれない
  await reviewPage.click('[data-action="choose-type"][data-type="qualification"]');
  await reviewPage.selectOption("#subject-select", "数的処理");
  await reviewPage.click('[data-action="start-session"]');
  await reviewPage.click('[data-action="stop-session"]');
  await reviewPage.click('[data-action="review-toggle"]');
  assert(
    (await reviewPage.locator('#modal-review [aria-pressed="true"][data-tag]').count()) === 0,
    "no review tag should be preselected for a non-review subject"
  );
  await reviewPage.click('[data-action="close-modal"]');

  // 手動追加: 科目「行政学」→ 復習をオンで行政学が選ばれ、科目を変えるとタグも追従する
  await reviewPage.click('nav.tabbar button[data-tab="data"]');
  await reviewPage.click('[data-action="manual-open"]');
  await reviewPage.click('[data-action="manual-type"][data-type="qualification"]');
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
