import { and, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  cardConcepts,
  cards,
  conceptRelations,
  concepts,
  noteConcepts,
  notes,
} from '../db/schema.js';

const RELATION_TYPES = new Set([
  'IS_A',
  'PART_OF',
  'PREREQUISITE_OF',
  'RELATED_TO',
  'DERIVES_FROM',
  'CONTRASTS_WITH',
]);

export interface GraphEntityInput {
  name: string;
  type?: string;
  description?: string;
  domain?: string;
  aliases?: string[];
  confidence?: number;
}

export interface GraphRelationInput {
  source: string;
  target: string;
  type?: string;
  description?: string;
  evidence?: string;
  confidence?: number;
}

export interface AdoptGraphInput {
  userId: string;
  noteId?: string | null;
  cardIds?: string[];
  sourceType?: string | null;
  sourceId?: string | null;
  entities: GraphEntityInput[];
  relations: GraphRelationInput[];
}

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

function cleanRelationType(type?: string): string {
  const normalized = String(type || 'RELATED_TO').trim().toUpperCase();
  return RELATION_TYPES.has(normalized) ? normalized : 'RELATED_TO';
}

function clampConfidence(value?: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0.8;
  return Math.max(0, Math.min(1, value));
}

export async function upsertConcept(
  userId: string,
  input: GraphEntityInput,
  sourceType?: string | null,
  sourceId?: string | null
) {
  const label = input.name.trim();
  const normalizedLabel = normalizeLabel(label);
  if (!label) return null;

  const [existing] = await db.select()
    .from(concepts)
    .where(and(eq(concepts.userId, userId), eq(concepts.normalizedLabel, normalizedLabel)))
    .limit(1);

  if (existing) {
    const description = existing.description || input.description?.trim() || null;
    const aliases = Array.from(new Set([
      ...(existing.aliases ?? []),
      ...(input.aliases ?? []).map(alias => alias.trim()).filter(Boolean),
    ]));

    const [updated] = await db.update(concepts)
      .set({
        description,
        domain: existing.domain || input.domain || input.type || null,
        aliases: aliases.length > 0 ? aliases : null,
        confidence: Math.max(existing.confidence, clampConfidence(input.confidence)),
        updatedAt: new Date(),
      })
      .where(eq(concepts.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(concepts).values({
    userId,
    label,
    normalizedLabel,
    description: input.description?.trim() || null,
    domain: input.domain || input.type || null,
    aliases: input.aliases?.map(alias => alias.trim()).filter(Boolean) ?? null,
    sourceType: sourceType ?? null,
    sourceId: sourceId ?? null,
    confidence: clampConfidence(input.confidence),
  }).returning();

  return created;
}

export async function adoptGraphFromExtraction(input: AdoptGraphInput) {
  const conceptByName = new Map<string, typeof concepts.$inferSelect>();
  const adoptedConcepts: Array<typeof concepts.$inferSelect> = [];
  const adoptedRelations: Array<typeof conceptRelations.$inferSelect> = [];

  for (const entity of input.entities) {
    const concept = await upsertConcept(input.userId, entity, input.sourceType, input.sourceId);
    if (!concept) continue;
    conceptByName.set(normalizeLabel(entity.name), concept);
    adoptedConcepts.push(concept);
  }

  if (input.noteId && adoptedConcepts.length > 0) {
    await db.insert(noteConcepts)
      .values(adoptedConcepts.map(concept => ({
        userId: input.userId,
        noteId: input.noteId!,
        conceptId: concept.id,
        role: 'mentions',
        confidence: concept.confidence,
      })))
      .onConflictDoNothing();
  }

  if (input.cardIds && input.cardIds.length > 0 && adoptedConcepts.length > 0) {
    const rows = input.cardIds.flatMap(cardId =>
      adoptedConcepts.slice(0, 5).map(concept => ({
        userId: input.userId,
        cardId,
        conceptId: concept.id,
        role: 'tests',
        confidence: concept.confidence,
      }))
    );
    await db.insert(cardConcepts).values(rows).onConflictDoNothing();
  }

  for (const relation of input.relations) {
    let source = conceptByName.get(normalizeLabel(relation.source));
    if (!source) {
      source = await upsertConcept(input.userId, { name: relation.source }, input.sourceType, input.sourceId) ?? undefined;
      if (source) conceptByName.set(normalizeLabel(relation.source), source);
    }

    let target = conceptByName.get(normalizeLabel(relation.target));
    if (!target) {
      target = await upsertConcept(input.userId, { name: relation.target }, input.sourceType, input.sourceId) ?? undefined;
      if (target) conceptByName.set(normalizeLabel(relation.target), target);
    }

    if (!source || !target || source.id === target.id) continue;

    const [created] = await db.insert(conceptRelations).values({
      userId: input.userId,
      sourceConceptId: source.id,
      targetConceptId: target.id,
      relationType: cleanRelationType(relation.type),
      weight: 1,
      evidence: relation.evidence || relation.description || null,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      confidence: clampConfidence(relation.confidence),
    }).onConflictDoUpdate({
      target: [
        conceptRelations.userId,
        conceptRelations.sourceConceptId,
        conceptRelations.targetConceptId,
        conceptRelations.relationType,
      ],
      set: {
        evidence: relation.evidence || relation.description || null,
        confidence: clampConfidence(relation.confidence),
        updatedAt: new Date(),
      },
    }).returning();

    if (created) adoptedRelations.push(created);
  }

  return {
    conceptIds: Array.from(new Set(adoptedConcepts.map(concept => concept.id))),
    relationIds: Array.from(new Set(adoptedRelations.map(relation => relation.id))),
  };
}

export async function getGraphOverview(userId: string, options: { limit?: number; q?: string; relationType?: string; isolatedOnly?: boolean } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 120, 20), 300);
  const conceptConditions = [eq(concepts.userId, userId)];
  if (options.q?.trim()) {
    const pattern = `%${options.q.trim()}%`;
    conceptConditions.push(or(ilike(concepts.label, pattern), ilike(concepts.description, pattern))!);
  }

  const conceptRows = await db.select({
    concept: concepts,
    noteCount: count(noteConcepts.id),
  })
    .from(concepts)
    .leftJoin(noteConcepts, eq(noteConcepts.conceptId, concepts.id))
    .where(and(...conceptConditions))
    .groupBy(concepts.id)
    .orderBy(desc(count(noteConcepts.id)), desc(concepts.updatedAt))
    .limit(limit);

  const conceptIds = conceptRows.map(row => row.concept.id);
  const relationConditions = [eq(conceptRelations.userId, userId)];
  if (conceptIds.length > 0) {
    relationConditions.push(or(
      inArray(conceptRelations.sourceConceptId, conceptIds),
      inArray(conceptRelations.targetConceptId, conceptIds)
    )!);
  }
  if (options.relationType) relationConditions.push(eq(conceptRelations.relationType, cleanRelationType(options.relationType)));

  const relationRows = conceptIds.length > 0
    ? await db.select().from(conceptRelations).where(and(...relationConditions)).limit(limit * 2)
    : [];

  const connectedIds = new Set<string>();
  relationRows.forEach(relation => {
    connectedIds.add(relation.sourceConceptId);
    connectedIds.add(relation.targetConceptId);
  });

  const [conceptCount] = await db.select({ value: count() }).from(concepts).where(eq(concepts.userId, userId));
  const [relationCount] = await db.select({ value: count() }).from(conceptRelations).where(eq(conceptRelations.userId, userId));

  const nodes = conceptRows.map(row => ({
      id: row.concept.id,
      label: row.concept.label,
      type: 'concept' as const,
      description: row.concept.description,
      domain: row.concept.domain,
      confidence: row.concept.confidence,
      noteCount: row.noteCount,
      isolated: !connectedIds.has(row.concept.id),
    }));
  const visibleNodes = options.isolatedOnly ? nodes.filter(node => node.isolated) : nodes;
  const visibleNodeIds = new Set(visibleNodes.map(node => node.id));
  const visibleEdges = options.isolatedOnly
    ? []
    : relationRows.filter(relation =>
      visibleNodeIds.has(relation.sourceConceptId) &&
      visibleNodeIds.has(relation.targetConceptId)
    );

  return {
    nodes: visibleNodes,
    edges: visibleEdges.map(relation => ({
      id: relation.id,
      source: relation.sourceConceptId,
      target: relation.targetConceptId,
      type: relation.relationType,
      weight: relation.weight,
      evidence: relation.evidence,
      confidence: relation.confidence,
    })),
    stats: {
      conceptCount: conceptCount?.value ?? 0,
      relationCount: relationCount?.value ?? 0,
      isolatedCount: conceptRows.filter(row => !connectedIds.has(row.concept.id)).length,
    },
  };
}

export async function searchGraph(userId: string, q: string) {
  const pattern = `%${q.trim()}%`;
  const conceptRows = await db.select()
    .from(concepts)
    .where(and(eq(concepts.userId, userId), or(ilike(concepts.label, pattern), ilike(concepts.description, pattern))!))
    .limit(20);

  return {
    concepts: conceptRows,
  };
}

export async function getConceptDetail(userId: string, conceptId: string) {
  const [concept] = await db.select().from(concepts)
    .where(and(eq(concepts.id, conceptId), eq(concepts.userId, userId)))
    .limit(1);

  if (!concept) return null;

  const linkedNotes = await db.select({
    id: notes.id,
    title: notes.title,
    content: notes.content,
    role: noteConcepts.role,
  })
    .from(noteConcepts)
    .innerJoin(notes, eq(notes.id, noteConcepts.noteId))
    .where(and(eq(noteConcepts.userId, userId), eq(noteConcepts.conceptId, conceptId)))
    .limit(10);

  const linkedCards = await db.select({
    id: cards.id,
    front: cards.front,
    back: cards.back,
    role: cardConcepts.role,
  })
    .from(cardConcepts)
    .innerJoin(cards, eq(cards.id, cardConcepts.cardId))
    .where(and(eq(cardConcepts.userId, userId), eq(cardConcepts.conceptId, conceptId)))
    .limit(10);

  const relations = await db.select().from(conceptRelations)
    .where(and(
      eq(conceptRelations.userId, userId),
      or(eq(conceptRelations.sourceConceptId, conceptId), eq(conceptRelations.targetConceptId, conceptId))!
    ))
    .limit(30);

  return {
    concept,
    notes: linkedNotes.map(note => ({
      ...note,
      summary: note.content.replace(/\s+/g, ' ').slice(0, 140),
    })),
    cards: linkedCards,
    relations,
  };
}

export async function getConceptNeighborhood(userId: string, conceptId: string) {
  const detail = await getConceptDetail(userId, conceptId);
  if (!detail) return null;

  const neighborIds = Array.from(new Set(detail.relations.flatMap(relation => [
    relation.sourceConceptId,
    relation.targetConceptId,
  ])));

  const nodeRows = neighborIds.length > 0
    ? await db.select().from(concepts)
      .where(and(eq(concepts.userId, userId), inArray(concepts.id, neighborIds)))
    : [detail.concept];

  return {
    nodes: nodeRows.map(concept => ({
      id: concept.id,
      label: concept.label,
      type: 'concept' as const,
      description: concept.description,
      domain: concept.domain,
      confidence: concept.confidence,
      isolated: detail.relations.length === 0,
    })),
    edges: detail.relations.map(relation => ({
      id: relation.id,
      source: relation.sourceConceptId,
      target: relation.targetConceptId,
      type: relation.relationType,
      weight: relation.weight,
      evidence: relation.evidence,
      confidence: relation.confidence,
    })),
  };
}

export async function getCardGraphContext(userId: string, cardId: string) {
  const [card] = await db.select()
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.userId, userId)))
    .limit(1);

  if (!card) return null;

  const cardConceptRows = await db.select({
    concept: concepts,
    role: cardConcepts.role,
  })
    .from(cardConcepts)
    .innerJoin(concepts, eq(concepts.id, cardConcepts.conceptId))
    .where(and(eq(cardConcepts.userId, userId), eq(cardConcepts.cardId, cardId)))
    .limit(10);

  const conceptIds = cardConceptRows.map(row => row.concept.id);

  const relationRows = conceptIds.length > 0
    ? await db.select({
      relation: conceptRelations,
      source: concepts,
    })
      .from(conceptRelations)
      .innerJoin(concepts, eq(concepts.id, conceptRelations.sourceConceptId))
      .where(and(
        eq(conceptRelations.userId, userId),
        or(
          inArray(conceptRelations.sourceConceptId, conceptIds),
          inArray(conceptRelations.targetConceptId, conceptIds)
        )!
      ))
      .limit(30)
    : [];

  const neighborIds = Array.from(new Set(relationRows.flatMap(row => [
    row.relation.sourceConceptId,
    row.relation.targetConceptId,
  ]))).filter(id => !conceptIds.includes(id));

  const neighbors = neighborIds.length > 0
    ? await db.select().from(concepts)
      .where(and(eq(concepts.userId, userId), inArray(concepts.id, neighborIds)))
    : [];
  const neighborById = new Map(neighbors.map(concept => [concept.id, concept]));

  const linkedNotes = conceptIds.length > 0
    ? await db.select({
      id: notes.id,
      title: notes.title,
      content: notes.content,
      conceptId: noteConcepts.conceptId,
    })
      .from(noteConcepts)
      .innerJoin(notes, eq(notes.id, noteConcepts.noteId))
      .where(and(eq(noteConcepts.userId, userId), inArray(noteConcepts.conceptId, conceptIds)))
      .limit(8)
    : [];

  const prerequisites = relationRows
    .filter(row => row.relation.relationType === 'PREREQUISITE_OF' && conceptIds.includes(row.relation.targetConceptId))
    .map(row => neighborById.get(row.relation.sourceConceptId))
    .filter(Boolean);

  const related = relationRows
    .map(row => {
      if (conceptIds.includes(row.relation.sourceConceptId)) return neighborById.get(row.relation.targetConceptId);
      return neighborById.get(row.relation.sourceConceptId);
    })
    .filter(Boolean);

  const uniqueById = <T extends { id: string }>(items: T[]) =>
    Array.from(new Map(items.map(item => [item.id, item])).values());

  return {
    cardId,
    concepts: cardConceptRows.map(row => ({
      id: row.concept.id,
      label: row.concept.label,
      description: row.concept.description,
      domain: row.concept.domain,
      confidence: row.concept.confidence,
      role: row.role,
    })),
    prerequisites: uniqueById(prerequisites as Array<typeof concepts.$inferSelect>).map(concept => ({
      id: concept.id,
      label: concept.label,
      description: concept.description,
      confidence: concept.confidence,
    })),
    related: uniqueById(related as Array<typeof concepts.$inferSelect>).slice(0, 8).map(concept => ({
      id: concept.id,
      label: concept.label,
      description: concept.description,
      confidence: concept.confidence,
    })),
    notes: uniqueById(linkedNotes).map(note => ({
      id: note.id,
      title: note.title,
      summary: note.content.replace(/\s+/g, ' ').slice(0, 140),
    })),
  };
}

