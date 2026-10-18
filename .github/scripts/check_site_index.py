from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


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


def main():
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

    required_files = {
        path.relative_to(SITE)
        for path in SITE.rglob("*")
        if path.is_file() and path != INDEX
    }
    missing = sorted(required_files - linked_files)
    if missing:
        files = ", ".join(path.as_posix() for path in missing)
        print(
            "::warning title=Site index is out of date::"
            f"Missing links for {files}. Re-run this task to update site/i/index.html."
        )


if __name__ == "__main__":
    main()
