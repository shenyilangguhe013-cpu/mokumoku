#!/usr/bin/env python3
"""keizai brief renderer (kokusai_render.py v2 から派生) (app-oriented visual layout).
usage: render2.py <bundle_dir> <out_dir>   (backfill: adds footer note)
module: render_issue(n, date, theme, body, footer=None)
"""
import json, datetime, re, sys, json, glob, html, os

CSS = """
:root{color-scheme:light;--bg:#ffffff;--card:#fff;--ink:#1f2430;--sub:#667085;--line:#e4e7ec;--blue:#2563eb;--blue-bg:#eef3ff;
--green:#188038;--green-bg:#e8f6ee;--pink:#be185d;--pink-bg:#fdf1f6;--vio:#7c3aed;--vio-bg:#f3eeff;--amber:#b45309;--amber-bg:#fff6e5}

*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:'Hiragino Kaku Gothic ProN','Yu Gothic UI','Noto Sans JP',Meiryo,sans-serif;font-size:17px;line-height:1.85}
.wrap{max-width:1000px;margin:0 auto;padding:6px 6px 40px}
.hero{background:linear-gradient(135deg,var(--blue),var(--vio));color:#fff;border-radius:14px;padding:20px 18px 22px;margin-bottom:8px}
.hero .meta{font-size:12px;opacity:.85;letter-spacing:.04em}
.hero .ser{font-size:13px;opacity:.9;margin-top:2px}
.hero h1{font-size:24px;line-height:1.45;margin:6px 0 0}
.lead{background:var(--card);border-left:5px solid var(--blue);border-radius:0 12px 12px 0;padding:12px 14px;margin:0 0 8px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
.sec{background:var(--card);border-radius:14px;padding:16px 12px 18px;margin:0 0 8px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.sec>h2{display:flex;align-items:center;gap:10px;font-size:20px;margin:0 0 12px;line-height:1.4}
.no{flex:none;width:28px;height:28px;border-radius:50%;background:var(--blue);color:#fff;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center}
p{margin:0 0 12px}
.sec p:last-child{margin-bottom:0}
.q{border:1px solid var(--line);border-left:5px solid var(--vio);border-radius:12px;padding:12px 10px;margin:0 0 10px;background:var(--card)}
.q .qb{display:inline-block;background:var(--vio-bg);color:var(--vio);font-size:12px;font-weight:700;border-radius:999px;padding:0 10px;margin-bottom:4px}
.q p{margin:0 0 8px}
.opt{display:flex;gap:10px;align-items:flex-start;background:var(--bg);border-radius:10px;padding:8px 10px;margin:0 0 6px;font-size:16.5px;line-height:1.7}
.ol{flex:none;width:24px;height:24px;border-radius:50%;border:2px solid var(--vio);color:var(--vio);font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px}
details{margin:6px 0 4px}
summary{cursor:pointer;color:var(--green);font-weight:700;font-size:14px;padding:6px 12px;background:var(--green-bg);border-radius:999px;display:inline-block;list-style:none}
summary::-webkit-details-marker{display:none}
details[open]>summary{margin-bottom:10px}
.ans{background:var(--green-bg);border-left:5px solid var(--green);border-radius:0 10px 10px 0;padding:10px 12px;margin:0 0 12px;font-size:16.5px;line-height:1.8}
.ans p{margin:0 0 6px}.ans p:last-child{margin:0}
.tl{list-style:none;margin:4px 0 0;padding:0 0 0 0;position:relative}
.tl:before{content:"";position:absolute;left:104px;top:8px;bottom:8px;width:3px;background:var(--line);border-radius:2px}
.tl li{position:relative;display:flex;gap:0;align-items:flex-start;margin:0 0 12px}
.tl li:last-child{margin-bottom:0}
.yr{flex:none;width:96px;text-align:right;padding-right:0;font-weight:800;font-size:17px;color:var(--blue);line-height:1.5}
.yr.sm{font-size:13px;line-height:1.7}
.tl li:before{content:"";position:absolute;left:98px;top:7px;width:15px;height:15px;border-radius:50%;background:var(--card);border:4px solid var(--blue)}
.ev{flex:1;margin-left:26px;background:var(--blue-bg);border-radius:10px;padding:6px 12px;font-size:16.5px;line-height:1.7}
.sub{font-size:13px;font-weight:700;color:var(--sub);letter-spacing:.08em;margin:2px 0 8px}
.era{--c:#2563eb;margin:0 0 12px}
.era.e0{--c:#64748b}.era.e1{--c:#b45309}.era.e2{--c:#2563eb}.era.e3{--c:#0f9d8a}.era.e4{--c:#be185d}.era.e5{--c:#7c3aed}.era.e6{--c:#d97706}

.eh{display:flex;align-items:baseline;gap:8px;background:var(--c);color:#fff;border-radius:999px;padding:2px 14px;margin:0 0 8px;width:fit-content;max-width:100%}
.eh span{font-weight:800;font-size:14.5px}.eh small{font-size:12px;opacity:.9}
.era .yr{color:var(--c)}
.era .tl:before{background:var(--c);opacity:.35}
.era .tl li:before{border-color:var(--c)}
.era .ev{background:var(--blue-bg);background:color-mix(in srgb,var(--c) 11%,transparent);border-left:3px solid var(--c)}
.tl li.gap{display:block;position:relative;height:20px;margin:-4px 0 6px}
.tl li.gap:before{display:none}
.tl li.gap span{position:absolute;left:105px;top:0;transform:translateX(-50%);background:var(--card);border:1px solid var(--line);border-radius:999px;font-size:12px;line-height:18px;padding:0 9px;color:var(--sub);white-space:nowrap}
.nums{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:0 0 4px}
.nc{background:var(--amber-bg);border-radius:12px;padding:10px 12px;text-align:center}
.nv{font-size:22px;font-weight:800;color:var(--amber);line-height:1.3;word-break:keep-all}
.nl{font-size:14px;line-height:1.55;margin-top:2px}
.flow{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 12px}
.chip{background:var(--blue-bg);color:var(--ink);border:1px solid var(--blue);border-radius:10px;padding:8px 14px;font-size:16px;line-height:1.5;font-weight:600}
.flow+.flow{margin-top:16px;padding-top:14px;border-top:1px dashed var(--line)}
.arr{color:var(--blue);font-weight:800;font-size:18px}
@media (max-width:520px){.flow{flex-direction:column;align-items:stretch}.arr{text-align:center;transform:rotate(90deg);height:18px;line-height:18px}.chip{text-align:center}}
.sum{display:flex;gap:12px;align-items:flex-start;background:var(--amber-bg);border-radius:12px;padding:10px 14px;margin:0 0 8px}
.sum .n{flex:none;width:28px;height:28px;border-radius:8px;background:var(--amber);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;margin-top:2px}
.sum p{margin:0;font-size:17px}
.tipbox{background:var(--pink-bg);border-radius:12px;padding:12px 10px}
.tp{display:flex;gap:10px;align-items:flex-start;margin:0 0 8px;font-size:16.5px;line-height:1.75}
.tp:last-child{margin-bottom:0}
.tp .pill{flex:none;background:var(--pink);color:#fff;border-radius:999px;font-size:12.5px;font-weight:700;padding:1px 10px;margin-top:3px;white-space:nowrap}
.tp .mk{flex:none;color:var(--pink);font-weight:800;margin-top:0}
.tw{overflow-x:auto;margin:0 0 12px;border-radius:12px;border:1px solid var(--line)}
table{width:100%;border-collapse:collapse;font-size:15.5px}
th{background:var(--blue);color:#fff;font-size:14.5px;text-align:left;padding:8px 10px}
td{padding:8px 10px;border-top:1px solid var(--line);vertical-align:top}
td:first-child{font-weight:700;background:var(--blue-bg)}
tr:nth-child(even) td:not(:first-child){background:rgba(127,127,127,.06)}
.xref{color:var(--blue);font-weight:700;text-decoration:underline;text-decoration-style:dotted;cursor:pointer;white-space:nowrap}
button.opt{width:100%;font:inherit;font-size:16.5px;color:var(--ink);text-align:left;border:1px solid var(--line);cursor:pointer;-webkit-tap-highlight-color:transparent}
button.opt:active{background:var(--vio-bg)}
.qw.done button.opt{cursor:default}
button.opt.ok{background:var(--green-bg);border-color:var(--green)}
button.opt.ok .ol{background:var(--green);border-color:var(--green);color:#fff}
button.opt.ng{background:var(--pink-bg);border-color:var(--pink)}
button.opt.ng .ol{background:var(--pink);border-color:var(--pink);color:#fff}
.vd{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-weight:800;margin:4px 0 8px;font-size:16px}
.vd.ok{color:var(--green)}.vd.ng{color:var(--pink)}
.vd button{font:inherit;font-size:13px;font-weight:600;color:var(--sub);background:none;border:1px solid var(--line);border-radius:999px;padding:1px 10px;cursor:pointer}
.tapnote{font-size:13px;color:var(--sub);margin:0 0 8px}
.li{margin:0 0 6px;padding-left:2px}
.foot{color:var(--sub);font-size:12px;text-align:center;margin-top:16px}
"""

