from __future__ import annotations

from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "images"
ICON_SET = ASSETS / "icon-set"

SIZE = 512
SCALE = 4
CANVAS = SIZE * SCALE

WHITE = (243, 246, 252, 255)
SOFT_WHITE = (220, 228, 242, 255)
BLUE = (10, 132, 255, 255)
ORANGE = (255, 159, 10, 255)
RED = (255, 69, 58, 255)
GREEN = (52, 199, 89, 255)


def _w(value: float) -> int:
    return int(value * SCALE)


def _stroke(base: float) -> int:
    return _w(base)


def _new() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img, "RGBA")


def _save(img: Image.Image, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    out = img.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    out.save(target)


def _rounded_rect(draw: ImageDraw.ImageDraw, xy: tuple[int, int, int, int], radius: int, outline, width: int) -> None:
    draw.rounded_rectangle(xy, radius=radius, outline=outline, width=width)


def icon_singing() -> Image.Image:
    img, d = _new()
    s = _stroke(42)
    d.ellipse((_w(180), _w(90), _w(332), _w(250)), outline=WHITE, width=s)
    d.arc((_w(180), _w(154), _w(332), _w(316)), start=20, end=160, fill=WHITE, width=s)
    d.line((_w(256), _w(250), _w(256), _w(372)), fill=WHITE, width=s)
    d.arc((_w(174), _w(356), _w(338), _w(432)), start=200, end=340, fill=WHITE, width=s)
    d.line((_w(384), _w(180), _w(422), _w(164), _w(462), _w(180), _w(500), _w(164)), fill=ORANGE, width=_stroke(24), joint="curve")
    return img


def icon_lyrics() -> Image.Image:
    img, d = _new()
    s = _stroke(34)
    _rounded_rect(d, (_w(108), _w(80), _w(336), _w(426)), radius=_w(28), outline=WHITE, width=s)
    d.line((_w(142), _w(170), _w(280), _w(170)), fill=SOFT_WHITE, width=_stroke(26))
    d.line((_w(142), _w(230), _w(280), _w(230)), fill=SOFT_WHITE, width=_stroke(26))
    d.line((_w(142), _w(290), _w(240), _w(290)), fill=SOFT_WHITE, width=_stroke(26))
    d.line((_w(330), _w(174), _w(426), _w(142), _w(426), _w(288)), fill=BLUE, width=_stroke(30), joint="curve")
    d.ellipse((_w(298), _w(300), _w(352), _w(354)), fill=BLUE)
    d.ellipse((_w(394), _w(268), _w(448), _w(322)), fill=BLUE)
    return img


def icon_sessions() -> Image.Image:
    img, d = _new()
    s = _stroke(30)
    _rounded_rect(d, (_w(130), _w(132), _w(318), _w(390)), radius=_w(24), outline=SOFT_WHITE, width=s)
    _rounded_rect(d, (_w(176), _w(96), _w(364), _w(354)), radius=_w(24), outline=WHITE, width=s)
    _rounded_rect(d, (_w(222), _w(62), _w(410), _w(320)), radius=_w(24), outline=WHITE, width=s)
    d.line((_w(252), _w(142), _w(374), _w(142)), fill=SOFT_WHITE, width=_stroke(20))
    d.line((_w(252), _w(198), _w(360), _w(198)), fill=SOFT_WHITE, width=_stroke(20))
    d.line((_w(252), _w(254), _w(338), _w(254)), fill=SOFT_WHITE, width=_stroke(20))
    return img


def icon_profile() -> Image.Image:
    img, d = _new()
    s = _stroke(34)
    d.ellipse((_w(186), _w(82), _w(326), _w(222)), outline=WHITE, width=s)
    d.rounded_rectangle((_w(104), _w(236), _w(408), _w(412)), radius=_w(90), outline=WHITE, width=s)
    return img


def icon_live_mode() -> Image.Image:
    img, d = _new()
    s = _stroke(32)
    _rounded_rect(d, (_w(84), _w(138), _w(430), _w(346)), radius=_w(50), outline=WHITE, width=s)
    d.ellipse((_w(372), _w(172), _w(420), _w(220)), fill=ORANGE)
    d.line((_w(158), _w(244), _w(356), _w(244)), fill=SOFT_WHITE, width=_stroke(24))
    return img


def icon_lyrics_sync() -> Image.Image:
    img, d = _new()
    s = _stroke(28)
    _rounded_rect(d, (_w(194), _w(174), _w(318), _w(334)), radius=_w(20), outline=WHITE, width=s)
    d.arc((_w(70), _w(70), _w(442), _w(442)), start=35, end=170, fill=WHITE, width=s)
    d.polygon([(_w(420), _w(120)), (_w(462), _w(120)), (_w(438), _w(160))], fill=WHITE)
    d.arc((_w(70), _w(70), _w(442), _w(442)), start=215, end=350, fill=WHITE, width=s)
    d.polygon([(_w(92), _w(394)), (_w(132), _w(394)), (_w(108), _w(430))], fill=WHITE)
    return img


def icon_feedback(high: bool) -> Image.Image:
    img, d = _new()
    base_y = _w(390)
    bar_w = _w(54)
    gap = _w(34)
    x = _w(112)
    heights = [_w(120), _w(170), _w(230), _w(280)]
    if not high:
        heights = [_w(260), _w(210), _w(160), _w(110)]
    for i, h in enumerate(heights):
        color = ORANGE if (high and i == 3) or (not high and i == 0) else SOFT_WHITE
        d.rounded_rectangle((x, base_y - h, x + bar_w, base_y), radius=_w(16), fill=color)
        x += bar_w + gap
    return img


def icon_mindfulness_voice() -> Image.Image:
    img, d = _new()
    s = _stroke(34)
    d.ellipse((_w(182), _w(92), _w(330), _w(248)), outline=WHITE, width=s)
    d.arc((_w(182), _w(154), _w(330), _w(308)), start=20, end=160, fill=WHITE, width=s)
    d.line((_w(256), _w(246), _w(256), _w(350)), fill=WHITE, width=s)
    d.arc((_w(174), _w(336), _w(338), _w(412)), start=200, end=340, fill=WHITE, width=s)
    d.line((_w(350), _w(250), _w(382), _w(214), _w(414), _w(266), _w(452), _w(228), _w(490), _w(246)), fill=ORANGE, width=_stroke(24), joint="curve")
    return img


def icon_language_accent() -> Image.Image:
    img, d = _new()
    s = _stroke(26)
    d.ellipse((_w(90), _w(84), _w(358), _w(352)), outline=WHITE, width=s)
    d.arc((_w(120), _w(84), _w(328), _w(352)), start=90, end=270, fill=SOFT_WHITE, width=_stroke(20))
    d.arc((_w(140), _w(84), _w(308), _w(352)), start=90, end=270, fill=SOFT_WHITE, width=_stroke(16))
    d.line((_w(90), _w(218), _w(358), _w(218)), fill=SOFT_WHITE, width=_stroke(20))
    d.rounded_rectangle((_w(292), _w(148), _w(456), _w(274)), radius=_w(46), outline=WHITE, width=s)
    d.polygon([(_w(330), _w(274)), (_w(300), _w(308)), (_w(334), _w(292))], fill=WHITE)
    for x in (338, 374, 410):
        d.ellipse((_w(x), _w(198), _w(x + 20), _w(218)), fill=ORANGE)
    return img


def icon_howto() -> Image.Image:
    img, d = _new()
    s = _stroke(30)
    _rounded_rect(d, (_w(110), _w(92), _w(402), _w(424)), radius=_w(34), outline=WHITE, width=s)
    _rounded_rect(d, (_w(198), _w(58), _w(314), _w(118)), radius=_w(18), outline=WHITE, width=_stroke(24))
    d.line((_w(156), _w(192), _w(292), _w(192)), fill=SOFT_WHITE, width=_stroke(20))
    d.line((_w(156), _w(246), _w(272), _w(246)), fill=SOFT_WHITE, width=_stroke(20))
    d.line((_w(156), _w(300), _w(292), _w(300)), fill=SOFT_WHITE, width=_stroke(20))
    d.ellipse((_w(286), _w(174), _w(404), _w(292)), outline=WHITE, width=_stroke(20))
    d.polygon([(_w(330), _w(208)), (_w(330), _w(258)), (_w(372), _w(233))], fill=BLUE)
    d.text((_w(382), _w(94)), "?", fill=ORANGE, font=ImageFont.load_default(size=_w(82)))
    return img


def icon_record() -> Image.Image:
    img, d = _new()
    d.ellipse((_w(108), _w(108), _w(404), _w(404)), outline=RED, width=_stroke(36))
    d.ellipse((_w(194), _w(194), _w(318), _w(318)), fill=RED)
    return img


def icon_stop() -> Image.Image:
    img, d = _new()
    d.rounded_rectangle((_w(128), _w(128), _w(384), _w(384)), radius=_w(76), fill=RED)
    return img


def icon_metronome() -> Image.Image:
    img, d = _new()
    s = _stroke(26)
    d.polygon([(_w(256), _w(92)), (_w(128), _w(412)), (_w(384), _w(412))], outline=WHITE, fill=(0, 0, 0, 0), width=s)
    d.line((_w(256), _w(180), _w(338), _w(308)), fill=ORANGE, width=_stroke(24))
    d.ellipse((_w(324), _w(292), _w(362), _w(330)), fill=ORANGE)
    return img


def icon_flag() -> Image.Image:
    img, d = _new()
    s = _stroke(24)
    d.line((_w(146), _w(88), _w(146), _w(420)), fill=WHITE, width=s)
    d.polygon([(_w(158), _w(110)), (_w(376), _w(154)), (_w(158), _w(210))], fill=ORANGE)
    d.line((_w(146), _w(420), _w(222), _w(420)), fill=WHITE, width=s)
    return img


def icon_bpm() -> Image.Image:
    img, d = _new()
    s = _stroke(24)
    d.polygon([(_w(256), _w(92)), (_w(144), _w(354)), (_w(368), _w(354))], outline=WHITE, fill=(0, 0, 0, 0), width=s)
    d.line((_w(256), _w(184), _w(316), _w(276)), fill=ORANGE, width=_stroke(20))
    d.ellipse((_w(300), _w(260), _w(332), _w(292)), fill=ORANGE)
    d.line((_w(92), _w(418), _w(184), _w(418), _w(214), _w(392), _w(242), _w(436), _w(272), _w(406), _w(420), _w(406)), fill=BLUE, width=_stroke(16), joint="curve")
    return img


def icon_count_in() -> Image.Image:
    img, d = _new()
    s = _stroke(20)
    d.arc((_w(82), _w(82), _w(430), _w(430)), start=300, end=580, fill=WHITE, width=s)
    for i, x in enumerate((170, 230, 290, 350), start=1):
        color = ORANGE if i == 4 else SOFT_WHITE
        d.ellipse((_w(x), _w(244), _w(x + 30), _w(274)), fill=color)
    d.line((_w(256), _w(112), _w(256), _w(170)), fill=ORANGE, width=_stroke(16))
    return img


def icon_lyrics_flow() -> Image.Image:
    img, d = _new()
    d.line((_w(98), _w(170), _w(290), _w(170)), fill=SOFT_WHITE, width=_stroke(24))
    d.polygon([(_w(290), _w(146)), (_w(352), _w(170)), (_w(290), _w(194))], fill=SOFT_WHITE)
    d.line((_w(98), _w(256), _w(330), _w(256)), fill=WHITE, width=_stroke(24))
    d.polygon([(_w(330), _w(230)), (_w(394), _w(256)), (_w(330), _w(282))], fill=BLUE)
    d.line((_w(98), _w(340), _w(370), _w(340)), fill=SOFT_WHITE, width=_stroke(24))
    d.polygon([(_w(370), _w(314)), (_w(434), _w(340)), (_w(370), _w(366))], fill=ORANGE)
    return img


def icon_about() -> Image.Image:
    img, d = _new()
    d.ellipse((_w(110), _w(110), _w(402), _w(402)), outline=WHITE, width=_stroke(28))
    d.ellipse((_w(244), _w(168), _w(268), _w(192)), fill=BLUE)
    d.line((_w(256), _w(216), _w(256), _w(330)), fill=WHITE, width=_stroke(26))
    return img


def icon_no_song() -> Image.Image:
    img, d = _new()
    _rounded_rect(d, (_w(120), _w(96), _w(318), _w(394)), radius=_w(24), outline=SOFT_WHITE, width=_stroke(26))
    d.line((_w(338), _w(170), _w(418), _w(144), _w(418), _w(258)), fill=BLUE, width=_stroke(20), joint="curve")
    d.ellipse((_w(312), _w(274), _w(358), _w(320)), fill=BLUE)
    d.line((_w(118), _w(402), _w(404), _w(108)), fill=ORANGE, width=_stroke(22))
    return img


def icon_gender(female: bool) -> Image.Image:
    img, d = _new()
    s = _stroke(24)
    d.ellipse((_w(180), _w(96), _w(332), _w(248)), outline=WHITE, width=s)
    if female:
        d.arc((_w(158), _w(90), _w(354), _w(286)), start=205, end=335, fill=BLUE, width=_stroke(30))
    else:
        d.rounded_rectangle((_w(176), _w(90), _w(336), _w(156)), radius=_w(26), fill=BLUE)
    d.rounded_rectangle((_w(108), _w(252), _w(404), _w(418)), radius=_w(90), outline=WHITE, width=s)
    return img


def icon_beats(count: int) -> Image.Image:
    img, d = _new()
    spacing = 70
    total = (count - 1) * spacing
    start = 256 - total // 2
    for i in range(count):
        x = start + i * spacing
        color = ORANGE if i == count - 1 else SOFT_WHITE
        d.ellipse((_w(x - 22), _w(220), _w(x + 22), _w(264)), fill=color)
    d.line((_w(130), _w(320), _w(382), _w(320)), fill=WHITE, width=_stroke(18))
    return img


def icon_easepocket() -> Image.Image:
    img, d = _new()
    d.ellipse((_w(92), _w(86), _w(420), _w(414)), outline=SOFT_WHITE, width=_stroke(20))
    d.line((_w(124), _w(256), _w(188), _w(256), _w(236), _w(210), _w(280), _w(302), _w(336), _w(236), _w(390), _w(236)), fill=BLUE, width=_stroke(20), joint="curve")
    d.ellipse((_w(356), _w(146), _w(392), _w(182)), fill=ORANGE)
    d.ellipse((_w(140), _w(318), _w(170), _w(348)), fill=(120, 120, 255, 210))
    return img


ICON_BUILD: list[tuple[Path, Callable[[], Image.Image]]] = [
    (ICON_SET / "Singing.png", icon_singing),
    (ICON_SET / "Lyrics.png", icon_lyrics),
    (ICON_SET / "sessions.png", icon_sessions),
    (ICON_SET / "Profile.png", icon_profile),
    (ICON_SET / "Live_mode.png", icon_live_mode),
    (ICON_SET / "Lyrics_sync.png", icon_lyrics_sync),
    (ICON_SET / "Feedback_intensity_high.png", lambda: icon_feedback(True)),
    (ICON_SET / "Feedback_intensity_low.png", lambda: icon_feedback(False)),
    (ICON_SET / "Mindfullness_voice.png", icon_mindfulness_voice),
    (ICON_SET / "Language_accent.png", icon_language_accent),
    (ICON_SET / "howto-icon.png", icon_howto),
    (ASSETS / "record_icon.png", icon_record),
    (ASSETS / "Stop_icon.png", icon_stop),
    (ASSETS / "metronome_icon.png", icon_metronome),
    (ASSETS / "flag_icon.png", icon_flag),
    (ASSETS / "bpm_icon.png", icon_bpm),
    (ASSETS / "count_in_icon.png", icon_count_in),
    (ASSETS / "lyrics_flow_speed_icon.png", icon_lyrics_flow),
    (ASSETS / "about_icon.png", icon_about),
    (ASSETS / "nosong_state.png", icon_no_song),
    (ASSETS / "Female.png", lambda: icon_gender(True)),
    (ASSETS / "Male.png", lambda: icon_gender(False)),
    (ASSETS / "two_beats.png", lambda: icon_beats(2)),
    (ASSETS / "four_beats.png", lambda: icon_beats(4)),
    (ASSETS / "EasePocket.png", icon_easepocket),
]


if __name__ == "__main__":
    for target, builder in ICON_BUILD:
        _save(builder(), target)
        print(f"generated {target.relative_to(ROOT)}")
