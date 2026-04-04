"""
FastAPI dev server — Evolucao do Rebanho.
Rodar com: npm run dev:py
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Gesttor Python API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "herd-evolution"}


@app.post("/calculate")
async def calculate(body: dict):
    # TODO: implementar logica de calculo em etapas
    return {"ok": True, "message": "Evolucao do Rebanho — endpoint ativo", "input": body}