ANS_RE = re.compile(r'^【(解答|正解|解説)[^】]*】|^(解答|解説)[：:]')
OPT_RE = re.compile(r'^([ア-エ])[．.　 ]\s*(.*)')
QSTART_RE = re.compile(r'^(問\s*\d+|Q\s*\d+|【Q\d+】|【問\d+)')
HEAD_RE = re.compile(r'^(■\s*|【)(\d+)[.．]\s*(.*?)】?\s*$')
BUL_RE = re.compile(r'^(・|[①-⑨]|\d+[.．]\s)')
STRIP_BUL = re.compile(r'^(・|[①-⑨]\s*|\d+[.．]\s*)')
YEAR_RE = re.compile(r'^(?:紀元前|約)?\d{1,4}')


CUR = [0]
XREF_RE = re.compile(r'第(\d{1,3})回')


def esc(s):
    h = html.escape(s, quote=False)
    return XREF_RE.sub(lambda m: m.group(0) if int(m.group(1)) == CUR[0] else
                       '<a class="xref" data-n="%s">%s</a>' % (m.group(1), m.group(0)), h)


def plain(s):
    return html.escape(s, quote=False)


def split_sections(body):
    pre, secs, cur = [], [], None
    for raw in body.split('\n'):
        l = raw.strip()
        m = HEAD_RE.match(l)
        if m and (l.startswith('■') or re.match(r'^【\d+[.．]', l)):
            cur = [m.group(2), m.group(3), []]
            secs.append(cur)
        elif cur is None:
            pre.append(l)
        else:
            cur[2].append(l)
    return pre, secs


