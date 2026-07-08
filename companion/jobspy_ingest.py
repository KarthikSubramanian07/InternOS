#!/usr/bin/env python3
"""
JobSpy companion for InternOS.

A Cloudflare Worker is browserless and can't scrape Indeed / Glassdoor /
ZipRecruiter / LinkedIn (those need proxies + TLS fingerprinting + HTML/internal
APIs). So we run JobSpy (https://github.com/speedyapply/JobSpy) here — on a real
runner (GitHub Actions or your laptop) — and POST the normalized internships to
the Worker's authenticated /ingest endpoint, where they flow through the exact
same categorize -> score -> flag -> dedupe -> Notion pipeline as every other source.

We ADAPT JobSpy, we do not reimplement it: `pip install python-jobspy`.

Env:
  WORKER_URL       e.g. https://internos.you.workers.dev   (required)
  WEBHOOK_SECRET   the same secret set on the Worker         (required)
  JOBSPY_SITES     comma list; default "indeed,linkedin,zip_recruiter,glassdoor,google"
  JOBSPY_TERMS     comma list of searches; default "software engineer intern,..."
  JOBSPY_LOCATION  default "United States"
  JOBSPY_RESULTS   per site per term; default "40"
  JOBSPY_HOURS_OLD default "720" (30 days)
  JOBSPY_PROXIES   optional comma list of proxies (many sites need these)
  COUNTRY_INDEED   default "USA"
"""
import os
import sys
import math
import datetime as dt

import requests

try:
    from jobspy import scrape_jobs
except ImportError:
    sys.exit("Missing dependency. Run: pip install python-jobspy requests")

WORKER_URL = os.environ.get("WORKER_URL", "").rstrip("/")
SECRET = os.environ.get("WEBHOOK_SECRET", "")
if not WORKER_URL or not SECRET:
    sys.exit("Set WORKER_URL and WEBHOOK_SECRET.")

SITES = [s.strip() for s in os.environ.get(
    "JOBSPY_SITES", "indeed,linkedin,zip_recruiter,glassdoor,google").split(",") if s.strip()]
TERMS = [t.strip() for t in os.environ.get(
    "JOBSPY_TERMS",
    "software engineer intern,machine learning intern,data science intern,quant intern,embedded systems intern",
).split(",") if t.strip()]
LOCATION = os.environ.get("JOBSPY_LOCATION", "United States")
RESULTS = int(os.environ.get("JOBSPY_RESULTS", "40"))
HOURS_OLD = int(os.environ.get("JOBSPY_HOURS_OLD", "720"))
COUNTRY_INDEED = os.environ.get("COUNTRY_INDEED", "USA")
PROXIES = [p.strip() for p in os.environ.get("JOBSPY_PROXIES", "").split(",") if p.strip()] or None

INTERN_RE = ("intern", "internship", "co-op", "coop", "new grad", "new-grad")


def salary_str(row) -> str:
    lo, hi, interval, cur = row.get("min_amount"), row.get("max_amount"), row.get("interval"), row.get("currency")
    if lo is None or (isinstance(lo, float) and math.isnan(lo)):
        lo = None
    if hi is None or (isinstance(hi, float) and math.isnan(hi)):
        hi = None
    if lo is None and hi is None:
        return ""
    sym = "$" if (cur in (None, "", "USD") or (isinstance(cur, float) and math.isnan(cur))) else f"{cur} "
    per = ""
    if isinstance(interval, str):
        per = {"yearly": "/yr", "hourly": "/hr", "monthly": "/mo", "weekly": "/wk"}.get(interval, "")
    def fmt(v):
        return f"{sym}{int(v):,}"
    if lo is not None and hi is not None:
        return f"{fmt(lo)} - {fmt(hi)}{per}"
    return f"{fmt(lo if lo is not None else hi)}{per}"


def iso_date(v) -> str:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return ""
    if isinstance(v, (dt.date, dt.datetime)):
        return v.strftime("%Y-%m-%d")
    return str(v)[:10]


def normalize(row) -> dict | None:
    title = str(row.get("title") or "").strip()
    company = str(row.get("company") or "").strip()
    url = str(row.get("job_url") or "").strip()
    if not title or not company or not url:
        return None
    # Keep it internship-focused; the Worker filters again, this just trims payload.
    if not any(k in title.lower() for k in INTERN_RE):
        return None
    desc = row.get("description")
    return {
        "company": company,
        "role": title,
        "location": str(row.get("location") or "").strip(),
        "url": url,
        "datePosted": iso_date(row.get("date_posted")),
        "description": (str(desc)[:3000] if isinstance(desc, str) else ""),
        "salary": salary_str(row),
        "source": str(row.get("site") or "jobspy"),
    }


def post_batch(jobs):
    r = requests.post(
        f"{WORKER_URL}/ingest",
        headers={"X-InternOS-Token": SECRET, "Content-Type": "application/json"},
        json={"jobs": jobs},
        timeout=45,
    )
    r.raise_for_status()
    return r.json()


def main():
    collected = []
    for term in TERMS:
        try:
            df = scrape_jobs(
                site_name=SITES,
                search_term=term,
                location=LOCATION,
                results_wanted=RESULTS,
                hours_old=HOURS_OLD,
                country_indeed=COUNTRY_INDEED,
                linkedin_fetch_description=False,
                proxies=PROXIES,
            )
        except Exception as e:  # one term/site failing shouldn't kill the run
            print(f"scrape failed for '{term}': {e}", file=sys.stderr)
            continue
        for _, row in df.iterrows():
            job = normalize(row.to_dict())
            if job:
                collected.append(job)

    # Dedupe by url before sending.
    seen, unique = set(), []
    for j in collected:
        if j["url"] not in seen:
            seen.add(j["url"])
            unique.append(j)

    print(f"collected {len(unique)} internship listings; posting in batches of 40")
    total = {"created": 0, "matched": 0, "skipped": 0, "failed": 0}
    for i in range(0, len(unique), 40):
        batch = unique[i : i + 40]
        try:
            res = post_batch(batch)
            for k in total:
                total[k] += res.get(k, 0)
            print(f"  batch {i // 40 + 1}: {res}")
        except Exception as e:
            print(f"  batch {i // 40 + 1} POST failed: {e}", file=sys.stderr)
    print(f"done: {total}")


if __name__ == "__main__":
    main()
