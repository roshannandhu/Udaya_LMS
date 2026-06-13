"""File storage routing: Cloudflare R2 when configured, else Supabase Storage.

Env-gated, mirroring the existing Cloudflare-Stream/Supabase video fallback:
- If the R2_* env vars are present, uploads go to Cloudflare R2 (zero egress).
- If not, every function falls back to the project's existing Supabase Storage
  behaviour, so the app is unchanged until R2 is set up.

Public objects are served from `R2_PUBLIC_BASE_URL` (the bucket's `pub-*.r2.dev`
URL for now; swap to `files.udayalms.com` once the domain is live). Private
objects (submissions, assignment files) are read via short-lived presigned URLs.

All functions are synchronous (boto3 + supabase-py are sync) — call them inside
`asyncio.to_thread(...)` from async endpoints, exactly like the existing code.
"""
import os

_r2_client = None


def is_r2_enabled() -> bool:
    return bool(
        os.getenv("R2_ACCOUNT_ID")
        and os.getenv("R2_ACCESS_KEY")
        and os.getenv("R2_SECRET_KEY")
        and os.getenv("R2_PUBLIC_BUCKET")
    )


def _r2():
    global _r2_client
    if _r2_client is None:
        import boto3  # lazy: only needed when R2 is configured
        _r2_client = boto3.client(
            "s3",
            endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
            aws_access_key_id=os.environ["R2_ACCESS_KEY"],
            aws_secret_access_key=os.environ["R2_SECRET_KEY"],
            region_name="auto",
        )
    return _r2_client


def _public_base() -> str:
    return os.environ.get("R2_PUBLIC_BASE_URL", "").rstrip("/")


def upload_public(supa, bucket: str, path: str, data: bytes, content_type: str) -> str:
    """Store a publicly-served file; return its URL. R2 public bucket (CDN) or Supabase."""
    if is_r2_enabled():
        _r2().put_object(
            Bucket=os.environ["R2_PUBLIC_BUCKET"], Key=path, Body=data, ContentType=content_type
        )
        return f"{_public_base()}/{path}"
    supa.storage.from_(bucket).upload(path, data, {"content-type": content_type})
    return supa.storage.from_(bucket).get_public_url(path)


def upload_private(supa, bucket: str, path: str, data: bytes, content_type: str) -> str:
    """Store a private file (served via signed URLs); return the storage path/key."""
    if is_r2_enabled():
        _r2().put_object(
            Bucket=os.environ["R2_PRIVATE_BUCKET"], Key=path, Body=data, ContentType=content_type
        )
        return path
    supa.storage.from_(bucket).upload(path, data, {"content-type": content_type})
    return path


def signed_url(supa, bucket: str, path: str, expires: int = 3600) -> str:
    """Short-lived read URL for a private object. R2 presign or Supabase signed URL."""
    if is_r2_enabled():
        return _r2().generate_presigned_url(
            "get_object",
            Params={"Bucket": os.environ["R2_PRIVATE_BUCKET"], "Key": path},
            ExpiresIn=expires,
        )
    s = supa.storage.from_(bucket).create_signed_url(path, expires)
    return (s or {}).get("signedUrl") or (s or {}).get("signedURL") or (s or {}).get("signed_url")


def signed_url_dict(supa, bucket: str, path: str, expires: int = 3600) -> dict:
    """Drop-in for `supa.storage.from_(bucket).create_signed_url(...)`: returns a
    dict with `signedUrl` so existing `.get("signedUrl")` parsing keeps working,
    backed by R2 presign when R2 is enabled."""
    if is_r2_enabled():
        return {"signedUrl": signed_url(supa, bucket, path, expires)}
    return supa.storage.from_(bucket).create_signed_url(path, expires)


def remove(supa, bucket: str, paths, public: bool = True):
    """Delete one or many objects from R2 (public/private bucket) or Supabase.
    `paths` may be a single key string or a list of keys. Best-effort."""
    keys = [paths] if isinstance(paths, str) else [p for p in (paths or []) if p]
    if not keys:
        return
    if is_r2_enabled():
        target = os.environ["R2_PUBLIC_BUCKET"] if public else os.environ["R2_PRIVATE_BUCKET"]
        for k in keys:
            _r2().delete_object(Bucket=target, Key=k)
        return
    supa.storage.from_(bucket).remove(keys)
