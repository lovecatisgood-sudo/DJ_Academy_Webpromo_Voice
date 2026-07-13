import { StatusPill } from "./StatusPill";

export function InterestPill({ value }: { value: string | null | undefined }) {
  if (value === "high") return <StatusPill tone="red">high interest</StatusPill>;
  if (value === "medium") return <StatusPill tone="amber">medium interest</StatusPill>;
  if (value === "low") return <StatusPill tone="slate">low interest</StatusPill>;
  return <StatusPill tone="slate">unknown interest</StatusPill>;
}
