"""Creature auto-fit: whatever is submitted becomes four 1024x1024 transparent PNGs, the creature at most 80% of the canvas,
centred, on baseline y=922, one shared scale. Offline (no network, no data). Run from backend/:
    python3 -m pytest tests/test_creature_autofit.py
"""
import io
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest
from PIL import Image, ImageDraw
import server as S

CANVAS, BASE, MAXSIDE = 1024, 922, 820


def drawing(size, bg=(255, 255, 255), body=(220, 40, 40), creature=0.7, wide=1.0, interior=(244, 244, 240)):
    """A child-like drawing: a dark closed outline whose inside is off-white paper, with a coloured blob in it."""
    im = Image.new("RGB", (size, size), bg)
    d = ImageDraw.Draw(im)
    w, h = int(size * creature * wide), int(size * creature)
    x0, y0 = (size - w) // 2, (size - h) // 2
    lw = max(3, size // 90)
    d.ellipse([x0, y0, x0 + w, y0 + h], fill=interior, outline=(70, 45, 25), width=lw)
    d.ellipse([x0 + w // 4, y0 + h // 4, x0 + 3 * w // 4, y0 + h // 2], fill=body)
    return im


def jpeg(im, q=60, exif=None):
    b = io.BytesIO()
    im.save(b, "JPEG", quality=q, **({"exif": exif} if exif else {}))
    return b.getvalue()


def png(im):
    b = io.BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


def out_images(res):
    assert res is not None
    return [Image.open(io.BytesIO(b)).convert("RGBA") for b in res[0]]


def bbox(im):
    return im.getchannel("A").point(lambda v: 255 if v > 12 else 0).getbbox()


def check_layout(im):
    assert im.size == (CANVAS, CANVAS)
    l, t, r, b = bbox(im)
    assert r - l <= MAXSIDE and b - t <= MAXSIDE            # at most 80% of the canvas
    assert abs((l + r) / 2 - CANVAS / 2) <= 2               # centred horizontally
    assert abs(b - BASE) <= 2                               # on the baseline
    assert im.getpixel((0, 0))[3] == 0 and im.getpixel((CANVAS - 1, CANVAS - 1))[3] == 0   # transparent corners


def four(make):
    return [make(i) for i in range(4)]


def test_white_background_jpeg_is_cut_out_with_white_inside_and_no_halo():
    res = S.normalise_creature_stages([jpeg(drawing(900, creature=0.35 + 0.1 * i)) for i in range(4)])
    assert res[1] is False                                   # plain paper: nothing for superadmin to review
    for im in out_images(res):
        check_layout(im)
        l, t, r, b = bbox(im)
        cx, cy = (l + r) // 2, (t + b) // 2
        assert im.getpixel((cx, b - (b - t) // 8))[3] >= 250             # paper inside the outline is opaque ...
        assert im.getpixel((cx, b - (b - t) // 8))[:3] == (255, 255, 255)  # ... and white, like the live creatures
        px = [p for p in im.getdata() if 12 < p[3] < 250]               # the feathered edge
        assert px, "expected a soft edge"
        assert sum(sum(p[:3]) / 3 for p in px) / len(px) < 170          # dark ink colour, no light paper halo


def test_plain_coloured_background_is_also_removed():
    res = S.normalise_creature_stages([jpeg(drawing(800, bg=(250, 225, 120), creature=0.3 + 0.12 * i)) for i in range(4)])
    assert res[1] is False
    for im in out_images(res):
        check_layout(im)
        assert im.getpixel((0, 0))[3] == 0 and im.getpixel((CANVAS // 2, 60))[3] == 0   # background gone, not kept


def busy(size, seed):
    rnd = random.Random(seed)
    im = Image.new("RGB", (size, size))
    px = im.load()
    for y in range(size):
        for x in range(size):
            px[x, y] = (rnd.randrange(256), (x * 3 + y) % 256, rnd.randrange(60, 256))
    ImageDraw.Draw(im).ellipse([size // 4, size // 4, 3 * size // 4, 3 * size // 4], fill=(240, 240, 240), outline=(0, 0, 0), width=6)
    return im


def test_busy_photo_background_is_kept_as_is_and_flagged():
    res = S.normalise_creature_stages([jpeg(busy(500, i), q=90) for i in range(4)])
    assert res[1] is True                                    # flagged for superadmin review
    for im in out_images(res):
        check_layout(im)
        l, t, r, b = bbox(im)
        assert im.getchannel("A").crop((l + 2, t + 2, r - 2, b - 2)).getextrema() == (255, 255)   # whole picture kept, nothing cut out


def test_tiny_image_is_fitted_not_blown_up_into_a_blur():
    res = S.normalise_creature_stages([png(drawing(24, creature=0.5 + 0.1 * i)) for i in range(4)])
    for im in out_images(res):
        check_layout(im)
        l, t, r, b = bbox(im)
        assert max(r - l, b - t) <= 24 * S.CREATURE_NORM_MAX_UPSCALE + 4      # upscale is capped (stays smaller than 80%)


def test_rotated_exif_photo_is_turned_upright_first():
    # a wide creature (300x100) stored sideways: EXIF orientation 6 means it is shown rotated, i.e. taller than wide
    from PIL import Image as I
    exif = I.Exif(); exif[0x0112] = 6
    def sideways(i):
        im = I.new("RGB", (400, 200), (255, 255, 255))
        ImageDraw.Draw(im).ellipse([40, 50, 40 + 200 + i * 20, 150], fill=(230, 230, 225), outline=(60, 40, 20), width=6)
        return jpeg(im, q=85, exif=exif.tobytes())
    res = S.normalise_creature_stages([sideways(i) for i in range(4)])
    for im in out_images(res):
        check_layout(im)
        l, t, r, b = bbox(im)
        assert (b - t) > (r - l)                             # upright: taller than wide (without EXIF handling it would be wider)


def alpha_creature(size, creature, x_off=0, y_off=0):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    w = int(size * creature)
    c = size // 2
    d.ellipse([c - w // 2 + x_off, c - w // 2 + y_off, c + w // 2 + x_off, c + w // 2 + y_off], fill=(255, 0, 0, 255), outline=(0, 0, 255, 255), width=5)
    return im


def test_png_with_real_alpha_keeps_its_pixels_and_gets_no_background_work():
    res = S.normalise_creature_stages([png(alpha_creature(700, 0.3 + 0.1 * i, x_off=60)) for i in range(4)])
    assert res[1] is False
    for im in out_images(res):
        check_layout(im)
        l, t, r, b = bbox(im)
        assert im.getpixel(((l + r) // 2, (t + b) // 2))[:4] == (255, 0, 0, 255)   # body colour untouched: no paper matting, no white fill
    # an alpha set already in the standard form is left exactly as uploaded
    standard = res[0]
    assert S.normalise_creature_stages(standard) is None


def test_four_stages_of_different_sizes_share_one_scale_and_one_baseline():
    # different canvas sizes AND different creature sizes: stage 4 is the biggest
    stages = [drawing(300, creature=0.40), drawing(600, creature=0.45), drawing(900, creature=0.50), drawing(1200, creature=0.66)]
    orig_h = [int(s.size[0] * c) for s, c in zip(stages, (0.40, 0.45, 0.50, 0.66))]
    res = S.normalise_creature_stages([jpeg(s, q=85) for s in stages])
    ims = out_images(res)
    heights = []
    for im in ims:
        check_layout(im)
        l, t, r, b = bbox(im)
        heights.append(b - t)
    assert heights == sorted(heights) and heights[-1] >= MAXSIDE - 4          # stage 4 largest, fills 80%
    scale = heights[-1] / orig_h[-1]
    for h, o in zip(heights, orig_h):
        assert abs(h / o - scale) / scale < 0.06                              # one shared scale: sizes keep their proportions


def test_unusable_input_leaves_everything_alone():
    good = jpeg(drawing(300))
    assert S.normalise_creature_stages([good, good, good, b"not an image"]) is None
    blank = S.normalise_creature_stages([jpeg(Image.new("RGB", (300, 300), (255, 255, 255)))] * 4)
    assert blank is not None and blank[1] is True        # an empty page is kept whole and sent to the superadmin, never silently cut to nothing


def test_speed_on_a_large_photo():
    big = jpeg(drawing(3000, creature=0.6), q=85)
    t0 = time.time()
    res = S.normalise_creature_stages([big] * 4)
    assert res is not None and time.time() - t0 < 25


# ---- the worker: new names, urls swapped last, originals kept, thumbnails, review flag ----------------------------------
class _Bucket:
    def __init__(self, store, fail_after=None):
        self.store, self.n, self.fail_after = store, 0, fail_after
    def download(self, path): return self.store[path]
    def upload(self, path, data, opts=None):
        self.n += 1
        if self.fail_after is not None and self.n > self.fail_after:
            raise RuntimeError("storage down")
        self.store[path] = data
    def get_public_url(self, path): return f"https://{S._our_storage_host()}/storage/v1/object/public/creature-images/{path}"

class _Storage:
    def __init__(self, bucket): self.b = bucket
    def from_(self, name): return self.b

class _Table:
    def __init__(self, rows, log): self.rows, self.log, self.f, self.upd = rows, log, {}, None
    def select(self, *a, **k): return self
    def eq(self, k, v): self.f[k] = v; return self
    def update(self, d): self.upd = d; return self
    def execute(self):
        hit = [r for r in self.rows if all(r.get(k) == v for k, v in self.f.items())]
        if self.upd is not None:
            self.log.append(dict(self.upd))
            for r in hit: r.update(self.upd)
        return type("R", (), {"data": hit})()

class _FakeSB:
    def __init__(self, rows, bucket): self.rows, self.storage, self.log = rows, _Storage(bucket), []
    def table(self, name): return _Table(self.rows, self.log)


def _setup(monkeypatch, imgs, flag=None, fail_after=None):
    host = S._our_storage_host()
    paths = [f"creatures/user_t_stage{i}_{'ab12cd3%d' % i}.jpg" for i in (1, 2, 3, 4)]
    store = dict(zip(paths, imgs))
    originals = dict(store)
    urls = [f"https://{host}/storage/v1/object/public/creature-images/{p}" for p in paths]
    rows = [{"id": "sub1", "ai_moderation_flag": flag, **{f"stage{i}_url": u for i, u in enumerate(urls, 1)}}]
    sb = _FakeSB(rows, _Bucket(store, fail_after))
    monkeypatch.setattr(S, "supabase", sb)
    return paths, originals, store, rows, sb


def test_worker_swaps_urls_last_keeps_originals_and_makes_thumbnails(monkeypatch):
    paths, originals, store, rows, sb = _setup(monkeypatch, [jpeg(drawing(700, creature=0.3 + 0.1 * i)) for i in range(4)])
    S._normalise_submission_images_sync("sub1", [rows[0][f"stage{i}_url"] for i in (1, 2, 3, 4)])
    assert all(store[p] == originals[p] for p in paths)                       # originals untouched
    new = [u for u in (rows[0][f"stage{i}_url"] for i in (1, 2, 3, 4))]
    assert all("_n" in u and u.endswith(".png") for u in new)                 # new object names
    assert sum(1 for k in store if k.endswith("_thumb.png")) == 4             # 200 px thumbnails alongside
    for k in store:
        if k.endswith("_thumb.png"):
            assert max(Image.open(io.BytesIO(store[k])).size) <= 200
    assert "ai_moderation_flag" not in sb.log[-1] and rows[0]["ai_moderation_flag"] is None   # plain paper: no review flag


def test_worker_flags_a_busy_background_for_review_but_never_replaces_an_ai_flag(monkeypatch):
    for current, expected in ((None, "review"), ("clean", "review"), ("error", "review"), ("flagged", "flagged")):
        paths, originals, store, rows, sb = _setup(monkeypatch, [jpeg(busy(500, i), q=90) for i in range(4)], flag=current)
        S._normalise_submission_images_sync("sub1", [rows[0][f"stage{i}_url"] for i in (1, 2, 3, 4)])
        assert rows[0]["ai_moderation_flag"] == expected, current
        assert "_n" in rows[0]["stage1_url"]


def test_worker_failure_leaves_the_row_and_originals_exactly_as_they_were(monkeypatch):
    paths, originals, store, rows, sb = _setup(monkeypatch, [jpeg(drawing(700, creature=0.4)) for _ in range(4)], fail_after=3)
    before = dict(rows[0])
    S._normalise_submission_images_sync("sub1", [rows[0][f"stage{i}_url"] for i in (1, 2, 3, 4)])
    assert rows[0] == before and sb.log == []                                 # urls never swapped
    assert all(store[p] == originals[p] for p in paths)


def test_already_standard_alpha_set_is_left_alone_by_the_worker(monkeypatch):
    std = S.normalise_creature_stages([png(alpha_creature(700, 0.3 + 0.1 * i)) for i in range(4)])[0]
    paths, originals, store, rows, sb = _setup(monkeypatch, std)
    before = dict(rows[0])
    S._normalise_submission_images_sync("sub1", [rows[0][f"stage{i}_url"] for i in (1, 2, 3, 4)])
    assert rows[0] == before and sb.log == [] and len(store) == 4


def test_review_flag_routes_to_superadmin_and_nothing_else_changes():
    assert S._ai_check_needs_superadmin("review") is True and S._ai_check_needs_superadmin("flagged") is True
    assert S._ai_check_needs_superadmin(None) is False and S._ai_check_needs_superadmin("clean") is False
    assert S._passes_creature_approval_gate("approved", "classroom", None, "review", None) is False      # needs superadmin
    assert S._passes_creature_approval_gate("approved", "classroom", "2026-11-12T00:00:00+00:00", "review", None) is True
    assert S._passes_creature_approval_gate("approved", "classroom", None, "clean", None) is True        # unchanged for everyone else