export async function getGraphQualityReport(userId: string, limit = 50) {
  const boundedLimit = Math.min(Math.max(limit, 10), 100);

  const isolatedRows = await db.execute(sql`
    SELECT c.id, c.label, c.description, c.domain, c.confidence
    FROM concepts c
    WHERE c.user_id = ${userId}
      AND NOT EXISTS (
        SELECT 1 FROM concept_relations r
        WHERE r.user_id = ${userId}
          AND (r.source_concept_id = c.id OR r.target_concept_id = c.id)
      )
    ORDER BY c.updated_at DESC
    LIMIT ${boundedLimit}
  `);

  const lowConfidenceRows = await db.execute(sql`
    SELECT
      r.id,
      r.relation_type,
      r.evidence,
      r.confidence,
      r.updated_at,
      source.id AS source_id,
      source.label AS source_label,
      target.id AS target_id,
      target.label AS target_label
    FROM concept_relations r
    INNER JOIN concepts source ON source.id = r.source_concept_id
    INNER JOIN concepts target ON target.id = r.target_concept_id
    WHERE r.user_id = ${userId}
      AND (r.confidence < 0.75 OR r.evidence IS NULL OR length(trim(r.evidence)) = 0)
    ORDER BY r.confidence ASC, r.updated_at DESC
    LIMIT ${boundedLimit}
  `);

  const unboundCardRows = await db.execute(sql`
    SELECT c.id, c.front, c.back, c.lapse_count, c.updated_at, n.title AS note_title
    FROM cards c
    LEFT JOIN card_concepts cc ON cc.card_id = c.id AND cc.user_id = ${userId}
    LEFT JOIN notes n ON n.id = c.note_id
    WHERE c.user_id = ${userId}
      AND c.suspended = false
      AND cc.id IS NULL
    ORDER BY c.updated_at DESC
    LIMIT ${boundedLimit}
  `);

  const isolatedCount = await db.execute(sql`
    SELECT count(*)::int AS value
    FROM concepts c
    WHERE c.user_id = ${userId}
      AND NOT EXISTS (
        SELECT 1 FROM concept_relations r
        WHERE r.user_id = ${userId}
          AND (r.source_concept_id = c.id OR r.target_concept_id = c.id)
      )
  `);

  const lowConfidenceCount = await db.execute(sql`
    SELECT count(*)::int AS value
    FROM concept_relations r
    WHERE r.user_id = ${userId}
      AND (r.confidence < 0.75 OR r.evidence IS NULL OR length(trim(r.evidence)) = 0)
  `);

  const unboundCardCount = await db.execute(sql`
    SELECT count(*)::int AS value
    FROM cards c
    LEFT JOIN card_concepts cc ON cc.card_id = c.id AND cc.user_id = ${userId}
    WHERE c.user_id = ${userId}
      AND c.suspended = false
      AND cc.id IS NULL
  `);

  const rowsOf = (result: unknown): any[] => ((result as any).rows || result || []) as any[];

  return {
    isolatedConcepts: rowsOf(isolatedRows).map(row => ({
      id: row.id,
      label: row.label,
      description: row.description,
      domain: row.domain,
      confidence: Number(row.confidence ?? 0),
    })),
    lowConfidenceRelations: rowsOf(lowConfidenceRows).map(row => ({
      id: row.id,
      type: row.relation_type,
      evidence: row.evidence,
      confidence: Number(row.confidence ?? 0),
      source: {
        id: row.source_id,
        label: row.source_label,
      },
      target: {
        id: row.target_id,
        label: row.target_label,
      },
    })),
    unboundCards: rowsOf(unboundCardRows).map(row => ({
      id: row.id,
      front: row.front,
      back: row.back,
      noteTitle: row.note_title,
      lapseCount: Number(row.lapse_count ?? 0),
    })),
    stats: {
      isolatedConceptCount: Number(rowsOf(isolatedCount)[0]?.value ?? 0),
      lowConfidenceRelationCount: Number(rowsOf(lowConfidenceCount)[0]?.value ?? 0),
      unboundCardCount: Number(rowsOf(unboundCardCount)[0]?.value ?? 0),
    },
  };
}

