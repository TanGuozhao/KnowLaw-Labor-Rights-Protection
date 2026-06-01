import json
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

INDEX_URL = "https://www.mohrss.gov.cn/SYrlzyhshbzb/rdzt/gznmgqxwt/wqqd/index.html"
INDEX_PATTERN_URL = "https://www.mohrss.gov.cn/SYrlzyhshbzb/rdzt/gznmgqxwt/wqqd/index_{}.html"


def build_cookies():
    status = 359815718 + 1214911875 + 477591873
    return {
        "__tst_status": f"{status}#;",
        "EO_Bot_Ssid": str(status + 4022009856),
    }


def normalize_space(value):
    return re.sub(r"\s+", " ", (value or "")).strip()


def fetch_html(session, url):
    response = session.get(url, timeout=30)
    if response.status_code == 404:
        return ""
    response.raise_for_status()
    response.encoding = "utf-8"
    return response.text


def parse_index_links_from_html(html):
    soup = BeautifulSoup(html, "html.parser")
    links = []
    for anchor in soup.select(".rsb_gzqx_mian_list li a[href]"):
        href = normalize_space(anchor.get("href"))
        title = normalize_space(anchor.get_text(" ", strip=True))
        if not href or "t20" not in href:
            continue
        links.append(
            {
                "title": title,
                "url": urljoin(INDEX_URL, href),
            }
        )
    return links


def parse_index_links(session):
    all_links = []
    seen_urls = set()
    page_urls = [INDEX_URL] + [INDEX_PATTERN_URL.format(page_no) for page_no in range(1, 20)]
    for page_url in page_urls:
        html = fetch_html(session, page_url)
        if not html:
            break
        links = parse_index_links_from_html(html)
        if not links:
            break
        new_count = 0
        for item in links:
            if item["url"] in seen_urls:
                continue
            seen_urls.add(item["url"])
            all_links.append(item)
            new_count += 1
        if new_count == 0:
            break
    return all_links


def parse_rows_from_table(table, province):
    rows = []
    for tr in table.select("tr"):
        cells = [normalize_space(td.get_text(" ", strip=True)) for td in tr.select("th,td")]
        cells = [cell for cell in cells if cell]
        if len(cells) < 2:
            continue
        joined = "".join(cells)
        if "举报投诉渠道" in joined and "地区" in joined:
            continue
        if cells[0] in {"序号", "地区"}:
            continue
        if len(cells) >= 3 and re.fullmatch(r"\d+", cells[0]):
            region = cells[1]
            channel = " ".join(cells[2:])
        else:
            region = cells[0]
            channel = " ".join(cells[1:])
        region = region.replace("（", "(").replace("）", ")")
        rows.append(
            {
                "province": province,
                "region": region,
                "channel": normalize_space(channel),
            }
        )
    return rows


def scrape_page(session, url):
    html = fetch_html(session, url)
    soup = BeautifulSoup(html, "html.parser")
    title_node = soup.select_one(".rsb_gzqx_xq_TitleBox h2")
    page_title = normalize_space(title_node.get_text(" ", strip=True)) if title_node else ""
    province_match = re.search(r"([\u4e00-\u9fa5]{2,10}(?:省|市|自治区|特别行政区|生产建设兵团))", page_title)
    province = province_match.group(1) if province_match else page_title
    table = soup.select_one("table")
    rows = parse_rows_from_table(table, province) if table else []
    return {
        "province": province,
        "title": page_title,
        "url": url,
        "rows": rows,
    }


def main():
    session = requests.Session()
    session.cookies.update(build_cookies())
    session.headers.update(
        {
            "User-Agent": "Mozilla/5.0",
            "Referer": INDEX_URL,
        }
    )

    provinces = []
    links = parse_index_links(session)
    print(f"index links: {len(links)}")
    for link in links:
        try:
            item = scrape_page(session, link["url"])
        except Exception:
            continue
        if item["rows"]:
            provinces.append(item)

    output = {
        "source": INDEX_URL,
        "updatedAt": None,
        "provinces": provinces,
    }
    with open("frontend/src/data/laborInspectionChannels.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"saved provinces: {len(provinces)}")


if __name__ == "__main__":
    main()
