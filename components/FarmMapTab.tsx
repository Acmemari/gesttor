import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Trash2, MapPin, Loader2, AlertCircle, FileUp, Layers } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import JSZip from 'jszip';
import { kml } from '@tmcw/togeojson';
import { listFarmMaps, createFarmMap, deleteFarmMapApi, type FarmMapData } from '../lib/api/farmMapsClient';
import { storageUpload, storageRemove } from '../lib/storage';

interface FarmMapTabProps {
  farmId: string;
  readOnly?: boolean;
}

const STORAGE_PREFIX = 'farm-maps';

function generateFileName(originalName: string): string {
  const ext = originalName.split('.').pop()?.toLowerCase() || 'kmz';
  return `${crypto.randomUUID()}.${ext}`;
}

async function parseKmzFile(file: File): Promise<GeoJSON.FeatureCollection> {
  const arrayBuffer = await file.arrayBuffer();

  if (file.name.toLowerCase().endsWith('.kml')) {
    const text = new TextDecoder().decode(arrayBuffer);
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    return kml(doc) as GeoJSON.FeatureCollection;
  }

  // KMZ is a ZIP containing a .kml
  const zip = await JSZip.loadAsync(arrayBuffer);
  let kmlContent: string | null = null;

  for (const [name, zipEntry] of Object.entries(zip.files)) {
    if (name.toLowerCase().endsWith('.kml') && !zipEntry.dir) {
      kmlContent = await zipEntry.async('text');
      break;
    }
  }

  if (!kmlContent) {
    throw new Error('Nenhum arquivo .kml encontrado dentro do KMZ');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlContent, 'text/xml');
  return kml(doc) as GeoJSON.FeatureCollection;
}

