"""One-time migration: move legacy PUBLIC note/broadcast files into the PRIVATE
R2 bucket so their old public URLs stop resolving.

Context: the secure-file feature serves teacher files only through authed,
app-only endpoints. NEW uploads already go to the private bucket. This script
fixes OLD files that were uploaded to the public bucket before the change — their
direct public URLs still resolve until moved. (Assignment attachments were already
private, so they're skipped.)

The app's stream endpoint is resilient (it finds files in either bucket), so this
migration is OPTIONAL — it only retires already-shared public URLs.

SAFE BY DEFAULT: copies public→private and verifies. It does NOT delete the public
copy or rewrite DB URLs unless you pass --delete-public.

Required env (already set on the box): SUPABASE_URL, SUPABASE_SERVICE_KEY,
R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_PUBLIC_BUCKET, R2_PRIVATE_BUCKET.

Run (dry copy):     docker compose exec -T api python backend/scripts/migrate_files_private.py
Run (full cutover): docker compose exec -T api python backend/scripts/migrate_files_private.py --delete-public
"""
import os
import sys


def main():
    delete_public = "--delete-public" in sys.argv

    for var in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY", "R2_ACCOUNT_ID",
                "R2_ACCESS_KEY", "R2_SECRET_KEY", "R2_PUBLIC_BUCKET", "R2_PRIVATE_BUCKET"):
        if not os.environ.get(var):
            sys.exit(f"[migrate] {var} not set — aborting")

    from supabase import create_client
    import boto3

    supa = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    r2 = boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY"],
        aws_secret_access_key=os.environ["R2_SECRET_KEY"],
        region_name="auto",
    )
    PUBLIC = os.environ["R2_PUBLIC_BUCKET"]
    PRIVATE = os.environ["R2_PRIVATE_BUCKET"]

    def move_key(key: str) -> bool:
        """Copy one object public→private (skip if already private). Returns True if
        the object is present in the private bucket afterward."""
        try:
            r2.head_object(Bucket=PRIVATE, Key=key)
            return True  # already migrated
        except Exception:
            pass
        try:
            obj = r2.get_object(Bucket=PUBLIC, Key=key)
            body = obj["Body"].read()
            r2.put_object(Bucket=PRIVATE, Key=key, Body=body,
                          ContentType=obj.get("ContentType", "application/octet-stream"))
            if delete_public:
                r2.delete_object(Bucket=PUBLIC, Key=key)
            return True
        except Exception as e:
            print(f"[migrate]   ! {key}: {e}")
            return False

    moved = 0

    # 1. Notes — DB holds a storage_path key + a public file_url.
    notes = supa.table("notes").select("id, storage_path, file_url").execute().data or []
    for n in notes:
        key = n.get("storage_path")
        if not key:
            continue
        if move_key(key):
            moved += 1
            if delete_public:
                supa.table("notes").update({"file_url": None}).eq("id", n["id"]).execute()

    # 2. Broadcast documents — attachment_url may be a legacy public URL (a key was
    #    never stored for these). We can only retire them if the URL is a public-bucket
    #    object whose key we can derive from the URL's last path segment.
    bcs = supa.table("broadcasts").select("id, attachment_url, attachment_type") \
        .not_.is_("attachment_url", "null").execute().data or []
    for b in bcs:
        url = b.get("attachment_url") or ""
        ct = b.get("attachment_type") or ""
        # Only documents were ever sensitive; inline image/audio stay public.
        if ct.startswith("image/") or ct.startswith("audio/"):
            continue
        if not url.startswith("http"):
            continue  # already a private key
        key = url.rstrip("/").split("/")[-1]
        if key and move_key(key):
            moved += 1
            if delete_public:
                supa.table("broadcasts").update({"attachment_url": key}).eq("id", b["id"]).execute()

    mode = "moved + retired public copies" if delete_public else "copied to private (public copies kept)"
    print(f"[migrate] done — {moved} file(s) {mode}.")
    if not delete_public:
        print("[migrate] re-run with --delete-public to retire the old public URLs once verified.")


if __name__ == "__main__":
    main()
