#!/usr/bin/env python3
"""Build a standalone white-label POACustomers deployment from a tenant JSON file."""
from __future__ import annotations
import argparse, json, re, shutil, sys
from pathlib import Path
try:
    from PIL import Image, ImageOps
except ImportError:
    Image = None

KIT = Path(__file__).resolve().parents[1]
PACKAGE_ROOT = KIT.parent
SOURCE_APP = PACKAGE_ROOT / "POACustomers"

def fail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(2)

def clean_slug(v: str) -> bool:
    return bool(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", v or ""))

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("tenant_json", help="Tenant JSON file (relative to the package root or absolute)")
    ap.add_argument("--output", help="Output directory; default: dist/<tenant_id>")
    ap.add_argument("--force", action="store_true", help="Replace an existing output directory after path safety checks")
    args = ap.parse_args()
    cfg_path = Path(args.tenant_json)
    if not cfg_path.is_absolute(): cfg_path = (PACKAGE_ROOT / cfg_path).resolve()
    if not cfg_path.exists(): fail(f"tenant config not found: {cfg_path}")
    try: cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    except Exception as e: fail(f"invalid tenant JSON: {e}")
    required = ["tenant_id","brand_name","app_name","theme_id","currency","supabase_url","supabase_publishable_key","logo_file","icon_file"]
    missing = [k for k in required if not str(cfg.get(k, "")).strip()]
    if missing: fail("missing fields: " + ", ".join(missing))
    if not clean_slug(cfg["tenant_id"]): fail("tenant_id must use lowercase letters, numbers and hyphens only")
    if not re.fullmatch(r"[A-Z]{3}", str(cfg["currency"]).upper()): fail("currency must be a 3-letter code, e.g. EGP or AED")
    if not str(cfg["supabase_url"]).startswith("https://") or ".supabase.co" not in str(cfg["supabase_url"]): fail("supabase_url must be the project's https://...supabase.co URL")
    # A tenant deployment must not accidentally point at another tenant's project.
    for other_cfg_path in (KIT / "tenants").glob("*/tenant.json"):
        if other_cfg_path.resolve() == cfg_path.resolve():
            continue
        try:
            other_cfg = json.loads(other_cfg_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if str(other_cfg.get("supabase_url", "")).rstrip("/").lower() == str(cfg["supabase_url"]).rstrip("/").lower():
            fail(f"Supabase project URL is already assigned to tenant '{other_cfg.get('tenant_id', other_cfg_path.parent.name)}'. Each customer needs its own Supabase project/database.")
    key = str(cfg["supabase_publishable_key"])
    if "service_role" in key.lower() or key.startswith("sb_secret_"):
        fail("service_role/secret keys must never be bundled into a browser app; use the publishable/anon key only")
    if "YOUR-NEW-PROJECT" in str(cfg["supabase_url"]) or "YOUR_NEW_" in key:
        fail("replace the template placeholders before building")
    for field in ("logo_file", "icon_file"):
        asset_path = (cfg_path.parent / str(cfg[field])).resolve()
        if not asset_path.exists(): fail(f"{field} not found: {asset_path}")
    if not SOURCE_APP.exists(): fail(f"POACustomers source folder not found beside the kit: {SOURCE_APP}")

    out = Path(args.output) if args.output else Path("dist") / cfg["tenant_id"]
    if not out.is_absolute(): out = (PACKAGE_ROOT / out).resolve()
    # Never allow a build to erase source folders or arbitrary existing directories by default.
    forbidden = {PACKAGE_ROOT.resolve(), KIT.resolve(), SOURCE_APP.resolve(), (KIT / "tenants").resolve()}
    resolved_out = out.resolve()
    in_source_app = resolved_out.is_relative_to(SOURCE_APP.resolve())
    in_kit = resolved_out.is_relative_to(KIT.resolve())
    would_cover_source = SOURCE_APP.resolve().is_relative_to(resolved_out)
    if resolved_out in forbidden or in_source_app or in_kit or would_cover_source:
        fail(f"unsafe output path; choose a new folder outside the source and kit directories: {out}")
    if out.exists():
        if not args.force:
            fail(f"output directory already exists: {out}; choose another path or pass --force to replace it")
        if not out.is_dir(): fail(f"output path is not a directory: {out}")
        shutil.rmtree(out)
    shutil.copytree(SOURCE_APP, out)
    assets = out / "assets"
    tenant_assets = assets / "tenant-branding"
    tenant_assets.mkdir(parents=True, exist_ok=True)
    logo_src = (cfg_path.parent / str(cfg["logo_file"])).resolve()
    icon_src = (cfg_path.parent / str(cfg["icon_file"])).resolve()
    shutil.copy2(logo_src, tenant_assets / "logo.png")
    shutil.copy2(icon_src, tenant_assets / "icon.png")

    theme_css_name = str(cfg.get("theme_css", "dina-theme.css"))
    if cfg.get("theme_css_file"):
        theme_src = (cfg_path.parent / str(cfg["theme_css_file"])).resolve()
        if not theme_src.exists(): fail(f"theme_css_file not found: {theme_src}")
        shutil.copy2(theme_src, tenant_assets / "theme.css")
        theme_css_name = "tenant-branding/theme.css"
    elif not (assets / theme_css_name).exists():
        fail(f"theme CSS not found in app assets: {theme_css_name}; provide theme_css_file instead")

    js_cfg = {
      "TENANT_ID":cfg["tenant_id"], "BRAND_NAME":cfg["brand_name"],
      "APP_NAME":cfg["app_name"], "TAGLINE":cfg.get("tagline", ""),
      "THEME_ID":cfg.get("theme_id", "custom"), "THEME_CSS":theme_css_name,
      "THEME_COLOR":cfg.get("theme_color", "#071D49"),
      "PAGE_BACKGROUND":cfg.get("page_background", "#F7F8FA"),
      "PRIMARY_COLOR":cfg.get("primary_color", "#071D49"),
      "SECONDARY_COLOR":cfg.get("secondary_color", "#D7A535"),
      "ACCENT_COLOR":cfg.get("accent_color", "#D7A535"),
      "CURRENCY":str(cfg["currency"]).upper(), "CURRENCY_LOCALE":cfg.get("currency_locale", "en"),
      "LOGO_FILE":"tenant-branding/logo.png", "ICON_FILE":"tenant-branding/icon.png",
      "DECORATIVE_FRAME":bool(cfg.get("decorative_frame", False))
    }
    (assets / "tenant-config.js").write_text('// Generated from this customer\'s tenant.json.\nwindow.POA_TENANT_CONFIG = Object.freeze(' + json.dumps(js_cfg, ensure_ascii=False, indent=2) + ');\n', encoding="utf-8")
    db_cfg = {
      "SUPABASE_URL": cfg["supabase_url"],
      "SUPABASE_PUBLISHABLE_KEY": cfg["supabase_publishable_key"]
    }
    formatter = "\n".join([
      "window.POA_GET_CURRENCY_CODE = function () {",
      "  const raw = String(window.POA_TENANT_CONFIG?.CURRENCY || \"EGP\").toUpperCase().trim();",
      "  return /^[A-Z]{3}$/.test(raw) ? raw : \"EGP\";",
      "};",
      "window.POA_FORMAT_CURRENCY = function (value) {",
      "  const amount = Number(value);",
      "  if (!Number.isFinite(amount)) return \"\";",
      "  const currency = window.POA_GET_CURRENCY_CODE();",
      "  const locale = String(window.POA_TENANT_CONFIG?.CURRENCY_LOCALE || (currency === \"EGP\" ? \"en-EG\" : \"en\"));",
      "  return currency + \" \" + new Intl.NumberFormat(locale, {minimumFractionDigits:2, maximumFractionDigits:2}).format(amount);",
      "};"
    ]) + "\n"
    (assets / "config.js").write_text('// Public database connection for this standalone tenant. Do not use secret/service_role keys here.\nwindow.POA_CONFIG = Object.freeze(' + json.dumps(db_cfg, ensure_ascii=False, indent=2) + ');\n' + formatter, encoding="utf-8")

    # Update the PWA name/theme and per-tenant icons.
    manifest_path = out / "manifest.webmanifest"
    try: manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception: manifest = {}
    manifest["name"] = cfg["app_name"]
    manifest["short_name"] = cfg["brand_name"][:24]
    manifest["description"] = cfg.get("tagline", cfg["app_name"])
    manifest["theme_color"] = cfg.get("theme_color", "#071D49")
    manifest["background_color"] = cfg.get("page_background", "#F7F8FA")
    manifest["icons"] = [{"src":"assets/icons/icon-192.png","sizes":"192x192","type":"image/png","purpose":"any maskable"},{"src":"assets/icons/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any maskable"}]
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    if Image:
        im = Image.open(icon_src).convert("RGBA")
        for size in (192,512):
            fitted = ImageOps.fit(im, (size,size), method=Image.Resampling.LANCZOS)
            fitted.save(assets / "icons" / f"icon-{size}.png", optimize=True)

    # Give every deployment a cache namespace of its own and list tenant configuration assets.
    sw_path = out / "sw.js"
    sw = sw_path.read_text(encoding="utf-8")
    source_cache_match = re.search(r'const CACHE = [^;]+;', sw)
    source_cache_name = source_cache_match.group(0) if source_cache_match else 'const CACHE = "source-v1";'
    # A new build owns a tenant-specific cache namespace and only cleans that tenant's old versions.
    cache_namespace = f'poac-tenant-{cfg["tenant_id"]}-'
    sw = re.sub(r'const CACHE_NAMESPACE = [^;]+;', f'const CACHE_NAMESPACE = "{cache_namespace}";', sw, count=1)
    sw = re.sub(r'const CACHE = [^;]+;', f'const CACHE = CACHE_NAMESPACE + "v35";', sw, count=1)
    sw = re.sub(r'keys\.filter\(key => .*?\)\.map\(key => caches\.delete\(key\)\)',
                'keys.filter(key => key.startsWith(CACHE_NAMESPACE) && key !== CACHE).map(key => caches.delete(key))', sw, count=1)
    if '"./assets/tenant-config.js"' not in sw:
        sw = sw.replace('"./assets/config.js",', '"./assets/config.js",\n  "./assets/tenant-config.js",\n  "./assets/tenant-branding.js",\n  "./assets/tenant-branding/logo.png",\n  "./assets/tenant-branding/icon.png",')
    theme_cache_entry = f'"./assets/{theme_css_name}"'
    if theme_cache_entry not in sw:
        sw = sw.replace('"./assets/tenant-branding.js",', '"./assets/tenant-branding.js",\n  ' + theme_cache_entry + ',')
    sw_path.write_text(sw, encoding="utf-8")
    print(f"Built tenant '{cfg['tenant_id']}' at: {out}")
    print(f"Brand: {cfg['brand_name']} | Currency: {str(cfg['currency']).upper()} | Theme: {cfg.get('theme_id','custom')}")
    print("Database URL/key are configured for this tenant only. Verify RLS/policies before production use.")

if __name__ == '__main__': main()
