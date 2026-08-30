#!/usr/bin/env python3
"""
Add files or images to the board.

Three steps, all of them here: stage with clean names, make thumbnails, upload
to Azure. It then prints the one SQL statement that indexes the container into
pm_files, which is what the Files view reads.

    ./tools/add-files.py ~/Desktop/new-logos --folder logos/rgb
    ./tools/add-files.py ~/Desktop/deck.pdf  --folder decks
    ./tools/add-files.py --reindex-only

Requires the Azure CLI, logged in, with the Storage Blob Data Contributor role
on the goprepassets account. Control-plane Contributor is not enough, which is a
distinction Azure does not make obvious.

Nothing here writes to the database. It prints SQL for you to run, so an upload
can never half-apply.
"""

import argparse, json, os, re, shutil, subprocess, sys, tempfile, unicodedata

ACCOUNT   = "goprepassets"
CONTAINER = "brand"
BASE      = f"https://{ACCOUNT}.blob.core.windows.net/{CONTAINER}/"
THUMB_PX  = 420
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".gif", ".webp")


def slug(name: str) -> str:
    """A filename anyone can paste into a URL without thinking about it."""
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    base, ext = os.path.splitext(name)
    base = re.sub(r"[^a-zA-Z0-9]+", "-", base).strip("-").lower()
    return (base or "file") + ext.lower()


def az(args, **kw):
    return subprocess.run(["az"] + args, check=True, capture_output=True, text=True, **kw)


def stage(src: str, folder: str, workdir: str):
    """Copy the input into workdir/<folder>/… with web-safe names."""
    out_root = os.path.join(workdir, "upload")
    staged = []

    def take(path, rel):
        target = os.path.join(out_root, folder, *[slug(p) for p in rel.split(os.sep)])
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.copy2(path, target)
        staged.append(os.path.relpath(target, out_root))

    if os.path.isfile(src):
        take(src, os.path.basename(src))
    else:
        for dp, _dn, fn in os.walk(src):
            for f in sorted(fn):
                if f.startswith(".") or f == "desktop.ini":
                    continue
                take(os.path.join(dp, f), os.path.relpath(os.path.join(dp, f), src))
    return out_root, staged


def thumbnails(out_root: str, workdir: str):
    """A 19 MB PNG makes a terrible thumbnail. Every image gets a small one."""
    try:
        from PIL import Image
    except ImportError:
        print("  ! Pillow not installed, skipping thumbnails (pip3 install Pillow)")
        return None, 0
    Image.MAX_IMAGE_PIXELS = None
    thumb_root = os.path.join(workdir, "tw", "thumbs")
    made = 0
    for dp, _dn, fn in os.walk(out_root):
        for f in fn:
            if not f.lower().endswith(IMAGE_EXT):
                continue
            src = os.path.join(dp, f)
            rel = os.path.relpath(src, out_root)
            dst = os.path.join(thumb_root, os.path.splitext(rel)[0] + ".jpg")
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            try:
                im = Image.open(src)
                im.thumbnail((THUMB_PX, THUMB_PX), Image.LANCZOS)
                if im.mode in ("RGBA", "LA", "P"):
                    bg = Image.new("RGB", im.size, (247, 245, 241))
                    im = im.convert("RGBA")
                    bg.paste(im, mask=im.split()[-1])
                    im = bg
                im.convert("RGB").save(dst, "JPEG", quality=82, optimize=True)
                made += 1
            except Exception as e:
                print(f"  ! thumbnail failed for {rel}: {type(e).__name__}")
    return os.path.join(workdir, "tw"), made


def upload(source_dir: str, label: str):
    print(f"  uploading {label} …")
    az(["storage", "blob", "upload-batch", "--account-name", ACCOUNT,
        "--auth-mode", "login", "--destination", CONTAINER,
        "--source", source_dir, "--overwrite", "--output", "none"])


def build_index_sql() -> str:
    """List the container and emit the call that refreshes pm_files."""
    out = az(["storage", "blob", "list", "--account-name", ACCOUNT,
              "--container-name", CONTAINER, "--auth-mode", "login",
              "--query", "[].{n:name,s:properties.contentLength}", "-o", "json"]).stdout
    rows = json.loads(out)
    originals = sorted((r for r in rows if not r["n"].startswith("thumbs/")),
                       key=lambda r: r["n"])
    thumbs = {r["n"][len("thumbs/"):] for r in rows if r["n"].startswith("thumbs/")}
    items = []
    for r in originals:
        has_thumb = 1 if (os.path.splitext(r["n"])[0] + ".jpg") in thumbs else 0
        items.append(f'{r["n"]}|{r["s"] or 0}|{has_thumb}')
    return ("select public.pm_reindex_files('" + ",".join(items) + "') as indexed;",
            len(originals), len(thumbs))


def main():
    ap = argparse.ArgumentParser(description="Add files to the GoPrep board.")
    ap.add_argument("source", nargs="?", help="file or folder to add")
    ap.add_argument("--folder", default="", help="target folder inside the container, e.g. logos/rgb")
    ap.add_argument("--reindex-only", action="store_true",
                    help="skip uploading, just rebuild the index SQL from what is already there")
    ap.add_argument("--out", default="reindex.sql", help="where to write the SQL")
    args = ap.parse_args()

    if not args.reindex_only:
        if not args.source or not os.path.exists(args.source):
            ap.error("source is required unless --reindex-only")
        with tempfile.TemporaryDirectory() as wd:
            out_root, staged = stage(args.source, args.folder.strip("/"), wd)
            print(f"  staged {len(staged)} file(s)")
            for s in staged[:8]:
                print(f"    {s}")
            if len(staged) > 8:
                print(f"    … and {len(staged) - 8} more")
            upload(out_root, "originals")
            tw, made = thumbnails(out_root, wd)
            if tw and made:
                upload(tw, f"{made} thumbnail(s)")

    sql, n_orig, n_thumb = build_index_sql()
    with open(args.out, "w") as fh:
        fh.write(sql + "\n")

    print(f"\n  container now holds {n_orig} file(s) and {n_thumb} thumbnail(s)")
    print(f"  index SQL written to {args.out}\n")
    print("  Last step, run that statement against Supabase. It is idempotent:")
    print("  it upserts every row, derives English names from the paths, and sets")
    print("  the language flag for anything under an /espanol/ or /ingles/ folder.\n")
    print("  Then hard-refresh the board. Nothing needs deploying: the page reads")
    print("  the database at runtime.")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as e:
        sys.stderr.write((e.stderr or "").strip() + "\n")
        sys.stderr.write("\nIf that mentions permissions, you need the data-plane role:\n"
                         "  az role assignment create --role 'Storage Blob Data Contributor' \\\n"
                         "    --assignee-object-id $(az ad signed-in-user show --query id -o tsv) \\\n"
                         "    --assignee-principal-type User \\\n"
                         "    --scope $(az storage account show -n goprepassets -g gp_mvp --query id -o tsv)\n"
                         "RBAC takes about a minute to propagate.\n")
        sys.exit(1)
