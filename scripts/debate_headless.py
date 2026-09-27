#!/usr/bin/env python3
"""
debate_headless.py — 複数ペルソナによる「ディベート」をコンソールに出力するCLIツール。

現状はオフライン(テンプレート応答)実装。各ペルソナの発言生成は
Persona.speak() に閉じているので、将来ここをClaude API呼び出しに
差し替えれば、同じCLI・同じ画面のまま本物のLLM同士の議論にできる。

使い方:
    python scripts/debate_headless.py "お題の文章" --rounds 3
"""

import argparse
import random
import re
import sys
import textwrap

CONSOLE_WIDTH = 78


# ============ お題のテーマ判定 ============
# オフライン版では実際の文意までは読めないので、お題に含まれる
# キーワードから大まかなテーマを推定し、テーマに合った発言テンプレートを選ぶ。
# 未知のテーマは GENERIC にフォールバックする。

THEME_KEYWORDS = {
    "visual": ["キャラ", "アバター", "見た目", "イラスト", "デザイン", "リアル", "アニメーション", "動き"],
    "notification": ["通知", "リマインド", "プッシュ", "アラーム", "呼び戻"],
    "performance": ["速度", "パフォーマンス", "重い", "軽く", "遅い", "バッテリー"],
}


def detect_theme(topic):
    for theme, keywords in THEME_KEYWORDS.items():
        if any(kw in topic for kw in keywords):
            return theme
    return "generic"


# ============ ペルソナ定義 ============

class Persona:
    def __init__(self, name, icon, templates):
        self.name = name
        self.icon = icon
        self.templates = templates  # {theme: {"open":[...], "middle":[...], "close":[...]}}

    def _bank(self, theme, phase):
        bank = self.templates.get(theme, self.templates["generic"])
        return bank[phase]

    def speak(self, topic, phase, theme, prev_speaker):
        bank = self._bank(theme, phase)
        template = random.choice(bank)
        return template.format(topic=topic, prev=prev_speaker or "みなさん")


def build_personas():
    return [
        Persona(
            "UXデザイナー", "🎨",
            {
                "visual": {
                    "open": [
                        "「{topic}」について、まず気になるのは認知負荷です。今のイラストはシルエットに近いくらいシンプルで、状態(勉強中/休憩中/退室中)が一瞬で見分けられるのが強みです。リアルさを足す方向に進めるなら、その「一瞬で分かる」を壊さない範囲でやるのが大前提だと思います。",
                    ],
                    "middle": [
                        "{prev}の意見にも一理ありますが、UXの立場からは「リアルさ」と「読み取りやすさ」はしばしばトレードオフになる点を強調したいです。表情や陰影を増やすほど、小さいアイコンでは逆に判別しづらくなることがあります。",
                    ],
                    "close": [
                        "結論としては、体のパーツ数を増やすよりも、色・ポーズ・小道具(ペン、カップなど)のバリエーションを増やす方が、リアルさと分かりやすさを両立しやすいと思います。",
                    ],
                },
                "generic": {
                    "open": [
                        "「{topic}」について、まず考えたいのは使う人の認知負荷です。この変更で、直感的な理解のしやすさが損なわれないかを最初に確認したいです。",
                    ],
                    "middle": [
                        "{prev}の指摘は一理あります。ただUXの観点では、機能や情報を増やすほど画面が複雑になりがちな点は注意が必要です。",
                    ],
                    "close": [
                        "結論としては、変更の効果を最小限の実装で確かめてから、段階的に広げるのが良いと思います。",
                    ],
                },
            },
        ),
        Persona(
            "開発者", "💻",
            {
                "visual": {
                    "open": [
                        "「{topic}」を実装コストの観点で見ると、今はSVGを文字列で組み立てているだけなので、パーツを増やすほどコードの複雑さと保守コストが増えます。特にアニメーションを増やすとパフォーマンスにも注意が必要です。",
                    ],
                    "middle": [
                        "{prev}が言うようなバリエーション追加なら、既存の描画関数を拡張する形で無理なく実装できそうです。ただし全員に個別の見た目を用意するなら、その分テストの手間も増えます。",
                    ],
                    "close": [
                        "実装面では、まず1〜2人のライバルにだけ試験的にバリエーションを増やし、負荷や見た目を確認してから全員に展開するのが現実的だと思います。",
                    ],
                },
                "generic": {
                    "open": [
                        "「{topic}」を実装コストの観点で見ると、まず既存のコードにどれくらい手を入れる必要があるかを見積もりたいです。",
                    ],
                    "middle": [
                        "{prev}の視点も踏まえると、一部だけ試験的に実装して様子を見る、という進め方が現実的そうです。",
                    ],
                    "close": [
                        "実装面では、影響範囲を小さく区切って、既存の動作を壊さない形で進めることを提案します。",
                    ],
                },
            },
        ),
        Persona(
            "対象ユーザー(大学生)", "🎓",
            {
                "visual": {
                    "open": [
                        "正直な感想として、「{topic}」というのは分かる気がします。今のキャラは可愛いけど、ちょっと記号的すぎて「本当に頑張ってる人がいる」という実感が薄い気もします。",
                    ],
                    "middle": [
                        "{prev}の言う通り、パーツが増えすぎると逆に安っぽく見えるかもと思いました。私が欲しいのは、細かい絵より「今日は数的処理を2時間もやってる人がいるんだ」みたいな、頑張りの中身が伝わる情報の方かもしれません。",
                    ],
                    "close": [
                        "見た目のリアルさより、「今何にどれだけ取り組んでいるか」が伝わる方が、一緒に頑張ってる感じは強くなると思います。",
                    ],
                },
                "generic": {
                    "open": [
                        "使う立場から言うと、「{topic}」は正直助かる/気になる変化かもしれません。ただ、日々の使い勝手が悪くなるなら本末転倒です。",
                    ],
                    "middle": [
                        "{prev}が言うように作り込みすぎるのも考えものですが、私としては「続けたくなるかどうか」を一番気にしています。",
                    ],
                    "close": [
                        "見た目や機能そのものより、「今日もやろう」と思わせてくれるかどうかで判断したいです。",
                    ],
                },
            },
        ),
        Persona(
            "批判的レビュアー", "🔍",
            {
                "visual": {
                    "open": [
                        "「{topic}」という方向性自体はコンセプトに合っていますが、一点確認したいのは「リアルにする」ことで、架空のライバルだと誤解されやすくなるリスクです。凝った見た目にするほど、実在の学生だと錯覚されやすくなります。",
                    ],
                    "middle": [
                        "{prev}の懸念(コスト面)は妥当です。加えて、キャラクターの作り込みに時間を使うことで、本来の学習支援としての機能改善が後回しになるという優先順位の問題も指摘しておきたいです。",
                    ],
                    "close": [
                        "「頑張ってる感じ」を強めたいなら、見た目よりもデータ(経過時間・今日の合計・連続日数)の見せ方を強化する方が、投資対効果は高いと考えます。見た目の作り込みは、そのあとでも遅くありません。",
                    ],
                },
                "generic": {
                    "open": [
                        "「{topic}」という方向性について、まず確認したいのは、それが本来の目的からズレていないかです。",
                    ],
                    "middle": [
                        "{prev}の懸念は妥当だと思います。加えて、優先順位として本当に今やるべきことかも問い直したいです。",
                    ],
                    "close": [
                        "見た目や機能の追加より前に、それが解決する課題は何か、他にもっと優先度の高い改善がないかを一度整理することを勧めます。",
                    ],
                },
            },
        ),
    ]


