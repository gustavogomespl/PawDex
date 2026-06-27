# Python YOLO Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Dockerized Python FastAPI YOLO detector and integrate it into the PawDex sighting flow.

**Architecture:** The existing Next.js app remains the browser-facing service. A new `ml-api` FastAPI service owns image validation, YOLO inference, and cat/dog detection formatting. The browser calls the same-origin Next route `/api/detect`, which forwards the uploaded image to `ml-api` through Docker Compose.

**Tech Stack:** Next.js 16, React 19, Vitest, Python 3.12, FastAPI, Pytest, Pillow, Ultralytics YOLO, Docker Compose.

---

## File Structure

- Create `ml-api/requirements.txt`: Python runtime and test dependencies.
- Create `ml-api/app/__init__.py`: package marker.
- Create `ml-api/app/detection.py`: detection dataclasses, filtering, best detection, YOLO adapter.
- Create `ml-api/app/main.py`: FastAPI app, `/health`, `/detect`.
- Create `ml-api/tests/test_detection.py`: unit tests for filtering and best detection.
- Create `ml-api/tests/test_main.py`: API tests with fake detector.
- Create `src/domain/detection/types.ts`: frontend detection response types.
- Create `src/domain/detection/client.ts`: browser helper that posts image files to `/api/detect`.
- Create `src/app/api/detect/route.ts`: Next route that proxies image upload to Python.
- Create `src/app/api/detect/route.test.ts`: route tests using mocked `fetch`.
- Modify `src/components/SightingComposer.tsx`: call detection helper, show status, set detected species, draw bounding box.
- Modify `src/components/SightingComposer.test.tsx`: cover success, empty, and error states.
- Modify `src/components/PawDexApp.test.tsx`: keep existing full flow working with detection mocked.
- Modify `src/test/setup.ts`: reset fetch and mocks safely after tests.
- Create `Dockerfile`: web app container.
- Create `.dockerignore`: shared Docker ignore rules.
- Create `ml-api/Dockerfile`: Python API container.
- Create `compose.yaml`: `web` and `ml-api` services.
- Modify `README.md`: document Docker and non-Docker commands.

## Task 1: Python Detection Domain

**Files:**
- Create: `ml-api/requirements.txt`
- Create: `ml-api/app/__init__.py`
- Create: `ml-api/app/detection.py`
- Test: `ml-api/tests/test_detection.py`

- [ ] **Step 1: Add Python dependencies**

Create `ml-api/requirements.txt`:

```txt
fastapi==0.115.13
uvicorn[standard]==0.34.3
python-multipart==0.0.20
pillow==11.1.0
ultralytics==8.3.59
pytest==8.3.4
httpx==0.28.1
```

Create `ml-api/app/__init__.py` as an empty file.

- [ ] **Step 2: Write failing detection tests**

Create `ml-api/tests/test_detection.py`:

```python
from app.detection import (
    BoundingBox,
    RawDetection,
    build_detection_response,
    normalize_yolo_label,
)


def test_normalizes_pet_labels():
    assert normalize_yolo_label("cat") == "cat"
    assert normalize_yolo_label("dog") == "dog"
    assert normalize_yolo_label("person") is None


def test_filters_non_pet_detections_and_selects_best_detection():
    response = build_detection_response(
        [
            RawDetection("person", 0.99, BoundingBox(0, 0, 10, 10)),
            RawDetection("dog", 0.68, BoundingBox(10, 20, 110, 220)),
            RawDetection("cat", 0.91, BoundingBox(30, 40, 130, 240)),
        ]
    )

    assert [d.species for d in response.detections] == ["dog", "cat"]
    assert response.best_detection is not None
    assert response.best_detection.species == "cat"
    assert response.best_detection.confidence == 0.91
    assert response.best_detection.box.x1 == 30


def test_returns_null_best_detection_when_no_pet_is_detected():
    response = build_detection_response(
        [RawDetection("chair", 0.88, BoundingBox(0, 0, 10, 10))]
    )

    assert response.detections == []
    assert response.best_detection is None
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
cd ml-api
python -m pytest tests/test_detection.py -q
```

