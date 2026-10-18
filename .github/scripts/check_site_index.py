import argparse
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit


ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "site"
INDEX = SITE / "i" / "index.html"


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.hrefs.extend(value for name, value in attrs if name == "href" and value)


def index_html(required_files):
    links = "\n".join(
        f'      <li><a href="../{escape(quote(path.as_posix(), safe="/"), quote=True)}">'
        f"{escape(path.as_posix())}</a></li>"
        for path in sorted(required_files)
    )
    return (
        '<!doctype html>\n<html lang="en">\n  <head>\n'
        '    <meta charset="utf-8">\n'
        '    <meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '    <title>Site index</title>\n'
        '  </head>\n  <body>\n    <h1>Site index</h1>\n'
        f"    <ul>\n{links}\n    </ul>\n  </body>\n</html>\n"
    )


def main():
    argument_parser = argparse.ArgumentParser()
    argument_parser.add_argument("--fix", action="store_true")
    args = argument_parser.parse_args()

    required_files = {
        path.relative_to(SITE)
        for path in SITE.rglob("*")
        if path.is_file() and path != INDEX
    }
    if args.fix:
        INDEX.write_text(index_html(required_files), encoding="utf-8")

    parser = LinkParser()
    parser.feed(INDEX.read_text(encoding="utf-8"))

    linked_files = set()
    for href in parser.hrefs:
        url = urlsplit(href)
        if url.scheme or url.netloc or not url.path:
            continue
        if url.path.startswith("/"):
            target = SITE / unquote(url.path.lstrip("/"))
        else:
            target = INDEX.parent / unquote(url.path)
        target = target.resolve()
        try:
            linked_files.add(target.relative_to(SITE.resolve()))
        except ValueError:
            continue

    missing = sorted(required_files - linked_files)
    if missing:
        files = ", ".join(path.as_posix() for path in missing)
        print(
            "::warning title=Site index is out of date::"
            f"Missing links for {files}. Re-run this task to update site/i/index.html."
        )


if __name__ == "__main__":
    main()
