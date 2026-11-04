#!/usr/bin/env python3
"""経済ブリーフの号を追加する(クラウド/ローカル共通。HTML化とindex.json・questions.jsonの更新だけ行う。pushは別途gitで)。
usage: python keizai_add.py <bundle.txt> [<bundle2.txt> ...]
bundle format: '@@@ISSUE n | YYYY-MM-DD | theme' の次の行から本文(国際ブリーフと同じ書式)。"""
import sys, os, json, datetime
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import keizai_render as kr
OUT = os.path.join(os.path.dirname(HERE), 'data', 'briefs', 'keizai')
SRC = os.path.join(os.path.dirname(HERE), 'data', 'briefs', 'keizai_src')

def main():
    os.makedirs(OUT, exist_ok=True); os.makedirs(SRC, exist_ok=True)
    idx_path = os.path.join(OUT, 'index.json')
    idx = json.load(open(idx_path, encoding='utf-8')) if os.path.exists(idx_path) else {'items': []}
    items = {it['n']: it for it in idx['items']}
    qpath = os.path.join(OUT, 'questions.json')
    qdoc = json.load(open(qpath, encoding='utf-8')) if os.path.exists(qpath) else {'items': []}
    qs = qdoc['items']; added = []
    for src in sys.argv[1:]:
        txt = open(src, encoding='utf-8').read()
        for chunk in txt.split('@@@ISSUE ')[1:]:
            head, _, body = chunk.partition('\n')
            n, date, theme = [x.strip() for x in head.split('|', 2)]
            n = int(n); fn = f'{n:02d}.html'
            open(os.path.join(OUT, fn), 'w', encoding='utf-8').write(kr.render_issue(n, date, theme, body))
            open(os.path.join(SRC, f'{n:02d}.txt'), 'w', encoding='utf-8').write('@@@ISSUE ' + chunk)
            items[n] = {'n': n, 'date': date, 'theme': theme, 'file': fn}
            qs = [q for q in qs if q['n'] != n] + kr.extract_questions(n, date, theme, body)
            added.append(n)
    idx['items'] = [items[k] for k in sorted(items, reverse=True)]
    idx['updated'] = datetime.date.today().isoformat()
    json.dump(idx, open(idx_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    qs.sort(key=lambda q: (q['n'], q['no']))
    json.dump({'updated': idx['updated'], 'items': qs}, open(qpath, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('added', added, 'total issues', len(items), 'questions', len(qs))

if __name__ == '__main__':
    main()
