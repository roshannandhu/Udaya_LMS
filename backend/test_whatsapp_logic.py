import inspect

import main


def test_wa_render_parent_and_student_phone_are_distinct(monkeypatch):
    monkeypatch.setattr(main, "_wa_login_url", lambda: "https://portal.example")
    monkeypatch.setattr(main, "_wa_branding_name", lambda: "Demo Institute")

    recip = {
        "name": "Aarav",
        "phone": "919999999999",
        "parent_phone": "919999999999",
        "student_phone": "918888888888",
        "student_code": "25UDAYA100001",
        "standard_name": "10th Standard",
        "avg_score": 88,
        "attendance_pct": 92,
    }

    body = (
        "{student_name} / {Student ID} / {Parent Phone} / {Student Phone} / "
        "{Institute Name} / {Login Link}"
    )

    assert main._wa_render(body, recip) == (
        "Aarav / 25UDAYA100001 / 919999999999 / 918888888888 / "
        "Demo Institute / https://portal.example"
    )


def test_wa_parse_aliases_as_auto_variables():
    parsed = main._wa_parse_variables("{student_name} scored {marks} in {exam_name}")
    assert parsed == [
        {"name": "student_name", "kind": "auto"},
        {"name": "marks", "kind": "auto"},
        {"name": "exam_name", "kind": "auto"},
    ]


def test_wa_phone_variants_cover_common_india_formats():
    variants = set(main._wa_phone_variants("+91 98765 43210"))
    assert "919876543210" in variants
    assert "+919876543210" in variants
    assert "9876543210" in variants


def test_baileys_event_handler_is_the_full_implementation():
    source = inspect.getsource(main._wa_handle_baileys_event)
    assert "outbound-device" in source
    assert "_wa_inbox_emit" in source
    assert "_wa_store_inbound_media" in source


def test_every_auto_key_is_listed_in_the_variable_registry():
    """The UI's variable picker + 'fill in the blanks' classifier are driven by
    WA_VARIABLES. Any auto key missing from it makes the Composer prompt the
    teacher for a value the engine then overwrites — the exact bug that shipped
    with {Parent Name}/{Month}/{Year}."""
    listed = {v["name"].strip().lower() for v in main.WA_VARIABLES if v["kind"] == "auto"}
    assert main._WA_AUTO_KEYS - listed == set()


def test_every_registry_auto_variable_actually_resolves(monkeypatch):
    monkeypatch.setattr(main, "_wa_login_url", lambda: "https://portal.example")
    monkeypatch.setattr(main, "_wa_branding_name", lambda: "Demo Institute")
    recip = {
        "name": "Aarav", "student_code": "25UDAYA100001", "standard_name": "10th",
        "username": "aarav01", "plain_password": "pw", "parent_phone": "919999999999",
        "phone": "919999999999", "student_phone": "918888888888",
        "attendance_pct": 92, "avg_score": 88, "points": 120,
        "latest_test": "Unit Test 2", "latest_assignment": "Algebra",
        "latest_material": "Ch 5 Notes", "upcoming_live_class": "Physics",
        "latest_video": "Trig Ch 1",
    }
    for v in main.WA_VARIABLES:
        if v["kind"] != "auto":
            continue
        assert main._wa_auto_value(v["name"].lower(), recip) != "", v["name"]


def test_manual_value_overrides_auto_value():
    recip = {"name": "Aarav"}
    out = main._wa_render("Hi {Student Name}", recip, {"Student Name": "Custom"})
    assert out == "Hi Custom"


def test_unknown_tag_keeps_its_word_matching_the_preview():
    # previewText.jsx shows an unknown tag as its plain word — the sent message
    # must match, never a stripped-out hole ("Dear , ...").
    assert main._wa_render("Dear {Studnet Name}, welcome", {}) == "Dear Studnet Name, welcome"


def test_positional_values_prefer_manual_over_auto():
    recip = {"name": "Aarav"}
    body = "Hi {Student Name}, fee {Fee Amount}"
    vals = main._wa_positional_values(body, recip, {"Student Name": "Custom", "Fee Amount": "5000"})
    assert vals == ["Custom", "5000"]


def test_variables_endpoint_ships_the_alias_table():
    # Aliases are served with the registry so the frontend never hand-copies
    # (and drifts from) the backend table.
    source = inspect.getsource(main.wa_variables)
    assert '"aliases": _WA_ALIAS' in source


def test_outbox_append_roundtrips_media_name(tmp_path, monkeypatch):
    import whatsapp_outbox as ob
    monkeypatch.setattr(ob, "_FILE", str(tmp_path / "outbox.json"))
    monkeypatch.setattr(ob, "ensure_loop", lambda: None)
    ob.append("919876543210", "Report attached",
              media_url="https://x/report.pdf", media_type="application/pdf",
              media_name="Aarav_Report.pdf", dedupe_key="k1")
    items = ob._read()
    assert items[0]["media_name"] == "Aarav_Report.pdf"
    # The drain loop must forward it (regression: it used to drop the filename).
    assert 'media_name=p.get("media_name")' in inspect.getsource(ob._drain_loop)


def test_webhook_status_branch_requires_service_token():
    source = inspect.getsource(main.wa_webhook)
    # Baileys chat events were gated; the status branch must be too.
    assert source.count("x-service-token") >= 2


def test_normalize_in_rejects_invalid_and_accepts_common_formats():
    import whatsapp_parent_routes as wpr
    assert wpr.normalize_in("+91 98765 43210") == "919876543210"
    assert wpr.normalize_in("098765 43210") == "919876543210"
    assert wpr.normalize_in("9876543210") == "919876543210"
    assert wpr.normalize_in("919876543210") == "919876543210"
    assert wpr.normalize_in("987654321") == ""        # 9 digits — truncated
    assert wpr.normalize_in("12345") == ""            # garbage
    assert wpr.normalize_in("4915112345678") == ""    # non-Indian country code
    assert wpr.normalize_in("") == ""


def test_send_input_has_media_name_and_wa_send_passes_it_through():
    """WhatsAppSendInput must have a media_name field, and wa_send must forward it
    to _wa_send_and_log in BOTH the test-to-self path and the bulk path.
    Regression: the field was missing, causing PDF/image filenames to be silently
    dropped on every announcement send that included an attachment."""
    import inspect
    # The Pydantic model must accept media_name.
    obj = main.WhatsAppSendInput(
        mode="freeform", body_text="hi",
        media_url="https://x/r.pdf", media_type="application/pdf",
        media_name="Aarav_Report.pdf",
    )
    assert obj.media_name == "Aarav_Report.pdf"

    # wa_send must forward it — check both call sites in the source.
    source = inspect.getsource(main.wa_send)
    assert source.count("media_name=data.media_name") >= 2
