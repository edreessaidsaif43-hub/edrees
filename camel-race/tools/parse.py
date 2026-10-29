import gzip, json, re, sys, collections

src = sys.argv[1]
out = sys.argv[2]
rows = json.load(gzip.open(src, 'rt', encoding='utf-8'))

LET = {'أ': 0, 'ا': 0, 'ب': 1, 'ج': 2, 'د': 3, 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'a': 0, 'b': 1, 'c': 2, 'd': 3}
opt_re = re.compile(r'^\s*([أابجدABCDabcd])\s*[\.\-\)\:]\s*(.+)$')
ans_re = re.compile(r'^\s*(?:ال)?إ?ا?جابة\s*(?:ال)?صحيحة\s*[:：]\s*(.*)$')
blk_re = re.compile(r'(?m)^\s*((?:واجب|سؤال|السؤال)\s*\d+)\s*[:\-—–]?[ \t]*')

def norm(s):
    return re.sub(r'[\s\.،،]+$', '', s.strip())

def clean(s):
    return re.sub(r'\s+', ' ', s).strip()

stats = collections.Counter()
def parse_block(b):
    lines = [l.strip() for l in b.split('\n') if l.strip()]
    if not lines:
        return None
    kind = None
    if re.search(r'صح\s*(أو|او)\s*خطأ', lines[0]):
        kind = 'tf'; lines = lines[1:]
    elif re.search(r'اختيار\s*من\s*متعدد', lines[0]):
        kind = 'mc'; lines = lines[1:]
    ans = None; opts = []; q = []
    for l in lines:
        m = ans_re.match(l)
        if m:
            ans = m.group(1).strip(); continue
        m = opt_re.match(l)
        if m and kind != 'tf':
            opts.append((LET[m.group(1)], clean(m.group(2)))); continue
        if ans is None and not opts:
            q.append(l)
    if not q or ans is None:
        stats['noq_or_ans'] += 1; return None
    text = clean(' '.join(q))
    if kind is None:
        kind = 'mc' if len(opts) >= 2 else 'tf'
    if kind == 'tf':
        a = norm(ans)
        if a.startswith('صح') or a.lower().startswith('true'):
            return {'t': 'tf', 'q': text, 'a': 1}
        if a.startswith('خطأ') or a.startswith('خطا') or a.lower().startswith('false'):
            return {'t': 'tf', 'q': text, 'a': 0}
        stats['tf_bad'] += 1; return None
    if len(opts) != 4:
        stats['mc_optcount_%d' % len(opts)] += 1
        if len(opts) < 2: return None
    o = [t for _, t in opts]
    a = norm(ans)
    idx = None
    m = re.match(r'^([أابجدABCDabcd])\s*[\.\-\)\:]', a) or re.match(r'^([أابجدABCDabcd])$', a)
    if m:
        idx = LET[m.group(1)]
    if idx is None or idx >= len(o):
        for i, t in enumerate(o):
            if norm(t) == a or norm(t) in a or (a and a in t):
                idx = i; break
    if idx is None or idx >= len(o):
        stats['mc_noans'] += 1; return None
    return {'t': 'mc', 'q': text, 'o': o, 'a': idx}

def ctx(s):
    return clean(s) if s and clean(s) not in ('-',) else ''

tree = collections.OrderedDict()
qcount = 0; lessons = 0; empty = 0
for r in rows:
    g, sub, sem, unit, les, txt = [x.strip() for x in r]
    if g in ('1',) and sub == '2':
        continue
    if not txt:
        empty += 1; continue
    parts = blk_re.split(txt)
    qs = []
    chunks = [('', parts[0])] + [(parts[i], parts[i + 1]) for i in range(1, len(parts) - 1, 2)]
    for lab, p in chunks:
        if not p.strip(): continue
        res = parse_block(p)
        if res:
            res['ref'] = clean(lab)
            qs.append(res)
    if not qs:
        stats['lesson_noq'] += 1; continue
    g = ctx(g) or 'غير محدد'
    g = re.sub(r'^الصف\s+', '', g)
    g = {'الاول': 'الأول', 'غير محدد': 'غير محدد'}.get(g, g)
    key = (g, ctx(sub), ctx(sem), ctx(unit) or 'بدون وحدة')
    tree.setdefault(g, {}).setdefault(ctx(sub), {}).setdefault(ctx(sem), {}).setdefault(key[3], []).append({'n': ctx(les) or 'درس', 'qs': qs})
    qcount += len(qs); lessons += 1

import os
ORDER = ['الأول','الثاني','الثالث','الرابع','الخامس','السادس','السابع','الثامن','التاسع','العاشر','الحادي عشر','الثاني عشر','غير محدد']
os.makedirs(os.path.join(out, 'grades'), exist_ok=True)
index = []
for gi, g in enumerate(sorted(tree.keys(), key=lambda x: ORDER.index(x) if x in ORDER else 99)):
    gid = 'g%02d' % gi
    subj = []
    for sub, sems in tree[g].items():
        semlist = []
        for sem, units in sems.items():
            ulist = []
            for u, lsn in units.items():
                for L in lsn:
                    for q in L['qs']:
                        n = len(q['o']) if q['t'] == 'mc' else 2
                        q['k'] = (q.pop('a') + len(q['q'])) % n
                ulist.append({"n": u, "l": lsn})
            semlist.append({'n': sem, 'u': ulist})
        subj.append({'n': sub, 's': semlist})
    with open(os.path.join(out, 'grades', gid + '.js'), 'w', encoding='utf-8') as f:
        f.write('window.__BANK=window.__BANK||{};window.__BANK["grades/%s"]=' % gid + json.dumps(subj, ensure_ascii=False, separators=(',', ':')) + ';\n')
    index.append({'id': gid, 'n': g, 'subjects': [x['n'] for x in subj]})
with open(os.path.join(out, 'index.js'), 'w', encoding='utf-8') as f:
    f.write('window.__BANK=window.__BANK||{};window.__BANK["index"]=' + json.dumps(index, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('lessons', lessons, 'questions', qcount, 'empty', empty, dict(stats))
print('grades', list(tree.keys()))
