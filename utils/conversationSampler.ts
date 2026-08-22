import type { RawConversation, RawConversationNode } from './api';

export type LinearMessage = {
  index: number;
  role: 'user' | 'assistant';
  text: string;
};

export type EnrichedConversationRecord = {
  id: string;
  title: string;
  gizmo_id: string | null;
  create_time: string | null;
  update_time: string | null;
  message_count: number;
  user_message_count: number;
  sampled: boolean;
  sample_indices: number[];
  messages: LinearMessage[];
};

export type EnrichedConversationError = {
  id: string;
  title: string;
  error: string;
};

export type EnrichedExportLine = EnrichedConversationRecord | EnrichedConversationError;

// Conversations with total messages at or below this threshold are exported in full.
const SHORT_THRESHOLD = 14;

// Target user-message count per zone when sampling. 4 zones × 4 = 16 user messages minimum.
const USER_MSGS_PER_ZONE = 4;

// Hard limits to keep export size reasonable.
const MAX_CHARS_USER = 4000;
const MAX_CHARS_ASSISTANT = 1200;

function extractText(node: RawConversationNode): string {
  const parts = node.message?.content?.parts;
  if (!Array.isArray(parts)) return '';

  const segments: string[] = [];
  for (const part of parts) {
    if (typeof part === 'string') {
      segments.push(part);
    } else if (part && typeof part === 'object') {
      const p = part as Record<string, unknown>;
      if (p.content_type === 'text' && typeof p.text === 'string') {
        segments.push(p.text);
      }
    }
  }
  return segments.join('\n').trim();
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n[…]';
}

/** Walk current_node → root via parent links, then reverse to get chronological order. */
function linearizeMessages(raw: RawConversation): LinearMessage[] {
  const mapping = raw.mapping ?? {};
  const currentNode = raw.current_node;
  if (!currentNode || !mapping[currentNode]) return [];

  // Collect the canonical path by walking parent links.
  const path: string[] = [];
  let nodeId: string | null = currentNode;
  const visited = new Set<string>();
  while (nodeId && mapping[nodeId] && !visited.has(nodeId)) {
    visited.add(nodeId);
    path.push(nodeId);
    nodeId = mapping[nodeId].parent ?? null;
  }
  path.reverse();

  const messages: LinearMessage[] = [];
  for (const id of path) {
    const node = mapping[id];
    if (!node?.message) continue;

    const role = node.message.author?.role;
    if (role !== 'user' && role !== 'assistant') continue;

    const contentType = node.message.content?.content_type;
    if (contentType !== 'text' && contentType !== 'multimodal_text') continue;

    const text = extractText(node);
    if (!text) continue;

    messages.push({ index: messages.length, role, text });
  }

  return messages;
}

/**
 * Sample messages from a long conversation across 4 zones.
 *
 * Strategy:
 * - Divide messages into 4 roughly equal zones: [0–33%), [33–50%), [50–66%), [66–100%]
 * - In each zone, collect up to USER_MSGS_PER_ZONE user messages and their adjacent
 *   assistant responses (the one immediately following each user message).
 * - Deduplicate by index.
 */
function sampleMessages(messages: LinearMessage[]): { sampled: LinearMessage[]; indices: number[] } {
  const n = messages.length;
  const zoneCount = 4;
  const zoneSize = n / zoneCount;

  const selected = new Map<number, LinearMessage>();

  for (let z = 0; z < zoneCount; z++) {
    const zoneStart = Math.floor(z * zoneSize);
    const zoneEnd = z === zoneCount - 1 ? n : Math.floor((z + 1) * zoneSize);

    // Collect user message indices in this zone.
    const userIndices: number[] = [];
    for (let i = zoneStart; i < zoneEnd; i++) {
      if (messages[i].role === 'user') userIndices.push(i);
    }

    // Pick evenly spaced user messages if there are more than the quota.
    let pickedUserIndices: number[];
    if (userIndices.length <= USER_MSGS_PER_ZONE) {
      pickedUserIndices = userIndices;
    } else {
      pickedUserIndices = [];
      for (let k = 0; k < USER_MSGS_PER_ZONE; k++) {
        const idx = Math.round((k / (USER_MSGS_PER_ZONE - 1)) * (userIndices.length - 1));
        pickedUserIndices.push(userIndices[idx]);
      }
    }

    // For each picked user message, include it and the immediately following assistant message.
    for (const ui of pickedUserIndices) {
      selected.set(ui, messages[ui]);
      const next = ui + 1;
      if (next < n && messages[next].role === 'assistant') {
        selected.set(next, messages[next]);
      }
    }
  }

  const indices = [...selected.keys()].sort((a, b) => a - b);
  const sampled = indices.map((i) => messages[i]);
  return { sampled, indices };
}

function applyLimits(messages: LinearMessage[]): LinearMessage[] {
  return messages.map((m) => ({
    ...m,
    text: truncate(m.text, m.role === 'user' ? MAX_CHARS_USER : MAX_CHARS_ASSISTANT),
  }));
}

function toIsoOrNull(ts: number | null | undefined): string | null {
  if (ts == null) return null;
  return new Date(ts * 1000).toISOString();
}

export function buildExportRecord(
  raw: RawConversation,
  id: string,
  title: string,
): EnrichedConversationRecord {
  const allMessages = linearizeMessages(raw);
  const userCount = allMessages.filter((m) => m.role === 'user').length;

  let sampled: LinearMessage[];
  let indices: number[];
  let isSampled: boolean;

  if (allMessages.length <= SHORT_THRESHOLD) {
    sampled = allMessages;
    indices = allMessages.map((m) => m.index);
    isSampled = false;
  } else {
    const result = sampleMessages(allMessages);
    sampled = result.sampled;
    indices = result.indices;
    isSampled = true;
  }

  return {
    id,
    title,
    gizmo_id: raw.gizmo_id ?? null,
    create_time: toIsoOrNull(raw.create_time),
    update_time: toIsoOrNull(raw.update_time),
    message_count: allMessages.length,
    user_message_count: userCount,
    sampled: isSampled,
    sample_indices: indices,
    messages: applyLimits(sampled),
  };
}

export function toJsonlLine(record: EnrichedExportLine): string {
  return JSON.stringify(record);
}
