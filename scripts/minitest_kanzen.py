#!/usr/bin/env python3
"""「これで完成」から毎週のミニテストを作る。公開ファイルには問題番号(kz)・科目・分野だけを書き、問題文は書かない。
使い方: python3 scripts/minitest_kanzen.py <bank:kokusai|kenpo|suuteki> <id> <水曜A|土曜B> <YYYY-MM-DD> <番号,番号,...|auto:問数:最小-最大> [--topics topics.json]
  topics.json があれば {番号: 分野} を使う。無ければ分野は科目名。"""
import json,sys,os
bank,tid,name,date,nos=sys.argv[1:6]
subj={"kokusai":"国際関係","kenpo":"憲法","suuteki":"数的処理"}[bank]
topics={}
if "--topics" in sys.argv: topics=json.load(open(sys.argv[sys.argv.index("--topics")+1],encoding="utf-8"))
d0=os.path.join(os.path.dirname(__file__),"..","data","minitests")
def used(bank):
    """これまでのミニテスト(同じ科目)で出した問題番号。同じ問題を出さないために使う"""
    u=set()
    for fn in os.listdir(d0):
        if fn.endswith(".json") and fn!="index.json":
            t=json.load(open(os.path.join(d0,fn),encoding="utf-8"))
            if t.get("kanzen")==bank: u|={q["kz"] for q in t["questions"] if "kz" in q}
    return u
if nos.startswith("auto:"):   # auto:10:1-101 のように「問数:番号の範囲」。出題済みを除いて等間隔に選ぶ
    _,n,rng=nos.split(":"); lo,hi=[int(x) for x in rng.split("-")]
    pool=[x for x in range(lo,hi+1) if x not in used(bank)]
    if len(pool)<int(n): sys.exit(f"未出題が足りません: 残り{len(pool)}問")
    step=len(pool)/int(n); nos=[pool[int(i*step)] for i in range(int(n))]
else:
    nos=[int(x) for x in nos.split(",")]
    dup=[x for x in nos if x in used(bank)]
    if dup: sys.exit(f"出題済みの番号が含まれています: {dup}")
qs=[{"q":i+1,"kz":n,"subject":subj,"field":topics.get(str(n),subj)} for i,n in enumerate(nos)]
t={"id":tid,"date":date,"name":name,"title":f"{subj}（これで完成）・{len(qs)}問","kanzen":bank,"questions":qs}
d=os.path.join(os.path.dirname(__file__),"..","data","minitests")
json.dump(t,open(os.path.join(d,tid+".json"),"w",encoding="utf-8"),ensure_ascii=False,indent=1)
ip=os.path.join(d,"index.json"); ix=json.load(open(ip,encoding="utf-8"))
ix["tests"]=[x for x in ix["tests"] if x["id"]!=tid]+[{"id":tid,"date":date,"name":name,"title":t["title"],"file":tid+".json"}]
json.dump(ix,open(ip,"w",encoding="utf-8"),ensure_ascii=False,indent=1)
print("OK",tid,len(qs))
