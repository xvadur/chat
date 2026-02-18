#!/usr/bin/env python3
import argparse
import csv
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

EMAIL_RE = re.compile(r"^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$", re.I)
BAD_EMAIL_PATTERNS = [
    re.compile(r"example\.com$", re.I),
    re.compile(r"@\d+(\.\d+)+$", re.I),
    re.compile(r"phone", re.I),
    re.compile(r"typed\\.js", re.I),
    re.compile(r"cookie@", re.I),
]
GENERIC_PREFIXES = {"info", "kontakt", "contact", "office", "admin", "sales", "support", "hello", "booking", "rezervacie", "recepcia", "reception"}

KEYWORDS = {
    "online_booking": ["book now", "rezerv", "booking", "book", "availability", "dostupnost"],
    "after_hours": ["24/7", "24h", "24 h", "nonstop", "anytime", "late check-in", "self check-in", "self checkin"],
    "faq": ["faq", "check-in", "check in", "check-out", "check out", "parking", "pet", "payment", "cancel"],
    "multilang": ["english", "slovak", "deutsch", "german", "hungarian", "cesky", "language"],
    "messaging": ["whatsapp", "viber", "messenger", "telegram", "chat"],
    "handoff": ["contact us", "call us", "write us", "reception", "front desk", "team"],
}


def bool_to_int(v: bool) -> int:
    return 1 if v else 0


def safe_float(value: str) -> float:
    try:
        return float(value)
    except Exception:
        return 0.0


def normalize_text(value: str) -> str:
    return (value or "").strip().lower()


def detect_keywords(text: str, tokens):
    t = normalize_text(text)
    return any(token in t for token in tokens)


def is_valid_email(email: str) -> bool:
    if not email:
        return False
    if not EMAIL_RE.match(email):
        return False
    for p in BAD_EMAIL_PATTERNS:
        if p.search(email):
            return False
    return True


def is_generic_email(email: str) -> bool:
    local = email.split("@", 1)[0].lower() if "@" in email else ""
    return local in GENERIC_PREFIXES


def classify_property_type(name: str) -> str:
    n = normalize_text(name)
    if "hostel" in n:
        return "hostel"
    if "apart" in n or "apartment" in n:
        return "apartment"
    if "penz" in n or "pension" in n:
        return "pension"
    if "hotel" in n:
        return "hotel"
    return "other"


def brave_search(api_key: str, query: str, timeout: int = 12):
    params = urlencode({"q": query, "count": 5, "safesearch": "off", "text_decorations": "false", "search_lang": "en"})
    url = f"https://api.search.brave.com/res/v1/web/search?{params}"
    req = Request(url)
    req.add_header("Accept", "application/json")
    req.add_header("X-Subscription-Token", api_key)
    with urlopen(req, timeout=timeout) as resp:
        payload = json.loads(resp.read().decode("utf-8", errors="replace"))
    results = []
    for item in payload.get("web", {}).get("results", [])[:5]:
        results.append({
            "title": item.get("title", ""),
            "description": item.get("description", ""),
            "url": item.get("url", ""),
        })
    return results


def load_cache(path: Path):
    if path.exists():
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(path: Path, data):
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def build_query(row):
    company = row.get("company") or row.get("title") or "hotel"
    city = row.get("city") or ""
    website = row.get("website") or ""
    q = f"{company} {city} hotel booking check-in phone"
    if website:
        q = f"{q} site:{website.replace('https://', '').replace('http://', '').split('/')[0]}"
    return q


def extract_features(row, web_text):
    email = (row.get("email") or "").strip().lower()
    website = (row.get("website") or "").strip()
    phone = (row.get("phoneNumber") or "").strip()
    rating = safe_float((row.get("rating") or "0").replace(",", "."))

    local_text = " ".join(
        [
            row.get("personal_opener", ""),
            row.get("subject_1", ""),
            row.get("subject_2", ""),
            row.get("subject_3", ""),
            row.get("email_1", ""),
            row.get("followup_1", ""),
            row.get("followup_2", ""),
        ]
    )
    combined_text = f"{web_text} {local_text} {website}"

    feature = {}
    feature["email_valid"] = is_valid_email(email)
    feature["generic_email"] = is_generic_email(email)
    feature["phone_present"] = bool(phone)
    feature["website_present"] = bool(website)
    feature["online_booking_present"] = detect_keywords(combined_text, KEYWORDS["online_booking"]) or ("booking" in normalize_text(website))
    feature["after_hours_claim"] = detect_keywords(combined_text, KEYWORDS["after_hours"])
    feature["faq_coverage"] = detect_keywords(combined_text, KEYWORDS["faq"])
    feature["multilingual_support"] = detect_keywords(combined_text, KEYWORDS["multilang"])
    feature["messaging_channel"] = detect_keywords(combined_text, KEYWORDS["messaging"])
    feature["handoff_signal"] = detect_keywords(combined_text, KEYWORDS["handoff"]) or bool(phone)
    feature["rating_signal"] = rating >= 4.3
    feature["property_type"] = classify_property_type(row.get("company") or row.get("title") or "")
    return feature


