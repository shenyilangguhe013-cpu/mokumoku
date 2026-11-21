#!/usr/bin/env python3
"""「これで完成」から毎週のミニテストを作る。公開ファイルには問題番号(kz)・科目・分野だけを書き、問題文は書かない。
使い方: python3 scripts/minitest_kanzen.py <bank:kokusai|kenpo|suuteki> <id> <水曜A|土曜B> <YYYY-MM-DD> <番号,番号,...> [--topics topics.json]
  topics.json があれば {番号: 分野} を使う。無ければ分野は科目名。"""
import json,sys,os
bank,tid,name,date,nos=sys.argv[1:6]
subj={"kokusai":"国際関係","kenpo":"憲法","suuteki":"数的処理"}[bank]
topics={}
if "--topics" in sys.argv: topics=json.load(open(sys.argv[sys.argv.index("--topics")+1],encoding="utf-8"))
nos=[int(x) for x in nos.split(",")]
qs=[{"q":i+1,"kz":n,"subject":subj,"field":topics.get(str(n),subj)} for i,n in enumerate(nos)]
t={"id":tid,"date":date,"name":name,"title":f"{subj}（これで完成）・{len(qs)}問","kanzen":bank,"questions":qs}
d=os.path.join(os.path.dirname(__file__),"..","data","minitests")
json.dump(t,open(os.path.join(d,tid+".json"),"w",encoding="utf-8"),ensure_ascii=False,indent=1)
ip=os.path.join(d,"index.json"); ix=json.load(open(ip,encoding="utf-8"))
ix["tests"]=[x for x in ix["tests"] if x["id"]!=tid]+[{"id":tid,"date":date,"name":name,"title":t["title"],"file":tid+".json"}]
json.dump(ix,open(ip,"w",encoding="utf-8"),ensure_ascii=False,indent=1)
print("OK",tid,len(qs))