def table_html(rows):
    rows = [[c.strip() for c in r.split(' / ')] for r in rows]
    hdr = not YEAR_RE.match(rows[0][0])
    h = ['<div class="tw"><table>']
    if hdr:
        h.append('<tr>' + ''.join(f'<th>{esc(c)}</th>' for c in rows[0]) + '</tr>')
        rows = rows[1:]
    for r in rows:
        h.append('<tr>' + ''.join(f'<td>{esc(c)}</td>' for c in r) + '</tr>')
    h.append('</table></div>')
    return ''.join(h)


def plain_blocks(lines):
    """paragraphs / tables / bullets / flow lines"""
    out, buf, tbl = [], [], []

    def fp():
        if buf:
            out.append('<p>' + '<br>'.join(esc(x) for x in buf) + '</p>')
            buf.clear()

    def ft():
        if tbl:
            out.append(table_html(list(tbl)))
            tbl.clear()
    for l in lines:
        if not l:
            fp(); ft(); continue
        if ' / ' in l and not ANS_RE.match(l):
            fp(); tbl.append(l); continue
        ft()
        if l.count(' → ') >= 1 and len(l) < 200 and not l.endswith('。'):
            fp()
            parts = [p.strip() for p in l.split(' → ')]
            out.append('<div class="flow">' + '<span class="arr">→</span>'.join(f'<span class="chip">{esc(p)}</span>' for p in parts) + '</div>')
            continue
        if BUL_RE.match(l):
            fp(); out.append(f'<p class="li">{esc(l)}</p>'); continue
        buf.append(l); fp()
    fp(); ft()
    return ''.join(out)


