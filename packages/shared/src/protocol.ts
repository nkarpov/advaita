import type { AgentSessionEvent, SessionEntry, SessionHeader } from "@mariozechner/pi-coding-agent";
import { z } from "zod";
import type {
  ClientPresence,
  ModelRef,
  RuntimeModelState,
  SessionMetadata,
  SessionSnapshot,
  StreamedTurnEvent,
  SubmittedTurn,
  ThinkingLevel,
  TurnAssignment,
  TurnCommit,
} from "./types.js";

const thinkingLevelSchema = z.enum(["off", "minimal", "low", "medium", "high", "xhigh"] satisfies [ThinkingLevel, ...ThinkingLevel[]]);

const modelRefSchema: z.ZodType<ModelRef> = z.object({
  provider: z.string().min(1),
  modelId: z.string().min(1),
  name: z.string().nullable().optional(),
});

const runtimeModelStateSchema: z.ZodType<RuntimeModelState> = z.object({
  currentModel: modelRefSchema.nullable(),
  availableModels: z.array(modelRefSchema),
  thinkingLevel: thinkingLevelSchema.nullable(),
});

const clientPresenceSchema: z.ZodType<ClientPresence> = z.object({
  clientId: z.string().min(1),
  runtimeId: z.string().min(1),
  displayName: z.string().min(1),
  cwd: z.string().min(1),
  connectedAt: z.string().min(1),
  lastSeenAt: z.string().min(1),
  typing: z.boolean(),
  executing: z.boolean(),
  modelState: runtimeModelStateSchema,
});

const sessionMetadataSchema: z.ZodType<SessionMetadata> = z.object({
  name: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  revision: z.number().int().nonnegative(),
  currentRuntimeId: z.string().nullable(),
  activeTurnId: z.string().nullable(),
});

const sessionHeaderSchema: z.ZodType<SessionHeader> = z.object({
  type: z.literal("session"),
  version: z.number().optional(),
  id: z.string().min(1),
  timestamp: z.string().min(1),
  cwd: z.string().min(1),
  parentSession: z.string().optional(),
});

const sessionEntrySchema = z.custom<SessionEntry>((value) => {
  return typeof value === "object" && value !== null && "type" in value && "id" in value;
}, { message: "Invalid session entry" });

const sessionSnapshotSchema: z.ZodType<SessionSnapshot> = z.object({
  header: sessionHeaderSchema,
  entries: z.array(sessionEntrySchema),
  metadata: sessionMetadataSchema,
});

const submittedTurnSchema: z.ZodType<SubmittedTurn> = z.object({
  turnId: z.string().min(1),
  text: z.string(),
  originClientId: z.string().min(1),
  originRuntimeId: z.string().min(1),
  originCwd: z.string().min(1),
  submittedAt: z.string().min(1),
  requestedRuntimeId: z.string().nullable(),
  requestedModelQuery: z.string().nullable(),
});

const turnAssignmentSchema: z.ZodType<TurnAssignment> = z.object({
  turnId: z.string().min(1),
  text: z.string(),
  originClientId: z.string().min(1),
  originRuntimeId: z.string().min(1),
  originCwd: z.string().min(1),
  submittedAt: z.string().min(1),
  requestedRuntimeId: z.string().nullable(),
  requestedModelQuery: z.string().nullable(),
  sessionName: z.string().min(1),
  snapshot: sessionSnapshotSchema,
  executionRuntimeId: z.string().min(1),
  executionClientId: z.string().min(1),
  executionCwd: z.string().min(1),
  queuedAt: z.string().min(1),
});

const agentSessionEventSchema = z.custom<AgentSessionEvent>((value) => {
  return typeof value === "object" && value !== null && "type" in value;
}, { message: "Invalid agent session event" });

const streamedTurnEventSchema: z.ZodType<StreamedTurnEvent> = z.object({
  turnId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  runtimeId: z.string().min(1),
  clientId: z.string().min(1),
  executionCwd: z.string().min(1),
  observedAt: z.string().min(1),
  event: agentSessionEventSchema,
});

const turnCommitSchema: z.ZodType<TurnCommit> = z.object({
  turnId: z.string().min(1),
  executionRuntimeId: z.string().min(1),
  executionClientId: z.string().min(1),
  executionCwd: z.string().min(1),
  committedAt: z.string().min(1),
  sessionRevision: z.number().int().nonnegative(),
  entries: z.array(sessionEntrySchema),
  modelState: runtimeModelStateSchema,
});

