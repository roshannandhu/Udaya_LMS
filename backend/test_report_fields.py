"""Unit test for whatsapp._report_fields scoping (run: `py test_report_fields.py`).

_report_fields must scope the figures to what is being sent:
- exam (test_id): only that one exam's result;
- weekly/monthly: the period's own average/attendance (NOT lifetime);
- overall: the student's lifetime figures.
"""
import whatsapp as wa


def make_report(period="overall", avg_score=70, attendance=80):
    return {
        "student": {"name": "Aarav", "standard_name": "10th", "student_code": "X1",
                    "avg_score": avg_score, "attendance_pct": attendance, "points": 120},
        "period": period,
        "rank": 3, "total_students": 20,
        "subject_radar": [
            {"subject_id": "m", "subject": "Math", "test_avg": 90, "attendance_pct": 100, "att_total": 10},
            {"subject_id": "s", "subject": "Science", "test_avg": 50, "attendance_pct": 60, "att_total": 5},
        ],
        "test_timeline": [
            {"test_id": "t1", "test_title": "Math Unit 1", "subject_id": "m", "score_pct": 90},
            {"test_id": "t2", "test_title": "Science Unit 1", "subject_id": "s", "score_pct": 50},
            {"test_id": "t3", "test_title": "Math Unit 2", "subject_id": "m", "score_pct": 80},
        ],
    }


def test_exam_scopes_to_single_exam():
    f = wa._report_fields(make_report(), test_id="t2")
    assert f["is_exam"] is True
    assert [t["test_id"] for t in f["recent_tests"]] == ["t2"], f["recent_tests"]
    assert f["avg_score"] == 50, f["avg_score"]
    assert f["attendance_pct"] is None, f["attendance_pct"]
    assert f["radar"] == [], f["radar"]
    assert f["rank"] is None
    assert f["exam_title"] == "Science Unit 1"


def test_weekly_uses_period_aggregates_not_lifetime():
    f = wa._report_fields(make_report(period="weekly"))
    assert f["is_exam"] is False
    assert f["avg_score"] == 73.3, f["avg_score"]            # mean(90,50,80), not lifetime 70
    assert f["attendance_pct"] == 86.7, f["attendance_pct"]  # (100*10+60*5)/15
    assert len(f["recent_tests"]) == 3


def test_overall_uses_lifetime():
    f = wa._report_fields(make_report(period="overall"))
    assert f["avg_score"] == 70, f["avg_score"]
    assert f["attendance_pct"] == 80, f["attendance_pct"]


if __name__ == "__main__":
    test_exam_scopes_to_single_exam()
    test_weekly_uses_period_aggregates_not_lifetime()
    test_overall_uses_lifetime()
    print("All _report_fields scoping tests passed.")
