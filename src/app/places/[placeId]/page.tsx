import { PawDexApp } from "@/components/PawDexApp";

export default async function PlaceAlbumPage({
  params,
}: {
  params: Promise<{ placeId: string }>;
}) {
  const { placeId } = await params;
  return <PawDexApp placeId={placeId} />;
}
