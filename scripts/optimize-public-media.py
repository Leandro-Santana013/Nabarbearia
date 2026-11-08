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


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "public/brand/optimized"
CACHE = ROOT / "artifacts/stage4-portrait-originals"
MANIFEST = ROOT / "src/config/publicMedia.generated.json"
REPORT = ROOT / "artifacts/stage4-media-report.json"
QUALITY = 84


def portrait_sources() -> list[tuple[str, str]]:
    config = (ROOT / "src/config/siteConfig.ts").read_text(encoding="utf-8")
    block = re.search(r"const photoById:.*?=\s*\{(.*?)\n\}", config, re.S)
    if not block:
        raise RuntimeError("The existing portrait-source map was not found.")
    return re.findall(r"^\s*([a-z0-9_]+):\s*'([^']+)'", block.group(1), re.M)


def checked_image(path: Path) -> Image.Image:
    with Image.open(path) as source:
        source.load()
        return ImageOps.exif_transpose(source).convert("RGBA" if "A" in source.getbands() else "RGB")


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


def brand_artifacts() -> dict:
    logo = checked_image(ROOT / "media-sources/brand/na-logo-cutout.png")
    # Only the favicon/social-card packaging trims transparent margins. Logo
    # derivatives above retain the original extent used by the site layout.
    symbol = logo.crop(logo.getchannel("A").getbbox())
    favicon = Image.new("RGBA", (64, 64), "#00749C")
    icon = ImageOps.contain(symbol, (60, 60), Image.Resampling.LANCZOS)
    favicon.alpha_composite(icon, ((64 - icon.width) // 2, (64 - icon.height) // 2))
    favicon.save(ROOT / "public/favicon.png", "PNG", optimize=True)

    card = Image.new("RGB", (1200, 630), "#062D40")
    team = checked_image(ROOT / "media-sources/brand/na-team.webp")
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
    target = ROOT / "public/brand/og-cover.jpg"
    card.save(target, "JPEG", quality=88, optimize=True, progressive=True, subsampling=0)
    return {"favicon": {"path": "/favicon.png", "bytes": (ROOT / "public/favicon.png").stat().st_size, "width": 64, "height": 64}, "socialImage": {"path": "/brand/og-cover.jpg", "bytes": target.stat().st_size, "width": 1200, "height": 630}}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="Use local files and cached portraits only.")
    args = parser.parse_args()
    if not features.check("webp"):
        raise RuntimeError("This Pillow installation does not provide the WebP encoder.")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    manifest = {}
    report = {"quality": QUALITY, "sources": [], "portraitFailures": []}
    originals = [
        ("logo", "/brand/na-logo-cutout.png", ROOT / "media-sources/brand/na-logo-cutout.png", (256, 512, 960), 512),
        ("team", "/brand/na-team.webp", ROOT / "media-sources/brand/na-team.webp", (384, 640, 1024), 640),
    ]
    for source in sorted((ROOT / "media-sources/brand/illustrative").glob("*.png")):
        originals.append((f"illustrative-{source.stem}", f"/brand/illustrative/{source.name}", source, (384, 640, 1024), 640))
    for name, url, source, widths, fallback in originals:
        manifest[url], entry = derivatives(name, url, source, widths, fallback)
        report["sources"].append(entry)
    with ThreadPoolExecutor(max_workers=3) as pool:
        portraits = list(pool.map(lambda item: portrait_source(item, args.offline), portrait_sources()))
    for name, url, source, error in portraits:
        if error:
            report["portraitFailures"].append({"name": name, "url": url, "error": error})
            continue
        manifest[url], entry = derivatives(f"portrait-{name}", url, source, (256, 512, 768), 512)
        report["sources"].append(entry)
    report.update(brand_artifacts())
    report["totals"] = {
        "sourceCount": len(report["sources"]),
        "originalBytes": sum(entry["originalBytes"] for entry in report["sources"]),
        "fallbackBytes": sum(entry["fallbackBytes"] for entry in report["sources"]),
        "allVariantBytes": sum(variant["bytes"] for entry in report["sources"] for variant in entry["variants"]),
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(MANIFEST.relative_to(ROOT)), "report": str(REPORT.relative_to(ROOT)), **report["totals"], "portraitFailures": report["portraitFailures"], "favicon": report["favicon"], "socialImage": report["socialImage"]}, ensure_ascii=True))


if __name__ == "__main__":
    main()
