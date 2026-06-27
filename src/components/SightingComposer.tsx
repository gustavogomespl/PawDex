import { Camera, ImageUp, Plus, X } from "lucide-react";
import { type CSSProperties, type ChangeEvent, useRef, useState } from "react";
import type { PetDetection } from "@/domain/detection/types";
import { analyzePetSighting } from "@/domain/matching/client";
import type {
  MatchCandidate,
  MatchRecommendation,
} from "@/domain/matching/types";
import type { Species } from "@/domain/pawdex/types";

type ExistingSightingPayload = {
  analysisId: string;
  animalId: string;
  photoUrl: string;
  matchConfidence: number;
};

type NewAnimalPayload = {
  analysisId: string;
  displayName: string;
  species: Species;
  photoUrl: string;
};

type SightingComposerProps = {
  placeId: string;
  onAddToExisting: (payload: ExistingSightingPayload) => void;
  onCreateNew: (payload: NewAnimalPayload) => void;
  onCancel: () => void;
  onWarning: (message: string) => void;
};

export function SightingComposer({
  placeId,
  onAddToExisting,
  onCreateNew,
  onCancel,
  onWarning,
}: SightingComposerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const analysisRequestIdRef = useRef(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [detectionStatus, setDetectionStatus] = useState<
    "idle" | "loading" | "success" | "empty" | "error"
  >("idle");
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null);
  const [bestDetection, setBestDetection] = useState<PetDetection | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [matches, setMatches] = useState<MatchCandidate[]>([]);
  const [recommendation, setRecommendation] =
    useState<MatchRecommendation | null>(null);
  const [newName, setNewName] = useState("");
  const [species, setSpecies] = useState<Species>("cat");

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !file.type.startsWith("image/")) {
      onWarning("Escolha um arquivo de imagem valido.");
      return;
    }

    const requestId = startNewImageRequest();
    resetImageAnalysis();
    const dataUrl = await readFileAsDataUrl(file);

    if (!isCurrentImageRequest(requestId)) {
      return;
    }

    setPhotoUrl(dataUrl);
    setImageSize(null);
    await runDetection(file, requestId);
  }

  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      onWarning("Camera indisponivel neste navegador. Use upload de imagem.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCameraStream(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      onWarning("Nao foi possivel abrir a camera. Use upload de imagem.");
    }
  }

  async function captureFromCamera() {
    const video = videoRef.current;

    if (!video) {
      onWarning("Camera ainda nao esta pronta.");
      return;
    }

    const requestId = startNewImageRequest();
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const context = canvas.getContext("2d");
    context?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    resetImageAnalysis();
    setPhotoUrl(dataUrl);
    setImageSize(null);
    stopCamera();
    await runDetection(dataUrlToFile(dataUrl, "camera-sighting.png"), requestId);
  }

  function stopCamera() {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
  }

  function handleCreateNew() {
    const name = newName.trim();

    if (!photoUrl || !name) {
      onWarning("Informe foto e nome para cadastrar um novo animal.");
      return;
    }

    if (!analysisId) {
      onWarning("Analise a foto antes de confirmar o avistamento.");
      return;
    }

    onCreateNew({ analysisId, displayName: name, species, photoUrl });
  }

  function handleConfirmMatch(match: MatchCandidate) {
    if (!analysisId || !photoUrl) {
      onWarning("Analise a foto antes de confirmar o avistamento.");
      return;
    }

    onAddToExisting({
      analysisId,
      animalId: match.animalId,
      photoUrl,
      matchConfidence: match.score,
    });
  }

  function startNewImageRequest() {
    const requestId = analysisRequestIdRef.current + 1;
    analysisRequestIdRef.current = requestId;
    return requestId;
  }

  function isCurrentImageRequest(requestId: number) {
    return requestId === analysisRequestIdRef.current;
  }

  function resetImageAnalysis() {
    setPhotoUrl(null);
    setImageSize(null);
    setDetectionStatus("idle");
    setDetectionMessage(null);
    setBestDetection(null);
    setAnalysisId(null);
    setMatches([]);
    setRecommendation(null);
  }

  async function runDetection(file: File, requestId: number) {
    if (!isCurrentImageRequest(requestId)) {
      return;
    }

    setDetectionStatus("loading");
    setDetectionMessage("Analisando imagem...");
    setBestDetection(null);
    setAnalysisId(null);
    setMatches([]);
    setRecommendation(null);

    try {
      const response = await analyzePetSighting(file, placeId);

      if (!isCurrentImageRequest(requestId)) {
        return;
      }

      setAnalysisId(response.analysisId);
      setMatches(response.matches);
      setRecommendation(response.recommendation);

      if (!response.detection || response.recommendation === "no_pet_detected") {
        setDetectionStatus("empty");
        setDetectionMessage("Nenhum gato ou cachorro detectado.");
        return;
      }

      setBestDetection(response.detection);
      setSpecies(response.detection.species);
      setDetectionStatus("success");
      setDetectionMessage(
        `${formatSpecies(response.detection.species)} detectado, ${formatConfidence(
          response.detection.confidence,
        )}`,
      );
    } catch {
      if (!isCurrentImageRequest(requestId)) {
        return;
      }

      setDetectionStatus("error");
      setDetectionMessage("Nao foi possivel analisar a imagem agora.");
      onWarning("Nao foi possivel analisar a imagem agora.");
    }
  }

  return (
    <section className="composer" aria-label="Registrar avistamento">
      <div className="composer__header">
        <h2>Registrar avistamento</h2>
        <button className="icon-button" type="button" onClick={onCancel}>
          <X aria-hidden="true" size={18} />
          <span>Fechar</span>
        </button>
      </div>

      <div className="media-actions">
        <label className="secondary-action">
          <ImageUp aria-hidden="true" size={18} />
          Enviar imagem
          <input accept="image/*" type="file" onChange={handleFileChange} />
        </label>
        <button className="secondary-action" type="button" onClick={openCamera}>
          <Camera aria-hidden="true" size={18} />
          Abrir camera
        </button>
      </div>

      <video
        ref={videoRef}
        className={cameraStream ? "camera-preview" : "camera-preview is-hidden"}
        autoPlay
        muted
        playsInline
      />
      {cameraStream ? (
        <button className="primary-action" type="button" onClick={captureFromCamera}>
          <Camera aria-hidden="true" size={18} />
          Capturar foto
        </button>
      ) : null}

      {photoUrl ? (
        <div className="selected-photo">
          <img
            src={photoUrl}
            alt="Foto selecionada"
            onLoad={(event) => {
              setImageSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              });
            }}
          />
          {bestDetection ? (
            <span
              className="detection-box"
              data-testid="detection-box"
              style={getDetectionBoxStyle(bestDetection, imageSize)}
            />
          ) : null}
        </div>
      ) : null}

      {photoUrl ? (
        <div className="match-panel">
          {detectionMessage ? (
            <p
              aria-live="polite"
              className={`detection-status detection-status--${detectionStatus}`}
            >
              {detectionMessage}
            </p>
          ) : null}

          <h3>Possiveis matches</h3>
          {recommendation && recommendation !== "no_pet_detected" ? (
            <p className="matching-recommendation">
              {formatRecommendation(recommendation, matches[0])}
            </p>
          ) : null}
          <div className="match-list">
            {matches.map((animal) => (
              <button
                key={animal.animalId}
                type="button"
                onClick={() => handleConfirmMatch(animal)}
              >
                <img src={animal.primaryPhotoUrl} alt="" />
                <span>Confirmar como {animal.displayName}</span>
              </button>
            ))}
          </div>
          <div className="new-animal-form">
            <label>
              Nome do animal
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
            </label>
            <label>
              Especie
              <select
                value={species}
                onChange={(event) => setSpecies(event.target.value as Species)}
              >
                <option value="cat">Gato</option>
                <option value="dog">Cachorro</option>
              </select>
            </label>
            <button className="primary-action" type="button" onClick={handleCreateNew}>
              <Plus aria-hidden="true" size={18} />
              Cadastrar novo
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [metadata, content] = dataUrl.split(",");
  const mimeType = metadata.match(/data:(.*);base64/)?.[1] ?? "image/png";
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], fileName, { type: mimeType });
}

