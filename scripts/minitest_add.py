#!/usr/bin/env python3
"""問題文つきミニテストを data/minitests/ に登録する。
使い方: python3 scripts/minitest_add.py <テストJSON> [--check]
  --check : 形式の検証だけ行い、書き込まない
JSONの形式は data/minitests/README.md を参照。トークンは表示しない。
GitHubへはAPIで反映する(.git-credentials のトークンを使う)。同じidは上書き、index.jsonは追記して日付順に並べる。"""
import re, os, sys, json, base64, urllib.request, urllib.parse
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = 'shenyilangguhe013-cpu/mokumoku'
FIELDS = {"数的処理": ["判断推理", "数的推理", "資料解釈"], "文章理解": ["現代文", "英文"], "人文科学": ["日本史", "世界史"],
          "社会科学": ["政治", "経済", "法律", "社会"], "自然科学": ["物理", "化学", "数学"], "時事": ["時事"]}
NAMES = ["水曜A", "土曜B", "その他"]

def validate(doc):
    errs = []
    for k in ("id", "date", "name", "title", "questions"):
        if not doc.get(k): errs.append("必須項目がありません: " + k)
    if errs: return errs
    if not re.fullmatch(r"[0-9A-Za-z_]+", doc["id"]): errs.append("id は英数字と_だけ: " + doc["id"])
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", doc["date"]): errs.append("date は YYYY-MM-DD")
    if doc["name"] not in NAMES: errs.append("name は " + "／".join(NAMES))
    seen = set()
    for q in doc["questions"]:
        n = q.get("q")
        if not isinstance(n, int) or n in seen: errs.append("q が整数でない、または重複: %r" % n); continue
        seen.add(n)
        if not q.get("stem"): errs.append("q%d: stem がありません" % n)
        o = q.get("options")
        if o is not None and (not isinstance(o, list) or not all(isinstance(x, str) and x for x in o)): errs.append("q%d: options は文字列のリスト" % n)
        a = q.get("answer")
        if isinstance(o, list) and o:
            if not isinstance(a, int) or not 1 <= a <= len(o): errs.append("q%d: answer は 1〜%d の整数" % (n, len(o)))
        elif a in (None, ""): errs.append("q%d: answer がありません" % n)
        if not q.get("explain"): errs.append("q%d: explain がありません" % n)
        s, f = q.get("subject"), q.get("field")
        if s not in FIELDS or f not in FIELDS[s]: errs.append("q%d: subject/field が分野表にありません: %r/%r" % (n, s, f))
    return errs

def token():
    cred = open(os.path.join(ROOT, '.git-credentials'), encoding='utf-8').read()
    return re.search(r'https://[^:\s]+:([^@\s]+)@github\.com', cred).group(1)

def api(tok, method, path, body=None):
    req = urllib.request.Request('https://api.github.com/repos/%s/contents/%s' % (REPO, urllib.parse.quote(path)),
        data=json.dumps(body).encode() if body else None, method=method,
        headers={'Authorization': 'token ' + tok, 'User-Agent': 'minitest-add', 'Accept': 'application/vnd.github+json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, {}

def put(tok, path, text, msg):
    for _ in range(2):   # 409(同時更新)は1回だけやり直す
        st, cur = api(tok, 'GET', path)
        body = {'message': msg, 'content': base64.b64encode(text.encode('utf-8')).decode(), 'branch': 'main'}
        if st == 200: body['sha'] = cur['sha']
        st2, _ = api(tok, 'PUT', path, body)
        if st2 in (200, 201): return True
    return False

def main():
    if len(sys.argv) < 2: print(__doc__); sys.exit(2)
    doc = json.load(open(sys.argv[1], encoding='utf-8'))
    errs = validate(doc)
    if errs:
        print("NG 形式エラー:"); [print(" -", e) for e in errs]; sys.exit(1)
    print("OK 形式:", doc["id"], len(doc["questions"]), "問")
    if "--check" in sys.argv: return
    tok = token()
    text = json.dumps(doc, ensure_ascii=False, indent=1)
    os.makedirs(os.path.join(ROOT, 'data', 'minitests'), exist_ok=True)
    open(os.path.join(ROOT, 'data', 'minitests', doc["id"] + ".json"), 'w', encoding='utf-8').write(text)
    if not put(tok, 'data/minitests/%s.json' % doc["id"], text, 'ミニテスト: %s を追加' % doc["id"]): print("NG 問題ファイルの反映に失敗"); sys.exit(1)
    st, cur = api(tok, 'GET', 'data/minitests/index.json')
    idx = json.loads(base64.b64decode(cur['content'])) if st == 200 else {"version": 1, "tests": []}
    tests = [t for t in idx.get("tests", []) if t.get("id") != doc["id"]]
    tests.append({"id": doc["id"], "date": doc["date"], "name": doc["name"], "title": doc["title"], "file": doc["id"] + ".json"})
    tests.sort(key=lambda t: (t["date"], t["id"]))
    idx["tests"] = tests
    itext = json.dumps(idx, ensure_ascii=False, indent=2)
    if not put(tok, 'data/minitests/index.json', itext, 'ミニテスト: 目次に %s を追加' % doc["id"]): print("NG 目次の反映に失敗"); sys.exit(1)
    open(os.path.join(ROOT, 'data', 'minitests', 'index.json'), 'w', encoding='utf-8').write(itext)
    print("OK 反映:", doc["id"], "(目次", len(tests), "件)")

if __name__ == '__main__': main()