def compute_score(feature):
    score = 0
    if not feature["email_valid"]:
        # Keep invalid contacts visible in reports, but deprioritized for outbound.
        score += 5
        score += 5 if feature["website_present"] else 0
        score += 5 if feature["phone_present"] else 0
        return max(0, min(100, score))

    score += 22 if feature["email_valid"] else 0
    score += 8 if not feature["generic_email"] else 2
    score += 8 if feature["phone_present"] else 0
    score += 6 if feature["website_present"] else 0
    score += 14 if feature["online_booking_present"] else 0
    score += 8 if feature["after_hours_claim"] else 0
    score += 8 if feature["faq_coverage"] else 0
    score += 7 if feature["multilingual_support"] else 0
    score += 5 if feature["messaging_channel"] else 0
    score += 6 if feature["handoff_signal"] else 0
    score += 6 if feature["rating_signal"] else 0

    # Penalize if little operational signal despite valid contact.
    if feature["email_valid"] and not (feature["online_booking_present"] or feature["after_hours_claim"] or feature["faq_coverage"]):
        score -= 8

    return max(0, min(100, score))


def compute_confidence(feature):
    signal_count = sum(bool_to_int(feature[k]) for k in [
        "online_booking_present",
        "after_hours_claim",
        "faq_coverage",
        "multilingual_support",
        "messaging_channel",
        "handoff_signal",
        "website_present",
        "phone_present",
    ])
    return min(100, 35 + signal_count * 8)


def assign_segment(feature, score):
    if not feature["email_valid"]:
        return "invalid_contact"
    if feature["website_present"] and not feature["online_booking_present"]:
        return "booking_gap"
    if feature["phone_present"] and not feature["after_hours_claim"] and feature["faq_coverage"]:
        return "after_hours_gap"
    if feature["online_booking_present"] and feature["faq_coverage"] and score >= 75:
        return "automation_candidate"
    return "frontdesk_overload"


def offer_angle(segment):
    mapping = {
        "after_hours_gap": "Menej zmeskanych hovorov mimo sluzby",
        "booking_gap": "Viac potvrdenych rezervacii z webu a telefonu",
        "automation_candidate": "AI recepcia pre 24/7 odpovede a handoff",
        "frontdesk_overload": "Odlahcenie recepcie od opakovanych otazok",
        "invalid_contact": "Manualny kontakt",
    }
    return mapping.get(segment, "AI recepcia pre vyssiu dostupnost")


def build_subject(company, segment):
    if segment == "after_hours_gap":
        return f"{company}: menej zmeskanych dopytov mimo sluzby"
    if segment == "booking_gap":
        return f"{company}: viac rezervacii bez navysej prace"
    if segment == "automation_candidate":
        return f"{company}: AI recepcia pre 24/7 hosti"
    return f"{company}: odlahcenie recepcie cez AI"


def build_email(row, segment, angle):
    company = row.get("company") or row.get("title") or "Vas hotel"
    city = row.get("city") or "vasom meste"
    opener = row.get("personal_opener") or f"Pozeral som {company} v {city} a vidim priestor na rychle zlepsenie host communication."

    pain_line = {
        "after_hours_gap": "Mimo sluzby zvyknu utekat hovory a cast otazok zostane bez odpovede.",
        "booking_gap": "Hostia casto riesia dostupnost a check-in pred prichodom, no booking flow nie je vzdy okamzity.",
        "automation_candidate": "Mate dobru online pritomnost, takze AI recepcia vie rychlo pridat dalsiu vrstvu dostupnosti.",
        "frontdesk_overload": "Recepcia je casto zatazena opakovanimi otazkami a to berie cas timu.",
        "invalid_contact": "Nemam overeny kontakt, preto posielam len navrh textu.",
    }[segment]

    return (
        f"Ahoj,\n\n"
        f"{opener}\n\n"
        f"{pain_line}\n"
        f"Pomahame ubytovaniam nasadit AI recepciu, ktora:\n"
        f"- odpovie hostom 24/7 (SK/EN),\n"
        f"- vybavi check-in/check-out, parkovanie, dostupnost a bezne otazky,\n"
        f"- pri specialnom pripade prepoji hosta na cloveka.\n\n"
        f"{angle}.\n\n"
        f"Ak chces, ukazem ti 15-min demo na realnych scenaroch pre {company}.\n"
        f"Vyhovuje skor utorok 10:00 alebo streda 14:30?\n\n"
        f"- Adam"
    )


