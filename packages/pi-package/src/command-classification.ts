import type { InputSource } from "@mariozechner/pi-coding-agent";

export function shouldBrokerInput(input: {
  connected: boolean;
  source: InputSource;
  text: string;
  hasImages: boolean;
}): boolean {
  if (!input.connected) return false;
  if (input.source === "extension") return false;

  const trimmed = input.text.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return false;
  if (trimmed.startsWith("!")) return false;
  if (input.hasImages) return false;
  return true;
}

export function isDeferredSharedSessionCommand(commandName: string): boolean {
  return ["new", "resume", "tree", "fork"].includes(commandName);
}
