#!/usr/bin/env python3
"""
簡体字残留検査。

日本語圏向けに「日本語のみ」で納品するため、簡体字中国語にしか現れない字
（日本語の常用漢字・人名用漢字には存在しない字）と、中国語特有の全角読点を検出する。

日本語の漢字は中国語と符号点が重なるため、単純な CJK 判定では区別できない。
ここでは「簡体字専用字」の集合との照合で判定する。

注意：集合は検証済みの字のみを入れること。日本語で普通に使う字
（例：解・判・段・描・示・依・敏・感・省・接・断・争・改・查・放・与・化・体・点・号・置・后）
を混ぜると誤検知だらけになり、ゲートが形骸化する。

使い方:  python3 verify/check_japanese_only.py [対象ディレクトリ]
終了コード: 検出あり=1 / なし=0
"""
import os
import sys

# 簡体字中国語にしか現れない字（日本語の常用漢字・人名用漢字には無い）。
# 日本語の新字体（会・体・学・国・数・点・号 など）は含めない。
SIMPLIFIED_ONLY = set(
    # 代名詞・機能語
    '们这为'
    # 語彙（IT・業務）
    '应语页录项统据现见让从说开关门东华儿义乐习书买车'
    '论试话认讲记训译详请谁调谢贝员资费账财贸购销银长问间队险难顶顺顾预领频'
    '风飞饭验骑鱼鸡单击键读缓听态联无处类组权层协议优证筛选汇总结输'
    '简词换转绑冲择显隐传递岗检测询题识库构逻辑报纳络增杂复'
    '标记备赖陷临样环绕节确误编级闭链线网锁竞抢续删寻码档归压缩'
    '签过还进运达扩弃执阶抛给带'
)

# 中国語特有の全角読点。日本語は通常「、」を使うため「，」を検出する。
# 全角セミコロン「；」は日本語の技術文書でも使うため検出対象にしない。
CHINESE_PUNCT = {'，': '全角カンマ U+FF0C'}

TEXT_EXT = ('.js', '.jsx', '.mjs', '.cjs', '.html', '.css', '.md', '.json', '.gitignore', '.py')
# verify/ は本スクリプト自身（簡体字の一覧を含む）なので除外する
SKIP_DIRS = {'.git', 'node_modules', 'dist', 'data', 'verify'}


def walk(target):
    for root, dirs, files in os.walk(target):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if f.endswith(TEXT_EXT) or f == '.gitignore':
                yield os.path.join(root, f)


def self_test():
    """誤検知防止：日本語の常用漢字が集合に混ざっていないことを確認する"""
    japanese_ok = '解判断段描示依敏感省接争改查放与化体点号置后会国数型目文件明'
    bad = sorted(set(japanese_ok) & SIMPLIFIED_ONLY)
    if bad:
        raise SystemExit(f'ゲート設定エラー：日本語の常用漢字が除外集合に混入しています → {"".join(bad)}')


def main():
    self_test()
    target = sys.argv[1] if len(sys.argv) > 1 else '.'
    problems = []
    for path in sorted(walk(target)):
        try:
            text = open(path, encoding='utf-8').read()
        except (UnicodeDecodeError, OSError):
            continue
        for lineno, line in enumerate(text.splitlines(), 1):
            bad = sorted({c for c in line if c in SIMPLIFIED_ONLY})
            punct = sorted({c for c in line if c in CHINESE_PUNCT})
            if bad or punct:
                mark = ''.join(bad) + ''.join(punct)
                problems.append((path, lineno, mark, line.strip()[:110]))

    rel = lambda p: os.path.relpath(p, target)
    if not problems:
        print(f'OK  簡体字・中国語句読点の残留なし（対象 {target}）')
        return 0

    print(f'NG  {len(problems)} 行に簡体字または中国語句読点を検出\n')
    cur = None
    for path, lineno, mark, snippet in problems:
        if path != cur:
            cur = path
            print(f'── {rel(path)}')
        print(f'   {lineno:>5}  [{mark}]  {snippet}')
    print(f'\n合計 {len(problems)} 行 / {len({p for p, *_ in problems})} ファイル')
    return 1


if __name__ == '__main__':
    sys.exit(main())
