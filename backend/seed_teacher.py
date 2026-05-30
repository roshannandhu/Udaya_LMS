"""
seed_teacher.py — Create (or reset) the first teacher login.

Teacher/student logins live in **Supabase Auth** (auth.users), NOT in schema.sql.
Running schema.sql on a fresh project creates empty tables but zero accounts, so
nobody can log in. This script creates a teacher auth user with the correct
user_metadata ({ "role": "teacher", "name": ... }) so the teacher portal works.

Idempotent: if the email already exists, it just resets the password and ensures
role=teacher — safe to run repeatedly.

Usage (from the backend/ folder, after `pip install -r requirements.txt`):

    python seed_teacher.py
    py seed_teacher.py                              # Windows
    python seed_teacher.py --email you@x.com --password Secret123 --name "Your Name"

Reads SUPABASE_URL and SUPABASE_SERVICE_KEY from backend/.env.
Defaults: admin@udaya.com / Admin1234 / "Admin Teacher".
"""
import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")


def main() -> int:
    parser = argparse.ArgumentParser(description="Create/reset the first teacher login.")
    parser.add_argument("--email", default="admin@udaya.com")
    parser.add_argument("--password", default="Admin1234")
    parser.add_argument("--name", default="Admin Teacher")
    args = parser.parse_args()

    url = os.getenv("SUPABASE_URL", "").strip()
    service_key = os.getenv("SUPABASE_SERVICE_KEY", "").strip()

    if not url or not service_key:
        print("[!] SUPABASE_URL / SUPABASE_SERVICE_KEY missing in backend/.env")
        print("    Fill them in (Supabase dashboard -> Project Settings -> API) and re-run.")
        return 1

    supabase = create_client(url, service_key)
    email = args.email.strip().lower()
    metadata = {"role": "teacher", "name": args.name}

    # Find an existing auth user with this email (paginate through admin list).
    existing = None
    page = 1
    while True:
        try:
            users = supabase.auth.admin.list_users(page=page, per_page=200)
        except TypeError:
            # Older supabase-py returns a plain list with no pagination kwargs.
            users = supabase.auth.admin.list_users()
        if not users:
            break
        for u in users:
            if (u.email or "").lower() == email:
                existing = u
                break
        if existing or len(users) < 200:
            break
        page += 1

    try:
        if existing:
            supabase.auth.admin.update_user_by_id(
                existing.id,
                {"password": args.password, "user_metadata": metadata, "email_confirm": True},
            )
            print(f"[*] Updated existing teacher: {email} (password reset, role=teacher)")
        else:
            resp = supabase.auth.admin.create_user(
                {
                    "email": email,
                    "password": args.password,
                    "email_confirm": True,
                    "user_metadata": metadata,
                }
            )
            if not resp.user:
                print("[!] Supabase did not return a user — creation failed.")
                return 1
            print(f"[*] Created teacher: {email}")
    except Exception as e:
        print(f"[!] Failed to create/update teacher: {e}")
        return 1

    print()
    print("    Login with:")
    print(f"      Email:    {email}")
    print(f"      Password: {args.password}")
    print("    (Teacher portal. Students are created from inside the teacher portal.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