def opt_html(l):
    m = OPT_RE.match(l)
    k = m.group(1)
    return f'<button type="button" class="opt" data-k="{k}"><span class="ol">{k}</span><span>{esc(m.group(2))}</span></button>'


ANSK_RE = re.compile(r'(?:解答|正解)[】：:＝=\s]*([ア-エ])')


def _fix_opts(opts):
    out = []
    for k, t in opts:
        parts = re.split(r'[\s　]+(?=[イウエ][．.])', t)
        out.append((k, parts[0].strip()))
        for p in parts[1:]:
            out.append((p[0], re.sub(r'^[イウエ][．.]\s*', '', p).strip()))
    return out


def _ans_letter(lines):
    for l in lines:
        m = ANSK_RE.search(l)
        if m:
            return m.group(1)
    return ''


def parse_q1(lines):
    stem, opts, i = [], [], 0
    while i < len(lines) and not ANS_RE.match(lines[i]):
        l = lines[i]
        if l:
            if OPT_RE.match(l):
                m = OPT_RE.match(l); opts.append((m.group(1), m.group(2)))
            else:
                stem.append(l)
        i += 1
    rest = lines[i:]
    first, j = [], 0
    while j < len(rest) and rest[j]:
        first.append(rest[j]); j += 1
    tail = rest[j:]
    opts = _fix_opts(opts)
    return {'stem': stem, 'opts': opts, 'ans': _ans_letter(first), 'first': first, 'tail': tail}


def parse_qlist(lines):
    cards, cur, pre = [], None, []
    for l in lines:
        if l and QSTART_RE.match(l):
            cur = {'stem': [l], 'opts': [], 'ans': [], 'in_ans': False}
            cards.append(cur); continue
        if cur is None:
            if l: pre.append(l)
            continue
        if not l:
            cur['in_ans'] = False if cur['ans'] else cur['in_ans']; continue
        if ANS_RE.match(l):
            cur['in_ans'] = True; cur['ans'].append(l); continue
        if cur['in_ans']:
            cur['ans'].append(l); continue
        if OPT_RE.match(l):
            m = OPT_RE.match(l); cur['opts'].append((m.group(1), m.group(2)))
        else:
            cur['stem'].append(l)
    out = []
    for c in cards:
        st = c['stem']
        head = re.match(r'^(問\s*\d+|Q\s*\d+|【Q\d+】|【問\d+】?)[\s：:.．]*(.*)', st[0])
        badge = head.group(1).strip('【】 ') if head else '問'
        first = head.group(2) if head else st[0]
        out.append({'badge': badge, 'stem': ([first] if first else []) + st[1:], 'opts': _fix_opts(c['opts']),
                    'ans': _ans_letter(c['ans']), 'exp': c['ans']})
    return pre, out


def quiz1_html(lines, n=0):
    p = parse_q1(lines)
    qid = f'{n}-q0'
    h = '<p class="tapnote">選択肢をタップして答えると、正誤がその場で表示されます。</p>'
    h += f'<div class="qw" data-qid="{qid}" data-ans="{p["ans"]}"><div class="q"><span class="qb">本日の一問</span>'
    h += ''.join(f'<p>{esc(x)}</p>' for x in p['stem'])
    h += ''.join(f'<button type="button" class="opt" data-k="{k}"><span class="ol">{k}</span><span>{esc(t)}</span></button>' for k, t in p['opts'])
    h += '</div>'
    if p['first'] or p['tail']:
        ans = '<div class="ans">' + ''.join(f'<p>{esc(x)}</p>' for x in p['first']) + '</div>'
        h += '<details><summary>答えと解説を見る</summary>' + ans + plain_blocks(p['tail']) + '</details>'
    return h + '</div>'


