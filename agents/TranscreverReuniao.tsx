import React, { useState, useRef } from 'react';
import { Mic, Upload, Loader2, CheckCircle, AlertCircle, Copy } from 'lucide-react';
import { getAuthHeaders } from '../lib/session';

const ACCEPTED_TYPES = '.mp3,.m4a,.wav,.webm,.ogg';
const MAX_MB = 200;

interface TranscricaoData {
  texto: string;
  modelo: string;
  chunks: number;
}

export default function TranscreverReuniao() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TranscricaoData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setResult(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const authHeaders = await getAuthHeaders();
      const formData = new FormData();
      formData.append('audio', file);

      // Não definir Content-Type manualmente — o browser inclui o boundary correto
      const res = await fetch('/api/transcrever-reuniao', {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      });

      const json = (await res.json()) as { ok: boolean; data?: TranscricaoData; error?: string };

      if (json.ok && json.data) {
        setResult(json.data);
      } else {
        setError(json.error ?? `Erro ${res.status}`);
      }
    } catch (err) {
      setError((err as Error).message ?? 'Falha na requisição.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.texto);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const fileSizeMB = file ? (file.size / 1024 / 1024).toFixed(1) : null;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 mb-6">
        <Mic className="text-ai-accent shrink-0" size={22} />
        <div>
          <h1 className="text-lg font-semibold text-ai-text">Transcrição de Reunião</h1>
          <p className="text-xs text-ai-subtext mt-0.5">
            Faça upload do áudio e receba a transcrição em texto
          </p>
        </div>
      </div>

      {/* Formulário de upload */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div
          role="button"
          tabIndex={0}
          className="border-2 border-dashed border-ai-border rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-ai-accent transition-colors focus:outline-none focus:border-ai-accent"
          onClick={() => inputRef.current?.click()}
          onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
        >
          <Upload size={28} className="text-ai-subtext" />
          {file ? (
            <div className="text-center">
              <p className="text-sm font-medium text-ai-text">{file.name}</p>
              <p className="text-xs text-ai-subtext mt-1">{fileSizeMB} MB</p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm text-ai-text">Clique para selecionar o arquivo de áudio</p>
              <p className="text-xs text-ai-subtext mt-1">
                mp3, m4a, wav, webm — até {MAX_MB} MB
              </p>
              <p className="text-xs text-ai-accent/70 mt-0.5">
                arquivos acima de 25 MB são divididos automaticamente
              </p>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        <button
          type="submit"
          disabled={!file || loading}
          className="w-full py-2.5 px-4 rounded-lg bg-ai-accent text-white font-medium text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-opacity"
        >
          {loading ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Transcrevendo...
            </>
          ) : (
            <>
              <Mic size={15} />
              Transcrever
            </>
          )}
        </button>
      </form>

      {/* Mensagem de erro */}
      {error && (
        <div className="mt-4 flex items-start gap-2.5 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle size={15} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Resultado da transcrição */}
      {result && (
        <div className="mt-5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={15} className="text-green-400 shrink-0" />
            <span className="text-sm font-medium text-ai-text">Transcrição concluída</span>
            <span className="text-xs text-ai-subtext ml-auto">
              modelo: {result.modelo}
              {result.chunks > 1 && ` · ${result.chunks} partes`}
            </span>
          </div>

          <div className="relative p-4 rounded-xl bg-ai-surface border border-ai-border">
            <pre className="text-sm text-ai-text whitespace-pre-wrap font-sans leading-relaxed">
              {result.texto}
            </pre>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="mt-2 flex items-center gap-1.5 text-xs text-ai-accent hover:opacity-80 transition-opacity"
          >
            <Copy size={12} />
            {copied ? 'Copiado!' : 'Copiar texto'}
          </button>
        </div>
      )}
    </div>
  );
}
