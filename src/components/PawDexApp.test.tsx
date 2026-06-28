import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAWDEX_STORAGE_KEY } from "@/domain/pawdex/storage";
import { demoState } from "@/domain/pawdex/seed";
import type { PawDexState } from "@/domain/pawdex/types";
import { PawDexApp } from "./PawDexApp";

const activePlaceId = "place-office-centro";

type FetchCall = {
  url: string;
  init: RequestInit | undefined;
};

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function createFetchRouter() {
  const calls: FetchCall[] = [];
  const handlers = new Map<
    string,
    (init: RequestInit | undefined) => unknown | Promise<unknown>
  >();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = url.split("?")[0];
    const handler = handlers.get(route);

    if (!handler) {
      throw new Error(`Unhandled fetch: ${url}`);
    }

    return handler(init);
  });

  vi.stubGlobal("fetch", fetchMock);

  return {
    calls,
    fetchMock,
    on(
      route: string,
      handler: (init: RequestInit | undefined) => unknown | Promise<unknown>,
    ) {
      handlers.set(route, handler);
    },
  };
}

function stateWithConfirmedMingauSighting(photoUrl = "data:image/png;base64,cGV0") {
  return {
    ...demoState,
    animals: demoState.animals.map((animal) =>
      animal.id === "animal-mingau"
        ? { ...animal, lastSeenAt: "2026-06-27T10:00:00.000Z" }
        : animal,
    ),
    sightings: [
      ...demoState.sightings,
      {
        id: "sighting-confirmed-mingau",
        placeId: activePlaceId,
        animalId: "animal-mingau",
        photoUrl,
        zoneLabel: "Area comum",
        takenAt: "2026-06-27T10:00:00.000Z",
        matchConfidence: 0.86,
        reviewStatus: "confirmed" as const,
      },
    ],
  };
}

function stateWithNewAnimal(photoUrl = "data:image/png;base64,cGV0") {
  const animalId = "animal-nina";

  return {
    ...demoState,
    animals: [
      ...demoState.animals,
      {
        id: animalId,
        placeId: activePlaceId,
        species: "cat" as const,
        displayName: "Nina",
        status: "unknown" as const,
        description: "Novo animal cadastrado pela confirmacao.",
        colorTags: ["rajado"],
        rarityLabel: "Novo",
        primaryPhotoUrl: photoUrl,
        firstSeenAt: "2026-06-27T11:00:00.000Z",
        lastSeenAt: "2026-06-27T11:00:00.000Z",
      },
    ],
    sightings: [
      ...demoState.sightings,
      {
        id: "sighting-nina-001",
        placeId: activePlaceId,
        animalId,
        photoUrl,
        zoneLabel: "Area comum",
        takenAt: "2026-06-27T11:00:00.000Z",
        matchConfidence: null,
        reviewStatus: "confirmed" as const,
      },
    ],
    albumSlots: demoState.albumSlots.map((slot) =>
      slot.slotNumber === 8
        ? {
            ...slot,
            animalId,
            isDiscovered: true,
          }
        : slot,
    ),
  };
}

function stubStateLoad(router: ReturnType<typeof createFetchRouter>, state: PawDexState) {
  router.on("/api/pawdex/state", () => jsonResponse(state));
}

