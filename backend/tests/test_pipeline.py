from __future__ import annotations

from pathlib import Path
import sys
from typing import Iterator

import pytest
from fastapi.testclient import TestClient
from qdrant_client import QdrantClient

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.config import get_settings
from app.main import app
from app.services import COLLECTION_NAME


@pytest.fixture
def api_client() -> Iterator[TestClient]:
    with TestClient(app) as client:
        yield client


@pytest.fixture
def sample_pdf(tmp_path: Path) -> Path:
    pdf_bytes = (
        b"%PDF-1.4\n1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n"
        b"2 0 obj\n<</Type /Pages /Kids [3 0 R] /Count 1>>\nendobj\n"
        b"3 0 obj\n<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>>\nendobj\n"
        b"4 0 obj\n<</Length 67>>\nstream\nBT /F1 24 Tf 100 700 Td (LexAI test term) Tj ET\nendstream\nendobj\n"
        b"5 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>\nendobj\n"
        b"xref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n"
        b"0000000112 00000 n \n0000000221 00000 n \n0000000338 00000 n \n"
        b"trailer\n<</Size 6 /Root 1 0 R>>\nstartxref\n413\n%%EOF\n"
    )
    pdf_path = tmp_path / "sample.pdf"
    pdf_path.write_bytes(pdf_bytes)
    return pdf_path


@pytest.fixture(autouse=True)
def reset_collection() -> Iterator[None]:
    settings = get_settings()
    client = QdrantClient(url=settings.qdrant_host)
    try:
        client.delete_collection(collection_name=COLLECTION_NAME)
    except Exception:
        pass
    yield
    try:
        client.delete_collection(collection_name=COLLECTION_NAME)
    except Exception:
        pass


@pytest.fixture(autouse=True)
def mock_extract_text(monkeypatch: pytest.MonkeyPatch) -> None:
    def _mock_extract_text(_: str) -> str:
        return "LexAI test term appears in this document chunk for verification."

    monkeypatch.setattr("app.services.rust_core.extract_text", _mock_extract_text)


@pytest.fixture(autouse=True)
def stub_embedder(monkeypatch: pytest.MonkeyPatch) -> None:
    import numpy as np

    from app import services

    class _StubEmbedder:
        def encode(self, texts, convert_to_numpy=True):  # type: ignore[override]
            single_input = False
            if isinstance(texts, str):
                texts = [texts]
                single_input = True

            vectors = []
            for text in texts:
                length = float(len(text) or 1)
                vectors.append([length, length / 2, length / 3])

            array = np.array(vectors, dtype=float)
            if single_input:
                return array[0]
            return array

    def _get_stub_embedder(_: str) -> _StubEmbedder:
        return _StubEmbedder()

    services.get_embedder.cache_clear()
    monkeypatch.setattr("app.services.get_embedder", _get_stub_embedder)
    monkeypatch.setattr("app.routers.documents.get_embedder", _get_stub_embedder)


@pytest.fixture(autouse=True)
def stub_qdrant(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx
    from qdrant_client import models
    from qdrant_client.http import exceptions

    class _FakeQdrantClient:
        _collections: dict[str, dict[str, list[models.PointStruct]]] = {}

        def __init__(self, url: str):  # noqa: ARG002
            self.collections = _FakeQdrantClient._collections

        def get_collection(self, collection_name: str) -> None:
            if collection_name not in self.collections:
                raise exceptions.UnexpectedResponse(
                    status_code=404,
                    reason_phrase="collection not found",
                    content=b"",
                    headers=httpx.Headers(),
                )

        def create_collection(
            self,
            collection_name: str,
            vectors_config: models.VectorParams,
        ) -> None:  # noqa: ARG002
            self.collections.setdefault(collection_name, {"points": []})

        def upsert(
            self,
            collection_name: str,
            points: list[models.PointStruct],
            wait: bool = True,  # noqa: ARG002
            **_: object,
        ) -> models.UpdateResult:
            self.collections.setdefault(collection_name, {"points": []})
            self.collections[collection_name]["points"] = points
            return models.UpdateResult(
                operation_id=0,
                status=models.UpdateStatus.COMPLETED,
                time=0.0,
            )

        def search(
            self,
            collection_name: str,
            query_vector: list[float],
            query_filter: models.Filter,
            limit: int,
            **_: object,
        ) -> list[models.ScoredPoint]:
            collection = self.collections.get(collection_name, {"points": []})
            doc_match = None
            if query_filter.must:
                condition = query_filter.must[0]
                if isinstance(condition, models.FieldCondition):
                    doc_match = condition.match.value

            scored: list[models.ScoredPoint] = []
            for point in collection["points"]:
                if doc_match is not None and point.payload.get("document_id") != doc_match:
                    continue
                score = float(sum(a * b for a, b in zip(point.vector, query_vector)))
                scored.append(
                    models.ScoredPoint(
                        id=point.id,
                        version=1,
                        score=score,
                        payload=point.payload,
                        vector=None,
                    )
                )

            scored.sort(key=lambda item: item.score, reverse=True)
            return scored[:limit]

    monkeypatch.setattr("app.services.QdrantClient", _FakeQdrantClient)
    monkeypatch.setattr("app.routers.documents.QdrantClient", _FakeQdrantClient)


def test_upload_and_search_pipeline(api_client: TestClient, sample_pdf: Path) -> None:
    upload_response = api_client.post(
        "/documents/upload",
        files={"file": ("sample.pdf", sample_pdf.read_bytes(), "application/pdf")},
    )
    assert upload_response.status_code == 201
    upload_payload = upload_response.json()
    assert upload_payload["status"] == "processed"

    document_id = upload_payload["document_id"]

    search_response = api_client.get(
        f"/documents/{document_id}/search",
        params={"term": "LexAI"},
    )

    assert search_response.status_code == 200
    search_payload = search_response.json()
    assert "results" in search_payload
    assert isinstance(search_payload["results"], list)
    assert search_payload["results"]

    first_result = search_payload["results"][0]
    assert "chunk_text" in first_result
    assert "score" in first_result