export async function confirmGraphRelation(userId: string, relationId: string) {
  const [relation] = await db.update(conceptRelations)
    .set({ confidence: 1, updatedAt: new Date() })
    .where(and(eq(conceptRelations.userId, userId), eq(conceptRelations.id, relationId)))
    .returning();

  return relation ?? null;
}

export async function deleteGraphRelation(userId: string, relationId: string) {
  const [relation] = await db.delete(conceptRelations)
    .where(and(eq(conceptRelations.userId, userId), eq(conceptRelations.id, relationId)))
    .returning({ id: conceptRelations.id });

  return relation ?? null;
}

export async function getGraphHealth(userId: string) {
  const [conceptCount] = await db.select({ value: count() }).from(concepts).where(eq(concepts.userId, userId));
  const [relationCount] = await db.select({ value: count() }).from(conceptRelations).where(eq(conceptRelations.userId, userId));
  const [cardCount] = await db.select({ value: count() }).from(cards).where(eq(cards.userId, userId));
  const [boundCardCount] = await db.select({ value: count() }).from(cardConcepts).where(eq(cardConcepts.userId, userId));
  const [noteCount] = await db.select({ value: count() }).from(notes).where(eq(notes.userId, userId));
  const [boundNoteCount] = await db.select({ value: count() }).from(noteConcepts).where(eq(noteConcepts.userId, userId));
  const quality = await getGraphQualityReport(userId, 10);

  const totalConcepts = conceptCount?.value ?? 0;
  const totalRelations = relationCount?.value ?? 0;
  const totalCards = cardCount?.value ?? 0;
  const totalNotes = noteCount?.value ?? 0;
  const isolatedRatio = totalConcepts > 0 ? quality.stats.isolatedConceptCount / totalConcepts : 0;
  const cardBindingRatio = totalCards > 0 ? (boundCardCount?.value ?? 0) / totalCards : 0;
  const noteBindingRatio = totalNotes > 0 ? (boundNoteCount?.value ?? 0) / totalNotes : 0;
  const relationDensity = totalConcepts > 1 ? totalRelations / totalConcepts : 0;

  const healthScore = Math.max(0, Math.min(100, Math.round(
    35 * (1 - isolatedRatio) +
    25 * Math.min(1, relationDensity / 2) +
    20 * cardBindingRatio +
    20 * noteBindingRatio
  )));

  return {
    conceptCount: totalConcepts,
    relationCount: totalRelations,
    cardCount: totalCards,
    boundCardCount: boundCardCount?.value ?? 0,
    noteCount: totalNotes,
    boundNoteCount: boundNoteCount?.value ?? 0,
    isolatedConceptCount: quality.stats.isolatedConceptCount,
    lowConfidenceRelationCount: quality.stats.lowConfidenceRelationCount,
    unboundCardCount: quality.stats.unboundCardCount,
    relationDensity,
    cardBindingRatio,
    noteBindingRatio,
    healthScore,
  };
}