def quizlist_html(lines, n=0):
    pre, cards = parse_qlist(lines)
    out = [f'<p>{esc(x)}</p>' for x in pre] + ['<p class="tapnote">選択肢をタップして答えると、正誤がその場で表示されます。「もう一度」で解き直せます。</p>']
    for i, c in enumerate(cards, 1):
        qid = f'{n}-q{i}'
        h = f'<div class="qw" data-qid="{qid}" data-ans="{c["ans"]}"><div class="q"><span class="qb">{esc(c["badge"])}</span>'
        h += ''.join(f'<p>{esc(x)}</p>' for x in c['stem'])
        h += ''.join(f'<button type="button" class="opt" data-k="{k}"><span class="ol">{k}</span><span>{esc(t)}</span></button>' for k, t in c['opts'])
        if c['exp']:
            h += '<details><summary>答えを見る</summary><div class="ans">' + ''.join(f'<p>{esc(a)}</p>' for a in c['exp']) + '</div></details>'
        h += '</div></div>'
        out.append(h)
    return ''.join(out)


def _clean_exp(lines):
    out = []
    for x in lines:
        x = re.sub(r'^【(?:解答|正解)[^】]*】\s*[ア-エ]?\s*', '', x)
        x = re.sub(r'^(?:解答|正解)[：:＝=]\s*[ア-エ]?\s*', '', x)
        x = re.sub(r'^(?:【解説】|解説[：:])\s*', '', x)
        if x.strip() and not re.fullmatch(r'[ア-エ]', x.strip()):
            out.append(x.strip())
    return out


def extract_questions(n, date, theme, body):
    pre, secs = split_sections(body)
    qs = []
    for num, title, lines in secs:
        if title.startswith('本日の一問'):
            p = parse_q1(lines)
            exp = _clean_exp(p['first'] + p['tail'])
            qs.append({'id': f'{n}-q0', 'n': n, 'date': date, 'theme': theme, 'kind': '本日の一問', 'no': 0,
                       'q': '\n'.join(p['stem']), 'opts': dict(p['opts']), 'ans': p['ans'],
                       'exp': '\n'.join(x for x in exp if x)})
        elif '復習' in title or 'クイズ' in title:
            _, cards = parse_qlist(lines)
            for i, c in enumerate(cards, 1):
                exp = _clean_exp(c['exp'])
                qs.append({'id': f'{n}-q{i}', 'n': n, 'date': date, 'theme': theme, 'kind': '復習クイズ', 'no': i,
                           'q': '\n'.join(c['stem']), 'opts': dict(c['opts']), 'ans': c['ans'],
                           'exp': '\n'.join(x for x in exp if x)})
    return qs


YR_RE = re.compile(r'^(紀元前)?(約)?(\d{1,4})(?:年(代)?(?:(\d{1,2})月)?|$)')
ERAS = [
    (1990, 'e0', 'バブル期まで', '〜1989'),
    (2001, 'e1', '1990年代', '1990〜2000'),
    (2013, 'e2', 'デフレ期', '2001〜2012'),
    (2020, 'e3', 'アベノミクス期', '2013〜2019'),
    (2022, 'e4', 'コロナ期', '2020〜2021'),
    (2025, 'e5', '物価高の時期', '2022〜2024'),
    (9999, 'e6', '2025年〜', '2025〜'),
]


def era_of(y):
    for lim, cls, name, rng in ERAS:
        if y < lim:
            return cls, name, rng
    return ERAS[-1][1:]


def parse_year(a):
    m = YR_RE.match(a)
    if not m:
        return None
    if '年' not in a and len(m.group(3)) < 3:
        return None
    y = int(m.group(3))
    if m.group(1):
        y = -y
    mo = int(m.group(5)) if m.group(5) else 0
    return y, mo, bool(m.group(4))


