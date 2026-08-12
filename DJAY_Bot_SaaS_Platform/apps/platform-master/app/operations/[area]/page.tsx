import { notFound } from "next/navigation";
import PlatformMasterPage from "../../page";
import { platformAreaKeys, type PlatformAreaKey } from "../../PlatformNavigation";

export default async function PlatformAreaPage({ params }: Readonly<{ params: Promise<{ area: string }> }>) {
  const { area } = await params;
  if (!platformAreaKeys.includes(area as PlatformAreaKey)) notFound();
  return <PlatformMasterPage searchParams={Promise.resolve({ area })} />;
}