function formatSpecies(species: Species): string {
  return species === "cat" ? "Gato" : "Cachorro";
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function formatRecommendation(
  recommendation: MatchRecommendation,
  firstMatch: MatchCandidate | undefined,
): string {
  if (recommendation === "needs_better_photo") {
    return "Foto com baixa qualidade para matching. Tente outra imagem ou cadastre manualmente.";
  }

  if (recommendation === "probably_new") {
    return "Parece ser um animal novo neste local.";
  }

  if (recommendation === "possible_existing" && firstMatch) {
    return `Parece ser ${firstMatch.displayName}, ${formatConfidence(
      firstMatch.score,
    )} de similaridade.`;
  }

  return "Possivel match encontrado. Revise antes de confirmar.";
}

function getDetectionBoxStyle(
  detection: PetDetection,
  imageSize: { width: number; height: number } | null,
): CSSProperties {
  const width = imageSize?.width ?? Math.max(detection.box.x2, 1);
  const height = imageSize?.height ?? Math.max(detection.box.y2, 1);

  return {
    left: `${(detection.box.x1 / width) * 100}%`,
    top: `${(detection.box.y1 / height) * 100}%`,
    width: `${((detection.box.x2 - detection.box.x1) / width) * 100}%`,
    height: `${((detection.box.y2 - detection.box.y1) / height) * 100}%`,
  };
}