def timeline_html(lines):
    years, nums, other = [], [], []
    for l in lines:
        if not l:
            continue
        m2 = re.match(r'^[・\-]?\s*([^：:/]{1,14}?)\s*[：:]\s*(.+)$', l)
        m3 = re.match(r'^[・\-]?\s*((?:紀元前|約)?\d{1,4}年(?:代)?(?:\d{1,2}月)?)[\s　]+(.+)$', l)
        if ' / ' in l:
            a, b = [x.strip() for x in l.split(' / ', 1)]
        elif m3:
            a, b = m3.group(1).strip(), m3.group(2).strip()
        elif m2 and re.search(r'\d', m2.group(1)):
            a, b = m2.group(1).strip(), m2.group(2).strip()
        else:
            other.append(l); continue
        if a in ('年', '年代', '年号'):
            continue
        py = parse_year(a)
        if py:
            if '年' not in a:
                a = a + '年'
            b = b.replace(' / ', '　—　')
            years.append((py, a, b))
        else:
            nums.append((a, b))
    if not years and not nums and other:
        sents = [x for x in re.split(r'(?<=。)', ''.join(other)) if x.strip()]
        for sent in sents:
            mm = re.search(r'((?:紀元前)?\d{3,4}年(?:\d{1,2}月)?)', sent)
            if mm and parse_year(mm.group(1)):
                years.append((parse_year(mm.group(1)), mm.group(1), sent.strip()))
            elif years:
                a0, b0 = years[-1][1], years[-1][2]
                years[-1] = (years[-1][0], a0, b0 + sent.strip())
        if years:
            other = []
    years.sort(key=lambda t: (t[0][0], t[0][1]))
    out = []
    if years:
        if nums:
            out.append('<div class="sub">年表</div>')
        groups = []
        for py, a, b in years:
            cls, name, rng = era_of(py[0])
            if not groups or groups[-1][0] != cls:
                groups.append([cls, name, rng, []])
            groups[-1][3].append((py, a, b))
        for cls, name, rng, its in groups:
            h = [f'<div class="era {cls}"><div class="eh"><span>{esc(name)}</span><small>{esc(rng)}</small></div><ol class="tl">']
            prev = None
            for py, a, b in its:
                if prev and not py[2] and not prev[2]:
                    d = py[0] - prev[0]
                    if d >= 1:
                        h.append(f'<li class="gap"><span>{d}年後</span></li>')
                prev = py
                small = ' sm' if len(a) > 8 else ''
                h.append(f'<li><span class="yr{small}">{esc(a)}</span><span class="ev">{esc(b)}</span></li>')
            h.append('</ol></div>')
            out.append(''.join(h))
    if nums:
        if years:
            out.append('<div class="sub">主な数字</div>')
        out.append('<div class="nums">' + ''.join(
            f'<div class="nc"><div class="nv">{esc(a)}</div><div class="nl">{esc(b)}</div></div>' for a, b in nums) + '</div>')
    out.extend(f'<p>{esc(o)}</p>' for o in other)
    return ''.join(out)


def summary_html(lines):
    h, k = [], 0
    for l in lines:
        if not l:
            continue
        k += 1
        t = STRIP_BUL.sub('', l)
        h.append(f'<div class="sum"><span class="n">{k}</span><p>{esc(t)}</p></div>')
    return ''.join(h)


def tips_html(lines):
    rows = []
    for l in lines:
        if not l:
            continue
        t = STRIP_BUL.sub('', l)
        m = re.match(r'^(.{1,16}?)[：＝=](.+)$', t)
        if m:
            rows.append(f'<div class="tp"><span class="pill">{esc(m.group(1))}</span><span>{esc(m.group(2).strip())}</span></div>')
        else:
            rows.append(f'<div class="tp"><span class="mk">▶</span><span>{esc(t)}</span></div>')
    return '<div class="tipbox">' + ''.join(rows) + '</div>'


def render_section(num, title, lines):
    if title.startswith('本日の一問'):
        body = quiz1_html(lines, CUR[0])
    elif '年号' in title or '年表' in title:
        body = timeline_html(lines)
    elif '3行' in title or 'まとめ' in title:
        body = summary_html(lines)
    elif '試験対策' in title:
        body = tips_html(lines)
    elif '復習' in title or 'クイズ' in title:
        body = quizlist_html(lines, CUR[0])
    else:
        body = plain_blocks(lines)
    return f'<section class="sec"><h2><span class="no">{esc(num)}</span>{esc(title)}</h2>{body}</section>'