export const clientHelloSchema = z.object({
  type: z.literal("client.hello"),
  sessionName: z.string().min(1),
  clientId: z.string().min(1),
  runtimeId: z.string().min(1),
  displayName: z.string().min(1),
  cwd: z.string().min(1),
  modelState: runtimeModelStateSchema,
});

export const clientSubmitSchema = z.object({
  type: z.literal("client.submit"),
  text: z.string(),
});

export const clientTypingSchema = z.object({
  type: z.literal("client.typing"),
  typing: z.boolean(),
});

export const clientSwitchRuntimeSchema = z.object({
  type: z.literal("client.switch_runtime"),
  runtimeId: z.string().min(1),
});

export const clientRuntimeModelStateSchema = z.object({
  type: z.literal("client.runtime.model_state"),
  modelState: runtimeModelStateSchema,
});

export const clientTurnStreamSchema = z.object({
  type: z.literal("client.turn.stream"),
  stream: streamedTurnEventSchema,
});

export const clientTurnCommitSchema = z.object({
  type: z.literal("client.turn.commit"),
  commit: turnCommitSchema,
});

export const clientTurnErrorSchema = z.object({
  type: z.literal("client.turn.error"),
  turnId: z.string().min(1),
  error: z.string().min(1),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  clientHelloSchema,
  clientSubmitSchema,
  clientTypingSchema,
  clientSwitchRuntimeSchema,
  clientRuntimeModelStateSchema,
  clientTurnStreamSchema,
  clientTurnCommitSchema,
  clientTurnErrorSchema,
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const brokerSnapshotSchema = z.object({
  type: z.literal("broker.snapshot"),
  session: sessionSnapshotSchema,
  presence: z.array(clientPresenceSchema),
  queuedCount: z.number().int().nonnegative(),
  activeTurnId: z.string().nullable(),
  executorRuntimeId: z.string().nullable(),
  executorClientId: z.string().nullable(),
  executionCwd: z.string().nullable(),
});

export const brokerPresenceSchema = z.object({
  type: z.literal("broker.presence"),
  presence: z.array(clientPresenceSchema),
  queuedCount: z.number().int().nonnegative(),
  activeTurnId: z.string().nullable(),
});

export const brokerSessionEntriesSchema = z.object({
  type: z.literal("broker.session.entries"),
  entries: z.array(sessionEntrySchema),
  metadata: sessionMetadataSchema,
});

export const brokerSessionCommitSchema = z.object({
  type: z.literal("broker.session.commit"),
  commit: turnCommitSchema,
  metadata: sessionMetadataSchema,
});

export const brokerTurnAssignedSchema = z.object({
  type: z.literal("broker.turn.assigned"),
  assignment: turnAssignmentSchema,
});

export const brokerTurnStreamSchema = z.object({
  type: z.literal("broker.turn.stream"),
  stream: streamedTurnEventSchema,
});

export const brokerTurnStateSchema = z.object({
  type: z.literal("broker.turn.state"),
  activeTurnId: z.string().nullable(),
  queuedCount: z.number().int().nonnegative(),
  currentRuntimeId: z.string().nullable(),
  executorRuntimeId: z.string().nullable(),
  executorClientId: z.string().nullable(),
  executionCwd: z.string().nullable(),
});

export const brokerNoticeSchema = z.object({
  type: z.literal("broker.notice"),
  level: z.enum(["info", "warning", "error"]),
  message: z.string().min(1),
});

export const brokerMessageSchema = z.discriminatedUnion("type", [
  brokerSnapshotSchema,
  brokerPresenceSchema,
  brokerSessionEntriesSchema,
  brokerSessionCommitSchema,
  brokerTurnAssignedSchema,
  brokerTurnStreamSchema,
  brokerTurnStateSchema,
  brokerNoticeSchema,
]);

export type BrokerMessage = z.infer<typeof brokerMessageSchema>;

export function serializeProtocolMessage(message: ClientMessage | BrokerMessage): string {
  return `${JSON.stringify(message)}\n`;
}

export function parseClientMessage(raw: string): ClientMessage {
  return clientMessageSchema.parse(JSON.parse(raw));
}

export function parseBrokerMessage(raw: string): BrokerMessage {
  return brokerMessageSchema.parse(JSON.parse(raw));
}
