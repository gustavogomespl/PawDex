import { Camera, ImageUp, Plus, X } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import type { Animal, Species } from "@/domain/pawdex/types";

type ExistingSightingPayload = {
  animalId: string;
  photoUrl: string;
};

type NewAnimalPayload = {
  displayName: string;
  species: Species;
  photoUrl: string;
};

type SightingComposerProps = {
  suggestions: Animal[];
  onAddToExisting: (payload: ExistingSightingPayload) => void;
  onCreateNew: (payload: NewAnimalPayload) => void;
  onCancel: () => void;
  onWarning: (message: string) => void;
};

export function SightingComposer({
  suggestions,
  onAddToExisting,
  onCreateNew,
  onCancel,
  onWarning,
}: SightingComposerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [newName, setNewName] = useState("");
  const [species, setSpecies] = useState<Species>("cat");

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !file.type.startsWith("image/")) {
      onWarning("Escolha um arquivo de imagem valido.");
      return;
    }

    setPhotoUrl(await readFileAsDataUrl(file));
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

  function captureFromCamera() {
    const video = videoRef.current;

    if (!video) {
      onWarning("Camera ainda nao esta pronta.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const context = canvas.getContext("2d");
    context?.drawImage(video, 0, 0, canvas.width, canvas.height);
    setPhotoUrl(canvas.toDataURL("image/png"));
    stopCamera();
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

    onCreateNew({ displayName: name, species, photoUrl });
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
          <img src={photoUrl} alt="Foto selecionada" />
        </div>
      ) : null}

      {photoUrl ? (
        <div className="match-panel">
          <h3>Possiveis matches</h3>
          <div className="match-list">
            {suggestions.map((animal) => (
              <button
                key={animal.id}
                type="button"
                onClick={() => onAddToExisting({ animalId: animal.id, photoUrl })}
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