def render_issue(n, date, theme, body, footer=None):
    CUR[0] = n
    pre, secs = split_sections(body)
    lead = [p for p in pre if p]
    # drop leading "テーマ：..." line (shown in hero)
    lead = [p for p in lead if not p.startswith('テーマ：')]
    out = []
    if lead:
        out.append('<div class="lead">' + '<br>'.join(esc(x) for x in lead) + '</div>')
    for num, title, lines in secs:
        out.append(render_section(num, title, lines))
    title = f'経済ブリーフ 第{n}回'
    script = JS.replace('__N__', str(n))
    foot = f'<div class="foot">{esc(footer)}</div>' if footer else ''
    return f"""<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{plain(title)}</title><style>{CSS}</style></head>
<body><div class="wrap">
<header class="hero"><div class="meta">第{n}回 ／ {esc(date)}</div><div class="ser">経済ブリーフ</div><h1>{plain(theme)}</h1></header>
{''.join(out)}
{foot}
</div>{script}</body></html>"""


JS = r'''<script>
(function(){
var N=__N__;
function post(m){try{parent.postMessage(m,'*')}catch(e){}}
function mark(c,picked,silent){
  var ans=c.dataset.ans;
  c.classList.add('done');
  [].forEach.call(c.querySelectorAll('button.opt'),function(b){
    b.classList.remove('ok','ng');
    if(b.dataset.k===ans)b.classList.add('ok');
    else if(b.dataset.k===picked)b.classList.add('ng');
  });
  var old=c.querySelector('.vd');if(old)old.remove();
  var ok=picked===ans,v=document.createElement('div');
  v.className='vd '+(ok?'ok':'ng');
  v.innerHTML=(ok?'正解':'不正解（あなた：'+picked+'　正解：'+ans+'）');
  var r=document.createElement('button');r.type='button';r.textContent='もう一度';r.className='retry';v.appendChild(r);
  var d=c.querySelector('details');
  if(d){d.parentNode.insertBefore(v,d);d.open=true;}else c.appendChild(v);
  if(!silent)post({type:'quiz',issue:N,qid:c.dataset.qid,picked:picked,ans:ans,ok:ok});
}
document.addEventListener('click',function(e){
  var t=e.target;
  var x=t.closest&&t.closest('.xref');
  if(x){e.preventDefault();post({type:'openBrief',n:parseInt(x.dataset.n,10),from:N});return;}
  var rt=t.closest&&t.closest('.retry');
  if(rt){var c0=rt.closest('.qw');c0.classList.remove('done');
    [].forEach.call(c0.querySelectorAll('button.opt'),function(b){b.classList.remove('ok','ng')});
    var vd=c0.querySelector('.vd');if(vd)vd.remove();var dd=c0.querySelector('details');if(dd)dd.open=false;return;}
  var b=t.closest&&t.closest('button.opt');
  if(!b)return;
  var c=b.closest('.qw');
  if(!c||c.classList.contains('done')||!c.dataset.ans)return;
  mark(c,b.dataset.k,false);
});
window.addEventListener('message',function(e){
  var m=e.data;
  if(!m||m.type!=='state'||!m.results)return;
  [].forEach.call(document.querySelectorAll('.qw'),function(c){
    var r=m.results[c.dataset.qid];
    if(r&&r.picked)mark(c,r.picked,true);
  });
});
post({type:'ready',issue:N});
})();
</script>'''

BACKFILL_NOTE = '過去分の本文はメール配信分から再構成しています(キーワード一覧は省略)。'


def main():
    src, dst = sys.argv[1], sys.argv[2]
    os.makedirs(dst, exist_ok=True)
    issues = {}
    for f in sorted(glob.glob(os.path.join(src, 'bundle*.txt'))):
        txt = open(f, encoding='utf-8').read()
        for chunk in txt.split('@@@ISSUE ')[1:]:
            head, _, body = chunk.partition('\n')
            n, date, theme = [x.strip() for x in head.split('|', 2)]
            issues[int(n)] = (date, theme, body)
    for n in sorted(issues, reverse=True):
        date, theme, body = issues[n]
        open(os.path.join(dst, f'{n:02d}.html'), 'w', encoding='utf-8').write(render_issue(n, date, theme, body, BACKFILL_NOTE))
    qs = []
    for n in sorted(issues):
        date, theme, body = issues[n]
        qs += extract_questions(n, date, theme, body)
    json.dump({'updated': datetime.date.today().isoformat(), 'items': qs}, open(os.path.join(dst, 'questions.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(len(issues), 'issues rendered;', len(qs), 'questions')


if __name__ == '__main__':
    main()
