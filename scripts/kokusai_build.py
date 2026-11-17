#!/usr/bin/env python3
"""国際関係ブリーフ（新形式）のビルダー。標準ライブラリだけで動く。
使い方:
  python3 scripts/kokusai_build.py spec.json            # 反映: NN.html / index.json / questions.json / map.json を更新
  python3 scripts/kokusai_build.py spec.json --out x.html   # 確認用: HTMLだけを書く（データは更新しない）
spec.json の書き方は scripts/kokusai_kit/README.md を見る。
"""
import json, re, sys, os, argparse, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BR = os.path.join(ROOT, "data", "briefs", "kokusai")
KIT = os.path.join(ROOT, "scripts", "kokusai_kit")
LET = ["ア", "イ", "ウ", "エ"]


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def dump(path, obj, indent=1):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=indent)
        f.write("\n")


def short(text, n=110):
    text = re.sub(r"\s+", " ", text or "").strip()
    if len(text) <= n:
        return text
    cut = text[:n]
    i = max(cut.rfind("。"), cut.rfind("．"))
    return cut[: i + 1] if i > 30 else cut + "…"


def year_key(y):
    m = re.search(r"(\d{3,4})", y or "")
    return int(m.group(1)) if m else 0


def retry_items(n, used_qids, qmap, limit):
    exp = load(os.path.join(ROOT, "data", "kokusai_quiz_export.json"), {"attempts": []})
    latest = {}
    for a in exp.get("attempts", []):
        q = a.get("qid")
        if q and (q not in latest or a.get("ts", "") >= latest[q].get("ts", "")):
            latest[q] = a
    wrong = [a for a in latest.values() if a.get("ok") is False and a["qid"] in qmap
             and int(qmap[a["qid"]].get("n", 0)) != n and a["qid"] not in used_qids]
    wrong.sort(key=lambda a: a.get("ts", ""))
    out, seen_issue = [], set()
    for a in wrong:
        q = qmap[a["qid"]]
        if q["n"] in seen_issue and len(wrong) > limit:
            continue
        seen_issue.add(q["n"])
        opts = q.get("opts", {})
        if any(k not in opts for k in LET) or q.get("ans") not in LET:
            continue
        out.append({"qid": q["id"], "issue": q["n"], "q": re.sub(r"^[(（][^)）]*[)）]\s*[：:]?\s*", "", q["q"]),
                    "o": [opts[k] for k in LET], "a": LET.index(q["ans"]), "e": q.get("exp", "")})
        if len(out) >= limit:
            break
    return out


