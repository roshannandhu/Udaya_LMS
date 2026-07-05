"""File storage routing: Cloudflare R2 when configured, else Supabase Storage.

Env-gated:
- If the R2_* env vars are present, uploads go to Cloudflare R2 (zero egress).
- If not, storage operations RAISE (fail-closed) so production never silently
  writes files to Supabase Storage. To use the Supabase fallback in local dev,
  set STORAGE_ALLOW_SUPABASE=1.

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
        and (os.getenv("R2_ACCESS_KEY") or os.getenv("R2_ACCESS_KEY_ID"))
        and (os.getenv("R2_SECRET_KEY") or os.getenv("R2_SECRET_ACCESS_KEY"))
        and os.getenv("R2_PUBLIC_BUCKET")
    )


def _r2():
    global _r2_client
    if _r2_client is None:
        import boto3  # lazy: only needed when R2 is configured
        _r2_client = boto3.client(
            "s3",
            endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
            aws_access_key_id=os.getenv("R2_ACCESS_KEY") or os.getenv("R2_ACCESS_KEY_ID"),
            aws_secret_access_key=os.getenv("R2_SECRET_KEY") or os.getenv("R2_SECRET_ACCESS_KEY"),
            region_name="auto",
        )
    return _r2_client


def _public_base() -> str:
    return os.environ.get("R2_PUBLIC_BASE_URL", "").rstrip("/")


def _bucket_name(private: bool) -> str:
    """Bucket name from env with a clear error (a bare KeyError('R2_PRIVATE_BUCKET')
    surfaces to callers as an unreadable quoted string)."""
    var = "R2_PRIVATE_BUCKET" if private else "R2_PUBLIC_BUCKET"
    name = os.getenv(var, "").strip()
    if not name:
        raise RuntimeError(f"{var} env var is not set — cannot access the R2 {'private' if private else 'public'} bucket")
    return name


def _supabase_fallback_allowed() -> bool:
    """Fail-closed: production must never write files to Supabase Storage. The
    Supabase fallback is only permitted when explicitly opted in (local dev),
    via STORAGE_ALLOW_SUPABASE=1. So if the R2_* vars are ever missing in
    production, storage operations raise instead of silently using Supabase."""
    return os.getenv("STORAGE_ALLOW_SUPABASE", "").strip().lower() in ("1", "true", "yes")


def _require_backend() -> None:
    if not is_r2_enabled() and not _supabase_fallback_allowed():
        raise RuntimeError(
            "File storage backend not available: R2 is not configured "
            "(R2_ACCOUNT_ID/R2_ACCESS_KEY/R2_SECRET_KEY/R2_PUBLIC_BUCKET) and the "
            "Supabase fallback is disabled. Set the R2_* vars, or set "
            "STORAGE_ALLOW_SUPABASE=1 for local development."
        )


def upload_public(supa, bucket: str, path: str, data: bytes, content_type: str) -> str:
    """Store a publicly-served file; return its URL. R2 public bucket (CDN) or Supabase."""
    _require_backend()
    if is_r2_enabled():
        base = _public_base()
        if not base:
            raise RuntimeError("R2_PUBLIC_BASE_URL is required for public uploads")
        _r2().put_object(
            Bucket=_bucket_name(private=False), Key=path, Body=data, ContentType=content_type
        )
        return f"{base}/{path}"
    supa.storage.from_(bucket).upload(path, data, {"content-type": content_type})
    return supa.storage.from_(bucket).get_public_url(path)


def upload_private(supa, bucket: str, path: str, data: bytes, content_type: str) -> str:
    """Store a private file (served via signed URLs); return the storage path/key."""
    _require_backend()
    if is_r2_enabled():
        _r2().put_object(
            Bucket=_bucket_name(private=True), Key=path, Body=data, ContentType=content_type
        )
        return path
    supa.storage.from_(bucket).upload(path, data, {"content-type": content_type})
    return path


def get_bytes(supa, bucket: str, path: str, private: bool = True) -> bytes:
    """Read an object's raw bytes server-side (for authed streaming — the client
    never gets a file URL). R2 get_object or Supabase download."""
    _require_backend()
    if is_r2_enabled():
        target = _bucket_name(private=True) if private else _bucket_name(private=False)
        obj = _r2().get_object(Bucket=target, Key=path)
        return obj["Body"].read()
    return supa.storage.from_(bucket).download(path)


def signed_url(supa, bucket: str, path: str, expires: int = 3600) -> str:
    """Short-lived read URL for a private object. R2 presign or Supabase signed URL."""
    _require_backend()
    if is_r2_enabled():
        return _r2().generate_presigned_url(
            "get_object",
            Params={"Bucket": _bucket_name(private=True), "Key": path},
            ExpiresIn=expires,
        )
    s = supa.storage.from_(bucket).create_signed_url(path, expires)
    return (s or {}).get("signedUrl") or (s or {}).get("signedURL") or (s or {}).get("signed_url")


def signed_url_dict(supa, bucket: str, path: str, expires: int = 3600) -> dict:
    """Drop-in for `supa.storage.from_(bucket).create_signed_url(...)`: returns a
    dict with `signedUrl` so existing `.get("signedUrl")` parsing keeps working,
    backed by R2 presign when R2 is enabled."""
    _require_backend()
    if is_r2_enabled():
        return {"signedUrl": signed_url(supa, bucket, path, expires)}
    return supa.storage.from_(bucket).create_signed_url(path, expires)


def remove(supa, bucket: str, paths, public: bool = True):
    """Delete one or many objects from R2 (public/private bucket) or Supabase.
    `paths` may be a single key string or a list of keys. Best-effort."""
    keys = [paths] if isinstance(paths, str) else [p for p in (paths or []) if p]
    if not keys:
        return
    _require_backend()
    if is_r2_enabled():
        target = _bucket_name(private=False) if public else _bucket_name(private=True)
        for k in keys:
            _r2().delete_object(Bucket=target, Key=k)
        return
    supa.storage.from_(bucket).remove(keys)


def list_private(prefix: str = "") -> list:
    """List objects in the private bucket under `prefix`. R2 only — returns [] if
    R2 isn't enabled. Each item: {key, size, last_modified}. Used by the backup
    list endpoint + pruning."""
    if not is_r2_enabled():
        return []
    out, token = [], None
    while True:
        kw = {"Bucket": _bucket_name(private=True), "Prefix": prefix}
        if token:
            kw["ContinuationToken"] = token
        resp = _r2().list_objects_v2(**kw)
        for o in resp.get("Contents", []):
            out.append({"key": o["Key"], "size": o.get("Size", 0), "last_modified": o.get("LastModified")})
        if resp.get("IsTruncated"):
            token = resp.get("NextContinuationToken")
        else:
            break
    return out