const FarmMapTab: React.FC<FarmMapTabProps> = ({ farmId, readOnly = false }) => {
  const [maps, setMaps] = useState<FarmMapData[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.GeoJSON[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing maps
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const data = await listFarmMaps(farmId);
        if (!cancelled) {
          setMaps(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar mapas');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [farmId]);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [-15.7801, -47.9292], // Brazil center
      zoom: 4,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Render GeoJSON layers on map whenever maps change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing layers
    layersRef.current.forEach(layer => map.removeLayer(layer));
    layersRef.current = [];

    const allBounds: L.LatLngBounds[] = [];

    maps.forEach((mapData, index) => {
      if (!mapData.geojson) return;
      const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
      const color = colors[index % colors.length];
      
      try {
        const layer = L.geoJSON(mapData.geojson as GeoJSON.GeoJsonObject, {
          style: () => ({
            color,
            weight: 2.5,
            opacity: 0.85,
            fillColor: color,
            fillOpacity: 0.2,
          }),
          pointToLayer: (_feature, latlng) => {
            return L.circleMarker(latlng, {
              radius: 6,
              fillColor: color,
              color: '#fff',
              weight: 2,
              fillOpacity: 0.8,
            });
          },
          onEachFeature: (feature, featureLayer) => {
            const name = feature.properties?.name || mapData.original_name;
            const desc = feature.properties?.description || '';
            featureLayer.bindPopup(
              `<div style="font-family:sans-serif"><strong>${name}</strong>${desc ? `<br/><span style="font-size:12px;color:#666">${desc}</span>` : ''}</div>`,
            );
          },
        }).addTo(map);

        const bounds = layer.getBounds();
        if (bounds.isValid()) allBounds.push(bounds);
        layersRef.current.push(layer);
      } catch {
        // skip invalid geojson
      }
    });

    if (allBounds.length > 0) {
      let combined = allBounds[0];
      for (let i = 1; i < allBounds.length; i++) {
        combined = combined.extend(allBounds[i]);
      }
      map.fitBounds(combined, { padding: [30, 30], maxZoom: 15 });
    }
  }, [maps]);

  const handleUpload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const valid = fileArray.filter(f => {
      const ext = f.name.toLowerCase();
      return ext.endsWith('.kmz') || ext.endsWith('.kml');
    });

    if (valid.length === 0) {
      setError('Selecione um arquivo .kmz ou .kml');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      for (const file of valid) {
        // Parse the file to get GeoJSON
        const geojson = await parseKmzFile(file);

        // Upload original file to B2
        const storageName = generateFileName(file.name);
        const storagePath = `${STORAGE_PREFIX}/${farmId}/${storageName}`;
        await storageUpload(STORAGE_PREFIX, `${farmId}/${storageName}`, file, {
          contentType: file.name.toLowerCase().endsWith('.kml')
            ? 'application/vnd.google-earth.kml+xml'
            : 'application/vnd.google-earth.kmz',
        });

        // Save metadata to DB
        const saved = await createFarmMap({
          farmId,
          fileName: storageName,
          originalName: file.name,
          fileType: file.name.toLowerCase().endsWith('.kml') ? 'kml' : 'kmz',
          fileSize: file.size,
          storagePath,
          geojson,
        });

        setMaps(prev => [...prev, saved]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar arquivo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [farmId]);

  const handleDelete = useCallback(async (mapData: FarmMapData) => {
    if (!window.confirm(`Excluir mapa "${mapData.original_name}"?`)) return;

    try {
      const { storagePath } = await deleteFarmMapApi(mapData.id);
      // Remove from B2
      const parts = storagePath.split('/');
      const prefix = parts[0];
      const path = parts.slice(1).join('/');
      await storageRemove(prefix, [path]).catch(() => {/* ignore storage errors */});

      setMaps(prev => prev.filter(m => m.id !== mapData.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir mapa');
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  }, [handleUpload]);

  return (
    <fieldset className="border border-ai-border rounded-xl p-4 bg-white">
      <legend className="flex items-center gap-2 text-sm font-semibold text-ai-text px-2">
        <MapPin size={16} className="text-emerald-600" />
        Mapa da Fazenda
      </legend>

      {/* Map Container */}
      <div className="relative rounded-lg overflow-hidden border border-ai-border mb-4" style={{ height: 400 }}>
        <div ref={mapContainerRef} className="w-full h-full" />
        {loading && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-[500]">
            <Loader2 size={24} className="animate-spin text-emerald-600" />
            <span className="ml-2 text-sm text-ai-subtext">Carregando mapas...</span>
          </div>
        )}
        {!loading && maps.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-[400] pointer-events-none">
            <div className="bg-white/90 backdrop-blur-sm rounded-xl px-6 py-4 text-center shadow-sm">
              <Layers size={32} className="text-ai-subtext/40 mx-auto mb-2" />
              <p className="text-sm text-ai-subtext">Nenhum mapa carregado</p>
              <p className="text-xs text-ai-subtext/60 mt-1">Envie um arquivo KMZ ou KML para visualizar</p>
            </div>
          </div>
        )}
      </div>

      {/* Upload Area */}
      {!readOnly && (
        <div
          className={`relative border-2 border-dashed rounded-lg p-6 transition-all cursor-pointer ${
            dragOver
              ? 'border-emerald-500 bg-emerald-50'
              : 'border-ai-border hover:border-emerald-400 hover:bg-emerald-50/30'
          }`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".kmz,.kml"
            multiple
            className="hidden"
            onChange={e => e.target.files && handleUpload(e.target.files)}
          />
          <div className="flex flex-col items-center gap-2 text-center">
            {uploading ? (
              <>
                <Loader2 size={28} className="animate-spin text-emerald-600" />
                <span className="text-sm text-emerald-700 font-medium">Enviando arquivo...</span>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                  <FileUp size={22} className="text-emerald-600" />
                </div>
                <div>
                  <span className="text-sm font-medium text-ai-text">
                    Arraste e solte arquivos KMZ/KML aqui
                  </span>
                  <span className="block text-xs text-ai-subtext mt-0.5">
                    ou clique para selecionar
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-red-50 border border-red-200">
          <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* File list */}
      {maps.length > 0 && (
        <div className="mt-4 space-y-2">
          <h4 className="text-xs font-semibold text-ai-subtext uppercase tracking-wide flex items-center gap-1.5">
            <Upload size={12} />
            Arquivos Carregados ({maps.length})
          </h4>
          {maps.map(mapData => (
            <div
              key={mapData.id}
              className="flex items-center gap-3 p-2.5 rounded-lg bg-ai-surface2/50 border border-ai-border/50 hover:border-ai-border transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <MapPin size={14} className="text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-ai-text truncate">{mapData.original_name}</p>
                <p className="text-[10px] text-ai-subtext">
                  {mapData.file_type.toUpperCase()} • {(mapData.file_size / 1024).toFixed(0)} KB
                  {mapData.created_at && ` • ${new Date(mapData.created_at).toLocaleDateString('pt-BR')}`}
                </p>
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(mapData); }}
                  className="p-1.5 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Excluir mapa"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
};

export default FarmMapTab;
