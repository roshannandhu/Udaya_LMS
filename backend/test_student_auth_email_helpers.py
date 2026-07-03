"""Checks for student auth email normalization.

Run:
    python test_student_auth_email_helpers.py
"""
import main
from types import SimpleNamespace


class _FakeStudentTable:
    def __init__(self):
        self.filters = {}

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, field, value):
        self.filters[field] = value
        return self

    def ilike(self, field, value):
        self.filters[field] = value.lower()
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def single(self):
        self.filters["single"] = True
        return self

    def execute(self):
        if self.filters.get("student_code"):
            return SimpleNamespace(data=[])
        if self.filters.get("username") == "aarav.p":
            return SimpleNamespace(data=[{"email": None, "username": "aarav.p"}])
        if self.filters.get("username") == "candidate.test":
            return SimpleNamespace(data=[{
                "id": "student-2",
                "email": "parent@example.com",
                "username": "candidate.test",
            }])
        if self.filters.get("id") == "student-1":
            return SimpleNamespace(data={
                "id": "student-1",
                "standard_id": "std-1",
                "name": "Aarav Patel",
                "username": "aarav.p",
                "must_change_pwd": False,
                "blocked": False,
            })
        if self.filters.get("id") == "student-2":
            return SimpleNamespace(data={
                "id": "student-2",
                "standard_id": "std-1",
                "name": "Candidate Test",
                "username": "candidate.test",
                "must_change_pwd": False,
                "blocked": False,
            })
        return SimpleNamespace(data=[])


class _FakeServiceSupabase:
    def table(self, name):
        assert name == "students"
        return _FakeStudentTable()


class _FakeAuth:
    def __init__(self):
        self.emails = []
        self.attempts = []

    def sign_in_with_password(self, payload):
        email = payload["email"]
        password = payload["password"]
        self.emails.append(email)
        self.attempts.append((email, password))
        if email == "aarav.p@tutoria.local":
            raise Exception("Invalid login credentials")
        if email == "parent@example.com":
            raise Exception("Invalid login credentials")
        if password != "secret":
            raise Exception("Invalid login credentials")
        if email == "candidate.test@tutoria.local":
            user_id = "student-2"
            name = "Candidate Test"
            username = "candidate.test"
        else:
            assert email == "aarav.p@tutoria.internal"
            user_id = "student-1"
            name = "Aarav Patel"
            username = "aarav.p"
        return SimpleNamespace(
            user=SimpleNamespace(
                id=user_id,
                email=email,
                user_metadata={"role": "student", "name": name, "username": username},
            ),
            session=SimpleNamespace(access_token="token", refresh_token="refresh"),
        )


class _FakeSupabase:
    def __init__(self):
        self.auth = _FakeAuth()


def run():
    assert main._normalize_student_username(" Aarav P ") == "aarav.p"
    assert main._student_auth_email("Aarav P") == "aarav.p@tutoria.local"

    assert (
        main._student_auth_email_for_create("Aarav P", None)
        == "aarav.p@tutoria.local"
    )
    assert (
        main._student_auth_email_for_create("ignored", "Student@Example.COM")
        == "student@example.com"
    )
    assert (
        main._student_auth_email_for_create("Student@Example.COM", None)
        == "student@example.com"
    )

    no_email_row = {"email": None, "username": "Aarav P"}
    assert main._student_login_email_candidates(no_email_row) == [
        "aarav.p@tutoria.local",
        "aarav.p@tutoria.internal",
    ]

    real_email_row = {"email": "student@example.com", "username": "aarav.p"}
    assert main._student_login_email_candidates(real_email_row) == [
        "student@example.com",
        "aarav.p@tutoria.local",
        "aarav.p@tutoria.internal",
    ]

    email_username_row = {"email": None, "username": "Student@Example.COM"}
    assert main._student_login_email_candidates(email_username_row) == [
        "student@example.com",
    ]

    old_supabase = main.supabase
    old_service = main.service_supabase
    try:
        fake_supabase = _FakeSupabase()
        main.supabase = fake_supabase
        main.service_supabase = _FakeServiceSupabase()

        result = main.login(
            main.LoginRequest(email_or_username="aarav.p", password="secret"),
            _rl=None,
        )

        assert fake_supabase.auth.attempts == [
            ("aarav.p@tutoria.local", "secret"),
            ("aarav.p@tutoria.local", "secret "),
            ("aarav.p@tutoria.internal", "secret"),
        ]
        assert result["token"] == "token"
        assert result["user"]["student_id"] == "student-1"

        fake_supabase = _FakeSupabase()
        main.supabase = fake_supabase

        result = main.login(
            main.LoginRequest(email_or_username="aarav.p", password="secret "),
            _rl=None,
        )

        assert fake_supabase.auth.attempts == [
            ("aarav.p@tutoria.local", "secret "),
            ("aarav.p@tutoria.local", "secret"),
            ("aarav.p@tutoria.internal", "secret "),
            ("aarav.p@tutoria.internal", "secret"),
        ]
        assert result["token"] == "token"
        assert result["user"]["student_id"] == "student-1"

        fake_supabase = _FakeSupabase()
        main.supabase = fake_supabase

        result = main.login(
            main.LoginRequest(email_or_username="candidate.test", password="secret"),
            _rl=None,
        )

        assert fake_supabase.auth.attempts == [
            ("parent@example.com", "secret"),
            ("parent@example.com", "secret "),
            ("candidate.test@tutoria.local", "secret"),
        ]
        assert result["token"] == "token"
        assert result["user"]["student_id"] == "student-2"
    finally:
        main.supabase = old_supabase
        main.service_supabase = old_service

    print("PASS: student auth email helpers")


if __name__ == "__main__":
    run()
