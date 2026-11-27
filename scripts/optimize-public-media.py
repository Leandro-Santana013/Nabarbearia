"""Prepare landing-page derivatives while preserving every source image.

Requires Pillow with WebP support. Run from any directory with Python 3.
Portrait originals are cached under ignored artifacts, never inside public/.
Use --offline to rebuild from the local source/cache files without network.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import io
import json
from pathlib import Path
import re
import time
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from PIL import Image, ImageDraw, ImageFont, ImageOps, features

try:
    import cv2
except ImportError:
    cv2 = None


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "public/brand/optimized"
CACHE = ROOT / "artifacts/stage4-portrait-originals"
MANIFEST = ROOT / "src/config/publicMedia.generated.json"
REPORT = ROOT / "artifacts/stage4-media-report.json"
QUALITY = 84
SHOWREEL_VIDEO = ROOT / "public/brand/na-barbearia-showreel.mp4"
SHOWREEL_POSTER = OUTPUT / "showreel-poster.webp"
SHOWREEL_MIN_LUMA = 16.0
SHOWREEL_MAX_SCAN_FRAMES = 60


def portrait_sources() -> list[tuple[str, str]]:
    config = (ROOT / "src/config/siteConfig.ts").read_text(encoding="utf-8")
    block = re.search(r"const photoById:.*?=\s*\{(.*?)\n\}", config, re.S)
    if not block:
        raise RuntimeError("The existing portrait-source map was not found.")
    return re.findall(r"^\s*([a-z0-9_]+):\s*'([^']+)'", block.group(1), re.M)


def checked_image(path: Path) -> Image.Image:
    with Image.open(path) as source:
        source.load()
        transposed = ImageOps.exif_transpose(source)
        try:
            if "A" in transposed.getbands():
                rgba = transposed.convert("RGBA")
                if rgba.getchannel("A").getextrema() == (255, 255):
                    rgb = rgba.convert("RGB")
                    rgba.close()
                    return rgb
                return rgba
            return transposed.convert("RGB")
        finally:
            if transposed is not source:
                transposed.close()


def load_existing_manifest() -> dict[str, dict]:
    if not MANIFEST.is_file():
        return {}
    try:
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def _public_asset_path(url: object) -> Path | None:
    if not isinstance(url, str) or not url.startswith("/"):
        return None
    public_root = (ROOT / "public").resolve()
    candidate = (public_root / url.lstrip("/")).resolve()
    try:
        candidate.relative_to(public_root)
    except ValueError:
        return None
    return candidate


def valid_manifest_entry(entry: object) -> bool:
    if not isinstance(entry, dict):
        return False
    width = entry.get("width")
    height = entry.get("height")
    if isinstance(width, bool) or not isinstance(width, int) or width <= 0:
        return False
    if isinstance(height, bool) or not isinstance(height, int) or height <= 0:
        return False
    src_path = _public_asset_path(entry.get("src"))
    if src_path is None or not src_path.is_file():
        return False
    try:
        with Image.open(src_path) as image:
            image.verify()
    except Exception:
        return False
    src_set = entry.get("srcSet")
    if not isinstance(src_set, str) or not src_set.strip():
        return False
    candidates = [part.strip() for part in src_set.split(",") if part.strip()]
    if not candidates:
        return False
    for candidate in candidates:
        tokens = candidate.split()
        if len(tokens) != 2 or not tokens[1].endswith("w"):
            return False
        variant_path = _public_asset_path(tokens[0])
        if variant_path is None or not variant_path.is_file():
            return False
        try:
            with Image.open(variant_path) as image:
                image.verify()
        except Exception:
            return False
    return True


def _validate_existing_webp(path: Path) -> tuple[int, int]:
    with Image.open(path) as image:
        image.load()
        if image.format != "WEBP":
            raise RuntimeError(f"Expected WEBP image at {path}, got {image.format}.")
        width, height = image.size
    if width <= 0 or height <= 0:
        raise RuntimeError(f"Invalid WEBP dimensions at {path}: {width}x{height}")
    return width, height


def showreel_poster(offline: bool) -> dict:
    if cv2 is None:
        if SHOWREEL_POSTER.is_file():
            width, height = _validate_existing_webp(SHOWREEL_POSTER)
            return {
                "path": "/brand/optimized/showreel-poster.webp",
                "width": width,
                "height": height,
                "bytes": SHOWREEL_POSTER.stat().st_size,
                "preserved": True,
            }
        raise RuntimeError("OpenCV (cv2) is required to generate public/brand/optimized/showreel-poster.webp.")

    if not SHOWREEL_VIDEO.is_file():
        if offline and SHOWREEL_POSTER.is_file():
            width, height = _validate_existing_webp(SHOWREEL_POSTER)
            return {
                "path": "/brand/optimized/showreel-poster.webp",
                "width": width,
                "height": height,
                "bytes": SHOWREEL_POSTER.stat().st_size,
                "preserved": True,
            }
        raise FileNotFoundError(f"Missing showreel video: {SHOWREEL_VIDEO}")

    cap = cv2.VideoCapture(str(SHOWREEL_VIDEO))
    if not cap.isOpened():
        cap.release()
        raise RuntimeError(f"Could not open showreel video: {SHOWREEL_VIDEO}")

    selected_frame = None
    selected_index = 0
    selected_luma = -1.0
    brightest_frame = None
    brightest_index = 0
    brightest_luma = -1.0

    try:
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        scan_limit = min(frame_count, SHOWREEL_MAX_SCAN_FRAMES) if frame_count > 0 else SHOWREEL_MAX_SCAN_FRAMES
        for index in range(scan_limit):
            ok, frame = cap.read()
            if not ok or frame is None:
                break
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            luma = float(cv2.mean(gray)[0])
            if luma > brightest_luma:
                brightest_frame = frame
                brightest_index = index
                brightest_luma = luma
            if luma >= SHOWREEL_MIN_LUMA:
                selected_frame = frame
                selected_index = index
                selected_luma = luma
                break
        if selected_frame is None:
            selected_frame = brightest_frame
            selected_index = brightest_index
            selected_luma = brightest_luma
        if selected_frame is None:
            raise RuntimeError(f"Could not decode any frame from showreel video: {SHOWREEL_VIDEO}")
        rgb = cv2.cvtColor(selected_frame, cv2.COLOR_BGR2RGB)
    finally:
        cap.release()

    poster_image = Image.fromarray(rgb)
    try:
        poster_image.save(SHOWREEL_POSTER, "WEBP", quality=QUALITY, method=6)
    finally:
        poster_image.close()

    width, height = _validate_existing_webp(SHOWREEL_POSTER)
    return {
        "path": "/brand/optimized/showreel-poster.webp",
        "width": width,
        "height": height,
        "bytes": SHOWREEL_POSTER.stat().st_size,
        "frameIndex": selected_index,
        "meanLuma": round(selected_luma, 2),
    }


def portrait_source(item: tuple[str, str], offline: bool) -> tuple[str, str, Path | None, str | None]:
    name, url = item
    target = CACHE / f"{name}.source"
    try:
        if target.exists():
            checked_image(target).close()
            return name, url, target, None
        if offline:
            return name, url, None, "Original absent from the offline cache."
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname not in {"d39p7gjvbgwtet.cloudfront.net", "www.trinks.com"}:
            raise ValueError("Portrait URL is outside the existing image hosts.")
        error = None
        for attempt in range(2):
            try:
                request = Request(url, headers={"User-Agent": "Mozilla/5.0 NA-Barbearia-media-preparation", "Accept": "image/*"})
                with urlopen(request, timeout=15) as response:
                    data = response.read(15_000_001)
                if len(data) > 15_000_000:
                    raise ValueError("Portrait exceeds the 15 MB preparation limit.")
                with Image.open(io.BytesIO(data)) as image:
                    image.verify()
                target.write_bytes(data)
                return name, url, target, None
            except Exception as exception:
                error = exception
                if attempt == 0:
                    time.sleep(0.3)
        raise RuntimeError(f"Portrait download failed: {error}")
    except Exception as exception:
        return name, url, None, str(exception)


def derivatives(name: str, original_url: str, path: Path, requested_widths: tuple[int, ...], fallback_width: int) -> tuple[dict, dict]:
    image = checked_image(path)
    width, height = image.size
    widths = sorted({min(candidate, width) for candidate in requested_widths})
    variants = []
    for output_width in widths:
        output_height = max(1, round(height * output_width / width))
        variant = image.resize((output_width, output_height), Image.Resampling.LANCZOS)
        target = OUTPUT / f"{name}-{output_width}.webp"
        if image.mode == "RGBA":
            variant.save(target, "WEBP", lossless=True, method=6, exact=True)
        else:
            variant.save(target, "WEBP", quality=QUALITY, method=6)
        with Image.open(target) as verification:
            assert verification.size == (output_width, output_height)
            assert verification.format == "WEBP"
        variants.append({"url": f"/brand/optimized/{target.name}", "width": output_width, "height": output_height, "bytes": target.stat().st_size})
        variant.close()
    selected = min(variants, key=lambda variant: abs(variant["width"] - fallback_width))
    manifest = {
        "src": selected["url"],
        "srcSet": ", ".join(f'{variant["url"]} {variant["width"]}w' for variant in variants),
        "width": width,
        "height": height,
    }
    report = {
        "source": original_url,
        "originalBytes": path.stat().st_size,
        "originalSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "width": width,
        "height": height,
        "fallbackBytes": selected["bytes"],
        "fallbackUrl": selected["url"],
        "variants": variants,
    }
    image.close()
    return manifest, report


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    choices = [Path("C:/Windows/Fonts/seguisb.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"), Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")]
    for candidate in choices:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    raise RuntimeError("A local Segoe UI or DejaVu Sans font is required for the social card.")


def brand_artifacts(offline: bool = False) -> dict:
    logo_source = ROOT / "media-sources/brand/na-logo-cutout.png"
    team_source = ROOT / "media-sources/brand/na-team.webp"
    favicon_target = ROOT / "public/favicon.png"
    og_target = ROOT / "public/brand/og-cover.jpg"

    if not (logo_source.is_file() and team_source.is_file()):
        if offline and favicon_target.is_file() and og_target.is_file():
            with Image.open(favicon_target) as fav_image:
                fav_image.load()
                if fav_image.format != "PNG":
                    raise RuntimeError(f"Expected PNG favicon at {favicon_target}, got {fav_image.format}.")
                fav_width, fav_height = fav_image.size
            with Image.open(og_target) as og_image:
                og_image.load()
                if og_image.format != "JPEG":
                    raise RuntimeError(f"Expected JPEG social card at {og_target}, got {og_image.format}.")
                og_width, og_height = og_image.size
            if fav_width <= 0 or fav_height <= 0 or og_width <= 0 or og_height <= 0:
                raise RuntimeError("Existing brand artifacts have invalid dimensions.")
            return {
                "favicon": {"path": "/favicon.png", "bytes": favicon_target.stat().st_size, "width": fav_width, "height": fav_height, "preserved": True},
                "socialImage": {"path": "/brand/og-cover.jpg", "bytes": og_target.stat().st_size, "width": og_width, "height": og_height, "preserved": True},
            }
        raise FileNotFoundError(f"Missing brand source files ({logo_source}, {team_source}) and required existing artifacts.")

    logo = checked_image(logo_source)
    # Only the favicon/social-card packaging trims transparent margins. Logo
    # derivatives above retain the original extent used by the site layout.
    symbol = logo.crop(logo.getchannel("A").getbbox())
    favicon = Image.new("RGBA", (64, 64), "#00749C")
    icon = ImageOps.contain(symbol, (60, 60), Image.Resampling.LANCZOS)
    favicon.alpha_composite(icon, ((64 - icon.width) // 2, (64 - icon.height) // 2))
    favicon.save(favicon_target, "PNG", optimize=True)

    card = Image.new("RGB", (1200, 630), "#062D40")
    team = checked_image(team_source)
    # The full square photograph is preserved: no faces are removed by a crop.
    team = team.resize((630, 630), Image.Resampling.LANCZOS).convert("RGB")
    card.paste(team, (570, 0))
    draw = ImageDraw.Draw(card)
    draw.rectangle((0, 0, 11, 629), fill="#01A6E0")
    card_symbol = ImageOps.contain(symbol, (190, 145), Image.Resampling.LANCZOS)
    card.paste(card_symbol, (48, 52), card_symbol)
    draw.text((48, 231), "NA", font=font(72, True), fill="#FFFFFF")
    draw.text((48, 314), "Barbearia", font=font(64, True), fill="#FFFFFF")
    draw.text((50, 429), "Macuco · Santos/SP", font=font(26), fill="#6ED9FF")
    draw.text((50, 528), "Seu visual. A nossa história.", font=font(23), fill="#D0E9F3")
    card.save(og_target, "JPEG", quality=88, optimize=True, progressive=True, subsampling=0)
    return {
        "favicon": {"path": "/favicon.png", "bytes": favicon_target.stat().st_size, "width": 64, "height": 64},
        "socialImage": {"path": "/brand/og-cover.jpg", "bytes": og_target.stat().st_size, "width": 1200, "height": 630},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="Use local files and cached portraits only.")
    args = parser.parse_args()
    if not features.check("webp"):
        raise RuntimeError("This Pillow installation does not provide the WebP encoder.")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    if not args.offline:
        CACHE.mkdir(parents=True, exist_ok=True)
    existing_manifest = load_existing_manifest()
    manifest = {}
    report = {"quality": QUALITY, "sources": [], "preservedSources": [], "portraitFailures": []}
    originals = [
        ("logo", "/brand/na-logo-cutout.png", ROOT / "media-sources/brand/na-logo-cutout.png", (256, 512, 960), 512),
        ("team", "/brand/na-team.webp", ROOT / "media-sources/brand/na-team.webp", (384, 640, 1024), 640),
        ("carousel-intro", "/brand/na-carousel-intro.jpg", ROOT / "public/brand/na-carousel-intro.jpg", (384, 640, 1024), 640),
        ("gallery-shop", "/brand/na-gallery-shop.jpg", ROOT / "public/brand/na-gallery-shop.jpg", (384, 640, 1024), 640),
    ]
    illustrative_dir = ROOT / "media-sources/brand/illustrative"
    illustrative_sources = sorted(illustrative_dir.glob("*.png")) if illustrative_dir.is_dir() else []
    for source in illustrative_sources:
        originals.append((f"illustrative-{source.stem}", f"/brand/illustrative/{source.name}", source, (384, 640, 1024), 640))

    for name, url, source, widths, fallback in originals:
        if source.is_file():
            manifest[url], entry = derivatives(name, url, source, widths, fallback)
            report["sources"].append(entry)
        elif args.offline and valid_manifest_entry(existing_manifest.get(url)):
            manifest[url] = existing_manifest[url]
            report["preservedSources"].append(url)
        else:
            raise FileNotFoundError(f"Missing media source for {url}: {source}")

    if not illustrative_sources:
        if not args.offline:
            raise FileNotFoundError(f"Missing illustrative media sources under {illustrative_dir}")
        preserved_illustrative = [
            (url, entry)
            for url, entry in existing_manifest.items()
            if url.startswith("/brand/illustrative/")
        ]
        if not preserved_illustrative:
            raise RuntimeError("Offline mode requires existing /brand/illustrative/ entries in publicMedia.generated.json.")
        for url, entry in preserved_illustrative:
            if not valid_manifest_entry(entry):
                raise FileNotFoundError(f"Invalid or missing files for manifest entry {url}")
            manifest[url] = entry
            report["preservedSources"].append(url)

    with ThreadPoolExecutor(max_workers=3) as pool:
        portraits = list(pool.map(lambda item: portrait_source(item, args.offline), portrait_sources()))
    for name, url, source, error in portraits:
        if error:
            if args.offline and valid_manifest_entry(existing_manifest.get(url)):
                manifest[url] = existing_manifest[url]
                report["preservedSources"].append(url)
                continue
            if args.offline:
                raise RuntimeError(f"Offline portrait missing from cache and manifest for {name} ({url}): {error}")
            report["portraitFailures"].append({"name": name, "url": url, "error": error})
            continue
        manifest[url], entry = derivatives(f"portrait-{name}", url, source, (256, 512, 768), 512)
        report["sources"].append(entry)

    report["showreelPoster"] = showreel_poster(args.offline)
    report.update(brand_artifacts(args.offline))
    original_bytes = sum(entry["originalBytes"] for entry in report["sources"])
    fallback_bytes = sum(entry["fallbackBytes"] for entry in report["sources"])
    all_variant_bytes = sum(variant["bytes"] for entry in report["sources"] for variant in entry["variants"])
    report["totals"] = {
        "sourceCount": len(report["sources"]),
        "originalBytes": original_bytes,
        "fallbackBytes": fallback_bytes,
        "allVariantBytes": all_variant_bytes,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "manifest": str(MANIFEST.relative_to(ROOT)),
                "report": str(REPORT.relative_to(ROOT)),
                **report["totals"],
                "preservedSourceCount": len(report["preservedSources"]),
                "portraitFailures": report["portraitFailures"],
                "showreelPoster": report["showreelPoster"],
                "favicon": report["favicon"],
                "socialImage": report["socialImage"],
            },
            ensure_ascii=True,
        )
    )


if __name__ == "__main__":
    main()
