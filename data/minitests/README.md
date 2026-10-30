# ミニテスト（問題文つき）Claude Code用の手順

しんしん（古賀慎一朗）の「もくもく部屋」アプリは、このフォルダの問題を読んで、画面で○×の自己採点ができる。
ミニテストを作ったら、**作成と同時に**次の2ファイルを書くこと。

## 1. 問題ファイル `data/minitests/<id>.json`
`<id>` は `YYYYMMDD_名前`（例 `20261030_wedA`）。
```json
{
  "id": "20261030_wedA",
  "date": "2026-10-30",
  "name": "水曜A",
  "title": "時事・10問",
  "questions": [
    {"q": 1, "subject": "時事", "field": "時事",
     "stem": "問題文（改行は \\n）",
     "options": ["選択肢1", "選択肢2", "選択肢3", "選択肢4", "選択肢5"],
     "answer": 3,
     "explain": "解説（なぜ正解か／他の選択肢の誤り）"}
  ]
}
```
- `name` は 水曜A／土曜B／その他 のいずれか。
- `subject`/`field` は app の分野表記に合わせる：数的処理（判断推理・数的推理・資料解釈）／文章理解（現代文・英文）／人文科学（日本史・世界史）／社会科学（政治・経済・法律・社会）／自然科学（物理・化学・数学）／時事（時事）。地理・生物・地学・思想・文学芸術は出さない。
- `answer` は選択肢の番号（1始まり）。選択肢のない問題は文字列で答えを書く。
- 難しい漢字は `｜漢字《よみ》` でふりがなを付けられる。
- 問題番号 `q` は 1 から連番。後から変えない（採点記録が `q` で結びつく）。

## 2. 目次 `data/minitests/index.json`
```json
{"version": 1, "tests": [{"id": "20261030_wedA", "date": "2026-10-30", "name": "水曜A", "title": "時事・10問", "file": "20261030_wedA.json"}]}
```
既存の `tests` に **追記** する（上書きしない）。

## 3. 採点結果を読む
アプリで○×を保存すると `data/minitest_export.json` の `sessions` に入る。`testId` が上の `id` と一致するものが、問題つきミニテストの記録。
```json
{"id":"mt_...","date":"2026-10-30","name":"水曜A","testId":"20261030_wedA",
 "rows":[{"q":1,"subject":"時事","field":"時事","ok":true},{"q":2,"subject":"時事","field":"時事","ok":false}]}
```
- 正答率 = `ok:true` の数 ÷ `rows` の数。同じ `testId` を複数回解いたら、日付・idが新しい記録が最新。
- 間違えた問題 = `ok:false` の `q` を問題ファイルと突き合わせる。分野別は `subject`/`field` で集計。

## 4. 一問一答
アプリは問題ファイルの**全問**から、自動で「ミニテスト（出た問題すべて）」のめくりカードを作る（カードid `mt:<testId>:<q>`）。追加作業は不要。
○×形式の一問一答も作りたいときは、`data/ichimon/` に `ichimon_<deck>.json`（`type:"ox"`）を作り、`data/ichimon/index.json` の `decks` に追記する。形式は既存の `ichimon_kiso_jiji.json` を見本にする（カードid は `mt:<testId>:<q>:ox1` のように重ならないものにする）。

## 5. 確認
- JSONとして正しいか（`python3 -m json.tool`）。
- `index.json` の `file` が実在するか。
- 変更をコミットして `main` にpushする（GitHub Pagesに数分で反映）。