def build(spec, write):
    n = int(spec["n"])
    errs = []
    qdoc = load(os.path.join(BR, "questions.json"), {"updated": "", "items": []})
    qmap = {q["id"]: q for q in qdoc["items"]}
    mapdoc = load(os.path.join(BR, "map.json"), {"updated": "", "nodes": []})
    old_nodes = [x for x in mapdoc["nodes"] if x["n"] != n]
    all_ids = {x["id"] for x in old_nodes}
    new_q, kept = [], set()
    # クイズ: qid を割り当てる
    qparts = [p for p in spec["parts"] if p["type"] == "quiz"]
    for p in qparts:
        for it in p["items"]:
            if "keep" in it:
                kept.add(it["keep"])
    nextno = 0
    for p in qparts:
        items = []
        for it in p["items"]:
            if "keep" in it:
                q = qmap.get(it["keep"])
                if not q:
                    errs.append("keep が見つからない: " + it["keep"]); continue
                o = q["opts"]
                items.append({"qid": q["id"], "q": re.sub(r"^[(（][^)）]*[)）]\s*[：:]?\s*", "", q["q"]), "o": [o[k] for k in LET],
                              "a": LET.index(q["ans"]), "e": q.get("exp", ""), "kind": q.get("kind", "")})
            else:
                if len(it["o"]) != 4 or not (0 <= it["a"] < 4):
                    errs.append("クイズの選択肢は4つ・aは0〜3: " + it["q"][:20]); continue
                qid = "%d-q%d" % (n, nextno)
                while qid in kept:
                    nextno += 1; qid = "%d-q%d" % (n, nextno)
                new_q.append({"id": qid, "n": n, "date": spec["date"], "theme": spec["theme"],
                              "kind": it.get("kind", "復習クイズ"), "no": nextno, "q": it["q"],
                              "opts": {LET[i]: it["o"][i] for i in range(4)}, "ans": LET[it["a"]], "exp": it.get("e", "")})
                items.append({"qid": qid, "q": it["q"], "o": it["o"], "a": it["a"], "e": it.get("e", ""), "kind": it.get("kind", "")})
                nextno += 1
        p["items"] = items
    used = set(kept) | {x["id"] for x in new_q}
    for p in spec["parts"]:
        if p["type"] == "retry":
            p["items"] = retry_items(n, used, qmap, int(p.get("max", 2)))
    # 知識マップ
    mine = []
    for p in spec["parts"]:
        if p["type"] != "map":
            continue
        for nd in p["nodes"]:
            if not (0 <= nd["r"] < len(p["rows"]) and 0 <= nd["l"] < len(p["lanes"])):
                errs.append("ノードの位置が範囲外: " + nd["id"])
            for t in nd.get("to", []):
                if t not in {x["id"] for x in p["nodes"]}:
                    errs.append("to が見つからない: %s -> %s" % (nd["id"], t))
            for r in nd.get("refs", []):
                if r not in all_ids:
                    errs.append("refs が既存ノードにない（無視）: " + r)
            mine.append({"id": "%d-%s" % (n, nd["id"]), "n": n, "t": nd["t"], "y": nd.get("y", ""),
                         "ys": nd.get("ys") or year_key(nd.get("y", "")),
                         "to": ["%d-%s" % (n, t) for t in nd.get("to", [])],
                         "refs": [r for r in nd.get("refs", []) if r in all_ids]})
            nd["refs"] = [r for r in nd.get("refs", []) if r in all_ids]
    cum = old_nodes + mine
    spec["cum"] = cum
    css = open(os.path.join(KIT, "kit.css"), encoding="utf-8").read()
    js = open(os.path.join(KIT, "kit.js"), encoding="utf-8").read()
    data = json.dumps({k: spec[k] for k in ("n", "date", "theme", "subtitle", "minutes", "glossary", "parts", "cum") if k in spec},
                      ensure_ascii=False).replace("</", "<\\/").replace("<!--", "<\\!--")
    html = ('<!doctype html>\n<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n'
            "<title>国際関係 第%d回 %s</title><style>\n%s\n%s</style></head><body><div class=\"wrap\" id=\"app\"></div>\n"
            "<script id=\"kdata\" type=\"application/json\">%s</script>\n<script>\n%s\n</script></body></html>\n"
            % (n, spec["theme"], css, spec.get("extra_css", ""), data, js))
    return html, errs, new_q, mine, qdoc, mapdoc, old_nodes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("--out")
    a = ap.parse_args()
    spec = json.load(open(a.spec, encoding="utf-8"))
    html, errs, new_q, mine, qdoc, mapdoc, old_nodes = build(spec, not a.out)
    for e in errs:
        print("WARN", e)
    if a.out:
        open(a.out, "w", encoding="utf-8").write(html)
        print("OK html", a.out, len(html)); return
    n = int(spec["n"])
    fn = "%d.html" % n if n >= 100 else "%02d.html" % n
    open(os.path.join(BR, fn), "w", encoding="utf-8").write(html)
    today = spec["date"]
    # questions.json
    items = [q for q in qdoc["items"] if not (q["n"] == n and q["id"] in {x["id"] for x in new_q})] + new_q
    qdoc["items"] = items; qdoc["updated"] = today
    dump(os.path.join(BR, "questions.json"), qdoc)
    # map.json
    mapdoc["nodes"] = old_nodes + mine; mapdoc["updated"] = today
    dump(os.path.join(BR, "map.json"), mapdoc)
    # index.json
    idx = load(os.path.join(BR, "index.json"), {"updated": "", "items": []})
    its = [x for x in idx["items"] if x["n"] != n] + [{"n": n, "date": today, "theme": spec["theme"], "file": fn}]
    its.sort(key=lambda x: -x["n"]); idx["items"] = its; idx["updated"] = today
    dump(os.path.join(BR, "index.json"), idx)
    print("OK", fn, "questions+%d" % len(new_q), "nodes+%d" % len(mine), "errs=%d" % len(errs))


if __name__ == "__main__":
    main()
