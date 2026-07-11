"""Focused tests for optional PDF page selection in assessment generation."""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import main


@pytest.mark.parametrize("raw", [None, "", "   "])
def test_missing_or_blank_selection_means_full_pdf(raw):
    assert main._resolve_pdf_page_selection(raw, 4) == [1, 2, 3, 4]


def test_selection_is_deduplicated_and_sorted():
    assert main._resolve_pdf_page_selection(" 4,2,4,1 ", 5) == [1, 2, 4]


@pytest.mark.parametrize("raw", ["1,,2", "1-2", "2.5", "page 2", "+2"])
def test_malformed_selection_is_rejected(raw):
    with pytest.raises(HTTPException) as exc_info:
        main._resolve_pdf_page_selection(raw, 5)

    assert exc_info.value.status_code == 400
    assert "comma-separated" in exc_info.value.detail


@pytest.mark.parametrize("raw", ["0", "0,2"])
def test_non_positive_page_is_rejected(raw):
    with pytest.raises(HTTPException) as exc_info:
        main._resolve_pdf_page_selection(raw, 5)

    assert exc_info.value.status_code == 400
    assert "start at 1" in exc_info.value.detail


def test_page_beyond_pdf_is_rejected():
    with pytest.raises(HTTPException) as exc_info:
        main._resolve_pdf_page_selection("2,7", 6)

    assert exc_info.value.status_code == 400
    assert "7" in exc_info.value.detail
    assert "1-6" in exc_info.value.detail


def test_extremely_long_numeric_page_is_rejected_as_bad_request():
    with pytest.raises(HTTPException) as exc_info:
        main._resolve_pdf_page_selection("9" * 5000, 6)

    assert exc_info.value.status_code == 400
    assert "too long" in exc_info.value.detail


@pytest.mark.parametrize("size_mb", [10.1, 39, 50, 101, 500])
def test_pdf_sources_over_old_10_mb_limit_are_accepted(size_mb):
    main._validate_ai_source_size(int(size_mb * 1024 * 1024), is_pdf=True)


def test_image_source_keeps_10_mb_vision_limit():
    with pytest.raises(HTTPException) as exc_info:
        main._validate_ai_source_size(10 * 1024 * 1024 + 1, is_pdf=False)

    assert exc_info.value.status_code == 413
    assert "Image too large" in exc_info.value.detail


@pytest.mark.parametrize("head", [b"%PDF-1.7", b"%PDF-2.0"])
def test_pdf_magic_wins_over_image_metadata(head):
    assert main._detect_ai_source_type(head, "image/jpeg", "renamed.jpg") == (
        "pdf", "application/pdf"
    )


@pytest.mark.parametrize(("head", "expected_mime"), [
    (b"\xff\xd8\xff\xe0jpeg", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\nrest", "image/png"),
    (b"RIFF1234WEBPrest", "image/webp"),
])
def test_image_magic_wins_over_pdf_filename_and_normalizes_mime(head, expected_mime):
    assert main._detect_ai_source_type(head, "application/pdf", "renamed.pdf") == (
        "image", expected_mime
    )


def test_image_metadata_normalizes_nonstandard_jpg_mime():
    assert main._detect_ai_source_type(b"", "image/jpg", "photo") == (
        "image", "image/jpeg"
    )


def test_unknown_ai_source_type_is_rejected_by_classifier():
    assert main._detect_ai_source_type(b"not a document", "text/plain", "notes.txt") is None


def test_zero_page_pdf_is_rejected_even_without_selection():
    with pytest.raises(HTTPException) as exc_info:
        main._resolve_pdf_page_selection(None, 0)

    assert exc_info.value.status_code == 400
    assert "does not contain any pages" in exc_info.value.detail


def test_extraction_reads_only_selected_pages_and_keeps_original_numbers():
    extracted = []

    class FakePage:
        def __init__(self, number, text):
            self.number = number
            self.text = text

        def extract_text(self):
            extracted.append(self.number)
            return self.text

    pdf = SimpleNamespace(pages=[
        FakePage(1, "First selected page"),
        FakePage(2, "This page must not be read"),
        FakePage(3, "Third selected page"),
    ])

    labelled, readable = main._extract_selected_pdf_text(pdf, [1, 3])

    assert extracted == [1, 3]
    assert labelled == "[PDF Page 1]\nFirst selected page\n\n[PDF Page 3]\nThird selected page"
    assert readable == "First selected page\n\nThird selected page"