Expected: FAIL because `app.detection` does not exist.

- [ ] **Step 4: Implement detection domain**

Create `ml-api/app/detection.py`:

```python
from __future__ import annotations

import os
from dataclasses import dataclass
from io import BytesIO
from typing import Protocol

from PIL import Image, UnidentifiedImageError


@dataclass(frozen=True)
class BoundingBox:
    x1: float
    y1: float
    x2: float
    y2: float


@dataclass(frozen=True)
class RawDetection:
    label: str
    confidence: float
    box: BoundingBox


@dataclass(frozen=True)
class PetDetection:
    species: str
    label: str
    confidence: float
    box: BoundingBox


@dataclass(frozen=True)
class DetectionResponse:
    detections: list[PetDetection]
    best_detection: PetDetection | None


class Detector(Protocol):
    def detect(self, image: Image.Image) -> DetectionResponse:
        ...


def normalize_yolo_label(label: str) -> str | None:
    normalized = label.strip().lower()
    if normalized in {"cat", "dog"}:
        return normalized
    return None


def build_detection_response(raw_detections: list[RawDetection]) -> DetectionResponse:
    detections = [
        PetDetection(
            species=species,
            label=raw.label,
            confidence=max(0.0, min(1.0, raw.confidence)),
            box=raw.box,
        )
        for raw in raw_detections
        if (species := normalize_yolo_label(raw.label)) is not None
    ]
    best_detection = max(detections, key=lambda item: item.confidence, default=None)
    return DetectionResponse(detections=detections, best_detection=best_detection)


def load_image(image_bytes: bytes) -> Image.Image:
    try:
        image = Image.open(BytesIO(image_bytes))
        image.load()
        return image.convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("Unsupported or invalid image file.") from exc


class UltralyticsYoloDetector:
    def __init__(self, model_path: str | None = None, confidence: float | None = None):
        from ultralytics import YOLO

        self.model_path = model_path or os.getenv("PAWDEX_YOLO_MODEL", "yolo11n.pt")
        self.confidence = confidence or float(os.getenv("PAWDEX_YOLO_CONFIDENCE", "0.35"))
        self.model = YOLO(self.model_path)

    def detect(self, image: Image.Image) -> DetectionResponse:
        results = self.model.predict(
            source=image,
            imgsz=640,
            conf=self.confidence,
            save=False,
            verbose=False,
        )
        raw_detections: list[RawDetection] = []

        if not results:
            return build_detection_response(raw_detections)

        result = results[0]
        boxes = result.boxes
        if boxes is None:
            return build_detection_response(raw_detections)

        xyxy = boxes.xyxy.cpu().numpy()
        conf = boxes.conf.cpu().numpy()
        cls = boxes.cls.cpu().numpy().astype(int)

        for index, coordinates in enumerate(xyxy):
            class_id = int(cls[index])
            label = result.names.get(class_id, f"class_{class_id}")
            raw_detections.append(
                RawDetection(
                    label=label,
                    confidence=float(conf[index]),
                    box=BoundingBox(
                        x1=float(coordinates[0]),
                        y1=float(coordinates[1]),
                        x2=float(coordinates[2]),
                        y2=float(coordinates[3]),
                    ),
                )
            )

        return build_detection_response(raw_detections)
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
cd ml-api
python -m pytest tests/test_detection.py -q
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add ml-api/requirements.txt ml-api/app/__init__.py ml-api/app/detection.py ml-api/tests/test_detection.py
git commit -m "feat: add python pet detection domain"
```

## Task 2: FastAPI ML Service

**Files:**
- Create: `ml-api/app/main.py`
- Test: `ml-api/tests/test_main.py`

- [ ] **Step 1: Write failing API tests**

Create `ml-api/tests/test_main.py`:

```python
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from app.detection import BoundingBox, DetectionResponse, PetDetection
from app.main import create_app


class FakeDetector:
    def __init__(self, response: DetectionResponse):
        self.response = response
        self.calls = 0

    def detect(self, image):
        self.calls += 1
        assert image.mode == "RGB"
        return self.response


def make_png_bytes() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (12, 8), "white").save(buffer, format="PNG")
    return buffer.getvalue()


def test_health_returns_model_metadata():
    app = create_app(lambda: FakeDetector(DetectionResponse([], None)))
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["model"] == "configured"


def test_detect_returns_pet_detections():
    detector = FakeDetector(
        DetectionResponse(
            detections=[
                PetDetection(
                    species="cat",
                    label="cat",
                    confidence=0.87,
                    box=BoundingBox(1, 2, 10, 11),
                )
            ],
            best_detection=PetDetection(
                species="cat",
                label="cat",
                confidence=0.87,
                box=BoundingBox(1, 2, 10, 11),
            ),
        )
    )
    app = create_app(lambda: detector)
    client = TestClient(app)

    response = client.post(
        "/detect",
        files={"file": ("pet.png", make_png_bytes(), "image/png")},
    )

    assert response.status_code == 200
    assert detector.calls == 1
    assert response.json() == {
        "detections": [
            {
                "species": "cat",
                "label": "cat",
                "confidence": 0.87,
                "box": {"x1": 1, "y1": 2, "x2": 10, "y2": 11},
            }
        ],
        "bestDetection": {
            "species": "cat",
            "label": "cat",
            "confidence": 0.87,
            "box": {"x1": 1, "y1": 2, "x2": 10, "y2": 11},
        },
    }


def test_detect_rejects_invalid_image():
    app = create_app(lambda: FakeDetector(DetectionResponse([], None)))
    client = TestClient(app)

    response = client.post(
        "/detect",
        files={"file": ("not-image.txt", b"nope", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported or invalid image file."
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd ml-api
python -m pytest tests/test_main.py -q
```

Expected: FAIL because `app.main` does not exist.

- [ ] **Step 3: Implement FastAPI app**

Create `ml-api/app/main.py`:

```python
from __future__ import annotations

from collections.abc import Callable
from dataclasses import asdict

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.detection import Detector, UltralyticsYoloDetector, load_image


def create_app(detector_factory: Callable[[], Detector] | None = None) -> FastAPI:
    app = FastAPI(title="PawDex ML API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.detector_factory = detector_factory or UltralyticsYoloDetector
    app.state.detector = None

    def get_detector() -> Detector:
        if app.state.detector is None:
            app.state.detector = app.state.detector_factory()
        return app.state.detector

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "model": "configured"}

    @app.post("/detect")
    async def detect(file: UploadFile = File(...)) -> dict[str, object]:
        image_bytes = await file.read()
        try:
            image = load_image(image_bytes)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        result = get_detector().detect(image)
        return {
            "detections": [asdict(detection) for detection in result.detections],
            "bestDetection": asdict(result.best_detection)
            if result.best_detection is not None
            else None,
        }

    return app


app = create_app()
```

- [ ] **Step 4: Run API tests**

Run:

```bash
cd ml-api
python -m pytest tests/test_main.py -q
```

Expected: 3 passed.

- [ ] **Step 5: Run all Python tests**

Run:

```bash
cd ml-api
python -m pytest -q
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add ml-api/app/main.py ml-api/tests/test_main.py
git commit -m "feat: add fastapi detection service"
```

## Task 3: Next Detection Proxy Route

**Files:**
- Create: `src/domain/detection/types.ts`
- Create: `src/app/api/detect/route.ts`
- Test: `src/app/api/detect/route.test.ts`

- [ ] **Step 1: Write failing route tests**

Create `src/app/api/detect/route.test.ts`:

```ts
/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const successBody = {
  detections: [
    {
      species: "dog",
      label: "dog",
      confidence: 0.82,
      box: { x1: 1, y1: 2, x2: 30, y2: 40 },
    },
  ],
  bestDetection: {
    species: "dog",
    label: "dog",
    confidence: 0.82,
    box: { x1: 1, y1: 2, x2: 30, y2: 40 },
  },
};

describe("POST /api/detect", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards uploaded image to the ML API", async () => {
    vi.stubEnv("ML_API_URL", "http://ml-api:8000");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(successBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const formData = new FormData();
    formData.set("file", new File(["pet"], "pet.png", { type: "image/png" }));

    const response = await POST(new Request("http://localhost/api/detect", {
      method: "POST",
      body: formData,
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(successBody);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://ml-api:8000/detect",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
  });

  it("returns 400 when the browser request does not include a file", async () => {
    const response = await POST(new Request("http://localhost/api/detect", {
      method: "POST",
      body: new FormData(),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      detections: [],
      bestDetection: null,
      error: "Imagem obrigatoria.",
    });
  });

  it("returns 502 when the ML API is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const formData = new FormData();
    formData.set("file", new File(["pet"], "pet.png", { type: "image/png" }));

    const response = await POST(new Request("http://localhost/api/detect", {
      method: "POST",
      body: formData,
    }));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      detections: [],
      bestDetection: null,
      error: "Nao foi possivel analisar a imagem agora.",
    });
  });
});
```

- [ ] **Step 2: Run route tests to verify failure**

Run:

```bash
npm run test -- src/app/api/detect/route.test.ts
```

Expected: FAIL because `route.ts` does not exist.

- [ ] **Step 3: Add detection types**

Create `src/domain/detection/types.ts`:

```ts
export type DetectionSpecies = "cat" | "dog";

export type DetectionBox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type PetDetection = {
  species: DetectionSpecies;
  label: string;
  confidence: number;
  box: DetectionBox;
};

export type DetectionResponse = {
  detections: PetDetection[];
  bestDetection: PetDetection | null;
  error?: string;
};
```

- [ ] **Step 4: Implement proxy route**

Create `src/app/api/detect/route.ts`:

```ts
import { NextResponse } from "next/server";
import type { DetectionResponse } from "@/domain/detection/types";

const DEFAULT_ML_API_URL = "http://127.0.0.1:8000";

function emptyResponse(error: string): DetectionResponse {
  return { detections: [], bestDetection: null, error };
}

export async function POST(request: Request) {
  const incomingForm = await request.formData();
  const file = incomingForm.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(emptyResponse("Imagem obrigatoria."), { status: 400 });
  }

  const outgoingForm = new FormData();
  outgoingForm.set("file", file, file.name);
  const mlApiUrl = process.env.ML_API_URL ?? DEFAULT_ML_API_URL;

  try {
    const response = await fetch(`${mlApiUrl}/detect`, {
      method: "POST",
      body: outgoingForm,
    });

    if (!response.ok) {
      return NextResponse.json(
        emptyResponse("Nao foi possivel analisar a imagem agora."),
        { status: 502 },
      );
    }

    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json(
      emptyResponse("Nao foi possivel analisar a imagem agora."),
      { status: 502 },
    );
  }
}
```

- [ ] **Step 5: Run route tests**

Run:

```bash
npm run test -- src/app/api/detect/route.test.ts
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add src/domain/detection/types.ts src/app/api/detect/route.ts src/app/api/detect/route.test.ts
git commit -m "feat: proxy pet detection requests"
```

## Task 4: Frontend Detection Client and Composer UI

**Files:**
- Create: `src/domain/detection/client.ts`
- Modify: `src/components/SightingComposer.tsx`
- Modify: `src/components/SightingComposer.test.tsx`
- Modify: `src/components/PawDexApp.test.tsx`
- Modify: `src/test/setup.ts`

- [ ] **Step 1: Write failing SightingComposer tests**

Add these tests to `src/components/SightingComposer.test.tsx`:

```ts
import { detectPetImage } from "@/domain/detection/client";

vi.mock("@/domain/detection/client", () => ({
  detectPetImage: vi.fn(),
}));

const detectPetImageMock = vi.mocked(detectPetImage);
```

Add inside the `describe` block:

```ts
it("shows a successful dog detection and defaults new animal species", async () => {
  const user = userEvent.setup();
  detectPetImageMock.mockResolvedValue({
    detections: [
      {
        species: "dog",
        label: "dog",
        confidence: 0.87,
        box: { x1: 5, y1: 6, x2: 70, y2: 80 },
      },
    ],
    bestDetection: {
      species: "dog",
      label: "dog",
      confidence: 0.87,
      box: { x1: 5, y1: 6, x2: 70, y2: 80 },
    },
  });

  render(
    <SightingComposer
      suggestions={suggestions}
      onAddToExisting={vi.fn()}
      onCreateNew={vi.fn()}
      onCancel={vi.fn()}
      onWarning={vi.fn()}
    />,
  );

  await user.upload(
    screen.getByLabelText(/enviar imagem/i),
    new File(["pet"], "pet.png", { type: "image/png" }),
  );

  expect(await screen.findByText("Cachorro detectado, 87%")).toBeInTheDocument();
  expect(screen.getByLabelText(/especie/i)).toHaveValue("dog");
  expect(screen.getByTestId("detection-box")).toBeInTheDocument();
});

it("shows an empty detection state", async () => {
  const user = userEvent.setup();
  detectPetImageMock.mockResolvedValue({ detections: [], bestDetection: null });

  render(
    <SightingComposer
      suggestions={suggestions}
      onAddToExisting={vi.fn()}
      onCreateNew={vi.fn()}
      onCancel={vi.fn()}
      onWarning={vi.fn()}
    />,
  );

  await user.upload(
    screen.getByLabelText(/enviar imagem/i),
    new File(["pet"], "pet.png", { type: "image/png" }),
  );

  expect(
    await screen.findByText("Nenhum gato ou cachorro detectado."),
  ).toBeInTheDocument();
});

it("keeps manual flow available when detection fails", async () => {
  const user = userEvent.setup();
  const onWarning = vi.fn();
  detectPetImageMock.mockRejectedValue(new Error("offline"));

  render(
    <SightingComposer
      suggestions={suggestions}
      onAddToExisting={vi.fn()}
      onCreateNew={vi.fn()}
      onCancel={vi.fn()}
      onWarning={onWarning}
    />,
  );

  await user.upload(
    screen.getByLabelText(/enviar imagem/i),
    new File(["pet"], "pet.png", { type: "image/png" }),
  );

  expect(await screen.findByText("Nao foi possivel analisar a imagem agora.")).toBeInTheDocument();
  expect(screen.getByLabelText(/nome do animal/i)).toBeInTheDocument();
  expect(onWarning).toHaveBeenCalledWith("Nao foi possivel analisar a imagem agora.");
});
```

Update existing tests in this file to call `detectPetImageMock.mockResolvedValue({ detections: [], bestDetection: null })` before uploading.

- [ ] **Step 2: Run composer tests to verify failure**

Run:

```bash
npm run test -- src/components/SightingComposer.test.tsx
```

Expected: FAIL because `src/domain/detection/client.ts` does not exist and the UI has no detection states.

- [ ] **Step 3: Implement detection client**

Create `src/domain/detection/client.ts`:

```ts
import type { DetectionResponse } from "./types";

export async function detectPetImage(file: File): Promise<DetectionResponse> {
  const formData = new FormData();
  formData.set("file", file, file.name);

  const response = await fetch("/api/detect", {
    method: "POST",
    body: formData,
  });
  const body = (await response.json()) as DetectionResponse;

  if (!response.ok) {
    throw new Error(body.error ?? "Detection failed.");
  }

  return body;
}
```

- [ ] **Step 4: Update SightingComposer**

Modify `src/components/SightingComposer.tsx`:

- Import `detectPetImage`.
- Add state:
  - `selectedFile: File | null`
  - `detectionStatus: "idle" | "loading" | "success" | "empty" | "error"`
  - `detectionMessage: string | null`
  - `bestDetection: PetDetection | null`
- After upload, call `runDetection(file)` after setting the preview.
- When camera capture creates a data URL, convert it into a `File` or `Blob` and call the same detection path.
- On best detection, set `species` to the detected species.
- Render the detection panel and an absolutely positioned bounding box.

Use these helpers in the component:

```ts
function formatSpecies(species: Species): string {
  return species === "cat" ? "Gato" : "Cachorro";
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
```

- [ ] **Step 5: Update global test setup**

Modify the import in `src/test/setup.ts`:

```ts
import { afterEach, vi } from "vitest";
```

