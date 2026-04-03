import type { Node, Edge } from '@xyflow/react';
import { fetchProjects, type ProjectRow } from './projects';
import { fetchDeliveriesByProjects, type DeliveryRow } from './deliveries';
import {
  fetchInitiativesByDeliveries,
  type InitiativeWithProgress,
  type InitiativeTaskRow,
} from './initiatives';
import { formatDateBR } from './dateFormatters';

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

/**
 * Carrega a árvore completa EAP para um analista de forma otimizada (Bulk Fetch).
 */
export interface LoadFullEAPTreeOptions {
  organizationId?: string | null;
  farmId?: string | null;
  clientMode?: boolean;
}

export async function loadFullEAPTree(
  effectiveUserId: string,
  options?: LoadFullEAPTreeOptions,
): Promise<WBSNode[]> {
  const filters = options?.organizationId
    ? { organizationId: options.organizationId, farmId: options.farmId ?? undefined, clientMode: options.clientMode }
    : undefined;
    
  // Nível 1: Projetos
  const projects = await fetchProjects(effectiveUserId, filters);
  if (projects.length === 0) return [];
  
  const projectIds = projects.map(p => p.id);

  // Nível 2: Entregas (Bulk fetch)
  const deliveries = await fetchDeliveriesByProjects(projectIds);
  const deliveryIds = deliveries.map(d => d.id);

  // Nível 3 e 4: Atividades e Tarefas embutidas (Bulk fetch via joined tables)
  // Nota: fetchInitiativesByDeliveries já processa milestones -> tasks e agrupa adequadamente.
  const initiatives = await fetchInitiativesByDeliveries(deliveryIds);

  // Agrupamento em memórias
  const initiativesByDelivery = initiatives.reduce((acc, init) => {
    const dId = init.delivery_id;
    if (dId) {
      if (!acc[dId]) acc[dId] = [];
      acc[dId].push(init);
    }
    return acc;
  }, {} as Record<string, typeof initiatives>);

  const deliveriesByProject = deliveries.reduce((acc, del) => {
    const pId = del.project_id;
    if (pId) {
      if (!acc[pId]) acc[pId] = [];
      acc[pId].push(del);
    }
    return acc;
  }, {} as Record<string, typeof deliveries>);

  const rootNodes: WBSNode[] = [];

  for (const project of projects) {
    const projectDeliveries = deliveriesByProject[project.id] || [];
    const children: WBSNode[] = [];

    for (const delivery of projectDeliveries) {
      const deliveryInitiatives = initiativesByDelivery[delivery.id] || [];
      const activityChildren: WBSNode[] = [];

      for (const initiative of deliveryInitiatives) {
        // Obter as tarefas que já vieram aninhadas (resolvidas dentro de fetchInitiativesByDeliveries)
        const tasks = initiative.milestones?.flatMap(m => m.tasks || []) || [];
        
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
            task: t as any,
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
        label: project.name || 'Projeto sem nome',
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
