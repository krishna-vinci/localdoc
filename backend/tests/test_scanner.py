from app.models.document import Document
from app.services.scanner import (
    ParsedMarkdownDocument,
    _should_preserve_existing_document_on_empty_rescan,
)


def _make_document(*, content: str, size_bytes: int, frontmatter: str | None = None) -> Document:
    return Document(
        folder_id="folder-1",
        file_path="notes/example.md",
        file_name="example.md",
        title="Example",
        content_hash="existing-hash",
        content=content,
        frontmatter=frontmatter,
        device_id="device-1",
        size_bytes=size_bytes,
    )


def _make_empty_parse() -> ParsedMarkdownDocument:
    return ParsedMarkdownDocument(
        raw_content="",
        body_content="",
        content_hash="empty-hash",
        title="example",
        frontmatter=None,
        tags=None,
        status=None,
        headings=None,
        links=None,
        tasks=None,
        task_count=0,
    )


def test_preserve_existing_content_on_automatic_zero_byte_rescan() -> None:
    doc = _make_document(content="# Existing\n", size_bytes=12)

    should_preserve = _should_preserve_existing_document_on_empty_rescan(
        doc,
        _make_empty_parse(),
        size_bytes=0,
        allow_empty_file_overwrite=False,
    )

    assert should_preserve is True


def test_allow_explicit_empty_overwrite_on_manual_rescan() -> None:
    doc = _make_document(content="# Existing\n", size_bytes=12)

    should_preserve = _should_preserve_existing_document_on_empty_rescan(
        doc,
        _make_empty_parse(),
        size_bytes=0,
        allow_empty_file_overwrite=True,
    )

    assert should_preserve is False


def test_do_not_preserve_when_document_was_already_empty() -> None:
    doc = _make_document(content="", size_bytes=0)

    should_preserve = _should_preserve_existing_document_on_empty_rescan(
        doc,
        _make_empty_parse(),
        size_bytes=0,
        allow_empty_file_overwrite=False,
    )

    assert should_preserve is False