export async function findConceptPath(userId: string, sourceId: string, targetId: string, maxDepth = 4) {
  const depth = Math.min(Math.max(maxDepth, 1), 6);
  const conceptRows = await db.select().from(concepts).where(eq(concepts.userId, userId));
  const relationRows = await db.select().from(conceptRelations).where(eq(conceptRelations.userId, userId));
  const conceptById = new Map(conceptRows.map(concept => [concept.id, concept]));
  if (!conceptById.has(sourceId) || !conceptById.has(targetId)) return null;

  const adjacency = new Map<string, Array<{ to: string; relation: typeof conceptRelations.$inferSelect }>>();
  for (const relation of relationRows) {
    if (!adjacency.has(relation.sourceConceptId)) adjacency.set(relation.sourceConceptId, []);
    if (!adjacency.has(relation.targetConceptId)) adjacency.set(relation.targetConceptId, []);
    adjacency.get(relation.sourceConceptId)!.push({ to: relation.targetConceptId, relation });
    adjacency.get(relation.targetConceptId)!.push({ to: relation.sourceConceptId, relation });
  }

  const queue: Array<{ id: string; path: string[]; relations: Array<typeof conceptRelations.$inferSelect> }> = [
    { id: sourceId, path: [sourceId], relations: [] },
  ];
  const visited = new Set([sourceId]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.id === targetId) {
      return {
        nodes: current.path.map(id => {
          const concept = conceptById.get(id)!;
          return {
            id: concept.id,
            label: concept.label,
            description: concept.description,
            domain: concept.domain,
          };
        }),
        edges: current.relations.map(relation => ({
          id: relation.id,
          source: relation.sourceConceptId,
          target: relation.targetConceptId,
          type: relation.relationType,
          evidence: relation.evidence,
          confidence: relation.confidence,
        })),
      };
    }
    if (current.path.length > depth + 1) continue;
    for (const next of adjacency.get(current.id) ?? []) {
      if (visited.has(next.to)) continue;
      visited.add(next.to);
      queue.push({
        id: next.to,
        path: [...current.path, next.to],
        relations: [...current.relations, next.relation],
      });
    }
  }

  return {
    nodes: [],
    edges: [],
  };
}

