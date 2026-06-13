"""Weekly database backup → Cloudflare R2.

Standalone — run via cron / Coolify scheduled task (`0 2 * * 0`). Has no effect on
the running app and is never imported by it. Extra retention beyond managed
Supabase Pro's built-in 7-day backups.

Required env:
  DATABASE_URL        managed Supabase Postgres connection string (direct, port 5432)
  R2_ACCOUNT_ID       Cloudflare R2 account id
  R2_ACCESS_KEY       R2 access key
  R2_SECRET_KEY       R2 secret key
  R2_PRIVATE_BUCKET   target bucket (e.g. udaya-private)

Run:  python scripts/backup_db.py
"""
import os
import sys
import gzip
import datetime
import subprocess


def main():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        sys.exit("[backup] DATABASE_URL not set")

    ts = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M")
    fname = f"udaya_lms_{ts}.sql.gz"
    local_path = os.path.join("/tmp", fname)

    # pg_dump (no owner/acl so it restores cleanly into any target)
    dump = subprocess.run(
        ["pg_dump", db_url, "--no-owner", "--no-acl"],
        capture_output=True,
    )
    if dump.returncode != 0:
        sys.exit(f"[backup] pg_dump failed: {dump.stderr.decode(errors='replace')}")

    with gzip.open(local_path, "wb") as f:
        f.write(dump.stdout)

    # Upload to R2 (boto3 imported lazily so this file is import-safe anywhere)
    import boto3

    r2 = boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY"],
        aws_secret_access_key=os.environ["R2_SECRET_KEY"],
        region_name="auto",
    )
    r2.upload_file(local_path, os.environ["R2_PRIVATE_BUCKET"], f"backups/db/{fname}")
    os.remove(local_path)
    print(f"[backup] uploaded backups/db/{fname}")


if __name__ == "__main__":
    main()