# ============ 表示まわり ============

def print_header(topic, rounds, theme):
    print("=" * CONSOLE_WIDTH)
    print("もくもく部屋ディベート (オフライン・テンプレート応答版)")
    print(f"お題: {topic}")
    print(f"ラウンド数: {rounds} / 推定テーマ: {theme}")
    print("=" * CONSOLE_WIDTH)


def print_turn(persona, round_no, text):
    print(f"\n[第{round_no}ラウンド] {persona.icon} {persona.name}")
    wrapped = textwrap.fill(
        text, width=CONSOLE_WIDTH, initial_indent="  ", subsequent_indent="  "
    )
    print(wrapped)


def shorten_ja(text, width=90, placeholder="…"):
    # textwrap.shorten は空白区切りの英単語を前提にしており、
    # 分かち書きされない日本語では文全体が「1単語」扱いになって
    # ほぼ全て placeholder だけに潰れてしまう。文字数で単純に切る。
    if len(text) <= width:
        return text
    return text[: width - len(placeholder)] + placeholder


def print_summary(topic, history):
    # 各ペルソナの最後の発言(=結論フェーズの発言)だけを拾う。
    # historyはラウンドごとに全ペルソナ分あるので、同名の最新のものだけ残す。
    last_by_name = {}
    order = []
    for name, icon, text in history:
        if name not in last_by_name:
            order.append(name)
        last_by_name[name] = (icon, text)

    print("\n" + "=" * CONSOLE_WIDTH)
    print("ファシリテーターまとめ(各ペルソナの結論)")
    print("=" * CONSOLE_WIDTH)
    print(textwrap.fill(
        f"「{topic}」について、各ペルソナが最終的に出した意見は以下の通りです。"
        "実際にどれを採用するかは、あなた自身の判断で決めてください"
        "(このツールは論点を整理するためのもので、結論を代わりに出すものではありません)。",
        width=CONSOLE_WIDTH,
    ))
    for name in order:
        icon, text = last_by_name[name]
        print(f"\n- {icon} {name}: " + shorten_ja(text, width=140))


# ============ メイン ============

def run_debate(topic, rounds):
    personas = build_personas()
    theme = detect_theme(topic)
    print_header(topic, rounds, theme)

    history = []  # (name, icon, text) の全発言ログ
    prev_speaker = None

    for round_no in range(1, rounds + 1):
        if rounds == 1:
            phase = "close"
        elif round_no == 1:
            phase = "open"
        elif round_no == rounds:
            phase = "close"
        else:
            phase = "middle"

        for persona in personas:
            text = persona.speak(topic, phase, theme, prev_speaker)
            print_turn(persona, round_no, text)
            history.append((persona.name, persona.icon, text))
            prev_speaker = persona.name

    print_summary(topic, history)


def main():
    parser = argparse.ArgumentParser(
        description="複数ペルソナによるオフライン・ディベートをコンソールに出力する"
    )
    parser.add_argument("topic", help="議論させたいお題(文章)")
    parser.add_argument(
        "--rounds", type=int, default=3, help="ラウンド数(既定値: 3)"
    )
    args = parser.parse_args()

    if args.rounds < 1:
        print("エラー: --rounds は1以上を指定してください", file=sys.stderr)
        sys.exit(1)

    run_debate(args.topic, args.rounds)


if __name__ == "__main__":
    main()
