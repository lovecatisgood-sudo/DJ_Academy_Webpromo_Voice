type TimingFields = {
  route: string;
  conversationId?: string | null;
  channel?: string | null;
  dbMs?: number;
  modelMs?: number;
  analysisMs?: number;
  totalMs?: number;
  status?: string;
};

export function nowMs() {
  return Math.round(performance.now());
}

export function elapsedMs(startedAt: number) {
  return Math.max(0, nowMs() - startedAt);
}

export function logServerTiming(fields: TimingFields) {
  const payload = {
    route: fields.route,
    conversation_id: fields.conversationId || undefined,
    channel: fields.channel || undefined,
    db_ms: Math.round(fields.dbMs ?? 0),
    model_ms: Math.round(fields.modelMs ?? 0),
    analysis_ms: Math.round(fields.analysisMs ?? 0),
    total_ms: Math.round(fields.totalMs ?? 0),
    status: fields.status,
  };

  console.info("server_timing", payload);
}
