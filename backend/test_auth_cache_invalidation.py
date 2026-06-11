"""One-off check: _invalidate_auth_cache_for_user drops every cached token
for the target user and leaves other users' entries alone.

Repro for the bug: after POST /auth/change-password the _auth_cache still held
must_change_pwd=True for the student's token, so the immediate GET /auth/me
returned the stale flag and the frontend guard bounced the student back to
the change-password page until the 30s TTL expired.
"""
import time

import main


def run():
    main._auth_cache.clear()
    expires = time.time() + 30

    main._auth_cache["token-student-a-1"] = {
        "result": {"user_id": "student-a", "must_change_pwd": True},
        "expires_at": expires,
    }
    main._auth_cache["token-student-a-2"] = {
        "result": {"user_id": "student-a", "must_change_pwd": True},
        "expires_at": expires,
    }
    main._auth_cache["token-student-b"] = {
        "result": {"user_id": "student-b", "must_change_pwd": False},
        "expires_at": expires,
    }

    main._invalidate_auth_cache_for_user("student-a")

    assert "token-student-a-1" not in main._auth_cache, "student-a token 1 not evicted"
    assert "token-student-a-2" not in main._auth_cache, "student-a token 2 not evicted"
    assert "token-student-b" in main._auth_cache, "student-b entry must survive"

    main._auth_cache.clear()
    print("PASS: stale entries evicted for target user, others untouched")


if __name__ == "__main__":
    run()
