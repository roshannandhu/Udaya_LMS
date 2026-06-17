"""Weekly student-roster backup → Cloudflare R2 (human-readable CSV).

Companion to backup_db.py. The full pg_dump already backs up the students table,
but this writes an easy-to-open CSV snapshot of student details so a roster can be
restored/imported without parsing a SQL dump. Standalone — run via cron.

Required env:
  DATABASE_URL        managed Supabase Postgres connection string (pooler)
  R2_ACCOUNT_ID       Cloudflare R2 account id
  R2_ACCESS_KEY       R2 access key
  R2_SECRET_KEY       R2 secret key
  R2_PRIVATE_BUCKET   target bucket (e.g. udaya-private)

Run:  python scripts/backup_students.py
"""
import os
import sys
import gzip
import datetime
import subprocess


def main():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        sys.exit("[backup-students] DATABASE_URL not set")

    ts = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M")
    fname = f"students_{ts}.csv.gz"
    local_path = os.path.join("/tmp", fname)

    # \copy streams the students table to stdout as CSV with a header row.
    copy_sql = r"\copy (select * from students order by created_at) to stdout with csv header"
    dump = subprocess.run(
        ["psql", db_url, "-v", "ON_ERROR_STOP=1", "-c", copy_sql],
        capture_output=True,
    )
    if dump.returncode != 0:
        sys.exit(f"[backup-students] psql failed: {dump.stderr.decode(errors='replace')}")

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
    r2.upload_file(local_path, os.environ["R2_PRIVATE_BUCKET"], f"backups/students/{fname}")
    os.remove(local_path)
    print(f"[backup-students] uploaded backups/students/{fname}")


if __name__ == "__main__":
    main()
