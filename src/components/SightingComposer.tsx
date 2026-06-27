import { Camera, ImageUp, Plus, X } from "lucide-react";
import {
  type CSSProperties,
  type ChangeEvent,
  useEffect,
  useRef,
  useState,
} from "react";
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
  onAddToExisting: (payload: ExistingSightingPayload) => void | Promise<void>;
  onCreateNew: (payload: NewAnimalPayload) => void | Promise<void>;
  onCancel: () => void;
  onWarning: (message: string) => void;
};

const MAX_CAPTURE_DIMENSION = 1280;
const CAPTURE_QUALITY = 0.8;

export function SightingComposer({
  placeId,
  onAddToExisting,
  onCreateNew,
  onCancel,
  onWarning,
}: SightingComposerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(true);
  const submittingRef = useRef(false);
  const analysisRequestIdRef = useRef(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !file.type.startsWith("image/")) {
      onWarning("Escolha um arquivo de imagem valido.");
      return;
    }

    stopCamera();
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
      streamRef.current = stream;
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
    const { width, height } = computeCaptureSize(
      video.videoWidth || 640,
      video.videoHeight || 480,
      MAX_CAPTURE_DIMENSION,
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context?.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", CAPTURE_QUALITY);
    resetImageAnalysis();
    setPhotoUrl(dataUrl);
    setImageSize(null);
    stopCamera();
    await runDetection(dataUrlToFile(dataUrl, "camera-sighting.jpg"), requestId);
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStream?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraStream(null);
  }

  async function handleCreateNew() {
    const name = newName.trim();

    if (!photoUrl || !name) {
      onWarning("Informe foto e nome para cadastrar um novo animal.");
      return;
    }

    if (!analysisId) {
      onWarning("Analise a foto antes de confirmar o avistamento.");
      return;
    }

    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      await onCreateNew({ analysisId, displayName: name, species, photoUrl });
    } finally {
      finishSubmitting();
    }
  }

  async function handleConfirmMatch(match: MatchCandidate) {
    if (!analysisId || !photoUrl) {
      onWarning("Analise a foto antes de confirmar o avistamento.");
      return;
    }

    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      await onAddToExisting({
        analysisId,
        animalId: match.animalId,
        photoUrl,
        matchConfidence: match.score,
      });
    } finally {
      finishSubmitting();
    }
  }

  function finishSubmitting() {
    if (isMountedRef.current) {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
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
                disabled={isSubmitting}
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
            <button
              className="primary-action"
              type="button"
              disabled={isSubmitting}
              onClick={handleCreateNew}
            >
              <Plus aria-hidden="true" size={18} />
              Cadastrar novo
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function computeCaptureSize(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  const safeWidth = Math.max(1, Math.floor(width) || 0);
  const safeHeight = Math.max(1, Math.floor(height) || 0);
  const longestSide = Math.max(safeWidth, safeHeight);

  if (longestSide <= maxDimension) {
    return { width: safeWidth, height: safeHeight };
  }

  const scale = maxDimension / longestSide;
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
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
