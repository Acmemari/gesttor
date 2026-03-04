/**
 * EAP Tree — Carregamento e conversão para formato React Flow
 * Estrutura: Project (Programa) → Delivery (Entrega) → Initiative (Atividade) → Task (Tarefa)
 */

import type { Node, Edge } from '@xyflow/react';
import { fetchProjects, type ProjectRow } from './projects';
import { fetchDeliveriesByProject, type DeliveryRow } from './deliveries';
import {
  fetchInitiativesByDelivery,
  fetchTasksByInitiative,
  ensureDefaultMilestone,
  type InitiativeWithProgress,
  type InitiativeTaskRow,
} from './initiatives';

export type WBSLevel = 'program' | 'delivery' | 'activity' | 'task';

export interface WBSNodeData extends Record<string, unknown> {
  level: WBSLevel;
  label: string;
  subtitle?: string;
  rawId: string;
  parentId: string | null;
  project?: ProjectRow;
  delivery?: DeliveryRow;
  initiative?: InitiativeWithProgress;
  task?: InitiativeTaskRow;
}

export interface WBSNode {
  id: string;
  level: WBSLevel;
  parentId: string | null;
  data: WBSNodeData;
  children: WBSNode[];
}

const DATE_FMT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function formatDateBR(raw: string | null): string {
  if (!raw) return '—';
  try {
    const d = new Date(`${raw}T00:00:00`);
    return Number.isNaN(d.getTime()) ? raw : DATE_FMT.format(d);
  } catch {
    return raw;
  }
}

/**
 * Carrega a árvore completa EAP para um analista.
 */
export interface LoadFullEAPTreeOptions {
  clientId?: string | null;
  farmId?: string | null;
  clientMode?: boolean;
}

export async function loadFullEAPTree(
  effectiveUserId: string,
  options?: LoadFullEAPTreeOptions,
): Promise<WBSNode[]> {
  const filters = options?.clientId
    ? { clientId: options.clientId, farmId: options.farmId ?? undefined, clientMode: options.clientMode }
    : undefined;
  const projects = await fetchProjects(effectiveUserId, filters);
  const rootNodes: WBSNode[] = [];

  for (const project of projects) {
    const deliveries = await fetchDeliveriesByProject(project.id);
    const children: WBSNode[] = [];

    for (const delivery of deliveries) {
      const initiatives = await fetchInitiativesByDelivery(delivery.id);
      const activityChildren: WBSNode[] = [];

      for (const initiative of initiatives) {
        await ensureDefaultMilestone(initiative.id);
        const tasks = await fetchTasksByInitiative(initiative.id);
        const taskChildren: WBSNode[] = tasks.map(t => ({
          id: `task-${t.id}`,
          level: 'task' as const,
          parentId: `activity-${initiative.id}`,
          data: {
            level: 'task',
            label: t.title || 'Tarefa sem título',
            subtitle: `${t.kanban_status ?? 'A Fazer'}${t.due_date ? ` · ${formatDateBR(t.due_date)}` : ''}`,
            rawId: t.id,
            parentId: initiative.id,
            task: t,
          },
          children: [],
        }));

        activityChildren.push({
          id: `activity-${initiative.id}`,
          level: 'activity',
          parentId: `delivery-${delivery.id}`,
          data: {
            level: 'activity',
            label: initiative.name || 'Atividade sem nome',
            subtitle: `${initiative.progress ?? 0}% · ${initiative.status || 'Não Iniciado'}`,
            rawId: initiative.id,
            parentId: delivery.id,
            initiative,
          },
          children: taskChildren,
        });
      }

      children.push({
        id: `delivery-${delivery.id}`,
        level: 'delivery',
        parentId: `program-${project.id}`,
        data: {
          level: 'delivery',
          label: delivery.name || 'Entrega sem nome',
          subtitle:
            delivery.start_date || delivery.end_date || delivery.due_date
              ? `${formatDateBR(delivery.start_date)} — ${formatDateBR(delivery.end_date ?? delivery.due_date ?? null)}`
              : 'Sem período definido',
          rawId: delivery.id,
          parentId: project.id,
          delivery,
        },
        children: activityChildren,
      });
    }

    rootNodes.push({
      id: `program-${project.id}`,
      level: 'program',
      parentId: null,
      data: {
        level: 'program',
        label: project.name || 'Programa sem nome',
        subtitle: `${formatDateBR(project.start_date)} — ${formatDateBR(project.end_date)}`,
        rawId: project.id,
        parentId: null,
        project,
      },
      children,
    });
  }

  return rootNodes;
}

/**
 * Converte árvore WBS em nodes e edges para React Flow.
 * Posições iniciais em (0,0); o layout ELK será aplicado separadamente.
 */
export function wbsTreeToFlowData(
  tree: WBSNode[],
  nodeWidth = 220,
  nodeHeight = 72,
): { nodes: Node<WBSNodeData>[]; edges: Edge[] } {
  const nodes: Node<WBSNodeData>[] = [];
  const edges: Edge[] = [];

  function walk(nodesList: WBSNode[]) {
    for (const n of nodesList) {
      nodes.push({
        id: n.id,
        type: 'wbs',
        position: { x: 0, y: 0 },
        data: n.data,
        width: nodeWidth,
        height: nodeHeight,
      });

      for (const child of n.children) {
        edges.push({
          id: `e-${n.id}-${child.id}`,
          source: n.id,
          target: child.id,
        });
        walk([child]);
      }
    }
  }

  walk(tree);
  return { nodes, edges };
}
