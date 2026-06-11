# Plan - Purchase Screen (compras-movimento)

## Project Type: WEB
## Success Criteria:
- Compras screen accessible in Sidebar under Movimentações.
- Create, Read, Update, Delete purchase movements works successfully.
- Filtered client list works.
- Synchronization of Valor/kg in individual detaling mode works.
- Fully type-safe and lint-clean code.

## Tech Stack:
- React, TypeScript, Drizzle ORM, PostgreSQL, Tailwind CSS

## Proposed File Structure:
- `src/DB/schema.ts`
- `drizzle.config.ts`
- `src/DB/repositories/compras.ts`
- `api/compras.ts`
- `server-dev.ts`
- `lib/api/comprasClient.ts`
- `components/InttegraSidebar.tsx`
- `components/InttegraDashboard.tsx`
- `agents/pecuario/compra/CompraView.tsx`
- `agents/pecuario/compra/CompraCategoriaGrid.tsx`
- `agents/pecuario/compra/CompraLancamentosRecentes.tsx`
- `agents/pecuario/compra/types.ts`
- `agents/pecuario/compra/util.ts`

## Task Breakdown:
1. **Database Schema updates & Drizzle config** (Agent: `database-architect`, Priority: P0)
2. **Database repository for Compras** (Agent: `backend-specialist`, Priority: P0)
3. **API endpoint in /api/compras** (Agent: `backend-specialist`, Priority: P1)
4. **Register API endpoint in server-dev** (Agent: `devops-engineer`, Priority: P1)
5. **HTTP client helper for Compras** (Agent: `frontend-specialist`, Priority: P1)
6. **Integrate screen in InttegraSidebar** (Agent: `frontend-specialist`, Priority: P2)
7. **Register view in InttegraDashboard** (Agent: `frontend-specialist`, Priority: P2)
8. **Build Compra UI components (CompraView, CategoriaGrid, etc.)** (Agent: `frontend-specialist`, Priority: P2)
9. **Final checks and lint verification** (Agent: `test-engineer`, Priority: P3)