export async function recommendLearningPath(userId: string, targetConceptId?: string, limit = 8) {
  const boundedLimit = Math.min(Math.max(limit, 3), 20);
  const relationRows = await db.select().from(conceptRelations)
    .where(and(eq(conceptRelations.userId, userId), eq(conceptRelations.relationType, 'PREREQUISITE_OF')));
  const conceptRows = await db.select().from(concepts).where(eq(concepts.userId, userId));
  const conceptById = new Map(conceptRows.map(concept => [concept.id, concept]));

  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();
  for (const relation of relationRows) {
    if (!outgoing.has(relation.sourceConceptId)) outgoing.set(relation.sourceConceptId, new Set());
    if (!incoming.has(relation.targetConceptId)) incoming.set(relation.targetConceptId, new Set());
    outgoing.get(relation.sourceConceptId)!.add(relation.targetConceptId);
    incoming.get(relation.targetConceptId)!.add(relation.sourceConceptId);
  }

  const targetIds = targetConceptId
    ? [targetConceptId]
    : conceptRows
      .slice()
      .sort((a, b) => (incoming.get(b.id)?.size ?? 0) - (incoming.get(a.id)?.size ?? 0))
      .slice(0, 3)
      .map(concept => concept.id);

  const needed = new Set<string>();
  const visitPrerequisites = (id: string) => {
    for (const pre of incoming.get(id) ?? []) {
      if (needed.has(pre)) continue;
      needed.add(pre);
      visitPrerequisites(pre);
    }
  };
  targetIds.forEach(visitPrerequisites);
  targetIds.forEach(id => needed.add(id));

  const nodes = Array.from(needed)
    .map(id => conceptById.get(id))
    .filter(Boolean) as Array<typeof concepts.$inferSelect>;

  const ordered = nodes.sort((a, b) => {
    const aPre = incoming.get(a.id)?.size ?? 0;
    const bPre = incoming.get(b.id)?.size ?? 0;
    const aOut = outgoing.get(a.id)?.size ?? 0;
    const bOut = outgoing.get(b.id)?.size ?? 0;
    return aPre - bPre || bOut - aOut || a.label.localeCompare(b.label);
  }).slice(0, boundedLimit);

  return {
    targetConceptId: targetConceptId ?? null,
    steps: ordered.map((concept, index) => ({
      order: index + 1,
      id: concept.id,
      label: concept.label,
      description: concept.description,
      domain: concept.domain,
      prerequisiteCount: incoming.get(concept.id)?.size ?? 0,
      unlocksCount: outgoing.get(concept.id)?.size ?? 0,
    })),
  };
}
