import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[2]
PACKAGE_DIR = ROOT / "gems" / "dusan-edu-webpage"
ARCHIVE_PATH = ROOT / "gems" / "dusan-edu-webpage.zip"


def main():
    app_js = (PACKAGE_DIR / "app.js").read_text(encoding="utf-8")
    app_js_lines = json.loads((PACKAGE_DIR / "app.js.json").read_text(encoding="utf-8"))
    if (
        not isinstance(app_js_lines, list)
        or any(not isinstance(line, str) or "\n" in line or "\r" in line for line in app_js_lines)
        or app_js.splitlines() != app_js_lines
    ):
        raise SystemExit("app.js does not match the line-based source in app.js.json")

    with ZipFile(ARCHIVE_PATH, "w", compression=ZIP_DEFLATED) as archive:
        for file_path in sorted(PACKAGE_DIR.rglob("*")):
            if not file_path.is_file() or file_path.name == "app.js":
                continue

            archive_path = Path(PACKAGE_DIR.name) / file_path.relative_to(PACKAGE_DIR)
            info = ZipInfo(archive_path.as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            archive.writestr(info, file_path.read_bytes())


if __name__ == "__main__":
    main()