def main():
    parser = argparse.ArgumentParser(description="Hotel readiness and outbound personalization pipeline")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--brave-key-file", default="")
    parser.add_argument("--min-score", type=int, default=55)
    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cache_path = out_dir / "brave_cache.json"
    cache = load_cache(cache_path)

    brave_key = ""
    if args.brave_key_file and Path(args.brave_key_file).exists():
        brave_key = Path(args.brave_key_file).read_text(encoding="utf-8").strip()

    with open(args.input, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        source_rows = [r for r in reader]

    # Keep deterministic order and choose only leads with non-empty company/title.
    filtered = [r for r in source_rows if (r.get("company") or r.get("title"))]
    selected = filtered[: args.limit]

    jobs = []
    for idx, row in enumerate(selected):
        query = build_query(row)
        jobs.append((idx, row, query))

    def fetch(job):
        idx, row, query = job
        key = query
        if key in cache:
            return idx, row, query, cache[key], True
        if not brave_key:
            return idx, row, query, [], False
        try:
            results = brave_search(brave_key, query)
            cache[key] = results
            return idx, row, query, results, False
        except Exception:
            return idx, row, query, [], False

    enriched = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
        futures = [ex.submit(fetch, job) for job in jobs]
        for fut in as_completed(futures):
            enriched.append(fut.result())

    save_cache(cache_path, cache)

    enriched.sort(key=lambda x: x[0])
    report_rows = []
    outbound_rows = []
    outbound_seen_emails = set()

    for idx, row, query, results, from_cache in enriched:
        web_text = " ".join((r.get("title", "") + " " + r.get("description", "") + " " + r.get("url", "")) for r in results)
        feature = extract_features(row, web_text)
        score = compute_score(feature)
        confidence = compute_confidence(feature)
        segment = assign_segment(feature, score)
        angle = offer_angle(segment)

        company = row.get("company") or row.get("title") or ""
        city = row.get("city") or ""
        email = (row.get("email") or "").strip().lower()
        subject_v2 = build_subject(company, segment)
        email_v2 = build_email(row, segment, angle)

        report = {
            "idx": idx + 1,
            "company": company,
            "city": city,
            "email": email,
            "segment": segment,
            "readiness_score": score,
            "confidence_score": confidence,
            "offer_angle": angle,
            "query": query,
            "brave_hits": len(results),
            "from_cache": bool_to_int(from_cache),
            "email_valid": bool_to_int(feature["email_valid"]),
            "generic_email": bool_to_int(feature["generic_email"]),
            "phone_present": bool_to_int(feature["phone_present"]),
            "website_present": bool_to_int(feature["website_present"]),
            "online_booking_present": bool_to_int(feature["online_booking_present"]),
            "after_hours_claim": bool_to_int(feature["after_hours_claim"]),
            "faq_coverage": bool_to_int(feature["faq_coverage"]),
            "multilingual_support": bool_to_int(feature["multilingual_support"]),
            "messaging_channel": bool_to_int(feature["messaging_channel"]),
            "handoff_signal": bool_to_int(feature["handoff_signal"]),
            "subject_v2": subject_v2,
            "email_v2": email_v2,
        }
        report_rows.append(report)

        if feature["email_valid"] and score >= args.min_score and email not in outbound_seen_emails:
            outbound_rows.append(report)
            outbound_seen_emails.add(email)

    readiness_csv = out_dir / "hotel_readiness_report.csv"
    segments_csv = out_dir / "hotel_segments.csv"
    outbound_csv = out_dir / "outbound_v2.csv"
    send_script = out_dir / "send_batch_v2.sh"

    if report_rows:
        headers = list(report_rows[0].keys())
        with readiness_csv.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=headers)
            writer.writeheader()
            writer.writerows(report_rows)

        with segments_csv.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["company", "city", "email", "segment", "readiness_score", "confidence_score", "offer_angle"])
            writer.writeheader()
            for r in report_rows:
                writer.writerow({k: r[k] for k in ["company", "city", "email", "segment", "readiness_score", "confidence_score", "offer_angle"]})

    if outbound_rows:
        with outbound_csv.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["company", "city", "email", "segment", "readiness_score", "confidence_score", "subject_v2", "email_v2"])
            writer.writeheader()
            for r in outbound_rows:
                writer.writerow({k: r[k] for k in ["company", "city", "email", "segment", "readiness_score", "confidence_score", "subject_v2", "email_v2"]})

        with send_script.open("w", encoding="utf-8") as f:
            f.write("#!/usr/bin/env bash\n")
            f.write("set -euo pipefail\n")
            for i, r in enumerate(outbound_rows, start=1):
                body_file = out_dir / f"mail_v2_{i:03d}.txt"
                body_file.write_text(r["email_v2"], encoding="utf-8")
                subject = r["subject_v2"].replace('"', '\\"')
                to = r["email"].replace('"', '\\"')
                f.write(f"echo \"Sending {i}/{len(outbound_rows)} to {to}\"\n")
                f.write(f"gog send --to \"{to}\" --subject \"{subject}\" --body-file \"{body_file}\" --no-input\n")
        os.chmod(send_script, 0o755)

    summary = {
        "input_rows": len(source_rows),
        "processed_rows": len(selected),
        "report_rows": len(report_rows),
        "outbound_rows": len(outbound_rows),
        "readiness_csv": str(readiness_csv),
        "segments_csv": str(segments_csv),
        "outbound_csv": str(outbound_csv),
        "send_script": str(send_script),
        "cache_path": str(cache_path),
        "generated_at": int(time.time()),
    }
    (out_dir / "pipeline_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