Then update the existing `afterEach` block to clear local storage and mocks:

```ts
afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});
```

- [ ] **Step 6: Update PawDexApp tests**

Mock the detection client at the top of `src/components/PawDexApp.test.tsx`:

```ts
import { detectPetImage } from "@/domain/detection/client";

vi.mock("@/domain/detection/client", () => ({
  detectPetImage: vi.fn(),
}));

const detectPetImageMock = vi.mocked(detectPetImage);
```

Before each flow that uploads a file, call:

```ts
detectPetImageMock.mockResolvedValue({ detections: [], bestDetection: null });
```

- [ ] **Step 7: Run UI tests**

Run:

```bash
npm run test -- src/components/SightingComposer.test.tsx src/components/PawDexApp.test.tsx
```

Expected: all selected tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/domain/detection/client.ts src/components/SightingComposer.tsx src/components/SightingComposer.test.tsx src/components/PawDexApp.test.tsx src/test/setup.ts
git commit -m "feat: show yolo detections in sighting flow"
```

## Task 5: Dockerize Web and ML Services

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `ml-api/Dockerfile`
- Create: `compose.yaml`
- Modify: `README.md`

- [ ] **Step 1: Create Docker files**

Create `.dockerignore`:

```txt
.git
.next
.superpowers
.worktrees
node_modules
next-env.d.ts
coverage
ml-api/.pytest_cache
ml-api/__pycache__
ml-api/**/__pycache__
```

Create `Dockerfile`:

```dockerfile
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]
```

Create `ml-api/Dockerfile`:

```dockerfile
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

RUN apt-get update \
  && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 curl \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Create `compose.yaml`:

```yaml
services:
  ml-api:
    build:
      context: ./ml-api
    environment:
      PAWDEX_YOLO_MODEL: ${PAWDEX_YOLO_MODEL:-yolo11n.pt}
      PAWDEX_YOLO_CONFIDENCE: ${PAWDEX_YOLO_CONFIDENCE:-0.35}
    ports:
      - "8000:8000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  web:
    build:
      context: .
    environment:
      ML_API_URL: http://ml-api:8000
    ports:
      - "3000:3000"
    depends_on:
      ml-api:
        condition: service_healthy
```

- [ ] **Step 2: Update README**

Add Docker commands:

```md
## Docker

```bash
docker compose up --build
```

Open:

- Web app: http://localhost:3000
- ML health: http://localhost:8000/health

The first YOLO request may download the configured model. Override it with:

```bash
PAWDEX_YOLO_MODEL=yolov8n.pt docker compose up --build
```

## Python ML API Without Docker

```bash
cd ml-api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
```

- [ ] **Step 3: Run existing tests**

Run:

```bash
npm run test
cd ml-api && python -m pytest -q
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile .dockerignore compose.yaml ml-api/Dockerfile README.md
git commit -m "chore: dockerize pawdex web and ml api"
```

## Task 6: Full Verification

**Files:**
- No new files unless verification exposes a bug.

- [ ] **Step 1: Run frontend tests**

Run:

```bash
npm run test
```

Expected: all Vitest tests pass.

- [ ] **Step 2: Run frontend build**

Run:

```bash
npm run build
```

Expected: Next.js build succeeds.

- [ ] **Step 3: Run Python tests**

Run:

```bash
cd ml-api && python -m pytest -q
```

Expected: all Pytest tests pass.

- [ ] **Step 4: Build Docker services**

Run:

```bash
docker compose build
```

Expected: `web` and `ml-api` images build successfully.

- [ ] **Step 5: Start Docker Compose**

Run:

```bash
docker compose up
```

Expected:

- `ml-api` healthcheck becomes healthy.
- `web` starts on `http://localhost:3000`.

- [ ] **Step 6: Probe services**

Run in another terminal:

```bash
curl http://localhost:8000/health
curl -I http://localhost:3000
```

Expected:

- ML health returns JSON with `status: ok`.
- Web returns `HTTP/1.1 200 OK`.

- [ ] **Step 7: Final status check**

Run:

```bash
git status --short
```

Expected: no tracked changes.