describe("PawDexApp", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("loads PawDex state from the API before showing the album", async () => {
    const router = createFetchRouter();
    const remoteStateLoad = deferred<PawDexState>();
    router.on("/api/pawdex/state", async () =>
      jsonResponse(await remoteStateLoad.promise),
    );

    render(<PawDexApp placeId={activePlaceId} />);

    expect(screen.getByText("Carregando PawDex...")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Escritorio Centro" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Mingau")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /registrar avistamento/i }),
    ).not.toBeInTheDocument();
    expect(
      router.fetchMock,
    ).toHaveBeenCalledWith(`/api/pawdex/state?placeId=${activePlaceId}`);

    remoteStateLoad.resolve(demoState);

    expect(
      await screen.findByRole("heading", { name: "Escritorio Centro" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Mingau").length).toBeGreaterThan(0);
  });

  it("uses local storage when remote state fetch fails", async () => {
    const router = createFetchRouter();
    router.on("/api/pawdex/state", () => Promise.reject(new Error("offline")));
    const savedState = {
      ...demoState,
      animals: [
        ...demoState.animals,
        {
          ...demoState.animals[0],
          id: "animal-saved-nina",
          displayName: "Saved Nina",
          lastSeenAt: "2026-06-27T09:00:00.000Z",
        },
      ],
      albumSlots: demoState.albumSlots.map((slot) =>
        slot.slotNumber === 8
          ? {
              ...slot,
              animalId: "animal-saved-nina",
              isDiscovered: true,
            }
          : slot,
      ),
    };
    window.localStorage.setItem(PAWDEX_STORAGE_KEY, JSON.stringify(savedState));

    render(<PawDexApp placeId={activePlaceId} />);

    expect((await screen.findAllByText("Saved Nina")).length).toBeGreaterThan(0);
    expect(screen.getByText("8/12 encontrados")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Nao foi possivel carregar a PawDex remota\. Usando dados locais\./i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/Usando dados locais/i);
  });

  it("does not fall back to local storage when the user cannot access the place", async () => {
    const router = createFetchRouter();
    router.on("/api/pawdex/state", () =>
      jsonResponse(
        {
          places: [],
          animals: [],
          sightings: [],
          albumSlots: [],
          error: "Sem permissao para acessar este lugar.",
        },
        false,
        403,
      ),
    );
    const savedState = {
      ...demoState,
      animals: [
        ...demoState.animals,
        {
          ...demoState.animals[0],
          id: "animal-saved-nina",
          displayName: "Saved Nina",
          lastSeenAt: "2026-06-27T09:00:00.000Z",
        },
      ],
    };
    window.localStorage.setItem(PAWDEX_STORAGE_KEY, JSON.stringify(savedState));

    render(<PawDexApp placeId={activePlaceId} />);

    expect(
      await screen.findByText("Sem permissao para acessar este lugar."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Saved Nina")).not.toBeInTheDocument();
  });

  it("does not cache remote state in local storage", async () => {
    const router = createFetchRouter();
    stubStateLoad(router, demoState);

    render(<PawDexApp placeId={activePlaceId} />);

    await screen.findByRole("heading", { name: "Escritorio Centro" });

    expect(window.localStorage.getItem(PAWDEX_STORAGE_KEY)).toBeNull();
  });

  it("applies confirmed sighting state returned by the API", async () => {
    const user = userEvent.setup();
    const router = createFetchRouter();
    const confirmBodies: unknown[] = [];
    stubStateLoad(router, demoState);
    router.on("/api/analyze-sighting", () =>
      jsonResponse({
        analysisId: "analysis-existing-1",
        detection: {
          species: "cat",
          label: "cat",
          confidence: 0.91,
          box: { x1: 5, y1: 6, x2: 70, y2: 80 },
        },
        embedding: { modelVersion: "clip-test", qualityScore: 0.82 },
        matches: [
          {
            animalId: "animal-mingau",
            displayName: "Mingau",
            species: "cat",
            primaryPhotoUrl: "/mingau.png",
            score: 0.86,
          },
        ],
        recommendation: "possible_existing",
      }),
    );
    router.on("/api/confirm-sighting", (init) => {
      const body = JSON.parse(String(init?.body));
      confirmBodies.push(body);
      return jsonResponse({
        state: stateWithConfirmedMingauSighting(body.photoUrl),
        selectedAnimalId: "animal-mingau",
      });
    });
    render(<PawDexApp placeId={activePlaceId} />);

    await screen.findByRole("heading", { name: "Escritorio Centro" });
    await user.click(
      screen.getByRole("button", { name: /registrar avistamento/i }),
    );
    await user.upload(
      screen.getByLabelText(/enviar imagem/i),
      new File(["pet"], "pet.png", { type: "image/png" }),
    );
    await user.click(
      await screen.findByRole("button", { name: /confirmar como mingau/i }),
    );

    await waitFor(() =>
      expect(
        screen.queryByLabelText("Registrar avistamento"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Avistamento salvo na PawDex.")).toBeInTheDocument();
    expect(screen.getAllByText("Area comum").length).toBeGreaterThan(0);
    expect(confirmBodies[0]).toEqual(
      expect.objectContaining({
        decision: "existing",
        analysisId: "analysis-existing-1",
        animalId: "animal-mingau",
        matchConfidence: 0.86,
        photoUrl: expect.stringContaining("data:image/png"),
        placeId: activePlaceId,
      }),
    );
  });

  it("creates a new animal through the confirmation API", async () => {
    const user = userEvent.setup();
    const router = createFetchRouter();
    const confirmBodies: unknown[] = [];
    stubStateLoad(router, demoState);
    router.on("/api/analyze-sighting", () =>
      jsonResponse({
        analysisId: "analysis-new-1",
        detection: {
          species: "cat",
          label: "cat",
          confidence: 0.8,
          box: { x1: 5, y1: 6, x2: 70, y2: 80 },
        },
        embedding: { modelVersion: "clip-test", qualityScore: 0.78 },
        matches: [],
        recommendation: "probably_new",
      }),
    );
    router.on("/api/confirm-sighting", (init) => {
      const body = JSON.parse(String(init?.body));
      confirmBodies.push(body);
      return jsonResponse({
        state: stateWithNewAnimal(body.photoUrl),
        selectedAnimalId: "animal-nina",
      });
    });
    render(<PawDexApp placeId={activePlaceId} />);

    await screen.findByRole("heading", { name: "Escritorio Centro" });
    await user.click(
      screen.getByRole("button", { name: /registrar avistamento/i }),
    );
    await user.upload(
      screen.getByLabelText(/enviar imagem/i),
      new File(["pet"], "pet.png", { type: "image/png" }),
    );
    await user.type(await screen.findByLabelText(/nome do animal/i), "Nina");
    await user.click(screen.getByRole("button", { name: /cadastrar novo/i }));

    expect((await screen.findAllByText("Nina")).length).toBeGreaterThan(0);
    expect(screen.getByText("8/12 encontrados")).toBeInTheDocument();
    expect(screen.getByText("Novo animal adicionado ao album.")).toBeInTheDocument();
    expect(confirmBodies[0]).toEqual(
      expect.objectContaining({
        decision: "new",
        displayName: "Nina",
        species: "cat",
        analysisId: "analysis-new-1",
        placeId: activePlaceId,
      }),
    );
  });

  it("keeps the composer open and shows a warning when confirmation fails", async () => {
    const user = userEvent.setup();
    const router = createFetchRouter();
    stubStateLoad(router, demoState);
    router.on("/api/analyze-sighting", () =>
      jsonResponse({
        analysisId: "analysis-existing-fail",
        detection: {
          species: "cat",
          label: "cat",
          confidence: 0.91,
          box: { x1: 5, y1: 6, x2: 70, y2: 80 },
        },
        embedding: { modelVersion: "clip-test", qualityScore: 0.82 },
        matches: [
          {
            animalId: "animal-mingau",
            displayName: "Mingau",
            species: "cat",
            primaryPhotoUrl: "/mingau.png",
            score: 0.86,
          },
        ],
        recommendation: "possible_existing",
      }),
    );
    router.on("/api/confirm-sighting", () =>
      jsonResponse(
        {
          state: demoState,
          selectedAnimalId: "",
          error: "offline",
        },
        false,
      ),
    );
    render(<PawDexApp placeId={activePlaceId} />);

    await screen.findByRole("heading", { name: "Escritorio Centro" });
    await user.click(
      screen.getByRole("button", { name: /registrar avistamento/i }),
    );
    await user.upload(
      screen.getByLabelText(/enviar imagem/i),
      new File(["pet"], "pet.png", { type: "image/png" }),
    );
    await user.click(
      await screen.findByRole("button", { name: /confirmar como mingau/i }),
    );

    expect(
      await screen.findByText("Nao foi possivel salvar o avistamento agora."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Registrar avistamento")).toBeInTheDocument();
  });
});
