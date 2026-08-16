// ————————————————————————— ESP32 TELEMETRY & MQTT MONITOR —————————————————————————
function MQTTMonitorView({ currentUser, T, dark, showToast }) {
  const [telemetry, setTelemetry] = useState({
    temp: 24.5,
    humidity: 62.0,
    ph: 5.85,
    ec: 1.65,
    waterLevel: 85,
    pumpWater: true,
    pumpAir: true,
    led: true,
    exhaust: false,
    timestamp: new Date().toLocaleTimeString()
  });

  const [logs, setLogs] = useState([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [codeModalOpen, setCodeModalOpen] = useState(false);

  const fetchTelemetry = async () => {
    try {
      const res = await fetch(`https://grow.thegrowinstones.com/api/mqtt/telemetry/${currentUser.username}`);
      if (res.ok) {
        const result = await res.json();
        if (result.data) {
          setTelemetry({
            ...result.data,
            timestamp: new Date(result.timestamp || Date.now()).toLocaleTimeString()
          });
          setLogs((prev) => [
            { time: new Date().toLocaleTimeString(), topic: result.topic || `growinstones/${currentUser.username}/telemetry`, payload: JSON.stringify(result.data) },
            ...prev.slice(0, 15)
          ]);
        }
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 4000);
    return () => clearInterval(interval);
  }, [currentUser.username]);

  const simulateESP32Payload = async () => {
    setIsSimulating(true);
    const mockData = {
      temp: (23 + Math.random() * 3).toFixed(1),
      humidity: (58 + Math.random() * 8).toFixed(1),
      ph: (5.7 + Math.random() * 0.4).toFixed(2),
      ec: (1.5 + Math.random() * 0.4).toFixed(2),
      waterLevel: Math.floor(80 + Math.random() * 15),
      pumpWater: true,
      pumpAir: true,
      led: true,
      exhaust: Math.random() > 0.5
    };

    try {
      const res = await fetch("https://grow.thegrowinstones.com/api/mqtt/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: currentUser.username,
          topic: `growinstones/${currentUser.username}/telemetry`,
          data: mockData
        })
      });
      if (res.ok) {
        showToast("⚡ Mensagem ESP32 simulada enviada com sucesso!");
        fetchTelemetry();
      }
    } catch (e) {
      showToast("Erro ao simular envio do ESP32.");
    } finally {
      setIsSimulating(false);
    }
  };

  const esp32CodeSnippet = `// ——————————————————————————————————————————————————————————
// CÓDIGO ESP32 PARA GROWINSTONES (HTTP REST / MQTT TELEMETRY)
// Subdomínio: ${currentUser.username}.thegrowinstones.com
// ——————————————————————————————————————————————————————————

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid     = "SUA_REDE_WIFI";
const char* password = "SEU_PASSWORD_WIFI";

const char* serverUrl = "https://grow.thegrowinstones.com/api/mqtt/telemetry";
const char* username  = "${currentUser.username}";

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Conectado!");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<256> doc;
    doc["username"] = username;
    doc["topic"] = "growinstones/${currentUser.username}/telemetry";

    JsonObject data = doc.createNestedObject("data");
    data["temp"] = 24.5;       // Sensor DHT22 / DS18B20
    data["humidity"] = 62.0;   // Sensor umidade
    data["ph"] = 5.85;         // Sensor pH
    data["ec"] = 1.65;         // Sensor EC
    data["waterLevel"] = 85;   // Sensor ultrassônico
    data["pumpWater"] = true;
    data["pumpAir"] = true;
    data["led"] = true;

    String jsonString;
    serializeJson(doc, jsonString);

    int httpResponseCode = http.POST(jsonString);
    Serial.printf("Telemetria enviada! Código HTTP: %d\n", httpResponseCode);
    http.end();
  }
  delay(5000); // Envia a cada 5 segundos
}`;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 w-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold" style={{ color: T.text }}>📡 Telemetria ESP32 / MQTT</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> CONECTADO
            </span>
          </div>
          <p className="text-xs mt-1" style={{ color: T.textMuted }}>
            Acompanhe a leitura dos sensores e estado dos relés enviados pelo microcontrolador ESP32 apontado para seu subdomínio.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCodeModalOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all shadow flex items-center gap-1.5"
            style={{ background: "#0284c7", color: "#ffffff" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            <span>Código ESP32</span>
          </button>

          <button
            onClick={simulateESP32Payload}
            disabled={isSimulating}
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
          >
            <span>{isSimulating ? "Enviando..." : "⚡ Simular Mensagem ESP32"}</span>
          </button>
        </div>
      </div>

      {/* Connection info bar */}
      <div className="p-4 rounded-2xl mb-8 flex items-center justify-between flex-wrap gap-3" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sky-400 bg-sky-500/10 border border-sky-500/30">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/></svg>
          </div>
          <div>
            <div className="text-xs font-bold" style={{ color: T.text }}>Topic MQTT: <code className="text-sky-400 font-mono">growinstones/{currentUser.username}/telemetry</code></div>
            <div className="text-[11px]" style={{ color: T.textMuted }}>Endpoint: <code className="font-mono">https://grow.thegrowinstones.com/api/mqtt/telemetry</code></div>
          </div>
        </div>
        <div className="text-xs font-mono" style={{ color: T.textMuted }}>
          Última leitura: <b style={{ color: T.text }}>{telemetry.timestamp}</b>
        </div>
      </div>

      {/* Sensor Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="p-5 rounded-2xl" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: T.textMuted }}>Temperatura Ar</div>
          <div className="text-3xl font-extrabold font-mono" style={{ color: "#38bdf8" }}>{telemetry.temp} °C</div>
          <div className="text-[11px] mt-2" style={{ color: T.textMuted }}>Ideal: 21.0°C – 26.0°C</div>
        </div>

        <div className="p-5 rounded-2xl" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: T.textMuted }}>Umidade Relativa</div>
          <div className="text-3xl font-extrabold font-mono" style={{ color: "#34d399" }}>{telemetry.humidity} %</div>
          <div className="text-[11px] mt-2" style={{ color: T.textMuted }}>Ideal: 55% – 70%</div>
        </div>

        <div className="p-5 rounded-2xl" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: T.textMuted }}>pH da Solução</div>
          <div className="text-3xl font-extrabold font-mono" style={{ color: "#f59e0b" }}>{telemetry.ph} pH</div>
          <div className="text-[11px] mt-2" style={{ color: T.textMuted }}>Faixa ideal: 5.5 – 6.5</div>
        </div>

        <div className="p-5 rounded-2xl" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: T.textMuted }}>Condutividade (EC)</div>
          <div className="text-3xl font-extrabold font-mono" style={{ color: "#a78bfa" }}>{telemetry.ec} mS/cm</div>
          <div className="text-[11px] mt-2" style={{ color: T.textMuted }}>Faixa ideal: 1.2 – 2.2</div>
        </div>
      </div>

      {/* Actuators & Relays Section */}
      <div className="p-6 rounded-2xl mb-8" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
        <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: T.text }}>Estado dos Atuadores (Relés ESP32)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-3.5 rounded-xl border flex items-center justify-between" style={{ background: T.surface2, borderColor: T.border }}>
            <span className="text-xs font-bold" style={{ color: T.text }}>Bomba d'Água</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${telemetry.pumpWater ? "bg-emerald-500/20 text-emerald-400" : "bg-stone-500/20 text-stone-400"}`}>
              {telemetry.pumpWater ? "LIGADO" : "DESLIGADO"}
            </span>
          </div>

          <div className="p-3.5 rounded-xl border flex items-center justify-between" style={{ background: T.surface2, borderColor: T.border }}>
            <span className="text-xs font-bold" style={{ color: T.text }}>Bomba de Ar</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${telemetry.pumpAir ? "bg-emerald-500/20 text-emerald-400" : "bg-stone-500/20 text-stone-400"}`}>
              {telemetry.pumpAir ? "LIGADO" : "DESLIGADO"}
            </span>
          </div>

          <div className="p-3.5 rounded-xl border flex items-center justify-between" style={{ background: T.surface2, borderColor: T.border }}>
            <span className="text-xs font-bold" style={{ color: T.text }}>Painel LED</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${telemetry.led ? "bg-emerald-500/20 text-emerald-400" : "bg-stone-500/20 text-stone-400"}`}>
              {telemetry.led ? "LIGADO" : "DESLIGADO"}
            </span>
          </div>

          <div className="p-3.5 rounded-xl border flex items-center justify-between" style={{ background: T.surface2, borderColor: T.border }}>
            <span className="text-xs font-bold" style={{ color: T.text }}>Exaustor</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${telemetry.exhaust ? "bg-emerald-500/20 text-emerald-400" : "bg-stone-500/20 text-stone-400"}`}>
              {telemetry.exhaust ? "LIGADO" : "DESLIGADO"}
            </span>
          </div>
        </div>
      </div>

      {/* Incoming JSON Payload Logs Table */}
      <div className="p-6 rounded-2xl" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
        <h3 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: T.text }}>Histórico de Payloads Recebidos (Feed)</h3>
        {logs.length === 0 ? (
          <p className="text-xs" style={{ color: T.textMuted }}>Aguardando primeira mensagem do ESP32 ou clique em "Simular Mensagem ESP32".</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log, i) => (
              <div key={i} className="p-3 rounded-xl font-mono text-xs flex items-center justify-between gap-3 overflow-x-auto" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                <span className="text-stone-400 shrink-0">{log.time}</span>
                <span className="text-sky-400 shrink-0">{log.topic}</span>
                <span className="text-stone-200 truncate">{log.payload}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Code Modal */}
      {codeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}>
          <div className="w-full max-w-2xl p-6 rounded-2xl text-left shadow-2xl relative space-y-4" style={{ background: "#1c1917", border: "1px solid #383532", color: "#f5f5f4" }}>
            <button onClick={() => setCodeModalOpen(false)} className="absolute top-4 right-4 text-stone-400 hover:text-white font-bold text-sm">✕</button>

            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sky-400 bg-sky-500/10 border border-sky-500/30">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Código C++ para ESP32 (Arduino IDE)</h3>
                <p className="text-xs text-stone-400">Pré-configurado para enviar dados diretamente para o seu subdomínio</p>
              </div>
            </div>

            <div className="relative">
              <pre className="p-4 rounded-xl font-mono text-xs text-emerald-400 overflow-x-auto max-h-96" style={{ background: "#0c0a09", border: "1px solid #292524" }}>
                {esp32CodeSnippet}
              </pre>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(esp32CodeSnippet);
                  showToast("✓ Código ESP32 copiado para a área de transferência!");
                }}
                className="absolute top-3 right-3 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white shadow"
              >
                📋 Copiar Código
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



import { useState, useMemo, useEffect, useRef } from "react";
import Logo, { getLogoSvgString } from "./Logo";

// ————— Dados de referência —————
const POT_SIZES = [
  { label: "3,5 L", liters: 3.5, diameter: 18, shape: "circle" },
  { label: "7 L", liters: 7, diameter: 22, shape: "circle" },
  { label: "11 L", liters: 11, diameter: 26, shape: "circle" },
  { label: "15 L", liters: 15, diameter: 30, shape: "circle" },
  { label: "20 L", liters: 20, diameter: 33, shape: "circle" },
  { label: "30 L", liters: 30, diameter: 38, shape: "circle" },
  { label: "40 L (60×40)", liters: 40, widthCm: 60, depthCm: 40, shape: "rect" },
  { label: "50 L", liters: 50, diameter: 45, shape: "circle" },
  { label: "80 L", liters: 80, diameter: 52, shape: "circle" },
];

const PIPE_GAUGES = [
  { label: "10 mm", mm: 10, flow: "microduto · capilar / gotejamento ind." },
  { label: "16 mm", mm: 16, flow: "baixo fluxo · gotejamento" },
  { label: "20 mm", mm: 20, flow: "fluxo médio · até 8 vasos" },
  { label: "25 mm", mm: 25, flow: "fluxo alto · até 16 vasos" },
  { label: "32 mm", mm: 32, flow: "linha principal · 16+ vasos" },
  { label: "50 mm", mm: 50, flow: "alta vazão / drenagem · 32+ vasos" },
  { label: "75 mm", mm: 75, flow: "coletor / drenagem máster" },
];

const CONNECTIONS = [
  { id: "espinha", name: "Espinha de peixe (linha central + ramais)", short: "Espinha", desc: "Linha principal central distribuindo para ramais laterais em cada vaso. Ótimo equilíbrio e distribuição de vazão." },
  { id: "serpentina", name: "Serpentina (série)", short: "Série", desc: "Uma linha única passa vaso a vaso em zigue-zague. Econômica em tubulação, ideal para poucos vasos." },
  { id: "paralelo", name: "Paralelo (manifold de alimentação)", short: "Paralelo", desc: "Manifold coletor distribuidor na frente alimentando linhas independentes por coluna com 1 saída de retorno ao tanque." },
  { id: "anel", name: "Anel recirculante (RDWC)", short: "Anel", desc: "Circuito fechado ligando todos os vasos em loop com 1 retorno contínuo ao reservatório — padrão em DWC recirculante." },
  { id: "gotejo_coletor", name: "Gotejo + Calha Central (drenagem)", short: "Calha", desc: "Irrigação por capilares e calha central de recolhimento que conduz a drenagem em 1 saída de volta ao reservatório." },
  { id: "malha_grid", name: "Malha em Grid (pressurizada)", short: "Grid", desc: "Anel perimetral fechado equalizando a pressão de irrigação em todos os vasos sem perda de carga." },
];

const EQUIPMENT = [
  { id: "led", name: "Board de LED", defW: 240, hours: 18, max: 8, defCost: 600 },
  { id: "exaustor", name: "Exaustor", defW: 45, hours: 24, max: 4, defCost: 250 },
  { id: "filtro", name: "Filtro de carvão", defW: 0, hours: 0, max: 4, defCost: 180 },
  { id: "ventilador", name: "Ventilador de circulação", defW: 25, hours: 24, max: 6, defCost: 90 },
  { id: "bombaAgua", name: "Bomba de água", defW: 35, hours: 24, max: 4, defCost: 120 },
  { id: "bombaAr", name: "Bomba de ar", defW: 8, hours: 24, max: 4, defCost: 60 },
  { id: "tanque", name: "Tanque / reservatório extra", defW: 0, hours: 0, max: 3, defCost: 100 },
  { id: "umidificador", name: "Umidificador", defW: 30, hours: 12, max: 2, defCost: 250 },
  { id: "desumidificador", name: "Desumidificador", defW: 200, hours: 8, max: 2, defCost: 900 },
  { id: "aquecedor", name: "Aquecedor", defW: 500, hours: 6, max: 2, defCost: 150 },
  { id: "phec", name: "Medidor pH / EC", defW: 2, hours: 24, max: 2, defCost: 200 },
  { id: "timer", name: "Timer digital", defW: 1, hours: 24, max: 8, defCost: 30 },
];

const BASE_COSTS = { pot: 15, pipeM: 4, fitting: 3, reservoir: 120 };

const INITIAL_PRESETS = [
  {
    id: "preset-micro",
    name: "Micro · 2 vasos DWC",
    apply: { width: 80, depth: 80, height: 180, potCount: 2, potIdx: 4, gaugeIdx: 2, spacing: 20, cols: 0, conn: "anel" },
    equip: { led: 1, exaustor: 1, filtro: 1, ventilador: 1, bombaAgua: 0, bombaAr: 1, tanque: 1, umidificador: 0, desumidificador: 0, aquecedor: 0, phec: 1, timer: 1 },
    data: {
      growName: "Micro · 2 vasos DWC",
      width: 80, depth: 80, height: 180, potCount: 2, potIdx: 4, gaugeIdx: 2, spacing: 20, cols: 0, conn: "anel",
      equip: { led: 1, exaustor: 1, filtro: 1, ventilador: 1, bombaAgua: 0, bombaAr: 1, tanque: 1, umidificador: 0, desumidificador: 0, aquecedor: 0, phec: 1, timer: 1 },
      vegaHours: 18, floraHours: 12, vegaDays: 30, floraDays: 60, yieldPerPlant: 80, priceG: 50, tariff: 0.95,
    }
  },
  {
    id: "preset-padrao",
    name: "Padrão · 8 vasos gotejo",
    apply: { width: 240, depth: 120, height: 200, potCount: 8, potIdx: 2, gaugeIdx: 2, spacing: 15, cols: 4, conn: "espinha" },
    equip: { led: 2, exaustor: 1, filtro: 1, ventilador: 2, bombaAgua: 1, bombaAr: 1, tanque: 1, umidificador: 0, desumidificador: 0, aquecedor: 0, phec: 1, timer: 2 },
    data: {
      growName: "Padrão · 8 vasos gotejo",
      width: 240, depth: 120, height: 200, potCount: 8, potIdx: 2, gaugeIdx: 2, spacing: 15, cols: 4, conn: "espinha",
      equip: { led: 2, exaustor: 1, filtro: 1, ventilador: 2, bombaAgua: 1, bombaAr: 1, tanque: 1, umidificador: 0, desumidificador: 0, aquecedor: 0, phec: 1, timer: 2 },
      vegaHours: 18, floraHours: 12, vegaDays: 30, floraDays: 60, yieldPerPlant: 80, priceG: 50, tariff: 0.95,
    }
  },
  {
    id: "preset-ampla",
    name: "Ampla · 16 vasos",
    apply: { width: 300, depth: 150, height: 220, potCount: 16, potIdx: 1, gaugeIdx: 3, spacing: 12, cols: 0, conn: "paralelo" },
    equip: { led: 4, exaustor: 2, filtro: 2, ventilador: 3, bombaAgua: 2, bombaAr: 2, tanque: 2, umidificador: 1, desumidificador: 0, aquecedor: 0, phec: 1, timer: 4 },
    data: {
      growName: "Ampla · 16 vasos",
      width: 300, depth: 150, height: 220, potCount: 16, potIdx: 1, gaugeIdx: 3, spacing: 12, cols: 0, conn: "paralelo",
      equip: { led: 4, exaustor: 2, filtro: 2, ventilador: 3, bombaAgua: 2, bombaAr: 2, tanque: 2, umidificador: 1, desumidificador: 0, aquecedor: 0, phec: 1, timer: 4 },
      vegaHours: 18, floraHours: 12, vegaDays: 30, floraDays: 60, yieldPerPlant: 80, priceG: 50, tariff: 0.95,
    }
  },
];
const PRESETS = INITIAL_PRESETS;

const fmtBRL = (v) => {
  if (!isFinite(v)) return "R$ 0";
  const abs = Math.abs(v);
  if (abs > 0 && abs < 1) {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return Math.round(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
};
const fmtG = (v) => {
  if (!isFinite(v)) return "0 g";
  if (v >= 1000) {
    const kg = v / 1000;
    return `${kg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
  }
  return `${Math.round(v)} g`;
};



// Inputs com rascunho local: permitem digitar livremente e só normalizam ao sair do campo
function NumInput({ value, onCommit, min = 0, max = 999999, className, style }) {
  const [draft, setDraft] = useState(null); // null = não está editando
  const clamp = (n) => Math.min(max, Math.max(min, n));
  return (
    <input
      type="number"
      inputMode="numeric"
      value={draft !== null ? draft : value}
      min={min}
      max={max}
      className={className}
      style={style}
      onFocus={(e) => setDraft(String(value))}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        const n = Number(v);
        if (v !== "" && isFinite(n)) onCommit(clamp(n));
      }}
      onBlur={() => {
        const n = Number(draft);
        if (draft !== null && draft !== "" && isFinite(n)) onCommit(clamp(n));
        setDraft(null);
      }}
    />
  );
}

function MoneyInput({ value, onCommit, className, style }) {
  const [draft, setDraft] = useState(null);
  return (
    <input
      type="number"
      inputMode="decimal"
      step="0.01"
      min={0}
      value={draft !== null ? draft : value}
      className={className}
      style={style}
      onFocus={() => setDraft(String(value))}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        const n = Number(v);
        if (v !== "" && isFinite(n) && n >= 0) onCommit(n);
      }}
      onBlur={() => {
        const n = Number(draft);
        if (draft !== null && draft !== "" && isFinite(n) && n >= 0) onCommit(n);
        setDraft(null);
      }}
    />
  );
}

function IsometricPotSVG({ potW, potD, potH, potLiters, isRect, isSquare, dark, T }) {
  const svgW = 320;
  const svgH = 180;

  const isBox = isRect || isSquare;

  // Calculo de escala proporcional dinamica para caber 100% no canvas
  const scaleX = 200 / ((potW + potD) * 0.866);
  const scaleY = 110 / (potH * 0.85 + (potW + potD) * 0.5);
  const scale = Math.min(1.4, Math.max(0.4, scaleX, scaleY));

  const cos30 = 0.866;
  const sin30 = 0.5;

  const kX = cos30 * scale;
  const kY = sin30 * scale;
  const kZ = 0.85 * scale;

  const dxX = potW * kX;
  const dyX = potW * kY;
  const dxY = potD * kX;
  const dyY = potD * kY;
  const dz = potH * kZ;

  // Centralização geométrica exata dentro do viewBox 320x180
  const cx = 160 + (dxY - dxX) / 2;
  const cy = 90 + (dz - (dyX + dyY)) / 2 + 5;

  const strokeColor = dark ? "#e4e4e7" : "#475569";
  const rimColor = dark ? "#52525b" : "#cbd5e1";
  const sideLeftFill = dark ? "#27272a" : "#e2e8f0";
  const sideRightFill = dark ? "#3f3f46" : "#ffffff";
  const topFill = dark ? "#1c1917" : "#fef3c7";
  const soilInner = dark ? "#292524" : "#d97706";
  const cotaColor = dark ? "#fbbf24" : "#b45309";
  const cotaLine = dark ? "#f59e0b" : "#d97706";

  if (isBox) {
    const p0 = [cx, cy];
    const p1 = [cx + dxX, cy + dyX];
    const p2 = [cx + dxX - dxY, cy + dyX + dyY];
    const p3 = [cx - dxY, cy + dyY];

    const t0 = [cx, cy - dz];
    const t1 = [cx + dxX, cy + dyX - dz];
    const t2 = [cx + dxX - dxY, cy + dyX + dyY - dz];
    const t3 = [cx - dxY, cy + dyY - dz];

    const insetRatio = 0.12;
    const i0 = [t0[0] + (t2[0] - t0[0]) * insetRatio, t0[1] + (t2[1] - t0[1]) * insetRatio];
    const i1 = [t1[0] + (t3[0] - t1[0]) * insetRatio, t1[1] + (t3[1] - t1[1]) * insetRatio];
    const i2 = [t2[0] + (t0[0] - t2[0]) * insetRatio, t2[1] + (t0[1] - t2[1]) * insetRatio];
    const i3 = [t3[0] + (t1[0] - t3[0]) * insetRatio, t3[1] + (t1[1] - t3[1]) * insetRatio];

    return (
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-auto max-w-[320px] mx-auto block">
        {/* Sombra da base no chão */}
        <polygon points={`${p0[0]},${p0[1]} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]}`} fill="rgba(0,0,0,0.12)" />

        {/* Linhas ocultas da estrutura traseira (Tracejadas 3D) */}
        <line x1={p2[0]} y1={p2[1]} x2={p1[0]} y2={p1[1]} stroke={strokeColor} strokeWidth={1} strokeDasharray="3 3" opacity={0.45} />
        <line x1={p2[0]} y1={p2[1]} x2={p3[0]} y2={p3[1]} stroke={strokeColor} strokeWidth={1} strokeDasharray="3 3" opacity={0.45} />
        <line x1={p2[0]} y1={p2[1]} x2={t2[0]} y2={t2[1]} stroke={strokeColor} strokeWidth={1} strokeDasharray="3 3" opacity={0.45} />

        {/* Face Esquerda (Frente-Esquerda) */}
        <polygon points={`${p0[0]},${p0[1]} ${p3[0]},${p3[1]} ${t3[0]},${t3[1]} ${t0[0]},${t0[1]}`}
          fill={sideLeftFill} stroke={strokeColor} strokeWidth={1.5} strokeLinejoin="round" />

        {/* Face Direita (Frente-Direita) */}
        <polygon points={`${p0[0]},${p0[1]} ${p1[0]},${p1[1]} ${t1[0]},${t1[1]} ${t0[0]},${t0[1]}`}
          fill={sideRightFill} stroke={strokeColor} strokeWidth={1.5} strokeLinejoin="round" />

        {/* Face do Topo (Borda do Vaso) */}
        <polygon points={`${t0[0]},${t0[1]} ${t1[0]},${t1[1]} ${t2[0]},${t2[1]} ${t3[0]},${t3[1]}`}
          fill={rimColor} stroke={strokeColor} strokeWidth={1.5} strokeLinejoin="round" />

        {/* Vincos dos Cantos da Borda Interna */}
        <line x1={t0[0]} y1={t0[1]} x2={i0[0]} y2={i0[1]} stroke={strokeColor} strokeWidth={1} />
        <line x1={t1[0]} y1={t1[1]} x2={i1[0]} y2={i1[1]} stroke={strokeColor} strokeWidth={1} />
        <line x1={t2[0]} y1={t2[1]} x2={i2[0]} y2={i2[1]} stroke={strokeColor} strokeWidth={1} />
        <line x1={t3[0]} y1={t3[1]} x2={i3[0]} y2={i3[1]} stroke={strokeColor} strokeWidth={1} />

        {/* Substrato no topo */}
        <polygon points={`${i0[0]},${i0[1]} ${i1[0]},${i1[1]} ${i2[0]},${i2[1]} ${i3[0]},${i3[1]}`}
          fill={topFill} stroke={soilInner} strokeWidth={1.2} />

        {/* Linhas estruturais externas principais reforçadas */}
        <line x1={p0[0]} y1={p0[1]} x2={t0[0]} y2={t0[1]} stroke={strokeColor} strokeWidth={1.8} />
        <line x1={p1[0]} y1={p1[1]} x2={t1[0]} y2={t1[1]} stroke={strokeColor} strokeWidth={1.8} />
        <line x1={p3[0]} y1={p3[1]} x2={t3[0]} y2={t3[1]} stroke={strokeColor} strokeWidth={1.8} />
        <line x1={p0[0]} y1={p0[1]} x2={p1[0]} y2={p1[1]} stroke={strokeColor} strokeWidth={1.8} />
        <line x1={p0[0]} y1={p0[1]} x2={p3[0]} y2={p3[1]} stroke={strokeColor} strokeWidth={1.8} />
        <line x1={t0[0]} y1={t0[1]} x2={t1[0]} y2={t1[1]} stroke={strokeColor} strokeWidth={1.8} />
        <line x1={t0[0]} y1={t0[1]} x2={t3[0]} y2={t3[1]} stroke={strokeColor} strokeWidth={1.8} />
        <line x1={t1[0]} y1={t1[1]} x2={t2[0]} y2={t2[1]} stroke={strokeColor} strokeWidth={1.8} />
        <line x1={t3[0]} y1={t3[1]} x2={t2[0]} y2={t2[1]} stroke={strokeColor} strokeWidth={1.8} />

        {/* Cota Largura (Frente-Direita) */}
        <g>
          <line x1={p0[0]} y1={p0[1] + 6} x2={p1[0]} y2={p1[1] + 6} stroke={cotaLine} strokeWidth={1.2} strokeDasharray="3 2" />
          <rect x={(p0[0] + p1[0]) / 2 - 18} y={(p0[1] + p1[1]) / 2 + 1} width={36} height={13} rx={3} fill={T.surface} opacity={0.92} />
          <text x={(p0[0] + p1[0]) / 2} y={(p0[1] + p1[1]) / 2 + 10} textAnchor="middle" fontSize="9" fontWeight="700" fill={cotaColor}>
            {potW} cm
          </text>
        </g>
        {/* Cota Comprimento / Profundidade (Frente-Esquerda) */}
        <g>
          <line x1={p0[0]} y1={p0[1] + 6} x2={p3[0]} y2={p3[1] + 6} stroke={cotaLine} strokeWidth={1.2} strokeDasharray="3 2" />
          <rect x={(p0[0] + p3[0]) / 2 - 18} y={(p0[1] + p3[1]) / 2 + 1} width={36} height={13} rx={3} fill={T.surface} opacity={0.92} />
          <text x={(p0[0] + p3[0]) / 2} y={(p0[1] + p3[1]) / 2 + 10} textAnchor="middle" fontSize="9" fontWeight="700" fill={cotaColor}>
            {potD} cm
          </text>
        </g>
        {/* Cota Altura (Vertical Frontal) */}
        <g>
          <line x1={p0[0] - 8} y1={p0[1]} x2={t0[0] - 8} y2={t0[1]} stroke={cotaLine} strokeWidth={1.2} strokeDasharray="3 2" />
          <rect x={p0[0] - 38} y={(p0[1] + t0[1]) / 2 - 6} width={36} height={13} rx={3} fill={T.surface} opacity={0.92} />
          <text x={p0[0] - 20} y={(p0[1] + t0[1]) / 2 + 3} textAnchor="middle" fontSize="9" fontWeight="700" fill={cotaColor}>
            {potH} cm
          </text>
        </g>

        {/* Badge Litragem */}
        <g transform="translate(232, 12)">
          <rect width="76" height="24" rx="12" fill={T.accentBg} stroke={T.accentBorder} strokeWidth="1.2" />
          <text x="38" y="16" textAnchor="middle" fontSize="10.5" fontWeight="800" fill={T.text}>
            {potLiters} L
          </text>
        </g>
      </svg>
    );
  }

  const cylRadius = (potW / 2) * scale;
  const rx = cylRadius * 1.15;
  const ry = cylRadius * 0.55;
  const roundCy = 90 + (dz / 2) - 4;
  const topCy = roundCy - dz;

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-auto max-w-[320px] mx-auto block">
      {/* Sombra no chão */}
      <ellipse cx={160} cy={roundCy} rx={rx * 1.05} ry={ry * 1.05} fill="rgba(0,0,0,0.12)" />

      {/* Arco traseiro oculto da base (Tracejado 3D) */}
      <path
        d={`M ${160 - rx} ${roundCy} A ${rx} ${ry} 0 0 1 ${160 + rx} ${roundCy}`}
        fill="none" stroke={strokeColor} strokeWidth={1} strokeDasharray="3 3" opacity={0.45}
      />

      {/* Corpo do Cilindro */}
      <path
        d={`M ${160 - rx} ${topCy} L ${160 - rx} ${roundCy} A ${rx} ${ry} 0 0 0 ${160 + rx} ${roundCy} L ${160 + rx} ${topCy} Z`}
        fill={sideRightFill} stroke={strokeColor} strokeWidth={1.8} strokeLinejoin="round"
      />

      {/* Borda superior externa */}
      <ellipse cx={160} cy={topCy} rx={rx} ry={ry} fill={rimColor} stroke={strokeColor} strokeWidth={1.8} />

      {/* Substrato interno */}
      <ellipse cx={160} cy={topCy} rx={rx * 0.85} ry={ry * 0.85} fill={topFill} stroke={soilInner} strokeWidth={1.2} />

      {/* Linhas verticais de contorno reforçadas */}
      <line x1={160 - rx} y1={topCy} x2={160 - rx} y2={roundCy} stroke={strokeColor} strokeWidth={1.8} />
      <line x1={160 + rx} y1={topCy} x2={160 + rx} y2={roundCy} stroke={strokeColor} strokeWidth={1.8} />

      <g>
        <line x1={160 - rx} y1={topCy - ry - 6} x2={160 + rx} y2={topCy - ry - 6} stroke={cotaLine} strokeWidth={1.2} strokeDasharray="3 2" />
        <rect x={160 - 24} y={topCy - ry - 14} width={48} height={13} rx={3} fill={T.surface} opacity={0.92} />
        <text x={160} y={topCy - ry - 4} textAnchor="middle" fontSize="9" fontWeight="700" fill={cotaColor}>
          ⌀ {potW} cm
        </text>
      </g>
      <g>
        <line x1={160 - rx - 8} y1={roundCy} x2={160 - rx - 8} y2={topCy} stroke={cotaLine} strokeWidth={1.2} strokeDasharray="3 2" />
        <rect x={160 - rx - 40} y={(roundCy + topCy) / 2 - 6} width={36} height={13} rx={3} fill={T.surface} opacity={0.92} />
        <text x={160 - rx - 22} y={(roundCy + topCy) / 2 + 3} textAnchor="middle" fontSize="9" fontWeight="700" fill={cotaColor}>
          {potH} cm
        </text>
      </g>

      <g transform="translate(232, 12)">
        <rect width="76" height="24" rx="12" fill={T.accentBg} stroke={T.accentBorder} strokeWidth="1.2" />
        <text x="38" y="16" textAnchor="middle" fontSize="10.5" fontWeight="800" fill={T.text}>
          {potLiters} L
        </text>
      </g>
    </svg>
  );
}

function CollapsibleCard({ title, subtitle, defaultOpen = true, children, action, className = "", T, dark }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`rounded-2xl transition-all duration-200 ${open ? "p-5" : "px-5 py-3.5"} ${className}`}
      style={{
        background: T.surface,
        border: `1px solid ${T.borderSoft}`,
        boxShadow: dark ? "none" : "0 1px 2px rgba(31,27,22,0.04)"
      }}>
      <div
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between cursor-pointer select-none group">
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider transition-colors group-hover:text-amber-500"
            style={{ color: T.faint, letterSpacing: "0.14em" }}>
            {title}
          </h2>
          {!open && subtitle && (
            <span className="text-xs font-medium truncate px-2.5 py-0.5 rounded-md"
              style={{ background: T.surface2, color: T.text, border: `1px solid ${T.border}` }}>
              {subtitle}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          {action}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            title={open ? "Recolher card" : "Expandir card"}
            aria-label={open ? "Recolher card" : "Expandir card"}
            className="w-6 h-6 rounded-md flex items-center justify-center transition-transform hover:opacity-80"
            style={{ background: T.surface2, color: T.muted, border: `1px solid ${T.border}` }}>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}


const calculatePresetMetrics = (preset) => {
  const data = preset.data || {};
  const apply = preset.apply || {};
  const equipData = preset.equip || data.equip || {};

  const w = data.width || apply.width || 240;
  const d = data.depth || apply.depth || 120;
  const h = data.height || apply.height || 200;
  const potCount = data.potCount || apply.potCount || 8;
  const potIdx = data.potIdx !== undefined ? data.potIdx : (apply.potIdx !== undefined ? apply.potIdx : 2);

  const isCustomPot = potIdx >= POT_SIZES.length;
  let potObj;
  if (isCustomPot) {
    const cW = data.customPotW !== undefined ? data.customPotW : (apply.customPotW !== undefined ? apply.customPotW : 30);
    const cL = data.customPotL !== undefined ? data.customPotL : (apply.customPotL !== undefined ? apply.customPotL : 30);
    const cH = data.customPotH !== undefined ? data.customPotH : (apply.customPotH !== undefined ? apply.customPotH : 30);
    const customLiters = Math.round(((cW * cL * cH) / 1000) * 10) / 10;
    potObj = {
      label: `${customLiters} L (Custom)`,
      liters: customLiters,
      widthCm: cW,
      depthCm: cL,
      heightCm: cH,
      isCustom: true,
    };
  } else {
    potObj = POT_SIZES[potIdx] || POT_SIZES[2];
  }

  const areaM2 = (w * d) / 10000;
  const volM3 = (areaM2 * h) / 100;

  const yPerPlant = data.yieldPerPlant !== undefined ? data.yieldPerPlant : 80;
  const pG = data.priceG !== undefined ? data.priceG : 50;
  const trf = data.tariff !== undefined ? data.tariff : 0.95;

  const vDays = data.vegaDays !== undefined ? data.vegaDays : 30;
  const fDays = data.floraDays !== undefined ? data.floraDays : 60;
  const cDays = Math.max(1, vDays + fDays);
  const hYear = 365 / cDays;

  const yieldHarvestG = potCount * yPerPlant;
  const yieldYearG = yieldHarvestG * hYear;
  const yieldM2 = areaM2 > 0 ? yieldHarvestG / areaM2 : 0;

  const wattsMap = data.watts || Object.fromEntries(EQUIPMENT.map((e) => [e.id, e.defW]));
  let totalW = 0;
  EQUIPMENT.forEach((eq) => {
    const qty = equipData[eq.id] || 0;
    const wVal = wattsMap[eq.id] || eq.defW;
    totalW += qty * wVal;
  });

  const gPerW = totalW > 0 ? yieldYearG / totalW : 0;

  const costsMap = data.costs || { ...BASE_COSTS, ...Object.fromEntries(EQUIPMENT.map((e) => [e.id, e.defCost])) };
  let capex = 0;
  capex += potCount * (costsMap.pot || 15);
  capex += (w / 100) * 2 * (costsMap.pipeM || 4);
  capex += potCount * 2 * (costsMap.fitting || 3);
  capex += costsMap.reservoir || 120;
  EQUIPMENT.forEach((eq) => {
    const qty = equipData[eq.id] || 0;
    const unitCost = costsMap[eq.id] || eq.defCost;
    capex += qty * unitCost;
  });
  capex += data.extraCost || 0;

  const capexPerPlant = potCount > 0 ? capex / potCount : 0;

  const vHours = data.vegaHours || 18;
  const fHours = data.floraHours || 12;
  const avgHoursDay = cDays > 0 ? (vDays * vHours + fDays * fHours) / cDays : 18;
  const kwhMonth = (totalW * avgHoursDay * 30) / 1000;
  const energyCostMonth = kwhMonth * trf;
  const monthlyInsumos = data.monthlyCost || 0;
  const opexMonth = energyCostMonth + monthlyInsumos;
  const opexCycle = opexMonth * (cDays / 30);
  const opexYear = opexMonth * 12;

  const revHarvest = yieldHarvestG * pG;
  const revYear = yieldYearG * pG;
  const netProfitYear = revYear - opexYear;
  const profitHarvest = revHarvest - opexCycle;
  const paybackMonths = profitHarvest > 0 ? capex / (profitHarvest / (cDays / 30)) : null;

  // Cost-to-Return & Cost per Gram Ratios
  const ratioHarvest = opexCycle > 0 && pG > 0 ? revHarvest / opexCycle : 0;
  const ratioYear = opexYear > 0 && pG > 0 ? revYear / opexYear : 0;
  const capexRoiYear = capex > 0 && pG > 0 ? (netProfitYear / capex) * 100 : 0;
  const costPerGramOpex = yieldYearG > 0 ? opexYear / yieldYearG : 0;
  const costPerGramTotal = yieldYearG > 0 ? (capex + opexYear) / yieldYearG : 0;

  return {
    id: preset.id || preset.name,
    name: preset.name,
    width: w, depth: d, height: h,
    areaM2, volM3,
    potCount, potLabel: potObj.label,
    yPerPlant,
    cDays, hYear,
    yieldHarvestG, yieldYearG, yieldM2,
    totalW, gPerW,
    kwhMonth, opexMonth, opexCycle, opexYear,
    capex, capexPerPlant,
    priceG: pG,
    revHarvest, revYear,
    netProfitYear, profitHarvest, paybackMonths,
    ratioHarvest, ratioYear, capexRoiYear,
    costPerGramOpex, costPerGramTotal,
  };
};

function ComparisonView({ allPresets, loadPreset, removePreset, restoreDefaultPresets, addCurrentAsPreset, T, dark }) {
  const [compMode, setCompMode] = useState("all"); // "all" | "custom" | "individual"
  const [selectedIds, setSelectedIds] = useState(() => allPresets.map((p) => p.id || p.name));
  const [singleId, setSingleId] = useState(() => (allPresets.length > 0 ? (allPresets[0].id || allPresets[0].name) : ""));

  useEffect(() => {
    if (compMode === "all") {
      setSelectedIds(allPresets.map((p) => p.id || p.name));
    }
  }, [allPresets, compMode]);

  if (!allPresets || allPresets.length === 0) {
    return (
      <div className="rounded-2xl p-12 text-center my-8" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: T.surface, border: `1px solid ${T.accentBorder}`, color: T.text }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
        </div>
        <h3 className="text-xl font-bold mb-2" style={{ color: T.text }}>Nenhum chip de setup para comparar</h3>
        <p className="text-sm max-w-md mx-auto mb-6" style={{ color: T.muted }}>
          Adicione o setup atual como um novo chip ou restaure os presets padrão para visualizar gráficos e tabelas comparativas.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button onClick={addCurrentAsPreset} className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            style={{ background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>Salvar setup atual como chip</span>
          </button>
          <button onClick={restoreDefaultPresets} className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            <span>Restaurar presets padrão</span>
          </button>
        </div>
      </div>
    );
  }

  const toggleSelectId = (id) => {
    if (selectedIds.includes(id)) {
      if (selectedIds.length === 1) return;
      setSelectedIds(selectedIds.filter((x) => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const allMetrics = allPresets.map((p) => calculatePresetMetrics(p));

  const activeMetricsList = compMode === "individual"
    ? allMetrics.filter((m) => m.id === (singleId || (allPresets[0].id || allPresets[0].name)))
    : compMode === "custom"
    ? allMetrics.filter((m) => selectedIds.includes(m.id))
    : allMetrics;

  const metricsList = activeMetricsList.length > 0 ? activeMetricsList : allMetrics;

  const topYield = [...metricsList].sort((a, b) => b.yieldYearG - a.yieldYearG)[0];
  const lowestCapex = [...metricsList].sort((a, b) => a.capex - b.capex)[0];
  const lowestCostPerG = [...metricsList].sort((a, b) => a.costPerGramOpex - b.costPerGramOpex)[0];
  const topEfficiency = [...metricsList].sort((a, b) => b.gPerW - a.gPerW)[0];
  const validPaybackList = metricsList.filter((m) => m.paybackMonths && m.paybackMonths > 0);
  const lowestPayback = validPaybackList.length > 0 ? [...validPaybackList].sort((a, b) => a.paybackMonths - b.paybackMonths)[0] : null;

  const maxYieldG = Math.max(...metricsList.map((m) => m.yieldYearG), 1);
  const maxCapex = Math.max(...metricsList.map((m) => m.capex), 1);
  const maxOpex = Math.max(...metricsList.map((m) => m.opexMonth), 1);
  const maxRatioHarvest = Math.max(...metricsList.map((m) => m.ratioHarvest), 1);
  const maxRatioYear = Math.max(...metricsList.map((m) => m.ratioYear), 1);
  const maxCostPerG = Math.max(...metricsList.map((m) => m.costPerGramOpex), 1);

  const singlePresetMetrics = allMetrics.find((m) => m.id === singleId) || allMetrics[0];
  const otherMetrics = allMetrics.filter((m) => m.id !== singlePresetMetrics.id);
  const otherPresetsAverage = otherMetrics.length > 0
    ? {
        yieldYearG: otherMetrics.reduce((acc, m) => acc + m.yieldYearG, 0) / otherMetrics.length,
        capex: otherMetrics.reduce((acc, m) => acc + m.capex, 0) / otherMetrics.length,
        opexMonth: otherMetrics.reduce((acc, m) => acc + m.opexMonth, 0) / otherMetrics.length,
        costPerGramOpex: otherMetrics.reduce((acc, m) => acc + m.costPerGramOpex, 0) / otherMetrics.length,
      }
    : null;

  // Soft Pastel Palette (Theme-aware for maximum legibility and elegance)
  const pastelMintText = dark ? "#a3e635" : "#15803d";
  const pastelMintBar = dark ? "#a3e635" : "#86efac";
  const pastelMintBg = dark ? "rgba(163, 230, 53, 0.1)" : "rgba(21, 128, 61, 0.08)";

  const pastelPeachText = dark ? "#fde047" : "#b45309";
  const pastelPeachBar = dark ? "#fef08a" : "#fde047";

  const pastelSkyText = dark ? "#7dd3fc" : "#0284c7";
  const pastelSkyBar = dark ? "#bae6fd" : "#7dd3fc";

  const pastelLavenderText = dark ? "#c7d2fe" : "#4338ca";
  const pastelLavenderBar = dark ? "#c7d2fe" : "#a5b4fc";

  return (
    <div className="space-y-6 my-4">
      {/* Top Header Toolbar & Mode Switcher */}
      <div className="p-5 rounded-2xl space-y-4" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2" style={{ color: T.text }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              <span>Painel Comparativo de Setups</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                style={{ background: T.surface, border: `1px solid ${T.accentBorder}`, color: T.text }}>
                {metricsList.length} de {allPresets.length} setup(s) em análise
              </span>
            </h2>
            <p className="text-xs mt-1" style={{ color: T.muted }}>
              Visualização gráfica e tabular das métricas resultantes de cada chip de cultivo.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={addCurrentAsPreset} className="px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              style={{ background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>Salvar setup atual</span>
            </button>
            <button onClick={restoreDefaultPresets} className="px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              <span>Restaurar padrões</span>
            </button>
          </div>
        </div>

        {/* Mode Selector Buttons */}
        <div className="flex items-center gap-2 pt-2 border-t flex-wrap" style={{ borderColor: T.borderSoft }}>
          <span className="text-xs font-bold mr-1" style={{ color: T.muted }}>Modo de análise:</span>
          <button onClick={() => { setCompMode("all"); setSelectedIds(allPresets.map(p => p.id || p.name)); }}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            style={compMode === "all"
              ? { background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }
              : { background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <span>Em Conjunto (Todos os {allPresets.length})</span>
          </button>

          <button onClick={() => setCompMode("custom")}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            style={compMode === "custom"
              ? { background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }
              : { background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            <span>Customizado (Seleção)</span>
          </button>

          <button onClick={() => { setCompMode("individual"); if (!singleId && allPresets.length > 0) setSingleId(allPresets[0].id || allPresets[0].name); }}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            style={compMode === "individual"
              ? { background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }
              : { background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>Individual (Diagnóstico)</span>
          </button>
        </div>

        {/* Custom Mode: Checkbox Selectors */}
        {compMode === "custom" && (
          <div className="p-3 rounded-xl border flex items-center gap-2 flex-wrap" style={{ background: T.surface, borderColor: T.accentBorder }}>
            <span className="text-xs font-bold mr-1" style={{ color: T.muted }}>Marque para incluir no comparativo:</span>
            {allPresets.map((p) => {
              const id = p.id || p.name;
              const isChecked = selectedIds.includes(id);
              return (
                <button key={id} onClick={() => toggleSelectId(id)}
                  className="px-3 py-1 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5"
                  style={isChecked
                    ? { background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text, fontWeight: 700 }
                    : { background: T.surface2, border: `1px solid ${T.border}`, color: T.faint }}>
                  <span>{isChecked ? "✓" : "○"}</span>
                  <span>{p.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Individual Mode: Chip Selector */}
        {compMode === "individual" && (
          <div className="p-3.5 rounded-xl border space-y-3" style={{ background: T.surface, borderColor: T.accentBorder }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs font-bold" style={{ color: T.muted }}>Selecione o setup para diagnóstico individual:</span>
              <div className="flex items-center gap-2 flex-wrap">
                {allPresets.map((p) => {
                  const id = p.id || p.name;
                  const isSelected = singleId === id;
                  return (
                    <button key={id} onClick={() => setSingleId(id)}
                      className="px-3 py-1 rounded-lg text-xs font-bold border transition-all"
                      style={isSelected
                        ? { background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }
                        : { background: T.surface2, border: `1px solid ${T.border}`, color: T.muted }}>
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Individual Diagnostic Card */}
            {singlePresetMetrics && (
              <div className="p-4 rounded-xl border space-y-3" style={{ background: T.surface2, borderColor: T.borderSoft }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider block" style={{ color: pastelPeachText }}>Análise Individual</span>
                    <h3 className="text-base font-extrabold" style={{ color: T.text }}>{singlePresetMetrics.name}</h3>
                  </div>
                  <button onClick={() => loadPreset(allPresets.find((p) => (p.id || p.name) === singlePresetMetrics.id))}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                    style={{ background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                    <span>Carregar no Configurador</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg border" style={{ background: T.surface, borderColor: T.borderSoft }}>
                    <div className="text-[10px] font-bold uppercase" style={{ color: T.muted }}>Produção Anual</div>
                    <div className="text-lg font-extrabold mt-0.5" style={{ color: pastelMintText }}>{fmtG(singlePresetMetrics.yieldYearG)}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: T.faint }}>{singlePresetMetrics.hYear.toFixed(1)} safras/ano</div>
                  </div>
                  <div className="p-3 rounded-lg border" style={{ background: T.surface, borderColor: T.borderSoft }}>
                    <div className="text-[10px] font-bold uppercase" style={{ color: T.muted }}>Custo OPEX por Grama</div>
                    <div className="text-lg font-extrabold mt-0.5" style={{ color: pastelMintText }}>{fmtBRL(singlePresetMetrics.costPerGramOpex)}/g</div>
                    <div className="text-[10px] mt-0.5" style={{ color: T.faint }}>Custo produtivo direto</div>
                  </div>
                  <div className="p-3 rounded-lg border" style={{ background: T.surface, borderColor: T.borderSoft }}>
                    <div className="text-[10px] font-bold uppercase" style={{ color: T.muted }}>Investimento CAPEX</div>
                    <div className="text-lg font-extrabold mt-0.5" style={{ color: pastelPeachText }}>{fmtBRL(singlePresetMetrics.capex)}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: T.faint }}>{fmtBRL(singlePresetMetrics.capexPerPlant)}/vaso</div>
                  </div>
                  <div className="p-3 rounded-lg border" style={{ background: T.surface, borderColor: T.borderSoft }}>
                    <div className="text-[10px] font-bold uppercase" style={{ color: T.muted }}>OPEX Mensal</div>
                    <div className="text-lg font-extrabold mt-0.5" style={{ color: pastelSkyText }}>{fmtBRL(singlePresetMetrics.opexMonth)}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: T.faint }}>{singlePresetMetrics.kwhMonth.toFixed(0)} kWh/mês</div>
                  </div>
                </div>

                {/* Comparison vs Average */}
                {otherPresetsAverage && (
                  <div className="pt-2 border-t" style={{ borderColor: T.borderSoft }}>
                    <div className="text-[11px] font-bold mb-2" style={{ color: T.muted }}>
                      Comparação do <span style={{ color: T.text }}>{singlePresetMetrics.name}</span> em relação à média dos outros {otherMetrics.length} setup(s):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div className="flex items-center justify-between p-2 rounded border" style={{ background: T.surface, borderColor: T.borderSoft }}>
                        <span style={{ color: T.muted }}>Produção Anual:</span>
                        <span className="font-extrabold" style={{ color: singlePresetMetrics.yieldYearG >= otherPresetsAverage.yieldYearG ? pastelMintText : pastelPeachText }}>
                          {singlePresetMetrics.yieldYearG >= otherPresetsAverage.yieldYearG ? "+" : ""}
                          {(((singlePresetMetrics.yieldYearG - otherPresetsAverage.yieldYearG) / (otherPresetsAverage.yieldYearG || 1)) * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded border" style={{ background: T.surface, borderColor: T.borderSoft }}>
                        <span style={{ color: T.muted }}>Custo/g (OPEX):</span>
                        <span className="font-extrabold" style={{ color: singlePresetMetrics.costPerGramOpex <= otherPresetsAverage.costPerGramOpex ? pastelMintText : pastelPeachText }}>
                          {singlePresetMetrics.costPerGramOpex <= otherPresetsAverage.costPerGramOpex ? "-" : "+"}
                          {Math.abs(((singlePresetMetrics.costPerGramOpex - otherPresetsAverage.costPerGramOpex) / (otherPresetsAverage.costPerGramOpex || 1)) * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded border" style={{ background: T.surface, borderColor: T.borderSoft }}>
                        <span style={{ color: T.muted }}>CAPEX (Investimento):</span>
                        <span className="font-extrabold" style={{ color: singlePresetMetrics.capex <= otherPresetsAverage.capex ? pastelMintText : pastelPeachText }}>
                          {singlePresetMetrics.capex <= otherPresetsAverage.capex ? "-" : "+"}
                          {Math.abs(((singlePresetMetrics.capex - otherPresetsAverage.capex) / (otherPresetsAverage.capex || 1)) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hero Champions Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {topYield && (
          <div className="p-4 rounded-2xl relative overflow-hidden" style={{ background: T.surface2, border: `1px solid ${T.borderSoft}` }}>
            <div className="text-[10px] font-extrabold uppercase tracking-wider mb-1 flex items-center gap-1.5" style={{ color: T.muted }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>
              <span>Maior Produção Anual</span>
            </div>
            <div className="text-2xl font-extrabold tracking-tight" style={{ color: T.text }}>{fmtG(topYield.yieldYearG)}</div>
            <div className="text-xs font-bold mt-1 truncate" style={{ color: pastelMintText }}>{topYield.name}</div>
            <div className="text-[10px] mt-0.5" style={{ color: T.faint }}>{topYield.hYear.toFixed(1)} safras/ano ({fmtG(topYield.yieldHarvestG)}/safra)</div>
          </div>
        )}

        {lowestCostPerG && (
          <div className="p-4 rounded-2xl relative overflow-hidden" style={{ background: T.surface2, border: `1px solid ${T.borderSoft}` }}>
            <div className="text-[10px] font-extrabold uppercase tracking-wider mb-1 flex items-center gap-1.5" style={{ color: T.muted }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              <span>Menor Custo por Grama</span>
            </div>
            <div className="text-2xl font-extrabold tracking-tight" style={{ color: T.text }}>{fmtBRL(lowestCostPerG.costPerGramOpex)} / g</div>
            <div className="text-xs font-bold mt-1 truncate" style={{ color: pastelMintText }}>{lowestCostPerG.name}</div>
            <div className="text-[10px] mt-0.5" style={{ color: T.faint }}>Custo produtivo direto (OPEX/g)</div>
          </div>
        )}

        {topEfficiency && (
          <div className="p-4 rounded-2xl relative overflow-hidden" style={{ background: T.surface2, border: `1px solid ${T.borderSoft}` }}>
            <div className="text-[10px] font-extrabold uppercase tracking-wider mb-1 flex items-center gap-1.5" style={{ color: T.muted }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              <span>Eficiência por Watt</span>
            </div>
            <div className="text-2xl font-extrabold tracking-tight" style={{ color: T.text }}>{topEfficiency.gPerW.toFixed(2)} g/W</div>
            <div className="text-xs font-bold mt-1 truncate" style={{ color: pastelMintText }}>{topEfficiency.name}</div>
            <div className="text-[10px] mt-0.5" style={{ color: T.faint }}>Potência total: {topEfficiency.totalW}W</div>
          </div>
        )}

        {lowestPayback ? (
          <div className="p-4 rounded-2xl relative overflow-hidden" style={{ background: T.surface2, border: `1px solid ${T.borderSoft}` }}>
            <div className="text-[10px] font-extrabold uppercase tracking-wider mb-1 flex items-center gap-1.5" style={{ color: T.muted }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.71 1.26-1.5 1.74-2.3L4.5 16.5z"/><path d="M12 15l-3-3 7.5-7.5c1.4-1.4 3.7-1.4 5.1 0s1.4 3.7 0 5.1L12 15z"/></svg>
              <span>Retorno Mais Rápido</span>
            </div>
            <div className="text-2xl font-extrabold tracking-tight" style={{ color: T.text }}>{lowestPayback.paybackMonths.toFixed(1)} meses</div>
            <div className="text-xs font-bold mt-1 truncate" style={{ color: pastelSkyText }}>{lowestPayback.name}</div>
            <div className="text-[10px] mt-0.5" style={{ color: T.faint }}>Payback em ~{(lowestPayback.paybackMonths / (lowestPayback.cDays / 30)).toFixed(1)} safras</div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl relative overflow-hidden" style={{ background: T.surface2, border: `1px solid ${T.borderSoft}` }}>
            <div className="text-[10px] font-extrabold uppercase tracking-wider mb-1 flex items-center gap-1.5" style={{ color: T.muted }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              <span>Receita Anual Máxima</span>
            </div>
            <div className="text-2xl font-extrabold tracking-tight" style={{ color: T.text }}>{fmtBRL(topYield.revYear)}</div>
            <div className="text-xs font-bold mt-1 truncate" style={{ color: pastelPeachText }}>{topYield.name}</div>
            <div className="text-[10px] mt-0.5" style={{ color: T.faint }}>Estimativa baseada em R$/g</div>
          </div>
        )}
      </div>

      {/* Graphical Comparisons Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Produção Anual (kg/ano) */}
        <div className="p-5 rounded-2xl" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center justify-between" style={{ color: T.muted }}>
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              <span>Produção Anual Comparada</span>
            </span>
            <span className="text-[10px] font-semibold" style={{ color: pastelMintText }}>kg / ano</span>
          </h3>
          <div className="space-y-3">
            {metricsList.map((m) => {
              const pct = Math.max(8, Math.min(100, (m.yieldYearG / maxYieldG) * 100));
              const isTop = m.id === topYield.id;
              return (
                <div key={m.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="truncate max-w-[200px]" style={{ color: T.text }}>{m.name}</span>
                    <span className="font-bold" style={{ color: isTop ? pastelMintText : T.text }}>{fmtG(m.yieldYearG)}</span>
                  </div>
                  <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.borderSoft}` }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: isTop ? pastelMintBar : pastelPeachBar
                      }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 2: Investimento (CAPEX) vs OPEX Mensal */}
        <div className="p-5 rounded-2xl" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center justify-between" style={{ color: T.muted }}>
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              <span>Investimento (CAPEX) & OPEX Mensal</span>
            </span>
            <span className="text-[10px] font-semibold" style={{ color: T.faint }}>R$</span>
          </h3>
          <div className="space-y-3">
            {metricsList.map((m) => {
              const capexPct = Math.max(6, Math.min(100, (m.capex / maxCapex) * 100));
              const opexPct = Math.max(6, Math.min(100, (m.opexMonth / maxOpex) * 100));
              return (
                <div key={m.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="truncate max-w-[180px]" style={{ color: T.text }}>{m.name}</span>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span style={{ color: pastelPeachText }}>CAPEX: {fmtBRL(m.capex)}</span>
                      <span style={{ color: pastelSkyText }}>OPEX: {fmtBRL(m.opexMonth)}/mês</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.borderSoft}` }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${capexPct}%`, background: pastelPeachBar }} />
                    </div>
                    <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.borderSoft}` }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${opexPct}%`, background: pastelSkyBar }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 3: Comparativo Por Safra (Peso, Receita, Produtividade, Custo/g & Custo/Retorno) */}
        <div className="p-5 rounded-2xl lg:col-span-2" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center justify-between" style={{ color: T.muted }}>
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              <span>Métricas & Custo por Grama Por Safra</span>
            </span>
            <span className="text-[10px] font-semibold" style={{ color: T.faint }}>Desempenho por ciclo de cultivo</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {metricsList.map((m) => {
              const maxHarvestG = Math.max(...metricsList.map(x => x.yieldHarvestG), 1);
              const maxRevHarvest = Math.max(...metricsList.map(x => x.revHarvest), 1);
              const maxM2 = Math.max(...metricsList.map(x => x.yieldM2), 1);

              const pctWeight = Math.max(8, Math.min(100, (m.yieldHarvestG / maxHarvestG) * 100));
              const pctRev = Math.max(8, Math.min(100, (m.revHarvest / maxRevHarvest) * 100));
              const pctM2 = Math.max(8, Math.min(100, (m.yieldM2 / maxM2) * 100));
              const pctRatioH = Math.max(8, Math.min(100, (m.ratioHarvest / maxRatioHarvest) * 100));
              const pctCostG = Math.max(8, Math.min(100, (m.costPerGramOpex / maxCostPerG) * 100));

              return (
                <div key={m.id} className="p-4 rounded-xl space-y-3" style={{ background: T.surface, border: `1px solid ${T.borderSoft}` }}>
                  <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: T.borderSoft }}>
                    <span className="font-extrabold text-sm truncate" style={{ color: T.text }}>{m.name}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.muted }}>
                      {m.cDays} dias / ciclo
                    </span>
                  </div>

                  {/* Peso por safra */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] font-medium" style={{ color: T.muted }}>Peso por safra</span>
                      <span className="font-extrabold text-xs" style={{ color: pastelMintText }}>{fmtG(m.yieldHarvestG)}</span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: T.surface2 }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pctWeight}%`, background: pastelMintBar }} />
                    </div>
                  </div>

                  {/* Custo por Grama (OPEX) */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] font-medium" style={{ color: T.muted }}>Custo / grama (OPEX)</span>
                      <span className="font-extrabold text-xs" style={{ color: pastelMintText }}>{fmtBRL(m.costPerGramOpex)}/g</span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: T.surface2 }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pctCostG}%`, background: pastelMintBar }} />
                    </div>
                  </div>

                  {/* Receita por safra */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] font-medium" style={{ color: T.muted }}>Receita por safra</span>
                      <span className="font-extrabold text-xs" style={{ color: pastelPeachText }}>{m.priceG > 0 ? fmtBRL(m.revHarvest) : "—"}</span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: T.surface2 }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pctRev}%`, background: pastelPeachBar }} />
                    </div>
                  </div>

                  {/* Produtividade por m² */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] font-medium" style={{ color: T.muted }}>Produtividade / m²</span>
                      <span className="font-extrabold text-xs" style={{ color: pastelLavenderText }}>{m.yieldM2.toFixed(0)} g/m²</span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: T.surface2 }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pctM2}%`, background: pastelLavenderBar }} />
                    </div>
                  </div>

                  {/* Relação Custo / Retorno por safra */}
                  <div className="space-y-1 pt-1 border-t" style={{ borderColor: T.borderSoft }}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] font-bold" style={{ color: T.text }}>Custo/Retorno Safra</span>
                      <span className="font-extrabold text-xs" style={{ color: pastelSkyText }}>
                        {m.ratioHarvest > 0 ? `${m.ratioHarvest.toFixed(1)}× retorno` : "—"}
                      </span>
                    </div>
                    <div className="text-[9.5px] truncate" style={{ color: T.faint }}>
                      {m.priceG > 0 ? `OPEX ${fmtBRL(m.opexCycle)} → Receita ${fmtBRL(m.revHarvest)}` : "defina R$/g"}
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: T.surface2 }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pctRatioH}%`, background: pastelSkyBar }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 4: Relação Custo / Retorno Anual (OPEX & CAPEX vs Receita Anual) */}
        <div className="p-5 rounded-2xl lg:col-span-2" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center justify-between" style={{ color: T.muted }}>
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              <span>Relação Custo / Retorno Anual (OPEX & CAPEX vs Receita Anual)</span>
            </span>
            <span className="text-[10px] font-semibold" style={{ color: T.faint }}>Retorno financeiro por ano</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {metricsList.map((m) => {
              const pctRatioY = Math.max(8, Math.min(100, (m.ratioYear / maxRatioYear) * 100));

              return (
                <div key={m.id} className="p-4 rounded-xl space-y-3" style={{ background: T.surface, border: `1px solid ${T.borderSoft}` }}>
                  <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: T.borderSoft }}>
                    <span className="font-extrabold text-sm truncate" style={{ color: T.text }}>{m.name}</span>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full"
                      style={{ background: pastelMintBg, border: `1px solid ${T.border}`, color: pastelMintText }}>
                      {m.ratioYear > 0 ? `${m.ratioYear.toFixed(1)}× retorno s/ OPEX` : "—"}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400" style={{ color: T.muted }}>Custo OPEX por grama:</span>
                      <span className="font-extrabold" style={{ color: pastelMintText }}>{fmtBRL(m.costPerGramOpex)} / g</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400" style={{ color: T.muted }}>Custo Total 1º ano / grama:</span>
                      <span className="font-bold" style={{ color: T.text }}>{fmtBRL(m.costPerGramTotal)} / g</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: T.borderSoft }}>
                      <span className="text-slate-400" style={{ color: T.muted }}>OPEX Anual Total:</span>
                      <span className="font-bold" style={{ color: pastelSkyText }}>{fmtBRL(m.opexYear)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400" style={{ color: T.muted }}>Receita Anual Estimada:</span>
                      <span className="font-bold" style={{ color: pastelPeachText }}>{m.priceG > 0 ? fmtBRL(m.revYear) : "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400" style={{ color: T.muted }}>Lucro Líquido Anual:</span>
                      <span className="font-extrabold" style={{ color: pastelMintText }}>{m.priceG > 0 ? fmtBRL(m.netProfitYear) : "—"}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: T.borderSoft }}>
                      <span className="text-slate-400 font-medium" style={{ color: T.muted }}>ROI s/ CAPEX Anual:</span>
                      <span className="font-extrabold" style={{ color: pastelMintText }}>
                        {m.capexRoiYear > 0 ? `+${m.capexRoiYear.toFixed(0)}% / ano` : "—"}
                      </span>
                    </div>
                  </div>

                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: T.surface2 }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pctRatioY}%`, background: pastelMintBar }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Comparison Matrix Table */}
      <div className="p-5 rounded-2xl overflow-hidden" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
        <h3 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: T.muted }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          <span>Tabela Comparativa Detalhada ({metricsList.length} setup(s))</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs text-left min-w-[650px]">
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                <th className="py-3 px-4 font-bold uppercase tracking-wider w-56" style={{ color: T.muted }}>Métrica / Leitura</th>
                {metricsList.map((m) => (
                  <th key={m.id} className="py-3 px-4 text-center font-bold" style={{ borderLeft: `1px solid ${T.borderSoft}` }}>
                    <div className="font-extrabold text-sm mb-1" style={{ color: T.text }}>{m.name}</div>
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => loadPreset(allPresets.find((p) => (p.id || p.name) === m.id))}
                        className="px-2 py-0.5 rounded text-[10px] font-bold transition-all flex items-center gap-1"
                        style={{ background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                        <span>Carregar</span>
                      </button>
                      <button onClick={() => removePreset(allPresets.find((p) => (p.id || p.name) === m.id)?.id, m.name)}
                        className="px-2 py-0.5 rounded text-[10px] font-bold transition-all flex items-center gap-1"
                        style={{ background: dark ? "rgba(239, 68, 68, 0.15)" : "rgba(220, 38, 38, 0.08)", border: `1px solid ${dark ? "rgba(239, 68, 68, 0.3)" : "rgba(220, 38, 38, 0.2)"}`, color: dark ? "#f87171" : "#dc2626" }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        <span>Remover</span>
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: T.borderSoft }}>
              {/* Group 1: Estrutura */}
              <tr style={{ background: T.surface, borderBottom: `1px solid ${T.border}` }}>
                <td colSpan={metricsList.length + 1} className="py-2.5 px-4 font-extrabold text-[11px] uppercase tracking-wider" style={{ color: T.text }}>
                  Estrutura & Área de Cultivo
                </td>
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>Dimensões (L × P × A)</td>
                {metricsList.map((m) => (
                  <td key={m.id} className="py-2.5 px-4 text-center text-xs font-medium" style={{ color: T.text, borderLeft: `1px solid ${T.borderSoft}` }}>
                    {m.width} × {m.depth} × {m.height} cm
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>Área Útil de Cultivo</td>
                {metricsList.map((m) => (
                  <td key={m.id} className="py-2.5 px-4 text-center font-bold text-xs" style={{ color: T.text, borderLeft: `1px solid ${T.borderSoft}` }}>
                    {m.areaM2.toFixed(2)} m²
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>Volume Total da Estufa</td>
                {metricsList.map((m) => (
                  <td key={m.id} className="py-2.5 px-4 text-center text-xs font-medium" style={{ color: T.text, borderLeft: `1px solid ${T.borderSoft}` }}>
                    {m.volM3.toFixed(2)} m³
                  </td>
                ))}
              </tr>

              {/* Group 2: Vasos */}
              <tr style={{ background: T.surface, borderBottom: `1px solid ${T.border}` }}>
                <td colSpan={metricsList.length + 1} className="py-2.5 px-4 font-extrabold text-[11px] uppercase tracking-wider" style={{ color: T.text }}>
                  Vasos & Densidade
                </td>
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>Quantidade de Vasos</td>
                {metricsList.map((m) => (
                  <td key={m.id} className="py-2.5 px-4 text-center font-bold text-xs" style={{ color: T.text, borderLeft: `1px solid ${T.borderSoft}` }}>
                    {m.potCount} vaso(s)
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>Tipo de Vaso</td>
                {metricsList.map((m) => (
                  <td key={m.id} className="py-2.5 px-4 text-center text-xs font-medium" style={{ color: T.muted, borderLeft: `1px solid ${T.borderSoft}` }}>
                    {m.potLabel}
                  </td>
                ))}
              </tr>

              {/* Group 3: Produção */}
              <tr style={{ background: T.surface, borderBottom: `1px solid ${T.border}` }}>
                <td colSpan={metricsList.length + 1} className="py-2.5 px-4 font-extrabold text-[11px] uppercase tracking-wider" style={{ color: T.text }}>
                  Produção & Rendimento Por Safra e Por Ano
                </td>
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>Safras por Ano</td>
                {metricsList.map((m) => (
                  <td key={m.id} className="py-2.5 px-4 text-center text-xs font-medium" style={{ color: T.text, borderLeft: `1px solid ${T.borderSoft}` }}>
                    {m.hYear.toFixed(1)} safras/ano ({m.cDays}d/ciclo)
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>Produção por Safra (Peso)</td>
                {metricsList.map((m) => (
                  <td key={m.id} className="py-2.5 px-4 text-center font-bold text-xs" style={{ color: pastelMintText, borderLeft: `1px solid ${T.borderSoft}` }}>
                    {fmtG(m.yieldHarvestG)}
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>Produção por Ano</td>
                {metricsList.map((m) => {
                  const isTop = m.id === topYield.id;
                  return (
                    <td key={m.id} className="py-2.5 px-4 text-center font-extrabold text-xs"
                      style={{
                        color: isTop ? pastelMintText : T.text,
                        background: isTop ? pastelMintBg : "transparent",
                        borderLeft: `1px solid ${T.borderSoft}`
                      }}>
                      {fmtG(m.yieldYearG)} {isTop && "★"}
                    </td>
                  );
                })}
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>Produtividade por m²</td>
                {metricsList.map((m) => (
                  <td key={m.id} className="py-2.5 px-4 text-center text-xs font-semibold" style={{ color: pastelLavenderText, borderLeft: `1px solid ${T.borderSoft}` }}>
                    {m.yieldM2.toFixed(0)} g/m²
                  </td>
                ))}
              </tr>

              {/* Group 4: Financeiro */}
              <tr style={{ background: T.surface, borderBottom: `1px solid ${T.border}` }}>
                <td colSpan={metricsList.length + 1} className="py-2.5 px-4 font-extrabold text-[11px] uppercase tracking-wider" style={{ color: T.text }}>
                  Financeiro, Custos & Custo por Grama
                </td>
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>Custo Operacional por Grama (OPEX/g)</td>
                {metricsList.map((m) => {
                  const isLowG = m.id === lowestCostPerG.id;
                  return (
                    <td key={m.id} className="py-2.5 px-4 text-center font-extrabold text-xs"
                      style={{
                        color: isLowG ? pastelMintText : T.text,
                        background: isLowG ? pastelMintBg : "transparent",
                        borderLeft: `1px solid ${T.borderSoft}`
                      }}>
                      {fmtBRL(m.costPerGramOpex)} / g {isLowG && "★"}
                    </td>
                  );
                })}
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>Custo Total no 1º Ano (CAPEX+OPEX / g)</td>
                {metricsList.map((m) => (
                  <td key={m.id} className="py-2.5 px-4 text-center text-xs font-semibold" style={{ color: T.text, borderLeft: `1px solid ${T.borderSoft}` }}>
                    {fmtBRL(m.costPerGramTotal)} / g
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>Investimento Total (CAPEX)</td>
                {metricsList.map((m) => {
                  const isLow = m.id === lowestCapex.id;
                  return (
                    <td key={m.id} className="py-2.5 px-4 text-center font-bold text-xs"
                      style={{
                        color: isLow ? pastelMintText : pastelPeachText,
                        background: isLow ? pastelMintBg : "transparent",
                        borderLeft: `1px solid ${T.borderSoft}`
                      }}>
                      {fmtBRL(m.capex)} {isLow && "★"}
                    </td>
                  );
                })}
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>Custo Operacional por Safra (OPEX Safra)</td>
                {metricsList.map((m) => (
                  <td key={m.id} className="py-2.5 px-4 text-center text-xs font-medium" style={{ color: T.muted, borderLeft: `1px solid ${T.borderSoft}` }}>
                    {fmtBRL(m.opexCycle)}
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>OPEX Mensal (Energia + Insumos)</td>
                {metricsList.map((m) => (
                  <td key={m.id} className="py-2.5 px-4 text-center text-xs font-semibold" style={{ color: pastelSkyText, borderLeft: `1px solid ${T.borderSoft}` }}>
                    {fmtBRL(m.opexMonth)} / mês
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>Consumo Elétrico Mensal</td>
                {metricsList.map((m) => (
                  <td key={m.id} className="py-2.5 px-4 text-center text-xs font-medium" style={{ color: T.muted, borderLeft: `1px solid ${T.borderSoft}` }}>
                    {m.kwhMonth.toFixed(0)} kWh/mês
                  </td>
                ))}
              </tr>

              {/* Group 5: Retorno & Relações Custo/Retorno */}
              <tr style={{ background: T.surface, borderBottom: `1px solid ${T.border}` }}>
                <td colSpan={metricsList.length + 1} className="py-2.5 px-4 font-extrabold text-[11px] uppercase tracking-wider" style={{ color: T.text }}>
                  Relações Custo/Retorno, Receita & Lucro
                </td>
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>Receita por Safra</td>
                {metricsList.map((m) => (
                  <td key={m.id} className="py-2.5 px-4 text-center font-bold text-xs" style={{ color: pastelPeachText, borderLeft: `1px solid ${T.borderSoft}` }}>
                    {m.priceG > 0 ? fmtBRL(m.revHarvest) : "—"}
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>Relação Custo/Retorno por Safra</td>
                {metricsList.map((m) => (
                  <td key={m.id} className="py-2.5 px-4 text-center font-extrabold text-xs" style={{ color: pastelSkyText, borderLeft: `1px solid ${T.borderSoft}` }}>
                    {m.ratioHarvest > 0 ? `${m.ratioHarvest.toFixed(1)}× retorno` : "—"}
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>Receita Anual Estimada</td>
                {metricsList.map((m) => (
                  <td key={m.id} className="py-2.5 px-4 text-center font-extrabold text-xs" style={{ color: pastelPeachText, borderLeft: `1px solid ${T.borderSoft}` }}>
                    {m.priceG > 0 ? fmtBRL(m.revYear) : "—"}
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>Relação Custo/Retorno Anual (Receita/OPEX)</td>
                {metricsList.map((m) => (
                  <td key={m.id} className="py-2.5 px-4 text-center font-extrabold text-xs" style={{ color: pastelMintText, borderLeft: `1px solid ${T.borderSoft}` }}>
                    {m.ratioYear > 0 ? `${m.ratioYear.toFixed(1)}× retorno` : "—"}
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>Lucro Líquido Anual (Receita - OPEX)</td>
                {metricsList.map((m) => (
                  <td key={m.id} className="py-2.5 px-4 text-center font-bold text-xs" style={{ color: pastelMintText, borderLeft: `1px solid ${T.borderSoft}` }}>
                    {m.priceG > 0 ? fmtBRL(m.netProfitYear) : "—"}
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>ROI do CAPEX Inicial (% / ano)</td>
                {metricsList.map((m) => (
                  <td key={m.id} className="py-2.5 px-4 text-center font-extrabold text-xs" style={{ color: pastelMintText, borderLeft: `1px solid ${T.borderSoft}` }}>
                    {m.capexRoiYear > 0 ? `+${m.capexRoiYear.toFixed(0)}% / ano` : "—"}
                  </td>
                ))}
              </tr>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                <td className="py-2.5 px-4 font-semibold text-xs" style={{ color: T.muted }}>Payback Estimado</td>
                {metricsList.map((m) => {
                  const isBestPayback = lowestPayback && m.id === lowestPayback.id;
                  return (
                    <td key={m.id} className="py-2.5 px-4 text-center font-bold text-xs"
                      style={{
                        color: isBestPayback ? pastelMintText : T.text,
                        background: isBestPayback ? pastelMintBg : "transparent",
                        borderLeft: `1px solid ${T.borderSoft}`
                      }}>
                      {m.paybackMonths ? `${m.paybackMonths.toFixed(1)} m (${(m.paybackMonths / (m.cDays / 30)).toFixed(1)} safras)` : "—"} {isBestPayback && "★"}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function GrowinStones() {
  const [dark, setDark] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // identificação
  const [growName, setGrowName] = useState("");
  const [owner, setOwner] = useState("");
  const [strain, setStrain] = useState(""); // Variedade / Genética da planta

  // estrutura
  const [width, setWidth] = useState(240);
  const [depth, setDepth] = useState(120);
  const [height, setHeight] = useState(200);
  const [potCount, setPotCount] = useState(8);
  const [potIdx, setPotIdx] = useState(2);
  const [potShape, setPotShape] = useState("circle"); // "circle" ou "square"
  const [potFlipped, setPotFlipped] = useState(false);

  // vasos customizados pelo usuário
  const [customPotW, setCustomPotW] = useState(30);
  const [customPotL, setCustomPotL] = useState(30);
  const [customPotH, setCustomPotH] = useState(30);
  const [gaugeIdx, setGaugeIdx] = useState(1);
  const [spacing, setSpacing] = useState(15);
  const [cols, setCols] = useState(4);
  const [conn, setConn] = useState("espinha");
  const [recirculate, setRecirculate] = useState(true);
  const [equip, setEquip] = useState(PRESETS[1].equip);
  const [perPot, setPerPot] = useState({});
  const [watts, setWatts] = useState(Object.fromEntries(EQUIPMENT.map((e) => [e.id, e.defW])));
  const [equipUrls, setEquipUrls] = useState({});
  const [equipShopping, setEquipShopping] = useState({});

  const togglePerPot = (id) => setPerPot((prev) => ({ ...prev, [id]: !prev[id] }));
  const setEquipUrl = (id, url) => setEquipUrls((prev) => ({ ...prev, [id]: url }));
  const toggleEquipShopping = (id) => setEquipShopping((prev) => ({ ...prev, [id]: !prev[id] }));

  // cultivo & mercado & ciclo de luz
  const [vegaHours, setVegaHours] = useState(18);
  const [floraHours, setFloraHours] = useState(12);
  const [vegaDays, setVegaDays] = useState(30);
  const [floraDays, setFloraDays] = useState(60);
  const cycleDays = Math.max(1, (Number(vegaDays) || 0) + (Number(floraDays) || 0));

  const [yieldPerPlant, setYieldPerPlant] = useState(80); // g/planta/safra
  const [priceG, setPriceG] = useState(0); // R$/g
  const [tariff, setTariff] = useState(0.95); // R$/kWh

  // custos
  const [costs, setCosts] = useState({
    ...BASE_COSTS,
    ...Object.fromEntries(EQUIPMENT.map((e) => [e.id, e.defCost])),
  });
  const [extraCost, setExtraCost] = useState(0); // investimento extra (único)
  const [monthlyCost, setMonthlyCost] = useState(0); // insumos mensais

  // itens extras adicionados pelo usuário
  const [customItems, setCustomItems] = useState([]);
  const addCustom = () =>
    setCustomItems((a) => [...a, { id: Date.now() + Math.random(), name: "", watts: 0, hours: 24, qty: 1, cost: 0, perPot: false, url: "", inShoppingList: false }]);
  const updCustom = (id, patch) => setCustomItems((a) => a.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const delCustom = (id) => setCustomItems((a) => a.filter((it) => it.id !== id));

  const removeMaterialRow = (r) => {
    if (r.customId) {
      delCustom(r.customId);
      showToast(`✓ Item "${r.label}" removido da lista!`);
    } else if (r.isEquip || EQUIPMENT.some((e) => e.id === r.key)) {
      setEquip((prev) => ({ ...prev, [r.key]: 0 }));
      showToast(`✓ Equipamento "${r.label}" removido da lista!`);
    } else {
      setCost(r.key, 0);
      showToast(`✓ Custo do item "${r.label}" zerado!`);
    }
  };

  // observações, instruções e termos
  const [notes, setNotes] = useState("");
  const [instructions, setInstructions] = useState("");
  const [terms, setTerms] = useState("");

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem("growcalc_user");
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [authNameInput, setAuthNameInput] = useState("");
  const [authUsernameInput, setAuthUsernameInput] = useState("");

  // Google OAuth 2.0 & Identity Services
  const [googleClientId, setGoogleClientId] = useState(() => {
    const saved = localStorage.getItem("growcalc_google_client_id");
    if (saved && saved.includes("447903804008")) {
      localStorage.removeItem("growcalc_google_client_id");
    }
    return localStorage.getItem("growcalc_google_client_id") || "333530452535-ccad7tjf7fm0u9fboabk2uimk43arve6.apps.googleusercontent.com";
  });
  const [pendingGoogleUser, setPendingGoogleUser] = useState(null);
  const [googleClientIdModalOpen, setGoogleClientIdModalOpen] = useState(false);
  const [customClientIdInput, setCustomClientIdInput] = useState(googleClientId);


  useEffect(() => {
    if (!document.getElementById("google-gsi-script")) {
      const script = document.createElement("script");
      script.id = "google-gsi-script";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }, []);

  const triggerGoogleOAuth = () => {
    if (typeof window.google === "undefined" || !window.google.accounts) {
      showToast("⚠️ SDK do Google está carregando... Tente novamente em instantes.");
      return;
    }

    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: "email profile",
        error_callback: (err) => {
          console.error("Erro no Google Client ID:", err);
          setGoogleClientIdModalOpen(true);
        },
        callback: async (response) => {
          if (response.error) {
            console.error("Erro no Google OAuth:", response);
            if (response.error === "invalid_client" || response.error === "unauthorized_client") {
              setGoogleClientIdModalOpen(true);
              return;
            }
            showToast(`⚠️ Falha no Google Auth: ${response.error_description || response.error}`);
            return;
          }
          try {
            const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: `Bearer ${response.access_token}` }
            });
            const googleUser = await userInfoRes.json();
            
            if (!googleUser.email) {
              throw new Error("Não foi possível obter o e-mail da conta do Google.");
            }

            setPendingGoogleUser(googleUser);
            const defaultSlug = (googleUser.email ? googleUser.email.split("@")[0] : "grow")
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, "");
            
            setAuthNameInput(googleUser.name || "Cultivador");
            setAuthUsernameInput(defaultSlug);
            setAuthModalOpen(true);
            showToast(`✓ Google Authenticated: ${googleUser.email}`);
          } catch (err) {
            console.error("Erro ao obter perfil do Google:", err);
            showToast(`Erro ao obter perfil do Google: ${err.message}`);
          }
        }
      });

      tokenClient.requestAccessToken({ prompt: "select_account" });
    } catch (err) {
      console.error("Erro ao inicializar token client:", err);
      setGoogleClientIdModalOpen(true);
    }
  };


  const [activeTab, setActiveTab] = useState("configurator"); // "configurator" | "my_grows" | "comparison" | "settings"
 // "configurator" | "comparison"

  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [subdomainInput, setSubdomainInput] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);

  // Presets unificados e todos removíveis (padrão + customizados)
  const [allPresets, setAllPresets] = useState(() => {
    try {
      const saved = localStorage.getItem("growinstones_all_presets_v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 0) return parsed;
      }
    } catch (e) {}
    return INITIAL_PRESETS;
  });

  const saveAllPresetsToStorage = (list) => {
    setAllPresets(list);
    try {
      localStorage.setItem("growinstones_all_presets_v2", JSON.stringify(list));
    } catch (e) {}
  };

  const removePreset = (id, name) => {
    if (window.confirm(`Deseja remover o chip "${name}"?`)) {
      const updated = allPresets.filter((p) => (p.id || p.name) !== id);
      saveAllPresetsToStorage(updated);
      showToast(`✓ Preset "${name}" removido.`);
    }
  };

  const restoreDefaultPresets = () => {
    saveAllPresetsToStorage(INITIAL_PRESETS);
    showToast(`✓ Presets padrão restaurados!`);
  };

  const addCurrentAsPreset = () => {
    const defaultName = growName.trim()
      ? `${growName.trim()} (${potCount}v)`
      : `Meu Setup (${potCount} vasos)`;
    const name = window.prompt("Digite o nome para o novo preset:", defaultName);
    if (!name || !name.trim()) return;

    const newPreset = {
      id: "preset-" + Date.now(),
      name: name.trim(),
      data: getSetupData(),
    };
    const updated = [...allPresets, newPreset];
    saveAllPresetsToStorage(updated);
    showToast(`✓ Preset "${name.trim()}" adicionado!`);
  };

  const loadPreset = (preset) => {
    if (!preset) return;
    if (preset.data) {
      loadSetupData(preset.data);
    }
    if (preset.apply) {
      applyPreset(preset);
    }
    showToast(`✓ Setup "${preset.name}" carregado!`);
  };

  const fileInputRef = useRef(null);
  const [toastMsg, setToastMsg] = useState("");

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  };

  const getSetupData = () => ({
    version: "1.0",
    savedAt: new Date().toISOString(),
    growName,
    owner,
    strain,
    width,
    depth,
    height,
    potCount,
    potIdx,
    potShape,
    potFlipped,
    customPotW,
    customPotL,
    customPotH,
    gaugeIdx,
    spacing,
    cols,
    conn,
    recirculate,
    equip,
    perPot,
    watts,
    equipUrls,
    equipShopping,
    vegaHours,
    floraHours,
    vegaDays,
    floraDays,
    cycleDays,
    yieldPerPlant,
    priceG,
    tariff,
    costs,
    extraCost,
    monthlyCost,
    customItems,
    notes,
    instructions,
    terms,
    dark,
  });

  const loadSetupData = (data) => {
    if (!data || typeof data !== "object") return false;
    if (typeof data.growName === "string") setGrowName(data.growName);
    if (typeof data.owner === "string") setOwner(data.owner);
    if (typeof data.strain === "string") setStrain(data.strain);
    if (typeof data.width === "number") setWidth(data.width);
    if (typeof data.depth === "number") setDepth(data.depth);
    if (typeof data.height === "number") setHeight(data.height);
    if (typeof data.potCount === "number") setPotCount(data.potCount);
    if (typeof data.potIdx === "number" && data.potIdx >= 0 && data.potIdx <= POT_SIZES.length) setPotIdx(data.potIdx);
    if (typeof data.potShape === "string") setPotShape(data.potShape);
    if (typeof data.potFlipped === "boolean") setPotFlipped(data.potFlipped);
    if (typeof data.customPotW === "number") setCustomPotW(data.customPotW);
    if (typeof data.customPotL === "number") setCustomPotL(data.customPotL);
    if (typeof data.customPotH === "number") setCustomPotH(data.customPotH);
    if (typeof data.gaugeIdx === "number" && data.gaugeIdx >= 0 && data.gaugeIdx < PIPE_GAUGES.length) setGaugeIdx(data.gaugeIdx);
    if (typeof data.spacing === "number") setSpacing(data.spacing);
    if (typeof data.cols === "number") setCols(data.cols);
    if (typeof data.conn === "string") setConn(data.conn === "duplo_manifold" ? "paralelo" : data.conn);
    if (typeof data.recirculate === "boolean") setRecirculate(data.recirculate);
    if (data.equip && typeof data.equip === "object") setEquip((prev) => ({ ...prev, ...data.equip }));
    if (data.perPot && typeof data.perPot === "object") setPerPot(data.perPot);
    if (data.watts && typeof data.watts === "object") setWatts((prev) => ({ ...prev, ...data.watts }));
    if (data.equipUrls && typeof data.equipUrls === "object") setEquipUrls(data.equipUrls);
    if (data.equipShopping && typeof data.equipShopping === "object") setEquipShopping(data.equipShopping);
    if (typeof data.vegaHours === "number") setVegaHours(data.vegaHours);
    if (typeof data.floraHours === "number") setFloraHours(data.floraHours);
    if (typeof data.vegaDays === "number") setVegaDays(data.vegaDays);
    if (typeof data.floraDays === "number") setFloraDays(data.floraDays);
    if (typeof data.yieldPerPlant === "number") setYieldPerPlant(data.yieldPerPlant);
    if (typeof data.priceG === "number") setPriceG(data.priceG);
    if (typeof data.tariff === "number") setTariff(data.tariff);
    if (data.costs && typeof data.costs === "object") setCosts((prev) => ({ ...prev, ...data.costs }));
    if (typeof data.extraCost === "number") setExtraCost(data.extraCost);
    if (typeof data.monthlyCost === "number") setMonthlyCost(data.monthlyCost);
    if (Array.isArray(data.customItems)) setCustomItems(data.customItems);
    if (typeof data.notes === "string") setNotes(data.notes);
    if (typeof data.instructions === "string") setInstructions(data.instructions);
    if (typeof data.terms === "string") setTerms(data.terms);
    if (typeof data.dark === "boolean") setDark(data.dark);
    return true;
  };

  // Restaurar o setup salvo no localStorage ao recarregar a página
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && (window.location.search.includes("reset") || window.location.search.includes("clear"))) {
        localStorage.removeItem("growinstones_saved_setup");
        window.history.replaceState(null, "", window.location.pathname);
        return;
      }
      const saved = localStorage.getItem("growinstones_saved_setup");
      if (saved) {
        const parsed = JSON.parse(saved);
        loadSetupData(parsed);
      }
    } catch (err) {
      console.error("Erro ao carregar setup do localStorage", err);
      try {
        localStorage.removeItem("growinstones_saved_setup");
      } catch (e) {}
    }
  }, []);

  // Salvar automaticamente no localStorage quando qualquer valor do projeto muda
  useEffect(() => {
    try {
      const data = getSetupData();
      localStorage.setItem("growinstones_saved_setup", JSON.stringify(data));
    } catch (err) {
      console.error("Erro ao salvar setup no localStorage", err);
    }
  }, [
    growName, owner, strain, width, depth, height, potCount, potIdx, potShape, potFlipped, customPotW, customPotL, customPotH, gaugeIdx,
    spacing, cols, conn, recirculate, equip, perPot, watts, equipUrls, equipShopping, vegaHours, floraHours, vegaDays, floraDays, cycleDays, yieldPerPlant, priceG,
    tariff, costs, extraCost, monthlyCost, customItems, notes, instructions, terms, dark
  ]);

  // Exportar setup completo em arquivo JSON
  const exportSetupJson = () => {
    try {
      const data = getSetupData();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const cleanName = (growName || "growinstones-setup").toLowerCase().replace(/[^a-z0-9]/g, "-");
      link.href = url;
      link.download = `${cleanName}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast("✓ Setup exportado em arquivo JSON!");
    } catch (err) {
      console.error("Erro ao exportar JSON", err);
      showToast("❌ Erro ao exportar o arquivo JSON.");
    }
  };

  // Importar setup de arquivo JSON
  const handleImportJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result;
        if (typeof content === "string") {
          const parsed = JSON.parse(content);
          const success = loadSetupData(parsed);
          if (success) {
            showToast("✓ Setup importado com sucesso!");
          } else {
            showToast("❌ Arquivo JSON inválido.");
          }
        }
      } catch (err) {
        console.error("Erro ao ler JSON", err);
        showToast("❌ Erro ao ler o arquivo JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const isCustomPot = potIdx === POT_SIZES.length;
  const customLiters = Math.round(((customPotW * customPotL * customPotH) / 1000) * 10) / 10;
  const customDiameter = Math.round(Math.sqrt((customPotW * customPotL * 4) / Math.PI));

  const pot = isCustomPot
    ? {
        label: `${customLiters} L (Custom)`,
        liters: customLiters,
        widthCm: customPotW,
        depthCm: customPotL,
        heightCm: customPotH,
        diameter: customDiameter,
        shape: customPotW === customPotL ? "square" : "rect",
        isCustom: true,
      }
    : (POT_SIZES[potIdx] || POT_SIZES[2]);

  const isRect = pot.shape === "rect" || (pot.isCustom && pot.widthCm !== pot.depthCm);
  const isSquare = !isRect && potShape === "square";
  const potW = isRect ? (potFlipped ? (pot.depthCm || 40) : (pot.widthCm || 60)) : (pot.diameter || 26);
  const potD = isRect ? (potFlipped ? (pot.widthCm || 60) : (pot.depthCm || 40)) : (pot.diameter || 26);
  const potH = pot.heightCm || Math.round(pot.diameter ? pot.diameter * 0.95 : 28);

  const potDesc = isRect
    ? `retangular ${potW}×${potD} cm (alt. ${potH} cm)`
    : isSquare
    ? `quadrado ${potW}×${potD} cm (alt. ${potH} cm)`
    : `⌀ ${potW} cm (alt. ${potH} cm)`;

  const gauge = PIPE_GAUGES[gaugeIdx] || PIPE_GAUGES[0];
  const connInfo = CONNECTIONS.find((k) => k.id === conn) || CONNECTIONS[0];
  const setEq = (id, delta, max) => setEquip((e) => ({ ...e, [id]: Math.min(max, Math.max(0, ((e && e[id]) || 0) + delta)) }));
  const setW = (id, v) => setWatts((w) => ({ ...w, [id]: Math.min(5000, Math.max(0, Math.round(v) || 0)) }));
  const setCost = (key, v) => setCosts((c) => ({ ...c, [key]: Math.max(0, Number(v) || 0) }));

  const applyPreset = (p) => {
    setWidth(p.apply.width); setDepth(p.apply.depth); setHeight(p.apply.height);
    setPotCount(p.apply.potCount); setPotIdx(p.apply.potIdx);
    setGaugeIdx(p.apply.gaugeIdx); setSpacing(p.apply.spacing);
    setCols(p.apply.cols); setConn(p.apply.conn);
    setEquip({ ...p.equip });
  };

  // ————— Tema (creme / carvão) —————
  const T = dark
    ? {
        bg: "#151310", surface: "#1e1b17", surface2: "#26221d", inset: "#12100d",
        border: "#37322a", borderSoft: "#2c2822",
        text: "#ece5d8", muted: "#a89f90", faint: "#6e675c",
        brand: "#e9dfc9", accentBg: "#2e2a23", accentBorder: "#57503f",
        pipe: "#c8bda4", pipeReturn: "#8a9a7b",
        potFill: "#3b422f", potStroke: "#76856a", potNum: "#cdd6bd",
        tank: "#3d4a4a", tankStroke: "#6b7d7d",
        pump: "#4a4f5c", pumpStroke: "#7d84a0",
      }
    : {
        bg: "#f7f3ea", surface: "#fffdf8", surface2: "#f1ece0", inset: "#efe9db",
        border: "#e0d9c8", borderSoft: "#e9e3d4",
        text: "#1f1b16", muted: "#7a7263", faint: "#a89f8d",
        brand: "#1f1b16", accentBg: "#ece5d4", accentBorder: "#c9bfa8",
        pipe: "#3a352c", pipeReturn: "#6b7d55",
        potFill: "#dde3d0", potStroke: "#7e8c6d", potNum: "#3f4a33",
        tank: "#c4d2d0", tankStroke: "#6f8280",
        pump: "#b9bfcc", pumpStroke: "#5c6478",
      };

  // ————— Layout dos vasos —————
  const layout = useMemo(() => {
    const margin = 12;
    const cellW = potW + spacing;
    const cellD = potD + spacing;
    const usableW = width - margin * 2;
    const usableD = depth - margin * 2;
    const maxCols = Math.max(1, Math.floor((usableW + spacing) / cellW));
    const maxRows = Math.max(1, Math.floor((usableD + spacing) / cellD));

    const wantCols = cols > 0 ? cols : maxCols;
    const useCols = Math.min(wantCols, maxCols);
    const colsClamped = cols > 0 && cols > maxCols;

    const capacity = useCols * maxRows;
    const placed = Math.min(potCount, capacity);
    const nRows = Math.max(1, Math.ceil(placed / useCols));

    const gridW = Math.min(useCols, placed) * cellW - spacing;
    const gridD = nRows * cellD - spacing;
    const offX = margin + (usableW - gridW) / 2 + potW / 2;
    const offY = margin + (usableD - gridD) / 2 + potD / 2;

    const grid = [];
    for (let i = 0; i < placed; i++) {
      const r = Math.floor(i / useCols);
      const cc = i % useCols;
      grid.push({ x: offX + cc * cellW, y: offY + r * cellD, row: r, col: cc });
    }
    const xs = grid.length > 0 ? grid.map((g) => g.x) : [0];
    const ys = grid.length > 0 ? grid.map((g) => g.y) : [0];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const wallLeft = placed > 0 ? Math.max(0, Math.round(minX - potW / 2)) : 0;
    const wallRight = placed > 0 ? Math.max(0, Math.round(width - (maxX + potW / 2))) : 0;
    const wallTop = placed > 0 ? Math.max(0, Math.round(minY - potD / 2)) : 0;
    const wallBottom = placed > 0 ? Math.max(0, Math.round(depth - (maxY + potD / 2))) : 0;

    const serp = [];
    for (let i = 0; i < placed; i++) {
      const r = Math.floor(i / useCols);
      const cInRow = i % useCols;
      const rowLen = Math.min(useCols, placed - r * useCols);
      const cc = r % 2 === 0 ? cInRow : rowLen - 1 - cInRow;
      serp.push(grid.find((g) => g.row === r && g.col === cc));
    }

    return {
      cellW, cellD, maxCols, maxRows, useCols, nRows, capacity, placed, grid, serp, colsClamped,
      wallLeft, wallRight, wallTop, wallBottom, minX, maxX, minY, maxY
    };
  }, [width, depth, potCount, potW, potD, spacing, cols]);

  // ————— Geometria da ligação —————
  const plumbing = useMemo(() => {
    const { grid, serp, placed, cellW, cellD } = layout;
    if (placed === 0) return { segs: [], len: 0, fittings: 0 };

    const xs = grid.map((g) => g.x), ys = grid.map((g) => g.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const segs = [];
    let len = 0, fittings = 0;

    const add = (x1, y1, x2, y2, kind = "main") => {
      segs.push({ a: [x1, y1], b: [x2, y2], kind });
      len += Math.hypot(x2 - x1, y2 - y1);
    };

    const first = serp[0];
    const last = serp[serp.length - 1];

    if (conn === "serpentina") {
      // Alimentação em série vaso a vaso (1 -> 2 -> ... -> N)
      for (let i = 1; i < serp.length; i++) {
        add(serp[i - 1].x, serp[i - 1].y, serp[i].x, serp[i].y, "main");
      }
      fittings = Math.max(0, placed - 1);

      // Retorno recirculante direto entre último e primeiro vaso por fora
      if (recirculate && placed > 1) {
        const sideX = last.x <= first.x ? Math.max(8, minX - cellW * 0.45) : Math.min(width - 8, maxX + cellW * 0.45);
        add(last.x, last.y, sideX, last.y, "return");
        add(sideX, last.y, sideX, first.y, "return");
        add(sideX, first.y, first.x, first.y, "return");
        fittings += 3;
      }
    } else if (conn === "anel") {
      // Circuito fechado (RDWC) entre vasos
      for (let i = 1; i < serp.length; i++) {
        add(serp[i - 1].x, serp[i - 1].y, serp[i].x, serp[i].y, "main");
      }
      const sideX = last.x <= first.x ? Math.max(8, minX - cellW * 0.45) : Math.min(width - 8, maxX + cellW * 0.45);
      add(last.x, last.y, sideX, last.y, "return");
      add(sideX, last.y, sideX, first.y, "return");
      add(sideX, first.y, first.x, first.y, "return");
      fittings = placed + 3;
    } else if (conn === "espinha") {
      // Espinha central com ramais laterais para cada vaso
      const mainX = (minX + maxX) / 2;
      add(mainX, minY, mainX, maxY, "main");
      grid.forEach((g) => add(mainX, g.y, g.x, g.y, "branch"));
      fittings = placed + 2;

      if (recirculate && placed > 1) {
        const retLeft = Math.max(8, minX - cellW * 0.45);
        add(mainX, maxY, retLeft, maxY, "return");
        add(retLeft, maxY, retLeft, minY, "return");
        add(retLeft, minY, mainX, minY, "return");
        fittings += 3;
      }
    } else if (conn === "paralelo" || conn === "duplo_manifold") {
      // Manifold Duplo Balanceado: Entrada Frontal + Saída Traseira por Colunas
      const frontY = Math.max(12, minY - cellD * 0.45);
      const rearY = Math.min(depth - 12, maxY + cellD * 0.45);

      const colsUsed = Array.from(new Set(grid.map((g) => g.col)));
      const colXs = colsUsed.map((cc) => grid.find((g) => g.col === cc).x);
      const mMinX = Math.min(...colXs);
      const mMaxX = Math.max(...colXs);

      // Barramento Frontal (Alimentação)
      add(mMinX, frontY, mMaxX, frontY, "main");

      // Para cada coluna de vasos: conecta do barramento frontal e interliga TODOS os vasos da coluna
      colsUsed.forEach((cc) => {
        const colPots = grid.filter((g) => g.col === cc).sort((a, b) => a.y - b.y);
        const cx = colPots[0].x;
        const cMinY = colPots[0].y;
        const cMaxY = colPots[colPots.length - 1].y;

        // Entrada do barramento frontal ao 1º vaso da coluna
        add(cx, frontY, cx, cMinY, "branch");

        // Linha interligando os vasos da coluna sequencialmente (Vaso 1 -> Vaso 2 -> Vaso 3)
        for (let k = 1; k < colPots.length; k++) {
          add(colPots[k - 1].x, colPots[k - 1].y, colPots[k].x, colPots[k].y, "branch");
        }

        // Saída do último vaso da coluna para o barramento traseiro de dreno
        if (recirculate) {
          add(cx, cMaxY, cx, rearY, "return");
        }
      });

      // Barramento Traseiro de Retorno
      if (recirculate) {
        add(mMinX, rearY, mMaxX, rearY, "return");
        const sideX = Math.max(8, mMinX - cellW * 0.45);
        add(mMinX, rearY, sideX, rearY, "return");
        add(sideX, rearY, sideX, frontY, "return");
        add(sideX, frontY, mMinX, frontY, "return");
      }
      fittings = colsUsed.length * 2 + placed + 4;
    } else if (conn === "gotejo_coletor") {
      // Gotejamento superior + Calha central de drenagem
      const feedY = Math.max(12, minY - cellD * 0.45);
      const centerx = (minX + maxX) / 2;

      // Barramento de Alimentação Superior
      add(minX, feedY, maxX, feedY, "main");

      // Linha alimentadora descendo por coluna
      const colsUsed = Array.from(new Set(grid.map((g) => g.col)));
      colsUsed.forEach((cc) => {
        const colPots = grid.filter((g) => g.col === cc).sort((a, b) => a.y - b.y);
        const cx = colPots[0].x;
        const cMinY = colPots[0].y;
        const cMaxY = colPots[colPots.length - 1].y;

        add(cx, feedY, cx, cMinY, "branch");
        for (let k = 1; k < colPots.length; k++) {
          add(colPots[k - 1].x, colPots[k - 1].y, colPots[k].x, colPots[k].y, "branch");
        }
      });

      // Calha central de drenagem recolhendo todos os vasos
      add(centerx, minY, centerx, maxY, "return");
      grid.forEach((g) => add(g.x, g.y, centerx, g.y, "return"));

      if (recirculate) {
        const sideX = Math.min(width - 8, maxX + cellW * 0.45);
        add(centerx, maxY, sideX, maxY, "return");
        add(sideX, maxY, sideX, feedY, "return");
        add(sideX, feedY, maxX, feedY, "return");
      }
      fittings = placed * 2 + 4;
    } else if (conn === "malha_grid") {
      // Anel Grid Perimetral Pressurizado em volta dos vasos
      const marginY1 = Math.max(10, minY - cellD * 0.45);
      const marginY2 = Math.min(depth - 10, maxY + cellD * 0.45);
      const marginX1 = Math.max(10, minX - cellW * 0.45);
      const marginX2 = Math.min(width - 10, maxX + cellW * 0.45);

      // Anel retangular externo
      add(marginX1, marginY1, marginX2, marginY1, "main");
      add(marginX2, marginY1, marginX2, marginY2, "main");
      add(marginX2, marginY2, marginX1, marginY2, "main");
      add(marginX1, marginY2, marginX1, marginY1, "main");

      // Conexões horizontais por linha
      const rowsUsed = Array.from(new Set(grid.map((g) => g.row)));
      rowsUsed.forEach((r) => {
        const rowPots = grid.filter((g) => g.row === r).sort((a, b) => a.x - b.x);
        const ry = rowPots[0].y;
        add(marginX1, ry, rowPots[0].x, ry, "branch");
        for (let k = 1; k < rowPots.length; k++) {
          add(rowPots[k - 1].x, ry, rowPots[k].x, ry, "branch");
        }
        add(rowPots[rowPots.length - 1].x, ry, marginX2, ry, "branch");
      });

      // Conexões verticais por coluna
      const colsUsed = Array.from(new Set(grid.map((g) => g.col)));
      colsUsed.forEach((cc) => {
        const colPots = grid.filter((g) => g.col === cc).sort((a, b) => a.y - b.y);
        const cx = colPots[0].x;
        add(cx, marginY1, cx, colPots[0].y, "branch");
        for (let k = 1; k < colPots.length; k++) {
          add(cx, colPots[k - 1].y, cx, colPots[k].y, "branch");
        }
        add(cx, colPots[colPots.length - 1].y, cx, marginY2, "branch");
      });

      if (recirculate) {
        const midY = (minY + maxY) / 2;
        add(minX, midY, maxX, midY, "return");
      }
      fittings = placed + 6;
    }
    return { segs, len: Math.round(len), fittings };
  }, [layout, conn, recirculate, width, depth]);

  // ————— Métricas —————
  const overflow = potCount > layout.capacity;
  const areaM2 = (width / 100) * (depth / 100);
  const volumeM3 = areaM2 * (height / 100);
  // produção & plantas
  const plants = layout.placed;
  const reservoir = Math.max(20, Math.ceil(plants * (pot?.liters || 11) * 0.35));
  const getEquipQty = (id) => (equip?.[id] || 0) * (perPot?.[id] ? Math.max(1, plants) : 1);

  const customWatts = (customItems || []).reduce((s, it) => s + (it.watts || 0) * (it.qty || 0) * (it.perPot ? Math.max(1, plants) : 1), 0);
  const customKwh = (customItems || []).reduce((s, it) => s + ((it.watts || 0) * (it.hours || 0) * (it.qty || 0) * (it.perPot ? Math.max(1, plants) : 1) * 30) / 1000, 0);
  const totalWatts = EQUIPMENT.reduce((s, e) => s + (watts?.[e.id] || 0) * getEquipQty(e.id), 0) + customWatts;
  const ledHours = cycleDays > 0 ? Math.round(((vegaHours * vegaDays) + (floraHours * floraDays)) / cycleDays) : 18;
  const getEquipHours = (e) => (e.id === "led" ? ledHours : e.hours);
  const kwhMonth = EQUIPMENT.reduce((s, e) => s + ((watts?.[e.id] || 0) * getEquipHours(e) * getEquipQty(e.id) * 30) / 1000, 0) + customKwh;
  const ledWatts = (watts?.led || 0) * getEquipQty("led");
  const ledPerM2 = ledWatts > 0 ? Math.round(ledWatts / areaM2) : 0;
  const airFlowNeeded = Math.ceil(volumeM3 * 60);
  const pipeTotal = plumbing.len + 60;
  const pipeMeters = Math.ceil((pipeTotal / 100) * 1.15);

  const harvestsYear = cycleDays > 0 ? 365 / cycleDays : 0;
  const yieldHarvest = plants * yieldPerPlant; // g
  const yieldYear = yieldHarvest * harvestsYear;
  const yieldM2 = areaM2 > 0 ? yieldHarvest / areaM2 : 0;
  const gPerW = ledWatts > 0 ? yieldHarvest / ledWatts : 0;

  // financeiro
  const materialRows = useMemo(() => {
    const rows = [
      { key: "pot", label: `Vasos ${pot.label} (${potDesc})`, qty: plants, unitLabel: "un" },
      { key: "pipeM", label: `Mangueira/tubo ${gauge.label} — ${connInfo.short}`, qty: pipeMeters, unitLabel: "m" },
      { key: "fitting", label: `Conexões ${gauge.label} (T, cotovelos, engates)`, qty: plumbing.fittings, unitLabel: "un" },
      { key: "reservoir", label: "Reservatório principal", qty: 1, unitLabel: `un (≥ ${reservoir} L)` },
      ...EQUIPMENT.filter((e) => equip[e.id] > 0).map((e) => {
        const isPerPot = !!perPot[e.id];
        const effQty = equip[e.id] * (isPerPot ? Math.max(1, plants) : 1);
        return {
          key: e.id,
          isEquip: true,
          label: `${e.name}${watts[e.id] > 0 ? ` (${watts[e.id]} W)` : ""}${isPerPot ? ` (${equip[e.id]}/vaso × ${plants} vasos)` : ""}`,
          qty: effQty,
          unitLabel: "un",
        };
      }),
    ];
    const base = rows.map((r) => ({ ...r, unitCost: costs[r.key] ?? 0, subtotal: (costs[r.key] ?? 0) * r.qty }));
    const extras = customItems
      .filter((it) => it.qty > 0)
      .map((it) => {
        const isPerPot = !!it.perPot;
        const effQty = it.qty * (isPerPot ? Math.max(1, plants) : 1);
        return {
          key: `custom-${it.id}`,
          customId: it.id,
          label: `${it.name.trim() || "Item extra"}${it.watts > 0 ? ` (${it.watts} W)` : ""}${isPerPot ? ` (${it.qty}/vaso × ${plants} vasos)` : ""}`,
          qty: effQty,
          unitLabel: "un",
          unitCost: it.cost,
          subtotal: it.cost * effQty,
        };
      });
    return [...base, ...extras];
  }, [pot, gauge, connInfo, pipeMeters, plumbing.fittings, reservoir, equip, perPot, watts, costs, plants, customItems]);

  const shoppingListItems = useMemo(() => {
    const items = [];

    EQUIPMENT.forEach((e) => {
      if (equip[e.id] > 0 && equipShopping[e.id]) {
        const isPerPot = !!perPot[e.id];
        const effQty = equip[e.id] * (isPerPot ? Math.max(1, plants) : 1);
        const unitCost = costs[e.id] ?? 0;
        const subtotal = unitCost * effQty;
        items.push({
          id: e.id,
          name: `${e.name}${watts[e.id] > 0 ? ` (${watts[e.id]} W)` : ""}`,
          qty: effQty,
          unitCost,
          subtotal,
          url: equipUrls[e.id] || "",
        });
      }
    });

    (customItems || []).forEach((it) => {
      if (it.qty > 0 && it.inShoppingList) {
        const isPerPot = !!it.perPot;
        const effQty = it.qty * (isPerPot ? Math.max(1, plants) : 1);
        const unitCost = it.cost || 0;
        const subtotal = unitCost * effQty;
        items.push({
          id: `custom-${it.id}`,
          name: `${it.name.trim() || "Item extra"}${it.watts > 0 ? ` (${it.watts} W)` : ""}`,
          qty: effQty,
          unitCost,
          subtotal,
          url: it.url || "",
        });
      }
    });

    return items;
  }, [equip, equipShopping, perPot, plants, watts, costs, equipUrls, customItems]);

  const materialsTotal = materialRows.reduce((s, r) => s + r.subtotal, 0);
  const capex = materialsTotal + extraCost;
  const energyMonth = kwhMonth * tariff;
  const energyCycle = (energyMonth * cycleDays) / 30;
  const opexMonth = energyMonth + monthlyCost;
  const opexYear = opexMonth * 12;
  const opexCycle = (opexMonth * cycleDays) / 30;
  const revenueHarvest = yieldHarvest * priceG;
  const revenueYear = yieldYear * priceG;
  const profitYear = revenueYear - opexYear;
  const profitMonth = profitYear / 12;
  const profitHarvest = revenueHarvest - opexCycle;
  const paybackMonths = profitMonth > 0 ? capex / profitMonth : null;
  const marginPct = revenueYear > 0 ? (profitYear / revenueYear) * 100 : 0;
  const costPerG = yieldYear > 0 ? opexYear / yieldYear : 0;
  const capexPerPlant = plants > 0 ? capex / plants : 0;

  // alertas
  const alerts = [];
  if (overflow)
    alerts.push({ level: "hi", text: `Cabem no máximo ${layout.capacity} vasos de ${pot.label} nesta configuração (${layout.useCols} colunas). Reduza a quantidade, o vaso ou o espaçamento — ou aumente a estufa.` });
  if (layout.colsClamped)
    alerts.push({ level: "mid", text: `Você pediu ${cols} colunas, mas só cabem ${layout.maxCols} na largura atual. Usando ${layout.useCols}.` });
  if (conn === "anel" && equip.bombaAgua === 0)
    alerts.push({ level: "mid", text: "Anel recirculante (RDWC) precisa de bomba de água para manter o fluxo no loop." });
  if (conn === "anel" && equip.bombaAr === 0)
    alerts.push({ level: "mid", text: "Em RDWC, a oxigenação vem da bomba de ar — adicione ao menos uma." });
  if (equip.exaustor === 0)
    alerts.push({ level: "hi", text: `Sem exaustor: o cultivo precisa renovar ~${airFlowNeeded} m³/h de ar. Adicione ao menos 1 exaustor.` });
  else
    alerts.push({ level: "lo", text: `Renovação de ar: dimensione o conjunto para ≥ ${airFlowNeeded} m³/h (~${Math.ceil(airFlowNeeded / equip.exaustor)} m³/h por exaustor).` });
  if (equip.led > 0 && ledPerM2 < 150)
    alerts.push({ level: "mid", text: `Luz em ${ledPerM2} W/m² — abaixo dos ~150 W/m² recomendados para flora.` });
  if (equip.led === 0) alerts.push({ level: "hi", text: "Nenhum board de LED no projeto." });
  if ((gauge.mm === 16 && plants > 4) || (gauge.mm === 20 && plants > 8) || (gauge.mm === 25 && plants > 16))
    alerts.push({ level: "mid", text: `Bitola ${gauge.label} pode limitar a vazão para ${plants} vasos — considere subir um degrau.` });
  if (equip.bombaAgua === 0 && equip.bombaAr === 0 && plants > 0)
    alerts.push({ level: "mid", text: "Sem bomba de água nem de ar: hidroponia ativa exige ao menos uma delas." });
  if (priceG <= 0)
    alerts.push({ level: "lo", text: "Preencha o valor de mercado (R$/g) em Cultivo & mercado para liberar receita, lucro e payback." });

  // ————— Vista superior —————
  const topScale = Math.min(520 / width, 320 / depth);
  const topW = width * topScale, topH = depth * topScale;
  const OX = 24, OY = 24;
  const px = (x) => OX + x * topScale;
  const py = (y) => OY + y * topScale;
  const svgW = topW + OX * 2;
  const resZoneH = 74;
  const svgH = topH + OY + resZoneH;
  const pipeW = Math.max(2, gauge.mm * topScale * 0.1 + 1.2);
  const resY = OY + topH + 26;
  const showRes = equip.tanque > 0 || equip.bombaAgua > 0 || equip.bombaAr > 0;

  const resItems = useMemo(() => {
    const items = [];
    if (equip.tanque > 0) {
      for (let i = 0; i < equip.tanque; i++) {
        items.push({
          id: `tk_${i}`,
          label: i === 0 ? `${reservoir} L` : "tanque",
          w: 54,
          h: 32,
          type: "tank",
        });
      }
    }
    if (equip.bombaAgua > 0) {
      items.push({
        id: "pump_water",
        label: `água ×${equip.bombaAgua}`,
        w: 48,
        h: 26,
        type: "pump",
      });
    }
    if (equip.bombaAr > 0) {
      items.push({
        id: "pump_air",
        label: `ar ×${equip.bombaAr}`,
        w: 42,
        h: 24,
        type: "air",
      });
    }
    const gap = 10;
    const totalW = items.reduce((s, it) => s + it.w, 0) + Math.max(0, items.length - 1) * gap;
    const startX = OX + Math.max(10, (topW - totalW) / 2);

    let curX = startX;
    return items.map((it) => {
      const x = curX;
      curX += it.w + gap;
      return { ...it, x };
    });
  }, [equip.tanque, equip.bombaAgua, equip.bombaAr, reservoir, topW, OX]);

  const getCotaElements = (scale, ox, oy, lay, pW, pD, sp, w, d) => {
    if (!lay || lay.placed === 0) return [];
    const cotas = [];
    const pxLocal = (x) => ox + x * scale;
    const pyLocal = (y) => oy + y * scale;
    const tw = w * scale;
    const th = d * scale;

    const { grid, minX, maxX, minY, maxY, wallLeft, wallRight, wallTop, wallBottom, useCols, nRows } = lay;

    // 1. Cota Parede Esquerda (wallLeft)
    if (wallLeft > 0) {
      const x1 = ox;
      const x2 = pxLocal(minX - pW / 2);
      const y = pyLocal(minY);
      cotas.push({
        id: "cota_wleft",
        x1, y1: y, x2, y2: y,
        label: `${wallLeft} cm`,
        tx: (x1 + x2) / 2, ty: y - 5,
        tick1: [x1, y - 4, x1, y + 4],
        tick2: [x2, y - 4, x2, y + 4],
        dir: "horizontal",
      });
    }

    // 2. Cota Parede Direita (wallRight)
    if (wallRight > 0) {
      const x1 = pxLocal(maxX + pW / 2);
      const x2 = ox + tw;
      const y = pyLocal(maxY);
      cotas.push({
        id: "cota_wright",
        x1, y1: y, x2, y2: y,
        label: `${wallRight} cm`,
        tx: (x1 + x2) / 2, ty: y - 5,
        tick1: [x1, y - 4, x1, y + 4],
        tick2: [x2, y - 4, x2, y + 4],
        dir: "horizontal",
      });
    }

    // 3. Cota Parede Superior (wallTop)
    if (wallTop > 0) {
      const x = pxLocal(minX);
      const y1 = oy;
      const y2 = pyLocal(minY - pD / 2);
      cotas.push({
        id: "cota_wtop",
        x1: x, y1, x2: x, y2,
        label: `${wallTop} cm`,
        tx: x + 6, ty: (y1 + y2) / 2 + 3,
        tick1: [x - 4, y1, x + 4, y1],
        tick2: [x - 4, y2, x + 4, y2],
        dir: "vertical",
      });
    }

    // 4. Cota Parede Inferior (wallBottom)
    if (wallBottom > 0) {
      const x = pxLocal(maxX);
      const y1 = pyLocal(maxY + pD / 2);
      const y2 = oy + th;
      cotas.push({
        id: "cota_wbottom",
        x1: x, y1, x2: x, y2,
        label: `${wallBottom} cm`,
        tx: x + 6, ty: (y1 + y2) / 2 + 3,
        tick1: [x - 4, y1, x + 4, y1],
        tick2: [x - 4, y2, x + 4, y2],
        dir: "vertical",
      });
    }

    // 5. Cota Espaçamento Entre Vasos (Horizontal)
    if (useCols > 1 && grid.length > 1 && sp > 0) {
      const g1 = grid[0];
      const g2 = grid[1];
      if (g1 && g2) {
        const x1 = pxLocal(g1.x + pW / 2);
        const x2 = pxLocal(g2.x - pW / 2);
        const y = pyLocal(g1.y);
        if (x2 - x1 >= 4) {
          cotas.push({
            id: "cota_sp_h",
            x1, y1: y, x2, y2: y,
            label: `${sp} cm`,
            tx: (x1 + x2) / 2, ty: y - 5,
            tick1: [x1, y - 4, x1, y + 4],
            tick2: [x2, y - 4, x2, y + 4],
            dir: "horizontal",
          });
        }
      }
    }

    // 6. Cota Espaçamento Entre Vasos (Vertical)
    if (nRows > 1 && grid.length > useCols && sp > 0) {
      const g1 = grid[0];
      const g2 = grid[useCols];
      if (g1 && g2) {
        const x = pxLocal(g1.x);
        const y1 = pyLocal(g1.y + pD / 2);
        const y2 = pyLocal(g2.y - pD / 2);
        if (y2 - y1 >= 4) {
          cotas.push({
            id: "cota_sp_v",
            x1: x, y1, x2: x, y2,
            label: `${sp} cm`,
            tx: x + 6, ty: (y1 + y2) / 2 + 3,
            tick1: [x - 4, y1, x + 4, y1],
            tick2: [x - 4, y2, x + 4, y2],
            dir: "vertical",
          });
        }
      }
    }

    return cotas;
  };

  // ————— UI helpers —————
  const inputCls = "text-center rounded-lg text-sm font-semibold focus:outline-none";
  const inputStyle = { background: T.surface, border: `1px solid ${T.border}`, color: T.text };
  const num = (v, set, min, max, step = 10) => (
    <div className="flex items-center gap-1">
      <button onClick={() => set(Math.max(min, v - step))}
        className="w-8 h-8 rounded-lg font-medium transition-colors"
        style={{ background: T.surface2, color: T.muted }}>−</button>
      <NumInput value={v} onCommit={set} min={min} max={max}
        className={`w-16 h-8 ${inputCls}`} style={inputStyle} />
      <button onClick={() => set(Math.min(max, v + step))}
        className="w-8 h-8 rounded-lg font-medium transition-colors"
        style={{ background: T.surface2, color: T.muted }}>+</button>
    </div>
  );
  const numSm = (v, set, min, max, step = 1) => (
    <div className="flex items-center gap-0.5 shrink-0">
      <button onClick={() => set(Math.max(min, v - step))}
        className="w-6 h-7 rounded-md font-bold text-xs transition-colors"
        style={{ background: T.surface2, color: T.muted }}>−</button>
      <NumInput value={v} onCommit={set} min={min} max={max}
        className="w-10 h-7 text-center rounded-md text-xs font-bold focus:outline-none"
        style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text }} />
      <button onClick={() => set(Math.min(max, v + step))}
        className="w-6 h-7 rounded-md font-bold text-xs transition-colors"
        style={{ background: T.surface2, color: T.muted }}>+</button>
    </div>
  );
  const money = (v, set, w = "w-24") => (
    <div className="flex items-center gap-1">
      <span className="text-[11px]" style={{ color: T.faint }}>R$</span>
      <MoneyInput value={v} onCommit={set}
        className={`${w} h-8 ${inputCls}`} style={inputStyle} />
    </div>
  );
  const Eyebrow = useMemo(() => {
    const E = ({ children }) => (
      <h2 className="text-[11px] font-semibold uppercase mb-4" style={{ color: T.faint, letterSpacing: "0.14em" }}>{children}</h2>
    );
    return E;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);
  const alertColor = (lvl) =>
    lvl === "hi" ? (dark ? "#e0a0a0" : "#8c3b3b") : lvl === "mid" ? (dark ? "#d9be8a" : "#8a6a2a") : T.muted;
  const segStyle = (kind) =>
    kind === "return"
      ? { stroke: T.pipeReturn, strokeDasharray: "7 4", strokeWidth: pipeW }
      : kind === "branch"
      ? { stroke: T.pipe, strokeWidth: Math.max(1.5, pipeW * 0.65), opacity: 0.75 }
      : { stroke: T.pipe, strokeWidth: pipeW };

  const today = new Date().toLocaleDateString("pt-BR");

  // ————— Download do relatório como HTML autocontido (abre pronto p/ salvar em PDF) —————
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const generateReportHtmlString = (isStandalonePage = false) => {
    const kv = (a, b, st = false) => `<div class="kv${st ? " st" : ""}"><span>${a}</span><b>${b}</b></div>`;
    const rowsHtml = materialRows
      .map((r) => `<div class="mr"><span class="ml">${esc(r.label)}</span><span class="mq">${r.qty}</span><span class="mu">${fmtBRL(r.unitCost)}</span><span class="ms">${fmtBRL(r.subtotal)}</span></div>`)
      .join("");
    const alertsHtml = alerts
      .map((a) => `<div class="al ${a.level}">• ${esc(a.text)}</div>`)
      .join("");
    const revHtml = priceG > 0
      ? kv("Valor de mercado", `${fmtBRL(priceG)} / g`) +
        kv("Receita por safra", fmtBRL(revenueHarvest)) +
        kv("Receita anual", fmtBRL(revenueYear), true) +
        kv("Lucro por safra (receita − OPEX do ciclo)", fmtBRL(profitHarvest)) +
        kv("Lucro anual", fmtBRL(profitYear), true) +
        kv("Margem operacional", `${marginPct.toFixed(0)}%`) +
        kv("Payback do investimento", paybackMonths ? `${paybackMonths.toFixed(1)} meses (${(paybackMonths / (cycleDays / 30)).toFixed(1)} safras)` : "não atingido", true) +
        kv("Resultado no 1º ano (lucro − CAPEX)", fmtBRL(profitYear - capex))
      : `<p class="note">Valor de mercado (R$/g) não informado — preencha no configurador para calcular receita, lucro e payback.</p>`;

    const pipeWReport = Math.max(2, gauge.mm * topScale * 0.1 + 1.2);
    const segsSvg = plumbing.segs
      .map((s) => {
        const x1 = px(s.a[0]), y1 = py(s.a[1]), x2 = px(s.b[0]), y2 = py(s.b[1]);
        const isRet = s.kind === "return";
        const isBr = s.kind === "branch";
        const stroke = isRet ? "#6b7280" : "#2563eb";
        const dash = isRet ? 'stroke-dasharray="6 4"' : "";
        const sw = isBr ? Math.max(1.5, pipeWReport * 0.65) : pipeWReport;
        const op = isBr ? 'opacity="0.75"' : "";
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" ${dash} ${op}/>`;
      })
      .join("");

    const cotaListReport = getCotaElements(topScale, OX, OY, layout, potW, potD, spacing, width, depth);
    const cotasSvg = cotaListReport
      .map((c) => {
        const anchor = c.dir === "horizontal" ? 'text-anchor="middle"' : 'text-anchor="start"';
        const rx = c.tx - (c.dir === "horizontal" ? 18 : 2);
        return `<g>
          <line x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}" stroke="#d97706" stroke-width="1.2" stroke-dasharray="3 2"/>
          <line x1="${c.tick1[0]}" y1="${c.tick1[1]}" x2="${c.tick1[2]}" y2="${c.tick1[3]}" stroke="#d97706" stroke-width="1.2"/>
          <line x1="${c.tick2[0]}" y1="${c.tick2[1]}" x2="${c.tick2[2]}" y2="${c.tick2[3]}" stroke="#d97706" stroke-width="1.2"/>
          <rect x="${rx}" y="${c.ty - 9}" width="36" height="12" rx="3" fill="#ffffff" opacity="0.85"/>
          <text x="${c.tx}" y="${c.ty}" ${anchor} font-size="8.5" font-weight="700" fill="#b45309">${c.label}</text>
        </g>`;
      })
      .join("");

    const potsSvgReport = layout.grid
      .map((p, i) => {
        let potShapeSvg = "";
        if (isRect) {
          potShapeSvg = `<rect x="${px(p.x - potW / 2)}" y="${py(p.y - potD / 2)}" width="${potW * topScale}" height="${potD * topScale}" rx="5" fill="#dde3d0" stroke="#7e8c6d" stroke-width="1.5" />`;
        } else if (isSquare) {
          potShapeSvg = `<rect x="${px(p.x - potW / 2)}" y="${py(p.y - potD / 2)}" width="${potW * topScale}" height="${potD * topScale}" rx="4" fill="#dde3d0" stroke="#7e8c6d" stroke-width="1.5" />`;
        } else {
          potShapeSvg = `<circle cx="${px(p.x)}" cy="${py(p.y)}" r="${(potW / 2) * topScale}" fill="#dde3d0" stroke="#7e8c6d" stroke-width="1.5" />`;
        }
        return `<g>${potShapeSvg}<text x="${px(p.x)}" y="${py(p.y) + 3.5}" text-anchor="middle" font-size="10" font-weight="600" fill="#3f4a33">${i + 1}</text></g>`;
      })
      .join("");

    const dropLineSvgReport = plumbing.dropLine
      ? `<line x1="${px(plumbing.dropLine.a[0])}" y1="${py(plumbing.dropLine.a[1])}" x2="${px(plumbing.dropLine.b[0])}" y2="${py(plumbing.dropLine.b[1])}" stroke="#2563eb" stroke-width="${pipeWReport * 1.2}" stroke-linecap="round"/>`
      : "";

    const totalSvgH = showRes ? svgH : topH + OY * 2;
    const resSvgReport = showRes
      ? `<g>
          <text x="${OX}" y="${resY - 6}" font-size="9" fill="#6b6354" letter-spacing="0.1em">ZONA TÉCNICA</text>
          ${resItems
            .map(
              (it) => `
            <g>
              <rect x="${it.x}" y="${resY + (34 - it.h) / 2}" width="${it.w}" height="${it.h}" rx="6" fill="#cbd5e1" stroke="#64748b" stroke-width="1.4"/>
              <text x="${it.x + it.w / 2}" y="${resY + 19}" text-anchor="middle" font-size="8.5" font-weight="600" fill="#0f172a">${esc(it.label)}</text>
            </g>`
            )
            .join("")}
        </g>`
      : "";

    const diagramSvgHtml = `<div style="background:#f5f1e7; border-radius:12px; padding:14px 10px; text-align:center; margin:10px 0;">
      <svg width="${svgW}" height="${totalSvgH}" viewBox="0 0 ${svgW} ${totalSvgH}" style="width:100%; max-width:${svgW}px; height:auto; display:block; margin:0 auto;">
        <rect x="${OX}" y="${OY}" width="${topW}" height="${topH}" rx="10" fill="#ffffff" stroke="#1f1b16" stroke-width="1.5"/>
        <text x="${OX + topW / 2}" y="${OY - 8}" text-anchor="middle" font-size="11" fill="#6b6354">${width} cm</text>
        <text x="${OX - 10}" y="${OY + topH / 2}" text-anchor="middle" font-size="11" fill="#6b6354" transform="rotate(-90, ${OX - 10}, ${OY + topH / 2})">${depth} cm</text>
        ${segsSvg}
        ${dropLineSvgReport}
        ${potsSvgReport}
        ${cotasSvg}
        ${resSvgReport}
      </svg>
      <div style="font-size:10.5px; color:#6b6354; margin-top:8px;">Planta baixa (${width} × ${depth} cm) · ${plants} vaso(s) de ${esc(pot.label)} (${esc(potDesc)})<br/>Afastamento paredes: E/D ${layout.wallLeft}/${layout.wallRight} cm, Sup/Inf ${layout.wallTop}/${layout.wallBottom} cm · Entre vasos: ${spacing} cm</div>
    </div>`;

    const safeNotes = typeof notes === "string" ? notes.trim() : "";
    const safeInst = typeof instructions === "string" ? instructions.trim() : "";
    const safeTerms = typeof terms === "string" ? terms.trim() : "";

    const extraNotesHtml = (safeNotes || safeInst || safeTerms)
      ? `<h2>8 · Observações, instruções e termos</h2>
         <div style="background:#f5f1e7; border-radius:12px; padding:12px 14px; margin-bottom:16px; font-size:11px; color:#1f1b16;">
           ${safeNotes ? `<div style="margin-bottom:10px;"><b style="display:block; text-transform:uppercase; font-size:9.5px; color:#6b6354; margin-bottom:3px; letter-spacing:0.05em;">Observações</b><div style="white-space:pre-wrap; line-height:1.4;">${esc(safeNotes)}</div></div>` : ""}
           ${safeInst ? `<div style="margin-bottom:10px;"><b style="display:block; text-transform:uppercase; font-size:9.5px; color:#6b6354; margin-bottom:3px; letter-spacing:0.05em;">Instruções de operação</b><div style="white-space:pre-wrap; line-height:1.4;">${esc(safeInst)}</div></div>` : ""}
           ${safeTerms ? `<div><b style="display:block; text-transform:uppercase; font-size:9.5px; color:#6b6354; margin-bottom:3px; letter-spacing:0.05em;">Termos & Condições</b><div style="white-space:pre-wrap; line-height:1.4;">${esc(safeTerms)}</div></div>` : ""}
         </div>`
      : "";

    const shoppingListHtml = (Array.isArray(shoppingListItems) && shoppingListItems.length > 0)
      ? `<h2>9 · Lista de compras & QR Codes</h2>
         <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:16px;">
           ${shoppingListItems.map((item) => {
             const itemUrl = typeof item?.url === "string" ? item.url.trim() : "";
             const qrImg = itemUrl
               ? `<img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(itemUrl)}&size=200x200" alt="QR Code" style="width:108px; height:108px; max-width:100%; border-radius:8px; border:1px solid #e2e8f0; background:#ffffff; padding:4px;" />`
               : `<div style="width:108px; height:108px; max-width:100%; border-radius:8px; background:#f1f5f9; border:1px solid #e2e8f0; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8; text-align:center;">Sem link</div>`;
             return `
               <div style="display:flex; align-items:center; justify-content:space-between; gap:14px; background:#f5f1e7; border-radius:12px; padding:12px 14px;">
                 <div style="width:50%; min-width:0;">
                   <b style="font-size:12px; color:#1f1b16; display:block; margin-bottom:4px; line-height:1.3;">${esc(item.name)}</b>
                   <div style="font-size:10.5px; color:#6b6354; line-height:1.5;">
                     <div>Qtd: <b style="color:#1f1b16;">${item.qty} un</b></div>
                     <div>Unit.: <b>${fmtBRL(item.unitCost)}</b></div>
                     <div style="margin-top:2px;">Subtotal: <b style="font-size:11.5px; color:#1f1b16;">${fmtBRL(item.subtotal)}</b></div>
                   </div>
                 </div>
                 <div style="width:50%; display:flex; justify-content:center; align-items:center;">
                   ${qrImg}
                 </div>
               </div>
             `;
           }).join("")}
         </div>`
      : "";

    const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório — ${esc(growName || "GrowinStones")}</title>
<link href="https://fonts.googleapis.com/css2?family=Berkshire+Swash&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: 108mm 192mm; margin: 9mm; }
  * { box-sizing: border-box; }
  body { font-family: Inter, system-ui, sans-serif; color: #1f1b16; margin: 0; background: #f5f1e7; }
  .toolbar { position: sticky; top: 0; background: #f5f1e7; border-bottom: 1px solid #e2dccc; padding: 10px; text-align: center; }
  .toolbar button { padding: 9px 20px; border-radius: 10px; border: none; background: #1f1b16; color: #f7f3ea; font: 700 13px Inter; cursor: pointer; }
  .toolbar span { display: block; font-size: 11px; color: #6b6354; margin-top: 6px; }
  .page { max-width: 430px; margin: 18px auto; padding: 26px 24px; background: #fff; }
  .hd { border-bottom: 2px solid #1f1b16; padding-bottom: 14px; margin-bottom: 18px; }
  .hd .row { display: flex; align-items: center; gap: 10px; }
  .brand { font-family: 'Berkshire Swash', cursive; letter-spacing: -1px; font-size: 23px; line-height: 1; }
  .tag { font-size: 9px; text-transform: uppercase; letter-spacing: .18em; color: #a39a87; margin-top: 3px; }
  .meta { margin-top: 10px; font-size: 11.5px; color: #6b6354; }
  .meta b { font-size: 15px; color: #1f1b16; display: block; }
  .hl { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 22px; }
  .hl div { background: #f5f1e7; border-radius: 12px; padding: 12px 14px; }
  .hl b { font-size: 17px; font-weight: 800; display: block; }
  .hl small { font-size: 10.5px; color: #6b6354; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .16em; color: #a39a87; border-bottom: 1px solid #e2dccc; padding-bottom: 6px; margin: 26px 0 12px; font-weight: 600; }
  .kv { display: flex; justify-content: space-between; gap: 16px; padding: 5px 0; border-bottom: 1px dotted #e2dccc; font-size: 12.5px; }
  .kv span { color: #6b6354; } .kv b { font-weight: 600; text-align: right; } .kv.st b { font-weight: 800; }
  .mh, .mr { display: flex; gap: 4px; align-items: baseline; font-size: 11px; padding: 4px 0; border-bottom: 1px dotted #e2dccc; }
  .mh { text-transform: uppercase; letter-spacing: .08em; color: #a39a87; font-size: 10px; }
  .ml { flex: 1; color: #6b6354; } .mq { width: 40px; text-align: right; } .mu { width: 64px; text-align: right; } .ms { width: 74px; text-align: right; font-weight: 600; }
  .tot { display: flex; justify-content: space-between; margin-top: 10px; font-size: 15px; font-weight: 800; }
  .sub { font-size: 11.5px; color: #6b6354; margin-top: 2px; }
  .al { font-size: 12.5px; padding: 3px 0; color: #6b6354; } .al.hi { color: #8c3b3b; } .al.mid { color: #8a6a2a; }
  .note { font-size: 12.5px; color: #6b6354; }
  .ft { font-size: 10.5px; color: #a39a87; border-top: 1px solid #e2dccc; padding-top: 10px; margin-top: 20px; }
  @media print { .toolbar { display: none; } body { background: #fff; } .page { margin: 0; max-width: none; padding: 0; } }
</style></head><body>
<div class="toolbar">
  <button onclick="window.print()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;margin-right:6px"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>Salvar como PDF (9:16)</button>
  <span>Se o diálogo não abrir sozinho, clique no botão acima e escolha “Salvar como PDF”.</span>
</div>
<div class="page">
  <div class="hd">
    <div class="row" style="display:flex; align-items:center; gap:12px;">
      ${getLogoSvgString(34, "#1f1b16")}
      <div class="tag" style="font-size:9.5px; text-transform:uppercase; letter-spacing:0.18em; color:#78716c; border-left:1px solid #d6d3d1; padding-left:10px;">Relatório de projeto hidropônico</div>
    </div>
    <div class="meta"><b>${esc(growName || "Projeto sem nome")}</b>${owner ? `Responsável: ${esc(owner)} · ` : ""}${today}</div>
  </div>
  <div class="hl">
    <div><b>${fmtBRL(capex)}</b><small>Investimento</small></div>
    <div><b>${fmtG(yieldYear)}</b><small>Produção / ano</small></div>
    <div><b>${priceG > 0 ? fmtBRL(revenueYear) : "—"}</b><small>Receita / ano</small></div>
    <div><b>${paybackMonths ? paybackMonths.toFixed(1) + " meses" : "—"}</b><small>Payback</small></div>
  </div>
  <h2>1 · Estrutura do grow</h2>
  ${kv("Variedade / Genética da planta", esc(strain || "Não informada"))}
  ${kv("Dimensões (L × P × A)", `${width} × ${depth} × ${height} cm`)}
  ${kv("Área de cultivo / volume", `${areaM2.toFixed(2)} m² · ${volumeM3.toFixed(2)} m³`)}
  ${kv("Vasos", `${plants} × ${pot.label} (${esc(potDesc)})`)}
  ${kv("Disposição", `${layout.nRows} linha(s) × ${Math.min(layout.useCols, plants)} coluna(s) · espaçamento ${spacing} cm`)}
  ${kv("Ligação hidráulica", esc(connInfo.name))}
  ${kv("Bitola / tubulação", `${gauge.label} · ${pipeMeters} m (folga de 15%)`)}
  ${kv("Reservatório recomendado", `≥ ${reservoir} L`)}
  ${kv("Renovação de ar necessária", `≥ ${airFlowNeeded} m³/h`)}
  ${kv("Densidade de luz", ledWatts > 0 ? `${ledPerM2} W/m² (${ledWatts} W de LED)` : "sem LED no projeto")}
  <h2>2 · Planta baixa & disposição dos vasos</h2>
  ${diagramSvgHtml}
  <h2>3 · Equipamentos e materiais (CAPEX)</h2>
  <div class="mh"><span class="ml">Item</span><span class="mq">Qtd</span><span class="mu">Unit.</span><span class="ms">Subtotal</span></div>
  ${rowsHtml}
  <div class="mr"><span class="ml">Custos extras (frete, elétrica, estrutura…)</span><span class="ms" style="margin-left:auto">${fmtBRL(extraCost)}</span></div>
  <div class="tot"><span>Investimento total (CAPEX)</span><span>${fmtBRL(capex)}</span></div>
  <div class="sub">≈ ${fmtBRL(capexPerPlant)} por planta · ${areaM2 > 0 ? fmtBRL(capex / areaM2) : "—"} por m²</div>
  <h2>4 · Energia e custos operacionais (OPEX)</h2>
  ${kv("Potência instalada", `${totalWatts} W`)}
  ${kv("Ciclo de luz (Vega / Flora)", `${vegaHours}h/dia (${vegaDays}d) · ${floraHours}h/dia (${floraDays}d)`)}
  ${kv("Consumo mensal estimado", `${kwhMonth.toFixed(0)} kWh`)}
  ${kv("Tarifa de energia", `${fmtBRL(tariff)} / kWh`)}
  ${kv("Custo de energia / mês", fmtBRL(energyMonth))}
  ${kv("Insumos mensais (nutrientes, água…)", fmtBRL(monthlyCost))}
  ${kv("OPEX mensal total", fmtBRL(opexMonth), true)}
  ${kv(`OPEX por ciclo (${cycleDays} dias)`, fmtBRL(opexCycle))}
  ${kv("OPEX anual", fmtBRL(opexYear))}
  ${kv("Energia por ciclo", `${((kwhMonth * cycleDays) / 30).toFixed(0)} kWh · ${fmtBRL(energyCycle)}`)}
  <h2>5 · Produção e produtividade</h2>
  ${kv("Plantas por ciclo", `${plants}`)}
  ${kv("Fase Vegetativa", `${vegaDays} dias (${vegaHours}h luz/dia)`)}
  ${kv("Fase de Floração", `${floraDays} dias (${floraHours}h luz/dia)`)}
  ${kv("Tempo de cultivo (ciclo completo)", `${cycleDays} dias`)}
  ${kv("Safras por ano", harvestsYear.toFixed(1), true)}
  ${kv("Produtividade por planta", `${yieldPerPlant} g`)}
  ${kv("Produção por safra", fmtG(yieldHarvest), true)}
  ${kv("Produção anual", fmtG(yieldYear))}
  ${kv("Produtividade por m² (safra)", `${yieldM2.toFixed(0)} g/m²`)}
  ${kv("Eficiência de luz", ledWatts > 0 ? `${gPerW.toFixed(2)} g/W por safra` : "—")}
  ${kv("Custo operacional por grama", yieldYear > 0 ? fmtBRL(costPerG) : "—")}
  <h2>6 · Receita, lucro e retorno</h2>
  ${revHtml}
  <h2>7 · Diagnóstico do projeto</h2>
  ${alertsHtml}
  ${extraNotesHtml}
  ${shoppingListHtml}
  <p class="ft">Documento gerado pelo GrowinStones em ${today}. Valores estimados para planejamento — produtividade, preços e consumo variam com genética, manejo, fase do cultivo e tarifas locais. Não constitui aconselhamento financeiro.</p>
</div>
<script>${isStandalonePage ? "" : 'window.addEventListener("load", () => setTimeout(() => { try { window.print(); } catch (e) {} }, 500));'}</script>
</body></html>`;

    return html;
  };

  const generateWebDashboardHtmlString = (slug = "") => {
    const safeNotes = typeof notes === "string" ? notes.trim() : "";
    const safeInst = typeof instructions === "string" ? instructions.trim() : "";
    const safeTerms = typeof terms === "string" ? terms.trim() : "";
    const displaySlug = slug || subdomainInput || (currentUser?.username) || "grow";

    const rowsHtml = materialRows
      .map((r) => `<tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:10px 14px; font-weight:600; color:#1e293b;">${esc(r.label)}</td>
        <td style="padding:10px 14px; text-align:right; color:#475569;">${r.qty} un</td>
        <td style="padding:10px 14px; text-align:right; color:#475569;">${fmtBRL(r.unitCost)}</td>
        <td style="padding:10px 14px; text-align:right; font-weight:700; color:#0f172a;">${fmtBRL(r.subtotal)}</td>
      </tr>`)
      .join("");

    const alertsHtml = alerts
      .map((a) => `<div style="padding:10px 14px; border-radius:10px; font-size:13px; font-weight:600; margin-bottom:8px; ${a.level === 'hi' ? 'background:#fef2f2; color:#991b1b; border:1px solid #fecaca;' : a.level === 'mid' ? 'background:#fffbeb; color:#92400e; border:1px solid #fde68a;' : 'background:#f0fdf4; color:#166534; border:1px solid #bbf7d0;'}">• ${esc(a.text)}</div>`)
      .join("");

    const pipeWReport = Math.max(2, gauge.mm * topScale * 0.1 + 1.2);
    const segsSvg = plumbing.segs
      .map((s) => {
        const x1 = px(s.a[0]), y1 = py(s.a[1]), x2 = px(s.b[0]), y2 = py(s.b[1]);
        const isRet = s.kind === "return";
        const isBr = s.kind === "branch";
        const stroke = isRet ? "#6b7280" : "#2563eb";
        const dash = isRet ? 'stroke-dasharray="6 4"' : "";
        const sw = isBr ? Math.max(1.5, pipeWReport * 0.65) : pipeWReport;
        const op = isBr ? 'opacity="0.75"' : "";
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" ${dash} ${op}/>`;
      })
      .join("");

    const cotaListReport = getCotaElements(topScale, OX, OY, layout, potW, potD, spacing, width, depth);
    const cotasSvg = cotaListReport
      .map((c) => {
        const anchor = c.dir === "horizontal" ? 'text-anchor="middle"' : 'text-anchor="start"';
        const rx = c.tx - (c.dir === "horizontal" ? 18 : 2);
        return `<g>
          <line x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}" stroke="#d97706" stroke-width="1.2" stroke-dasharray="3 2"/>
          <line x1="${c.tick1[0]}" y1="${c.tick1[1]}" x2="${c.tick1[2]}" y2="${c.tick1[3]}" stroke="#d97706" stroke-width="1.2"/>
          <line x1="${c.tick2[0]}" y1="${c.tick2[1]}" x2="${c.tick2[2]}" y2="${c.tick2[3]}" stroke="#d97706" stroke-width="1.2"/>
          <rect x="${rx}" y="${c.ty - 9}" width="36" height="12" rx="3" fill="#ffffff" opacity="0.85"/>
          <text x="${c.tx}" y="${c.ty}" ${anchor} font-size="8.5" font-weight="700" fill="#b45309">${c.label}</text>
        </g>`;
      })
      .join("");

    const potsSvgReport = layout.grid
      .map((p, i) => {
        let potShapeSvg = "";
        if (isRect) {
          potShapeSvg = `<rect x="${px(p.x - potW / 2)}" y="${py(p.y - potD / 2)}" width="${potW * topScale}" height="${potD * topScale}" rx="5" fill="#dde3d0" stroke="#7e8c6d" stroke-width="1.5" />`;
        } else if (isSquare) {
          potShapeSvg = `<rect x="${px(p.x - potW / 2)}" y="${py(p.y - potD / 2)}" width="${potW * topScale}" height="${potD * topScale}" rx="4" fill="#dde3d0" stroke="#7e8c6d" stroke-width="1.5" />`;
        } else {
          potShapeSvg = `<circle cx="${px(p.x)}" cy="${py(p.y)}" r="${(potW / 2) * topScale}" fill="#dde3d0" stroke="#7e8c6d" stroke-width="1.5" />`;
        }
        return `<g>${potShapeSvg}<text x="${px(p.x)}" y="${py(p.y) + 3.5}" text-anchor="middle" font-size="10" font-weight="600" fill="#3f4a33">${i + 1}</text></g>`;
      })
      .join("");

    const dropLineSvgReport = plumbing.dropLine
      ? `<line x1="${px(plumbing.dropLine.a[0])}" y1="${py(plumbing.dropLine.a[1])}" x2="${px(plumbing.dropLine.b[0])}" y2="${py(plumbing.dropLine.b[1])}" stroke="#2563eb" stroke-width="${pipeWReport * 1.2}" stroke-linecap="round"/>`
      : "";

    const totalSvgH = showRes ? svgH : topH + OY * 2;
    const resSvgReport = showRes
      ? `<g>
          <text x="${OX}" y="${resY - 6}" font-size="9" fill="#6b6354" letter-spacing="0.1em">ZONA TÉCNICA</text>
          ${resItems
            .map(
              (it) => `
            <g>
              <rect x="${it.x}" y="${resY + (34 - it.h) / 2}" width="${it.w}" height="${it.h}" rx="6" fill="#cbd5e1" stroke="#64748b" stroke-width="1.4"/>
              <text x="${it.x + it.w / 2}" y="${resY + 19}" text-anchor="middle" font-size="8.5" font-weight="600" fill="#0f172a">${esc(it.label)}</text>
            </g>`
            )
            .join("")}
        </g>`
      : "";

    const shoppingListHtml = (Array.isArray(shoppingListItems) && shoppingListItems.length > 0)
      ? `<div style="margin-top:28px;">
          <h2 style="font-size:14px; text-transform:uppercase; letter-spacing:0.12em; color:#0369a1; border-bottom:2px solid #bae6fd; padding-bottom:8px; margin-bottom:16px;">🛒 Lista de compras com QR Codes</h2>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:14px;">
            ${shoppingListItems.map((item) => {
              const itemUrl = typeof item?.url === "string" ? item.url.trim() : "";
              const qrImg = itemUrl
                ? `<img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(itemUrl)}&size=200x200" alt="QR Code" style="width:90px; height:90px; border-radius:8px; border:1px solid #e2e8f0; background:#ffffff; padding:4px;" />`
                : `<div style="width:90px; height:90px; border-radius:8px; background:#f1f5f9; border:1px solid #cbd5e1; display:flex; align-items:center; justify-content:center; font-size:11px; color:#94a3b8;">Sem link</div>`;
              return `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; background:#ffffff; border-radius:14px; padding:14px; border:1px solid #e2e8f0; box-shadow:0 4px 12px rgba(0,0,0,0.03);">
                  <div style="flex:1; min-width:0;">
                    <b style="font-size:13px; color:#0f172a; display:block; margin-bottom:4px; line-height:1.3;">${esc(item.name)}</b>
                    <div style="font-size:11px; color:#64748b; line-height:1.5;">
                      <div>Qtd: <b style="color:#0f172a;">${item.qty} un</b></div>
                      <div>Unit.: <b>${fmtBRL(item.unitCost)}</b></div>
                      <div style="margin-top:2px; font-weight:700; color:#0284c7;">Subtotal: ${fmtBRL(item.subtotal)}</div>
                    </div>
                  </div>
                  <div style="shrink:0;">
                    ${qrImg}
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>`
      : "";

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(growName || "GrowinStones")} — Dashboard Interativo</title>
<link href="https://fonts.googleapis.com/css2?family=Berkshire+Swash&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background: #0c0a09; color: #f5f5f4; margin: 0; padding: 0; min-height: 100vh; }
  header { background: #1c1917; border-bottom: 1px solid #292524; position: sticky; top: 0; z-index: 50; }
  .header-in { max-width: 1100px; margin: 0 auto; padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .brand { font-family: 'Berkshire Swash', cursive; font-size: 24px; color: #f59e0b; text-decoration: none; display: flex; align-items: center; gap: 8px; }
  .badge-live { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; background: rgba(16,185,129,0.15); border: 1px solid #10b981; color: #34d399; font-size: 11.5px; font-weight: 700; border-radius: 20px; text-decoration: none; }
  .badge-live::before { content: ""; width: 7px; height: 7px; background: #10b981; border-radius: 50%; display: inline-block; box-shadow: 0 0 8px #10b981; }
  .container { max-width: 1100px; margin: 24px auto; padding: 0 20px 60px; }
  .hero-card { background: linear-gradient(135deg, #1c1917 0%, #292524 100%); border: 1px solid #44403c; border-radius: 20px; padding: 28px; margin-bottom: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); }
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 28px; }
  .kpi-card { background: #1c1917; border: 1px solid #292524; border-radius: 16px; padding: 20px; }
  .kpi-val { font-size: 24px; font-weight: 800; color: #38bdf8; margin: 4px 0 2px; }
  .kpi-lbl { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.08em; color: #a8a29e; }
  .sec-card { background: #1c1917; border: 1px solid #292524; border-radius: 20px; padding: 24px; margin-bottom: 24px; }
  .sec-title { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #f59e0b; border-bottom: 1px solid #292524; padding-bottom: 10px; margin-top: 0; margin-bottom: 16px; }
  .kv-row { display: flex; justify-content: space-between; gap: 16px; padding: 10px 0; border-bottom: 1px solid #292524; font-size: 13px; }
  .kv-row span { color: #a8a29e; } .kv-row b { font-weight: 600; color: #f5f5f4; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
  th { text-align: left; padding: 12px; border-bottom: 2px solid #292524; color: #a8a29e; font-size: 11px; text-transform: uppercase; }
  td { padding: 12px; border-bottom: 1px solid #292524; color: #e7e5e4; }
  .footer { text-align: center; font-size: 12px; color: #78716c; margin-top: 40px; }
</style>
</head>
<body>
<header>
  <div class="header-in">
    <a href="#" class="brand">🌱 GrowinStones</a>
    <a href="https://${displaySlug}.thegrowinstones.com" target="_blank" class="badge-live">https://${displaySlug}.thegrowinstones.com</a>
  </div>
</header>
<div class="container">
  <div class="hero-card">
    <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
      <div>
        <h1 style="font-size:28px; font-weight:800; margin:0 0 6px; color:#ffffff;">${esc(growName || "GrowinStones")}</h1>
        <div style="font-size:13px; color:#a8a29e;">
          ${owner ? `Responsável: <b style="color:#f5f5f4;">${esc(owner)}</b> · ` : ""}Genética: <b style="color:#f5f5f4;">${esc(strain || "Não informada")}</b> · Atualizado em ${today}
        </div>
      </div>
      <button onclick="window.print()" style="background:#0284c7; color:#fff; border:none; padding:10px 18px; border-radius:12px; font:700 13px Inter; cursor:pointer;">🖨️ Exportar PDF</button>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-lbl">Investimento (CAPEX)</div>
      <div class="kpi-val" style="color:#38bdf8;">${fmtBRL(capex)}</div>
      <div style="font-size:11px; color:#78716c;">≈ ${fmtBRL(capexPerPlant)} / planta</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-lbl">Produção Anual Estimada</div>
      <div class="kpi-val" style="color:#34d399;">${fmtG(yieldYear)}</div>
      <div style="font-size:11px; color:#78716c;">${harvestsYear.toFixed(1)} safras/ano (${yieldPerPlant}g/planta)</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-lbl">Receita Estimada / Ano</div>
      <div class="kpi-val" style="color:#f59e0b;">${priceG > 0 ? fmtBRL(revenueYear) : "—"}</div>
      <div style="font-size:11px; color:#78716c;">${priceG > 0 ? `${fmtBRL(priceG)}/g` : "Preço/g não preenchido"}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-lbl">Payback Estimado</div>
      <div class="kpi-val" style="color:#a78bfa;">${paybackMonths ? `${paybackMonths.toFixed(1)} m` : "—"}</div>
      <div style="font-size:11px; color:#78716c;">${paybackMonths ? `~${(paybackMonths / (cycleDays / 30)).toFixed(1)} safras` : "Retorno não atingido"}</div>
    </div>
  </div>

  <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:24px;">
    <div class="sec-card">
      <h2 class="sec-title">📐 Estrutura & Dimensões</h2>
      <div class="kv-row"><span>Dimensões (L × P × A)</span><b>${width} × ${depth} × ${height} cm</b></div>
      <div class="kv-row"><span>Área / Volume</span><b>${areaM2.toFixed(2)} m² · ${volumeM3.toFixed(2)} m³</b></div>
      <div class="kv-row"><span>Vasos</span><b>${plants} × ${pot.label} (${esc(potDesc)})</b></div>
      <div class="kv-row"><span>Sistema Hidráulico</span><b>${esc(connInfo.name)}</b></div>
      <div class="kv-row"><span>Tubulação / Bitola</span><b>${gauge.label} (${pipeMeters} m)</b></div>
      <div class="kv-row"><span>Reservatório Mínimo</span><b>≥ ${reservoir} L</b></div>
      <div class="kv-row"><span>Renovação de Ar</span><b>≥ ${airFlowNeeded} m³/h</b></div>
      <div class="kv-row"><span>Iluminação LED</span><b>${ledWatts > 0 ? `${ledPerM2} W/m² (${ledWatts} W)` : "Sem LED"}</b></div>
    </div>

    <div class="sec-card">
      <h2 class="sec-title">⚡ Custos Operacionais & Energia</h2>
      <div class="kv-row"><span>Potência Total Instalada</span><b>${totalWatts} W</b></div>
      <div class="kv-row"><span>Consumo Mensal</span><b>${kwhMonth.toFixed(0)} kWh</b></div>
      <div class="kv-row"><span>Tarifa de Energia</span><b>${fmtBRL(tariff)} / kWh</b></div>
      <div class="kv-row"><span>Custo de Energia / Mês</span><b>${fmtBRL(energyMonth)}</b></div>
      <div class="kv-row"><span>Insumos / Mês</span><b>${fmtBRL(monthlyCost)}</b></div>
      <div class="kv-row"><span>OPEX Mensal Total</span><b style="color:#f43f5e;">${fmtBRL(opexMonth)}</b></div>
      <div class="kv-row"><span>OPEX por Safra (${cycleDays}d)</span><b style="color:#f43f5e;">${fmtBRL(opexCycle)}</b></div>
      <div class="kv-row"><span>Custo por Grama Produzida</span><b>${yieldYear > 0 ? fmtBRL(costPerG) : "—"}</b></div>
    </div>
  </div>

  <div class="sec-card">
    <h2 class="sec-title">🗺️ Planta Baixa Interativa</h2>
    <div style="background:#f5f1e7; border-radius:14px; padding:16px; text-align:center;">
      <svg width="${svgW}" height="${totalSvgH}" viewBox="0 0 ${svgW} ${totalSvgH}" style="width:100%; max-width:${svgW}px; height:auto; display:block; margin:0 auto;">
        <rect x="${OX}" y="${OY}" width="${topW}" height="${topH}" rx="10" fill="#ffffff" stroke="#1f1b16" stroke-width="1.5"/>
        <text x="${OX + topW / 2}" y="${OY - 8}" text-anchor="middle" font-size="11" fill="#6b6354">${width} cm</text>
        <text x="${OX - 10}" y="${OY + topH / 2}" text-anchor="middle" font-size="11" fill="#6b6354" transform="rotate(-90, ${OX - 10}, ${OY + topH / 2})">${depth} cm</text>
        ${segsSvg}
        ${dropLineSvgReport}
        ${potsSvgReport}
        ${cotasSvg}
        ${resSvgReport}
      </svg>
      <div style="font-size:11px; color:#6b6354; margin-top:10px;">Planta baixa (${width} × ${depth} cm) · ${plants} vaso(s) de ${esc(pot.label)} (${esc(potDesc)})</div>
    </div>
  </div>

  <div class="sec-card">
    <h2 class="sec-title">📋 Equipamentos e Materiais (CAPEX)</h2>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th style="text-align:right;">Qtd</th>
          <th style="text-align:right;">Unitário</th>
          <th style="text-align:right;">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${materialRows.map((r) => `<tr><td>${esc(r.label)}</td><td style="text-align:right;">${r.qty}</td><td style="text-align:right;">${fmtBRL(r.unitCost)}</td><td style="text-align:right; font-weight:700;">${fmtBRL(r.subtotal)}</td></tr>`).join("")}
        <tr>
          <td colspan="3" style="font-weight:700;">Custos Extras (frete, estrutura, elétrica)</td>
          <td style="text-align:right; font-weight:700;">${fmtBRL(extraCost)}</td>
        </tr>
        <tr style="font-size:15px; font-weight:800; color:#38bdf8;">
          <td colspan="3">INVESTIMENTO TOTAL (CAPEX)</td>
          <td style="text-align:right;">${fmtBRL(capex)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  ${shoppingListHtml}

  ${safeNotes || safeInst || safeTerms ? `
  <div class="sec-card">
    <h2 class="sec-title">📝 Notas, Instruções & Termos</h2>
    ${safeNotes ? `<div style="margin-bottom:12px;"><b style="color:#f59e0b; display:block; font-size:11px; text-transform:uppercase; margin-bottom:4px;">Observações</b><div style="white-space:pre-wrap; line-height:1.5;">${esc(safeNotes)}</div></div>` : ""}
    ${safeInst ? `<div style="margin-bottom:12px;"><b style="color:#f59e0b; display:block; font-size:11px; text-transform:uppercase; margin-bottom:4px;">Instruções de Operação</b><div style="white-space:pre-wrap; line-height:1.5;">${esc(safeInst)}</div></div>` : ""}
    ${safeTerms ? `<div><b style="color:#f59e0b; display:block; font-size:11px; text-transform:uppercase; margin-bottom:4px;">Termos & Condições</b><div style="white-space:pre-wrap; line-height:1.5;">${esc(safeTerms)}</div></div>` : ""}
  </div>` : ""}

  <div class="footer">
    Relatório e Dashboard Interativo gerado pelo <b>GrowinStones</b> em ${today}.<br/>
    Hospedado exclusivamente em <b>https://${displaySlug}.thegrowinstones.com</b>
  </div>
</div>
</body>
</html>`;
  };

  const openReportHtml = () => {
    const html = generateReportHtmlString(false);
    const win = window.open("", "_blank");
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
    } else {
      showToast("⚠️ O seu navegador bloqueou a abertura de abas. Habilite pop-ups para visualizar o PDF.");
    }
  };

  const openStaticDashboardHtml = () => {
    const slug = subdomainInput || currentUser?.username || "grow";
    const htmlContent = generateWebDashboardHtmlString(slug);
    const win = window.open("", "_blank");
    if (win) {
      win.document.open();
      win.document.write(htmlContent);
      win.document.close();
    } else {
      showToast("⚠️ O seu navegador bloqueou a abertura de abas. Habilite pop-ups.");
    }
  };

  const handlePublishSubdomain = async () => {
    if (!subdomainInput.trim()) return;
    setIsPublishing(true);
    setPublishResult(null);

    const cleanSlug = subdomainInput.toLowerCase().trim().replace(/[^a-z0-9-]/g, "");

    let html = "";
    let setupData = null;

    try {
      html = generateWebDashboardHtmlString(cleanSlug);
      setupData = getSetupData();
    } catch (e) {
      console.error("Erro ao gerar relatório HTML:", e);
      setPublishResult({ success: false, error: `Erro ao gerar relatório HTML: ${e.message}` });
      setIsPublishing(false);
      return;
    }

    if (!html || typeof html !== "string" || html.trim().length < 100) {
      setPublishResult({ success: false, error: "O conteúdo HTML do relatório foi gerado em branco." });
      setIsPublishing(false);
      return;
    }

    const apiUrl = window.location.origin.includes("localhost") 
      ? "/api/publish" 
      : "https://grow.thegrowinstones.com/api/publish";

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: cleanSlug, html, setupData }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Servidor retornou código HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.success) {
        setPublishResult({ success: true, url: data.url, slug: data.slug });
      } else {
        setPublishResult({ success: false, error: data.error || "Erro ao publicar subdomínio." });
      }
    } catch (err) {
      console.error("Erro na publicação:", err);
      const errMsg = err.name === "AbortError"
        ? "Tempo limite esgotado (15s) ao conectar com o servidor."
        : (err.message || "Falha na conexão com o servidor de publicação.");
      setPublishResult({ success: false, error: errMsg });
    } finally {
      setIsPublishing(false);
    }
  };

// ————————————————————————— GOOGLE AUTH LANDING PAGE —————————————————————————
  if (!currentUser) {
    return (
      <div className="min-h-screen flex flex-col justify-between" style={{ background: "#0c0a09", color: "#f5f5f4", fontFamily: "'Inter', system-ui, sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Berkshire+Swash&display=swap');`}</style>
        
        {/* Header */}
        <header style={{ background: "rgba(28, 25, 23, 0.8)", backdropFilter: "blur(12px)", borderBottom: "1px solid #292524" }} className="sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo height={38} color="#f59e0b" />
            </div>
            <button
              onClick={triggerGoogleOAuth}
              className="px-5 py-2.5 rounded-xl font-bold text-xs transition-all hover:scale-105 shadow-lg flex items-center gap-2"
              style={{ background: "#0284c7", color: "#ffffff" }}
            >
              <span>Entrar com o Google</span>
            </button>
          </div>
        </header>

        {/* Hero Section */}
        <main className="max-w-5xl mx-auto px-6 py-16 text-center flex-1 flex flex-col justify-center items-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold mb-6" style={{ background: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(245, 158, 11, 0.3)", color: "#fbbf24" }}>
            <span>🌱 Engenharia de Cultivo & Subdomínios Exclusivos</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-6" style={{ color: "#ffffff", lineHeight: 1.15 }}>
            Dimensionamento Profissional de <br/>
            <span style={{ background: "linear-gradient(135deg, #f59e0b 0%, #38bdf8 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Grows Hidropônicos
            </span>
          </h1>

          <p className="text-base sm:text-lg max-w-2xl mx-auto mb-10" style={{ color: "#a8a29e", lineHeight: 1.6 }}>
            Calcule layouts de vasos, bitolas de tubulação, automação de irrigação, custos de energia (OPEX), investimento (CAPEX) e publique seu dashboard completo em um subdomínio exclusivo com SSL.
          </p>

          <button
            onClick={triggerGoogleOAuth}
            className="px-8 py-4 rounded-2xl font-bold text-sm transition-all hover:scale-105 shadow-2xl flex items-center gap-3"
            style={{ background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)", color: "#ffffff" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
              <polyline points="10 17 15 12 10 7"/>
              <line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
            <span>Entrar ou Cadastrar com o Google</span>
          </button>

          {/* Feature Highlights Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-16 text-left w-full">
            <div className="p-6 rounded-2xl" style={{ background: "#1c1917", border: "1px solid #292524" }}>
              <div className="text-2xl mb-2">📐</div>
              <h3 className="font-bold text-sm mb-1 text-white">Dimensionamento de Vasos</h3>
              <p className="text-xs text-stone-400">Arranjo de linhas e colunas com afastamento ajustável e cálculo exato de milímetros.</p>
            </div>
            <div className="p-6 rounded-2xl" style={{ background: "#1c1917", border: "1px solid #292524" }}>
              <div className="text-2xl mb-2">💧</div>
              <h3 className="font-bold text-sm mb-1 text-white">Engenharia Hidráulica</h3>
              <p className="text-xs text-stone-400">Cálculo de bitola de tubos, bombas de água/ar, anéis recirculantes e reservatórios.</p>
            </div>
            <div className="p-6 rounded-2xl" style={{ background: "#1c1917", border: "1px solid #292524" }}>
              <div className="text-2xl mb-2">🌐</div>
              <h3 className="font-bold text-sm mb-1 text-white">Subdomínio Exclusivo</h3>
              <p className="text-xs text-stone-400">Exportação com um clique para seu subdomínio exclusivo com certificado SSL automático.</p>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="py-6 text-center text-xs border-t border-stone-800" style={{ color: "#78716c" }}>
          GrowinStones © 2026 — Plataforma de Projetos Hidropônicos.
        </footer>

        {/* Modal Configurar Client ID do Google OAuth ou Entrar Direto */}
        {googleClientIdModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)" }}>
            <div className="w-full max-w-lg p-6 rounded-2xl text-left shadow-2xl relative space-y-4" style={{ background: "#1c1917", border: "1px solid #383532", color: "#f5f5f4" }}>
              <button onClick={() => setGoogleClientIdModalOpen(false)} className="absolute top-4 right-4 text-stone-400 hover:text-white font-bold text-sm">✕</button>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-amber-400 text-lg bg-amber-500/10 border border-amber-500/30 shrink-0">
                  🔑
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Configuração do Google OAuth 2.0</h3>
                  <p className="text-xs text-stone-400">O Google exige um Client ID válido para o domínio grow.thegrowinstones.com</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 space-y-2">
                <p className="font-bold text-amber-200">📍 Origem não registrada no Google Cloud (no registered origin)</p>
                <p>O seu Client ID <code className="text-amber-200 bg-black/40 px-1 py-0.5 rounded font-mono">447903804008...</code> é válido, mas o domínio <code className="text-white bg-black/40 px-1 py-0.5 rounded font-mono">https://grow.thegrowinstones.com</code> precisa ser adicionado como **Origem JavaScript Autorizada** no Google Cloud.</p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => {
                      setGoogleClientIdModalOpen(false);
                      setAuthNameInput("Cultivador");
                      setAuthUsernameInput("meu-grow");
                      setAuthModalOpen(true);
                    }}
                    className="flex-1 py-3 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg flex items-center justify-center gap-2"
                  >
                    🚀 Entrar no Modo Direto (Acessar Agora)
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-stone-300 pt-3 border-t border-stone-800 space-y-1.5">
                <p className="font-bold text-sky-400">💡 Como autorizar o domínio no Google Cloud (em 15 segundos):</p>
                <ol className="list-decimal pl-4 space-y-1 text-stone-300">
                  <li>Acesse **<a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-sky-400 underline font-bold">console.cloud.google.com/apis/credentials</a>**.</li>
                  <li>Clique no seu Client ID (**447903804008...**).</li>
                  <li>No campo **Origens JavaScript autorizadas**, adicione:
                    <div className="font-mono text-[10.5px] text-emerald-400 bg-black/50 p-1.5 rounded my-1">
                      https://grow.thegrowinstones.com<br/>
                      http://localhost:5173
                    </div>
                  </li>
                  <li>Clique em **Salvar** no rodapé do Google Cloud!</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* Modal Cadastro Google & Subdomínio */}
        {authModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}>
            <div className="w-full max-w-md p-6 rounded-2xl text-left shadow-2xl relative" style={{ background: "#1c1917", border: "1px solid #383532", color: "#f5f5f4" }}>
              <button onClick={() => setAuthModalOpen(false)} className="absolute top-4 right-4 text-stone-400 hover:text-white font-bold text-sm">✕</button>

              <div className="flex items-center gap-3 mb-4">
                {pendingGoogleUser && pendingGoogleUser.picture ? (
                  <img src={pendingGoogleUser.picture} alt="Google Avatar" className="w-11 h-11 rounded-full border-2 border-emerald-500 shadow shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white text-lg shrink-0" style={{ background: "#0284c7" }}>
                    G
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="font-bold text-base text-white truncate">
                    {pendingGoogleUser ? pendingGoogleUser.name : "Entrar com o Google"}
                  </h3>
                  <p className="text-xs text-emerald-400 font-medium truncate flex items-center gap-1">
                    {pendingGoogleUser ? (
                      <><span>✓ {pendingGoogleUser.email}</span></>
                    ) : (
                      <span className="text-stone-400">Defina seu usuário e subdomínio exclusivo</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-stone-300">Seu Nome / Nome do Cultivo:</label>
                  <input
                    type="text"
                    value={authNameInput}
                    onChange={(e) => setAuthNameInput(e.target.value)}
                    placeholder="Ex: João Silva"
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none font-medium"
                    style={{ background: "#292524", border: "1px solid #44403c", color: "#ffffff" }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 text-stone-300">Seu Nome de Usuário / Subdomínio:</label>
                  <div className="flex items-center rounded-xl overflow-hidden px-3 py-2" style={{ background: "#292524", border: "1px solid #0284c7" }}>
                    <span className="text-xs text-stone-400 mr-1 font-mono">https://</span>
                    <input
                      type="text"
                      value={authUsernameInput}
                      onChange={(e) => setAuthUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      placeholder="joaofarms"
                      className="w-full text-sm outline-none font-bold bg-transparent text-sky-400 font-mono"
                    />
                    <span className="text-xs text-stone-400 ml-1 font-mono">.thegrowinstones.com</span>
                  </div>
                  <p className="text-[11px] text-stone-400 mt-1">Este será o endereço público permanente dos seus relatórios.</p>
                </div>

                <button
                  onClick={() => {
                    const cleanSlug = authUsernameInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, "") || "cultivador";
                    const cleanName = authNameInput.trim() || (pendingGoogleUser ? pendingGoogleUser.name : "Cultivador");
                    const newUser = {
                      name: cleanName,
                      email: pendingGoogleUser ? pendingGoogleUser.email : `${cleanSlug}@gmail.com`,
                      username: cleanSlug,
                      avatar: pendingGoogleUser && pendingGoogleUser.picture ? pendingGoogleUser.picture : `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanSlug}`,
                      googleSub: pendingGoogleUser ? pendingGoogleUser.sub : null
                    };
                    localStorage.setItem("growcalc_user", JSON.stringify(newUser));
                    setCurrentUser(newUser);
                    setSubdomainInput(cleanSlug);
                    setAuthModalOpen(false);
                    showToast(`✓ Bem-vindo, ${cleanName}! Subdomínio @${cleanSlug} ativado com Google.`);
                  }}
                  className="w-full py-3 rounded-xl font-bold text-xs transition-all hover:opacity-90 shadow-lg flex items-center justify-center gap-2 mt-2"
                  style={{ background: "#0284c7", color: "#ffffff" }}
                >
                  🚀 Confirmar & Acessar Configurador
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

// ————————————————————————— LAYOUT COM SIDEBAR LATERAL —————————————————————————
  return (
    <div className="min-h-screen flex" style={{ background: T.bg, color: T.text, fontFamily: "'Inter', system-ui, sans-serif", transition: "background 0.3s, color 0.3s" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Berkshire+Swash&display=swap');
        input[type=number]::-webkit-inner-spin-button{ -webkit-appearance:none; }`}</style>

      {/* SIDEBAR LATERAL ESQUERDO */}
      <aside
        className={`sticky top-0 h-screen flex flex-col justify-between transition-all duration-300 z-40 shrink-0 ${sidebarCollapsed ? "w-16 px-2 py-4" : "w-64 px-4 py-4"}`}
        style={{ background: T.surface, borderRight: `1px solid ${T.border}` }}
      >
        {/* Top Header Sidebar */}
        <div>
          <div className="flex items-center justify-between mb-6 px-1">
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2">
                <Logo height={30} color={T.brand} />
              </div>
            )}
            {sidebarCollapsed && (
              <div className="mx-auto">
                <Logo height={24} color={T.brand} />
              </div>
            )}
            <button
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-xs font-bold shrink-0"
              style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.textMuted }}
              title={sidebarCollapsed ? "Expandir Menu" : "Recolher Menu"}
            >
              {sidebarCollapsed ? "→" : "←"}
            </button>
          </div>

          {/* Subdomain Badge link */}
          {!sidebarCollapsed && (
            <a
              href={`https://${currentUser.username}.thegrowinstones.com`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between px-3 py-2 rounded-xl mb-6 text-xs font-mono transition-opacity hover:opacity-85"
              style={{ background: dark ? "rgba(16,185,129,0.1)" : "#ecfdf5", border: "1px solid #10b981", color: "#10b981" }}
            >
              <span className="truncate">https://{currentUser.username}.grow...</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse"></span>
            </a>
          )}

          {/* Menu Items com Ícones Vetoriais Monocromáticos */}
          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveTab("configurator")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${activeTab === "configurator" ? "shadow-sm" : "hover:opacity-80"}`}
              style={{
                background: activeTab === "configurator" ? (dark ? "#0284c7" : "#0369a1") : T.surface2,
                color: activeTab === "configurator" ? "#ffffff" : T.text
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>
              </svg>
              {!sidebarCollapsed && <span>Configurador de Grow</span>}
            </button>

            <button
              onClick={() => setActiveTab("my_grows")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${activeTab === "my_grows" ? "shadow-sm" : "hover:opacity-80"}`}
              style={{
                background: activeTab === "my_grows" ? (dark ? "#0284c7" : "#0369a1") : T.surface2,
                color: activeTab === "my_grows" ? "#ffffff" : T.text
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <path d="M12 22v-9"/><path d="M12 13a6 6 0 0 1 6-6c0 6-6 6-6 6z"/><path d="M12 13a6 6 0 0 0-6-6c0 6 6 6 6 6z"/>
              </svg>
              {!sidebarCollapsed && (
                <div className="flex items-center justify-between w-full">
                  <span>Meus Grows</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 font-bold">LIVE</span>
                </div>
              )}
            </button>

            <button
              onClick={() => setActiveTab("comparison")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${activeTab === "comparison" ? "shadow-sm" : "hover:opacity-80"}`}
              style={{
                background: activeTab === "comparison" ? (dark ? "#0284c7" : "#0369a1") : T.surface2,
                color: activeTab === "comparison" ? "#ffffff" : T.text
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
              {!sidebarCollapsed && <span>Comparar Setups</span>}
            </button>

            <button
              onClick={() => setActiveTab("mqtt")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${activeTab === "mqtt" ? "shadow-sm" : "hover:opacity-80"}`}
              style={{
                background: activeTab === "mqtt" ? (dark ? "#0284c7" : "#0369a1") : T.surface2,
                color: activeTab === "mqtt" ? "#ffffff" : T.text
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="15" x2="23" y2="15"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="15" x2="4" y2="15"/>
              </svg>
              {!sidebarCollapsed && (
                <div className="flex items-center justify-between w-full">
                  <span>Telemetria ESP32</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-500/20 text-sky-400 font-bold font-mono">MQTT</span>
                </div>
              )}
            </button>

            <button
              onClick={() => setActiveTab("settings")}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${activeTab === "settings" ? "shadow-sm" : "hover:opacity-80"}`}
              style={{
                background: activeTab === "settings" ? (dark ? "#0284c7" : "#0369a1") : T.surface2,
                color: activeTab === "settings" ? "#ffffff" : T.text
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              {!sidebarCollapsed && <span>Configurações</span>}
            </button>
          </nav>
        </div>

        {/* User Card at bottom of Sidebar */}
        <div className="pt-4 border-t" style={{ borderColor: T.border }}>
          {!sidebarCollapsed ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0" style={{ background: "#0284c7" }}>
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate" style={{ color: T.text }}>{currentUser.name}</div>
                  <div className="text-[11px] font-mono truncate" style={{ color: T.textMuted }}>@{currentUser.username}</div>
                </div>
              </div>
              <button
                onClick={() => {
                  if (window.confirm("Deseja sair da sua conta?")) {
                    localStorage.removeItem("growcalc_user");
                    setCurrentUser(null);
                  }
                }}
                className="p-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-red-500/20 text-red-400 shrink-0"
                title="Sair da Conta"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                if (window.confirm("Deseja sair da sua conta?")) {
                  localStorage.removeItem("growcalc_user");
                  setCurrentUser(null);
                }
              }}
              className="w-full py-2 rounded-lg text-xs text-red-400 hover:bg-red-500/20 text-center"
              title="Sair"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          )}
        </div>
      </aside>

      {/* ÁREA PRINCIPAL DA APLICAÇÃO */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Render Tab Content */}
                {activeTab === "mqtt" && (
          <MQTTMonitorView currentUser={currentUser} T={T} dark={dark} showToast={showToast} />
        )}

        {activeTab === "my_grows" && (
          <div className="max-w-5xl mx-auto px-6 py-8 w-full">
            <h1 className="text-2xl font-bold mb-2" style={{ color: T.text }}>🌿 Meus Grows & Subdomínios</h1>
            <p className="text-xs mb-6" style={{ color: T.textMuted }}>Gerencie os setups salvos e seu subdomínio exclusivo em funcionamento.</p>
            
            <div className="p-6 rounded-2xl mb-8" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">SUBDOMÍNIO ATIVO</span>
                  <h3 className="text-lg font-extrabold mt-2 font-mono" style={{ color: T.brand }}>https://{currentUser.username}.thegrowinstones.com</h3>
                  <p className="text-xs mt-1" style={{ color: T.textMuted }}>Status: Online com Certificado SSL (HTTPS) Let's Encrypt</p>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`https://${currentUser.username}.thegrowinstones.com`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow"
                    style={{ background: "#0284c7" }}
                  >
                    🌐 Ver Subdomínio ao Vivo
                  </a>
                  <button
                    onClick={() => {
                      setSubdomainInput(currentUser.username);
                      setPublishModalOpen(true);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold"
                    style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                  >
                    🚀 Re-publicar Setup Atual
                  </button>
                </div>
              </div>
            </div>

            <h2 className="text-base font-bold mb-4" style={{ color: T.text }}>Setups Guardados ({allPresets.length})</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {allPresets.map((p, idx) => (
                <div key={idx} className="p-4 rounded-xl flex flex-col justify-between gap-3" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
                  <div>
                    <h4 className="font-bold text-sm" style={{ color: T.text }}>{p.name}</h4>
                    <p className="text-xs mt-1" style={{ color: T.textMuted }}>{p.plants} vasos · {p.width}×{p.depth} cm · {p.conn}</p>
                  </div>
                  <button
                    onClick={() => {
                      applyPreset(p);
                      setActiveTab("configurator");
                      showToast(`✓ Setup "${p.name}" carregado!`);
                    }}
                    className="w-full py-2 rounded-lg text-xs font-semibold"
                    style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                  >
                    ⚡ Carregar no Configurador
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="max-w-3xl mx-auto px-6 py-8 w-full">
            <h1 className="text-2xl font-bold mb-2" style={{ color: T.text }}>⚙️ Configurações da Conta</h1>
            <p className="text-xs mb-6" style={{ color: T.textMuted }}>Ajuste seu perfil, subdomínio base e preferências de visualização.</p>

            <div className="p-6 rounded-2xl space-y-6" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: T.text }}>Nome de Usuário (Subdomínio Exclusivo)</label>
                <div className="flex items-center rounded-xl px-3 py-2" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                  <span className="text-xs text-stone-400 font-mono">https://</span>
                  <input
                    type="text"
                    value={currentUser.username}
                    onChange={(e) => {
                      const clean = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                      const updated = { ...currentUser, username: clean };
                      setCurrentUser(updated);
                      localStorage.setItem("growcalc_user", JSON.stringify(updated));
                    }}
                    className="w-full text-sm font-bold bg-transparent outline-none font-mono"
                    style={{ color: T.brand }}
                  />
                  <span className="text-xs text-stone-400 font-mono">.thegrowinstones.com</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: T.text }}>Tema da Interface</label>
                <button
                  onClick={() => setDark((d) => !d)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2"
                  style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                >
                  <span>{dark ? "🌙 Tema Escuro (Ativo)" : "☀️ Tema Claro (Ativo)"}</span>
                </button>
              </div>

              <div className="pt-4 border-t" style={{ borderColor: T.border }}>
                <button
                  onClick={() => {
                    if (window.confirm("Deseja desconectar sua conta?")) {
                      localStorage.removeItem("growcalc_user");
                      setCurrentUser(null);
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700"
                >
                  🚪 Desconectar Conta
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CONFIGURADOR & COMPARADOR VIEWS */}
        {(activeTab === "configurator" || activeTab === "comparison") && (
          <>
            <header style={{ borderBottom: `1px solid ${T.borderSoft}`, background: T.bg }}>
              <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="font-bold text-sm" style={{ color: T.text }}>{activeTab === "comparison" ? "📊 Comparação de Setups" : "🛠️ Configurador de Grow"}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input type="file" ref={fileInputRef} accept=".json,application/json" onChange={handleImportJson} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-80 flex items-center gap-1.5"
                    style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>Importar JSON</span>
                  </button>
                  <button onClick={exportSetupJson}
                    className="px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-80 flex items-center gap-1.5"
                    style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span>Exportar JSON</span>
                  </button>
                  <button onClick={openStaticDashboardHtml}
                    title="Abrir Dashboard Estático HTML em uma nova aba"
                    className="px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-85 flex items-center gap-1.5"
                    style={{ background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <line x1="3" y1="9" x2="21" y2="9" />
                      <line x1="9" y1="21" x2="9" y2="9" />
                    </svg>
                    <span>Dashboard HTML</span>
                  </button>

                  <button onClick={() => {
                    if (!subdomainInput && currentUser?.username) setSubdomainInput(currentUser.username);
                    setPublishModalOpen(true);
                  }}
                    title="Publicar este setup em um subdomínio exclusivo (ex: meu-grow.thegrowinstones.com)"
                    className="px-3.5 py-2 rounded-xl text-xs font-bold transition-all hover:opacity-90 flex items-center gap-1.5 shadow-sm"
                    style={{ background: dark ? "#0284c7" : "#0369a1", color: "#ffffff" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.71 1.26-1.5 1.74-2.3L4.5 16.5z"/>
                      <path d="M12 15l-3-3 7.5-7.5c1.4-1.4 3.7-1.4 5.1 0s1.4 3.7 0 5.1L12 15z"/>
                    </svg>
                    <span>*Publicar Grow</span>
                  </button>
                  <button onClick={openReportHtml}
                    className="px-4 py-2 rounded-xl text-xs font-bold transition-opacity hover:opacity-85 flex items-center gap-1.5"
                    style={{ background: T.text, color: T.bg }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    <span>Exportar relatório (PDF)</span>
                  </button>
                  <button onClick={() => setDark((d) => !d)} aria-label="Alternar tema"
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0"
                    style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}>
                    {dark ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="5" />
                        <line x1="12" y1="1" x2="12" y2="3" />
                        <line x1="12" y1="21" x2="12" y2="23" />
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                        <line x1="1" y1="12" x2="3" y2="12" />
                        <line x1="21" y1="12" x2="23" y2="12" />
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                      </svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </header>

    <div className="min-h-screen" style={{ background: T.bg, color: T.text, fontFamily: "'Inter', system-ui, sans-serif", transition: "background 0.3s, color 0.3s" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Berkshire+Swash&display=swap');
        input[type=number]::-webkit-inner-spin-button{ -webkit-appearance:none; }`}</style>

      <header style={{ borderBottom: `1px solid ${T.borderSoft}`, background: T.bg }}>
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo height={34} color={T.brand} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="file" ref={fileInputRef} accept=".json,application/json" onChange={handleImportJson} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-80 flex items-center gap-1.5"
              style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Importar JSON</span>
            </button>
            <button onClick={exportSetupJson}
              className="px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-80 flex items-center gap-1.5"
              style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>Exportar JSON</span>
            </button>
            <button onClick={openStaticDashboardHtml}
              title="Abrir Dashboard Estático HTML em uma nova aba"
              className="px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-85 flex items-center gap-1.5"
              style={{ background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
              <span>Dashboard HTML</span>
            </button>

            <button onClick={() => setPublishModalOpen(true)}
              title="Publicar este setup em um subdomínio exclusivo (ex: meu-grow.thegrowinstones.com)"
              className="px-3.5 py-2 rounded-xl text-xs font-bold transition-all hover:opacity-90 flex items-center gap-1.5 shadow-sm"
              style={{ background: dark ? "#0284c7" : "#0369a1", color: "#ffffff" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.71 1.26-1.5 1.74-2.3L4.5 16.5z"/>
                <path d="M12 15l-3-3 7.5-7.5c1.4-1.4 3.7-1.4 5.1 0s1.4 3.7 0 5.1L12 15z"/>
              </svg>
              <span>*Publicar Grow</span>
            </button>
            <button onClick={() => setShowReport(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-opacity hover:opacity-85 flex items-center gap-1.5"
              style={{ background: T.text, color: T.bg }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <span>Exportar relatório (PDF)</span>
            </button>
            <button onClick={() => setDark((d) => !d)} aria-label="Alternar tema"
              className="w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0"
              style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}>
              {dark ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-4xl font-bold tracking-tight leading-tight">
            Projete seu grow <span style={{ color: T.muted, fontStyle: "italic", fontWeight: 500 }}>em segundos</span>
          </h1>
          <p className="mt-2" style={{ color: T.muted }}>
            Estrutura, ligações, custos, produção e retorno — com planta baixa em tempo real e relatório completo em PDF.
          </p>
        </div>

        {/* Barra de Abas e Chips de Presets */}
        <div className="space-y-4 mb-8">
          <div className="flex items-center justify-between gap-4 flex-wrap pb-3"
            style={{ borderBottom: `1px solid ${T.border}` }}>
            <div className="flex items-center gap-2">
              <button onClick={() => setActiveTab("configurator")}
                className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                style={activeTab === "configurator"
                  ? { background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }
                  : { background: T.surface2, border: `1px solid ${T.border}`, color: T.muted }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                <span>Projetar Grow</span>
              </button>

              <button onClick={() => setActiveTab("comparison")}
                className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                style={activeTab === "comparison"
                  ? { background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }
                  : { background: T.surface2, border: `1px solid ${T.border}`, color: T.muted }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                <span>Comparativo entre Setups</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold"
                  style={{ background: T.surface, color: T.accentBorder, border: `1px solid ${T.border}` }}>
                  {allPresets.length}
                </span>
              </button>
            </div>
          </div>

          {/* Chips removíveis para todos os presets */}
          <div className="flex flex-wrap gap-2 items-center">
            {allPresets.map((p) => (
              <div key={p.id || p.name} className="flex items-center rounded-full transition-all shrink-0 shadow-sm"
                style={{ background: T.surface2, border: `1px solid ${T.accentBorder}`, color: T.text }}>
                <button onClick={() => loadPreset(p)}
                  className="pl-3.5 pr-2 py-1.5 text-xs font-semibold hover:opacity-85 flex items-center gap-1.5"
                  title={`Carregar setup "${p.name}"`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: T.accentBorder }}>
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                  <span>{p.name}</span>
                </button>
                <button onClick={(e) => { e.stopPropagation(); removePreset(p.id || p.name, p.name); }}
                  title={`Remover chip "${p.name}"`}
                  className="pr-3 pl-1 py-1.5 text-xs font-bold transition-colors hover:text-red-500 rounded-r-full"
                  style={{ color: T.faint }}>
                  ×
                </button>
              </div>
            ))}

            <button onClick={addCurrentAsPreset}
              title="Salvar a configuração atual como um novo chip de preset"
              className="px-3.5 py-1.5 rounded-full text-xs font-bold transition-all hover:opacity-85 flex items-center gap-1.5 shrink-0"
              style={{ background: T.surface2, border: `1.5px dashed ${T.accentBorder}`, color: T.text }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Salvar preset atual</span>
            </button>

            {allPresets.length === 0 && (
              <button onClick={restoreDefaultPresets}
                className="px-3.5 py-1.5 rounded-full text-xs font-bold transition-all hover:opacity-85 flex items-center gap-1.5 shrink-0"
                style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.muted }}>
                🔄 Restaurar presets padrão
              </button>
            )}
          </div>
        </div>

        {activeTab === "configurator" ? (
          <div className="grid lg:grid-cols-5 gap-6 items-start">
          {/* ————— Configuração ————— */}
          <div className="lg:col-span-2 space-y-5">
            <CollapsibleCard
              title="Identificação"
              subtitle={growName || owner || strain ? `${growName || "Grow"}${strain ? ` · ${strain}` : ""}` : undefined}
              T={T} dark={dark}>
              <div className="space-y-3">
                <div>
                  <label className="text-xs block mb-1" style={{ color: T.muted }}>Nome do grow</label>
                  <input type="text" value={growName} placeholder="Ex.: Grow Sala Verde"
                    onChange={(e) => setGrowName(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg text-sm font-medium focus:outline-none" style={inputStyle} />
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{ color: T.muted }}>Responsável</label>
                  <input type="text" value={owner} placeholder="Seu nome"
                    onChange={(e) => setOwner(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg text-sm font-medium focus:outline-none" style={inputStyle} />
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{ color: T.muted }}>Variedade / Genética da planta</label>
                  <input type="text" value={strain} placeholder="Ex.: White Widow, Gorilla Glue..."
                    onChange={(e) => setStrain(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg text-sm font-medium focus:outline-none" style={inputStyle} />
                </div>
              </div>
            </CollapsibleCard>

            <CollapsibleCard
              title="1 · Estufa (cm)"
              subtitle={`${width} × ${depth} × ${height} cm (${areaM2.toFixed(2)} m²)`}
              T={T} dark={dark}>
              <div className="space-y-3">
                <div className="flex items-center justify-between"><span className="text-sm" style={{ color: T.muted }}>Largura</span>{num(width, setWidth, 60, 1000)}</div>
                <div className="flex items-center justify-between"><span className="text-sm" style={{ color: T.muted }}>Profundidade</span>{num(depth, setDepth, 60, 1000)}</div>
                <div className="flex items-center justify-between"><span className="text-sm" style={{ color: T.muted }}>Altura</span>{num(height, setHeight, 100, 400)}</div>
              </div>
              <p className="text-xs mt-3" style={{ color: T.faint }}>Área {areaM2.toFixed(2)} m² · Volume {volumeM3.toFixed(2)} m³</p>
            </CollapsibleCard>

            <CollapsibleCard
              title="2 · Vasos & disposição"
              subtitle={`${pot.label} (${potW}×${potD}×${potH} cm)`}
              T={T} dark={dark}>

              {/* Representação Isométrica 3D do Vaso Configurado */}
              <div className="mb-4 p-3 rounded-2xl transition-all relative overflow-hidden"
                style={{ background: T.inset, border: `1px solid ${T.borderSoft}` }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: T.faint }}>
                    Vista Isométrica 3D do Vaso
                  </span>
                  <span className="text-[10px] font-semibold" style={{ color: T.muted }}>
                    {pot.label} ({potW}×{potD}×{potH} cm)
                  </span>
                </div>
                <IsometricPotSVG
                  potW={potW}
                  potD={potD}
                  potH={potH}
                  potLiters={pot.liters}
                  isRect={isRect}
                  isSquare={isSquare}
                  dark={dark}
                  T={T}
                />
              </div>

              {/* Grid de Presets + Card Customizado */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                {POT_SIZES.map((p, i) => {
                  const pIsRect = p.shape === "rect";
                  const pIsSq = !pIsRect && potShape === "square";
                  const pW = pIsRect ? (potFlipped ? p.depthCm : p.widthCm) : p.diameter;
                  const pD = pIsRect ? (potFlipped ? p.widthCm : p.depthCm) : p.diameter;
                  const pSub = pIsRect ? `${pW}×${pD} cm` : (pIsSq ? `${p.diameter}×${p.diameter} cm` : `⌀ ${p.diameter} cm`);
                  return (
                    <button key={p.label} onClick={() => setPotIdx(i)}
                      className="rounded-xl px-2 py-2 text-sm font-medium transition-all"
                      style={i === potIdx
                        ? { background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }
                        : { background: "transparent", border: `1px solid ${T.border}`, color: T.muted }}>
                      {p.label}
                      <span className="block text-[10px] font-normal" style={{ color: T.faint }}>{pSub}</span>
                    </button>
                  );
                })}
                {/* Card de Vaso Customizado */}
                <button onClick={() => setPotIdx(POT_SIZES.length)}
                  className="rounded-xl px-2 py-2 text-sm font-semibold transition-all"
                  style={potIdx === POT_SIZES.length
                    ? { background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }
                    : { background: "transparent", border: `1px solid ${T.border}`, color: T.muted }}>
                  <div className="flex items-center justify-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    <span>Custom</span>
                  </div>
                  <span className="block text-[10px] font-normal" style={{ color: T.faint }}>
                    {customLiters} L ({customPotW}×{customPotL}×{customPotH})
                  </span>
                </button>
              </div>

              {/* Campos de Dimensão Customizada do Vaso */}
              {isCustomPot && (
                <div className="mb-4 p-3 rounded-xl space-y-2.5 transition-all"
                  style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold" style={{ color: T.text }}>Dimensões do vaso customizado</span>
                    <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full"
                      style={{ background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }}>
                      {customLiters} Litros
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-medium block mb-1" style={{ color: T.muted }}>Largura (cm)</label>
                      {num(customPotW, setCustomPotW, 5, 200, 1)}
                    </div>
                    <div>
                      <label className="text-[10px] font-medium block mb-1" style={{ color: T.muted }}>Comprimento (cm)</label>
                      {num(customPotL, setCustomPotL, 5, 200, 1)}
                    </div>
                    <div>
                      <label className="text-[10px] font-medium block mb-1" style={{ color: T.muted }}>Altura (cm)</label>
                      {num(customPotH, setCustomPotH, 5, 200, 1)}
                    </div>
                  </div>
                </div>
              )}

              {!isRect && (
                <div className="mb-4 flex items-center justify-between p-3 rounded-xl transition-all"
                  style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                  <div>
                    <span className="text-xs font-bold block" style={{ color: T.text }}>
                      Formato dos vasos
                    </span>
                    <span className="text-[11px] block mt-0.5" style={{ color: T.muted }}>
                      {potShape === "square" ? `Quadrados ${pot.diameter}×${pot.diameter} cm` : `Redondos ⌀ ${pot.diameter} cm`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setPotShape("circle")}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                      style={potShape === "circle"
                        ? { background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }
                        : { background: "transparent", border: `1px solid ${T.border}`, color: T.muted }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" />
                      </svg>
                      Redondo
                    </button>
                    <button onClick={() => setPotShape("square")}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                      style={potShape === "square"
                        ? { background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }
                        : { background: "transparent", border: `1px solid ${T.border}`, color: T.muted }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="4.5" y="4.5" width="15" height="15" rx="2" />
                      </svg>
                      Quadrado
                    </button>
                  </div>
                </div>
              )}

              {isRect && (
                <div className="mb-4 flex items-center justify-between p-3 rounded-xl transition-all"
                  style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                  <div>
                    <span className="text-xs font-bold block" style={{ color: T.text }}>
                      Orientação do vaso retangular
                    </span>
                    <span className="text-[11px] block mt-0.5" style={{ color: T.muted }}>
                      Largura: <strong>{potW} cm</strong> × Profundidade: <strong>{potD} cm</strong>
                    </span>
                  </div>
                  <button onClick={() => setPotFlipped((f) => !f)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:opacity-85 flex items-center gap-1.5 shrink-0"
                    style={{ background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }}>
                    🔄 Girar ({potW}×{potD})
                  </button>
                </div>
              )}
            </CollapsibleCard>

            <CollapsibleCard
              title="3 · Fases do ciclo de cultivo"
              subtitle={`${cycleDays}d ciclo total (${vegaDays}d V / ${floraDays}d F)`}
              T={T} dark={dark}>
              <div className="space-y-3">
                <div className="p-3 rounded-xl space-y-2.5" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                  <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: T.text }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22v-9" />
                      <path d="M12 13C7 13 4 8.5 4 4c4.5 0 8 3 8 9" />
                      <path d="M12 13c5 0 8-4.5 8-8.5-4.5 0-8 3-8 8.5" />
                    </svg>
                    Fase Vegetativa (Vega)
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: T.muted }}>Duração (dias)</span>
                    {num(vegaDays, setVegaDays, 0, 180, 5)}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: T.muted }}>Ciclo de luz (horas/dia)</span>
                    {num(vegaHours, setVegaHours, 1, 24, 1)}
                  </div>
                </div>

                <div className="p-3 rounded-xl space-y-2.5" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                  <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: T.text }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 2a4 4 0 0 0-4 4c0 2 2 4 4 6 2-2 4-4 4-6a4 4 0 0 0-4-4z" />
                      <path d="M12 22a4 4 0 0 0 4-4c0-2-2-4-4-6-2 2-4 4-4 6a4 4 0 0 0 4 4z" />
                      <path d="M22 12a4 4 0 0 0-4-4c-2 0-4 2-6 4 2 2 4 4 6 4a4 4 0 0 0 4 4z" />
                      <path d="M2 12a4 4 0 0 0 4 4c2 0 4-2 6-4-2-2-4-4-6-4a4 4 0 0 0-4 4z" />
                    </svg>
                    Fase de Floração (Flora)
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: T.muted }}>Duração (dias)</span>
                    {num(floraDays, setFloraDays, 0, 180, 5)}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: T.muted }}>Ciclo de luz (horas/dia)</span>
                    {num(floraHours, setFloraHours, 1, 24, 1)}
                  </div>
                </div>

                <p className="text-xs rounded-lg px-3 py-2" style={{ background: T.surface2, color: T.muted }}>
                  Ciclo total: <strong style={{ color: T.text }}>{cycleDays} dias</strong> ({vegaDays}d vega + {floraDays}d flora) · <strong style={{ color: T.text }}>{harvestsYear.toFixed(1)} safras/ano</strong>
                </p>
              </div>
            </CollapsibleCard>

            <CollapsibleCard
              title="4 · Equipamentos & consumo"
              subtitle={`${totalWatts} W · ${fmtBRL(opexMonth)}/mês`}
              T={T} dark={dark}>
              <div className="space-y-1.5">
                {EQUIPMENT.map((e) => {
                  const on = equip[e.id] > 0;
                  const isPerPot = !!perPot[e.id];
                  return (
                    <div key={e.id} className="rounded-xl px-3 py-2 transition-colors"
                      style={{ background: on ? T.surface2 : "transparent", border: `1px solid ${on ? T.border : "transparent"}` }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: on ? T.text : T.faint }}>{e.name}</p>
                          {on && isPerPot && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                              style={{ background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }}>
                              {equip[e.id] * layout.placed} un ({equip[e.id]}/vaso)
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => setEq(e.id, -1, e.max)}
                            className="w-7 h-7 rounded-lg text-sm transition-colors"
                            style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}>−</button>
                          <span className="w-5 text-center text-sm font-bold">{equip[e.id]}</span>
                          <button onClick={() => setEq(e.id, +1, e.max)}
                            className="w-7 h-7 rounded-lg text-sm transition-colors"
                            style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}>+</button>
                        </div>
                      </div>
                      {on && (
                        <div className="mt-2 pt-2 border-t flex flex-col gap-2" style={{ borderColor: T.borderSoft }}>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1">
                              <NumInput value={watts[e.id]} min={0} max={5000}
                                onCommit={(n) => setW(e.id, n)}
                                className={`w-16 h-7 ${inputCls}`} style={inputStyle} />
                              <span className="text-[11px] font-medium" style={{ color: T.muted }}>W{e.hours ? ` · ${e.hours} h/dia` : ""}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[11px]" style={{ color: T.faint }}>R$/un</span>
                              <MoneyInput value={costs[e.id]}
                                onCommit={(n) => setCost(e.id, n)}
                                className={`w-20 h-7 ${inputCls}`} style={inputStyle} />
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium shrink-0 flex items-center gap-1" style={{ color: T.faint }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                              </svg>
                              Link
                            </span>
                            <input type="url" value={equipUrls[e.id] || ""} placeholder="https://link-de-compra.com..."
                              onChange={(ev) => setEquipUrl(e.id, ev.target.value)}
                              className="flex-1 min-w-0 h-7 px-2.5 rounded-lg text-xs focus:outline-none" style={inputStyle} />
                          </div>

                          <div className="flex flex-col gap-1.5 pt-0.5">
                            <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-medium transition-colors"
                              style={{ color: isPerPot ? T.text : T.faint }}>
                              <input type="checkbox" checked={isPerPot}
                                onChange={() => togglePerPot(e.id)}
                                className="rounded w-3.5 h-3.5 accent-amber-500 cursor-pointer" />
                              <span>Multiplicar quantidade pelo total de vasos ({layout.placed} vasos)</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-semibold transition-colors"
                              style={{ color: equipShopping[e.id] ? T.text : T.faint }}>
                              <input type="checkbox" checked={!!equipShopping[e.id]}
                                onChange={() => toggleEquipShopping(e.id)}
                                className="rounded w-3.5 h-3.5 accent-amber-500 cursor-pointer" />
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="9" cy="21" r="1" />
                                <circle cx="20" cy="21" r="1" />
                                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                              </svg>
                              <span>Incluir na Lista de Compras (PDF)</span>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Itens extras do usuário */}
              <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${T.borderSoft}` }}>
                <p className="text-[11px] font-semibold uppercase mb-2" style={{ color: T.faint, letterSpacing: "0.14em" }}>
                  Itens extras
                </p>
                <div className="space-y-2">
                  {customItems.map((it) => (
                    <div key={it.id} className="rounded-xl px-3 py-2.5"
                      style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                      <div className="flex items-center gap-2 mb-2">
                        <input type="text" value={it.name} placeholder="Nome do item (ex.: Controlador, CO₂…)"
                          onChange={(ev) => updCustom(it.id, { name: ev.target.value })}
                          className="flex-1 min-w-0 h-8 px-3 rounded-lg text-sm font-medium focus:outline-none"
                          style={inputStyle} />
                        <button onClick={() => delCustom(it.id)} aria-label="Excluir item"
                          className="w-8 h-8 rounded-lg text-sm font-bold shrink-0 transition-opacity hover:opacity-70 flex items-center justify-center"
                          style={{ background: T.surface, border: `1px solid ${T.border}`, color: dark ? "#e0a0a0" : "#8c3b3b" }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                      <div className="flex items-center gap-x-3 gap-y-2 flex-wrap">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px]" style={{ color: T.faint }}>qtd</span>
                          <NumInput value={it.qty} min={0} max={99}
                            onCommit={(n) => updCustom(it.id, { qty: n })}
                            className={`w-12 h-7 ${inputCls}`} style={inputStyle} />
                        </div>
                        <div className="flex items-center gap-1">
                          <NumInput value={it.watts} min={0} max={5000}
                            onCommit={(n) => updCustom(it.id, { watts: n })}
                            className={`w-16 h-7 ${inputCls}`} style={inputStyle} />
                          <span className="text-[11px] font-medium" style={{ color: T.muted }}>W</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <NumInput value={it.hours} min={0} max={24}
                            onCommit={(n) => updCustom(it.id, { hours: n })}
                            className={`w-12 h-7 ${inputCls}`} style={inputStyle} />
                          <span className="text-[11px] font-medium" style={{ color: T.muted }}>h/dia</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[11px]" style={{ color: T.faint }}>R$/un</span>
                          <MoneyInput value={it.cost}
                            onCommit={(n) => updCustom(it.id, { cost: n })}
                            className={`w-20 h-7 ${inputCls}`} style={inputStyle} />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[11px] font-medium shrink-0 flex items-center gap-1" style={{ color: T.faint }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                          </svg>
                          Link
                        </span>
                        <input type="url" value={it.url || ""} placeholder="https://link-de-compra.com..."
                          onChange={(ev) => updCustom(it.id, { url: ev.target.value })}
                          className="flex-1 min-w-0 h-7 px-2.5 rounded-lg text-xs focus:outline-none" style={inputStyle} />
                      </div>

                      <div className="flex flex-col gap-1.5 mt-2">
                        <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-medium transition-colors"
                          style={{ color: it.perPot ? T.text : T.faint }}>
                          <input type="checkbox" checked={!!it.perPot}
                            onChange={(ev) => updCustom(it.id, { perPot: ev.target.checked })}
                            className="rounded w-3.5 h-3.5 accent-amber-500 cursor-pointer" />
                          <span>Multiplicar por vaso ({layout.placed} vasos) {it.perPot ? `(${it.qty * layout.placed} un)` : ""}</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-semibold transition-colors"
                          style={{ color: it.inShoppingList ? T.text : T.faint }}>
                          <input type="checkbox" checked={!!it.inShoppingList}
                            onChange={(ev) => updCustom(it.id, { inShoppingList: ev.target.checked })}
                            className="rounded w-3.5 h-3.5 accent-amber-500 cursor-pointer" />
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="9" cy="21" r="1" />
                            <circle cx="20" cy="21" r="1" />
                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                          </svg>
                          <span>Incluir na Lista de Compras (PDF)</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={addCustom}
                  className="mt-2 w-full py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-80 flex items-center justify-center gap-1.5"
                  style={{ background: "transparent", border: `1.5px dashed ${T.accentBorder}`, color: T.muted }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Adicionar item extra</span>
                </button>
              </div>
            </CollapsibleCard>

            <CollapsibleCard
              title="5 · Observações, instruções e termos"
              subtitle={notes || instructions || terms ? "Preenchido" : undefined}
              T={T} dark={dark}>
              <div className="space-y-3">
                <div>
                  <label className="text-xs block mb-1 font-medium" style={{ color: T.muted }}>Observações</label>
                  <textarea
                    rows={2}
                    value={notes}
                    placeholder="Notas adicionais do projeto, observações técnicas..."
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full p-2.5 rounded-lg text-xs font-medium focus:outline-none resize-y"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="text-xs block mb-1 font-medium" style={{ color: T.muted }}>Instruções de operação</label>
                  <textarea
                    rows={2}
                    value={instructions}
                    placeholder="Instruções de rega, manutenção, trocas de solução..."
                    onChange={(e) => setInstructions(e.target.value)}
                    className="w-full p-2.5 rounded-lg text-xs font-medium focus:outline-none resize-y"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="text-xs block mb-1 font-medium" style={{ color: T.muted }}>Termos & Condições</label>
                  <textarea
                    rows={2}
                    value={terms}
                    placeholder="Termos de garantia, responsabilidade, prazos..."
                    onChange={(e) => setTerms(e.target.value)}
                    className="w-full p-2.5 rounded-lg text-xs font-medium focus:outline-none resize-y"
                    style={inputStyle}
                  />
                </div>
              </div>
            </CollapsibleCard>
          </div>

          {/* ————— Planta + resumo ————— */}
          <div className="lg:col-span-3 space-y-5">
            <CollapsibleCard
              title={growName ? growName : "Planta baixa"}
              subtitle={`${layout.nRows} × ${Math.min(layout.useCols, layout.placed)} · ${plants} vasos · ${width} × ${depth} cm`}
              T={T} dark={dark}>
              <div className="p-3.5 rounded-xl mb-4 flex items-center justify-between gap-3 flex-wrap"
                style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 px-3 rounded-lg flex items-center justify-center font-extrabold text-base shrink-0 tracking-tight"
                    style={{ background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }}>
                    {layout.nRows} × {Math.min(layout.useCols, layout.placed)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold" style={{ color: T.text }}>
                        Disposição
                      </span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}>
                        {layout.placed} de {potCount} vasos
                      </span>
                    </div>
                    <p className="text-[11px] truncate mt-0.5" style={{ color: T.muted }}>
                      {growName ? growName : "Planta baixa"}{strain ? ` · ${strain}` : ""} · {width} × {depth} cm · {connInfo.name}{owner ? ` · ${owner}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[11px] shrink-0" style={{ color: T.muted }}>
                  <span className="flex items-center gap-1.5 font-medium">
                    <span style={{ width: 14, height: 3, background: T.pipe, display: "inline-block", borderRadius: 2 }} />
                    alimentação
                  </span>
                  {(recirculate || plumbing.segs.some((s) => s.kind === "return")) && (
                    <span className="flex items-center gap-1.5 font-medium">
                      <span style={{ width: 14, height: 3, background: T.pipeReturn, display: "inline-block", borderRadius: 2 }} />
                      retorno
                    </span>
                  )}
                </div>
              </div>

              <div className="flex justify-center rounded-xl p-4 overflow-x-auto"
                style={{ background: T.inset, border: `1px solid ${T.borderSoft}` }}>
                <svg width={svgW} height={showRes ? svgH : topH + OY * 2} className="max-w-full">
                  <rect x={OX} y={OY} width={topW} height={topH} rx={10}
                    fill={T.surface} stroke={T.text} strokeWidth={1.5} />
                  <text x={OX + topW / 2} y={OY - 8} textAnchor="middle" fontSize="11" fill={T.faint}>{width} cm</text>
                  <text x={OX - 10} y={OY + topH / 2} textAnchor="middle" fontSize="11" fill={T.faint}
                    transform={`rotate(-90, ${OX - 10}, ${OY + topH / 2})`}>{depth} cm</text>

                  {plumbing.segs.map((s, i) => (
                    <line key={i} x1={px(s.a[0])} y1={py(s.a[1])} x2={px(s.b[0])} y2={py(s.b[1])}
                      strokeLinecap="round" {...segStyle(s.kind)} />
                  ))}


                  {layout.grid.map((p, i) => (
                    <g key={i}>
                      {isRect ? (
                        <rect x={px(p.x - potW / 2)} y={py(p.y - potD / 2)} width={potW * topScale} height={potD * topScale} rx={5}
                          fill={T.potFill} stroke={T.potStroke} strokeWidth={1.5} />
                      ) : isSquare ? (
                        <rect x={px(p.x - pot.diameter / 2)} y={py(p.y - pot.diameter / 2)} width={pot.diameter * topScale} height={pot.diameter * topScale} rx={4}
                          fill={T.potFill} stroke={T.potStroke} strokeWidth={1.5} />
                      ) : (
                        <circle cx={px(p.x)} cy={py(p.y)} r={(pot.diameter / 2) * topScale}
                          fill={T.potFill} stroke={T.potStroke} strokeWidth={1.5} />
                      )}
                      <text x={px(p.x)} y={py(p.y) + 3.5} textAnchor="middle"
                        fontSize="10" fontWeight="600" fill={T.potNum}>{i + 1}</text>
                    </g>
                  ))}

                  {getCotaElements(topScale, OX, OY, layout, potW, potD, spacing, width, depth).map((c) => (
                    <g key={c.id}>
                      <line x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke="#d97706" strokeWidth={1.2} strokeDasharray="3 2" />
                      <line x1={c.tick1[0]} y1={c.tick1[1]} x2={c.tick1[2]} y2={c.tick1[3]} stroke="#d97706" strokeWidth={1.2} />
                      <line x1={c.tick2[0]} y1={c.tick2[1]} x2={c.tick2[2]} y2={c.tick2[3]} stroke="#d97706" strokeWidth={1.2} />
                      <rect x={c.tx - (c.dir === "horizontal" ? 18 : 2)} y={c.ty - 9} width={36} height={12} rx={3} fill="#ffffff" opacity={0.9} />
                      <text x={c.tx} y={c.ty} textAnchor={c.dir === "horizontal" ? "middle" : "start"} fontSize="8.5" fontWeight="700" fill="#b45309">
                        {c.label}
                      </text>
                    </g>
                  ))}

                  {showRes && (
                    <g>
                      <text x={OX} y={resY - 6} fontSize="9" fill={T.faint} style={{ letterSpacing: "0.1em" }}>ZONA TÉCNICA</text>
                      {resItems.map((it) => (
                        <g key={it.id}>
                          <rect x={it.x} y={resY + (34 - it.h) / 2} width={it.w} height={it.h} rx={6}
                            fill={it.type === "tank" ? T.tank : T.pump}
                            stroke={it.type === "tank" ? T.tankStroke : T.pumpStroke}
                            strokeWidth={1.4} />
                          <text x={it.x + it.w / 2} y={resY + 19} textAnchor="middle" fontSize="8.5" fontWeight="600" fill={T.text}>
                            {it.label}
                          </text>
                        </g>
                      ))}
                    </g>
                  )}
                </svg>
              </div>
              <p className="text-xs mt-3 leading-relaxed" style={{ color: T.muted }}>{connInfo.desc}</p>

              {/* Ajustes de Disposição e Ligação dos Vasos no Mapa */}
              <div className="mt-4 pt-3 space-y-3 transition-all"
                style={{ borderTop: `1px solid ${T.border}` }}>

                <p className="text-xs rounded-lg px-3 py-2" style={{ background: T.surface2, color: T.muted }}>
                  Disposição atual: <strong style={{ color: T.text }}>{layout.nRows} linha{layout.nRows > 1 ? "s" : ""} × {Math.min(layout.useCols, layout.placed)} coluna{Math.min(layout.useCols, layout.placed) > 1 ? "s" : ""}</strong> · {layout.placed} de {potCount} vaso{potCount > 1 ? "s" : ""}
                </p>

                {/* Linha 1: Tipo de Ligação e Circulação */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="p-2 rounded-xl space-y-1 min-w-0" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                    <label className="text-[11px] font-bold block" style={{ color: T.text }}>
                      Tipo de ligação
                    </label>
                    <select
                      value={conn}
                      onChange={(e) => setConn(e.target.value)}
                      className="w-full h-7 px-2 rounded-lg text-[11px] font-semibold focus:outline-none cursor-pointer transition-all truncate"
                      style={{ background: T.surface, border: `1px solid ${T.accentBorder}`, color: T.text }}>
                      {CONNECTIONS.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="p-2 rounded-xl flex items-center justify-between gap-1.5 min-w-0" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                    <div>
                      <span className="text-[11px] font-bold block" style={{ color: T.text }}>Circulação</span>
                      <span className="text-[9.5px] block" style={{ color: T.faint }}>
                        {recirculate ? "1 Entrada + 1 Saída" : "1 Entrada simples"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setRecirculate(false)}
                        className="px-2 py-1 rounded-md text-[10px] font-semibold transition-all"
                        style={!recirculate
                          ? { background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }
                          : { background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}>
                        1 Entrada
                      </button>
                      <button onClick={() => setRecirculate(true)}
                        className="px-2 py-1 rounded-md text-[10px] font-semibold transition-all"
                        style={recirculate
                          ? { background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }
                          : { background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}>
                        + 1 Saída
                      </button>
                    </div>
                  </div>
                </div>

                {/* Linha 2: Quantidade, Colunas e Espaçamento compactos */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="flex items-center justify-between p-2 rounded-xl min-w-0" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                    <span className="text-[11px] font-bold" style={{ color: T.text }}>Quantidade</span>
                    {numSm(potCount, setPotCount, 1, 60, 1)}
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-xl min-w-0" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                    <span className="text-[11px] font-bold" style={{ color: T.text }}>Colunas</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setCols(0)}
                        className="h-7 px-1.5 rounded-md text-[10px] font-semibold transition-colors"
                        style={cols === 0
                          ? { background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }
                          : { background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}>
                        Auto
                      </button>
                      {numSm(cols === 0 ? layout.useCols : cols, (v) => setCols(v), 1, 12, 1)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-xl min-w-0" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                    <span className="text-[11px] font-bold" style={{ color: T.text }}>Espaçamento</span>
                    {numSm(spacing, setSpacing, 0, 100, 5)}
                  </div>
                </div>

                {/* Linha 3: Bitola das Ligações ao lado de Girar Vaso */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="p-2 rounded-xl space-y-1 min-w-0" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                    <label className="text-[11px] font-bold block" style={{ color: T.text }}>
                      Bitola das ligações
                    </label>
                    <select
                      value={gaugeIdx}
                      onChange={(e) => setGaugeIdx(Number(e.target.value))}
                      className="w-full h-7 px-2 rounded-lg text-[11px] font-semibold focus:outline-none cursor-pointer transition-all truncate"
                      style={{ background: T.surface, border: `1px solid ${T.accentBorder}`, color: T.text }}>
                      {PIPE_GAUGES.map((g, idx) => (
                        <option key={g.label} value={idx}>
                          {g.label} ({g.flow})
                        </option>
                      ))}
                    </select>
                  </div>

                  {isRect ? (
                    <div className="p-2 rounded-xl flex items-center justify-between transition-all min-w-0"
                      style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                      <div>
                        <span className="text-[11px] font-bold block" style={{ color: T.text }}>
                          Orientação do vaso
                        </span>
                        <span className="text-[9.5px] block" style={{ color: T.faint }}>
                          {potW} × {potD} cm
                        </span>
                      </div>
                  <button onClick={() => setPotFlipped((f) => !f)}
                        className="px-2.5 py-1 rounded-md text-[11px] font-bold transition-all hover:opacity-85 flex items-center gap-1 shrink-0"
                        style={{ background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                        </svg>
                        <span>Girar vaso</span>
                      </button>
                    </div>
                  ) : (
                    <div className="p-2 rounded-xl flex items-center justify-between transition-all min-w-0"
                      style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                      <div>
                        <span className="text-[11px] font-bold block" style={{ color: T.text }}>
                          Formato do vaso
                        </span>
                        <span className="text-[9.5px] block" style={{ color: T.faint }}>
                          {isSquare ? "Quadrado" : "Cilíndrico / Redondo"}
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold px-2 py-1 rounded-md" style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}>
                        {potW} cm
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleCard>

            {/* Resumo */}
            <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Receita / safra", value: priceG > 0 ? fmtBRL(revenueHarvest) : "—", sub: priceG > 0 ? `${fmtG(yieldHarvest)} / safra` : "defina o R$/g" },
                { label: "Safras / ano", value: harvestsYear.toFixed(1), sub: `ciclo de ${cycleDays} dias` },
                { label: "Produção / safra", value: fmtG(yieldHarvest), sub: `${yieldM2.toFixed(0)} g/m²` },
                { label: "Produção / ano", value: fmtG(yieldYear), sub: ledWatts > 0 ? `${gPerW.toFixed(2)} g/W` : "sem luz" },
                { label: "Investimento", value: fmtBRL(capex), sub: `${fmtBRL(capexPerPlant)} / planta` },
                { label: "OPEX mensal", value: fmtBRL(opexMonth), sub: `${kwhMonth.toFixed(0)} kWh + insumos` },
                { label: "Receita / ano", value: priceG > 0 ? fmtBRL(revenueYear) : "—", sub: priceG > 0 ? `${fmtBRL(priceG)}/g` : "defina o R$/g" },
                { label: "Payback", value: paybackMonths ? `${paybackMonths.toFixed(1)} m` : "—", sub: paybackMonths ? `${(paybackMonths / (cycleDays / 30)).toFixed(1)} safras` : "lucro ≤ 0" },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl p-4"
                  style={{ background: T.surface2, border: `1px solid ${T.borderSoft}` }}>
                  <p className="text-xl font-bold tracking-tight">{s.value}</p>
                  <p className="text-xs font-medium mt-0.5" style={{ color: T.muted }}>{s.label}</p>
                  <p className="text-[10px]" style={{ color: T.faint }}>{s.sub}</p>
                </div>
              ))}
            </section>

            {/* Ajustes de produtividade e custos */}
            <CollapsibleCard
              title="Ajustes de produtividade e custos"
              subtitle="Parâmetros de rendimento, valor de venda e OPEX mensal"
              T={T} dark={dark}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-1">
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl" style={{ background: T.surface2, border: `1px solid ${T.borderSoft}` }}>
                  <span className="text-xs font-semibold" style={{ color: T.text }}>Produtividade (g/planta)</span>
                  {num(yieldPerPlant, setYieldPerPlant, 1, 2000, 10)}
                </div>
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl" style={{ background: T.surface2, border: `1px solid ${T.borderSoft}` }}>
                  <span className="text-xs font-semibold" style={{ color: T.text }}>Valor de mercado (R$/g)</span>
                  {money(priceG, setPriceG, "w-24")}
                </div>
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl" style={{ background: T.surface2, border: `1px solid ${T.borderSoft}` }}>
                  <span className="text-xs font-semibold" style={{ color: T.text }}>Tarifa de energia (R$/kWh)</span>
                  {money(tariff, setTariff, "w-24")}
                </div>
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl" style={{ background: T.surface2, border: `1px solid ${T.borderSoft}` }}>
                  <span className="text-xs font-semibold" style={{ color: T.text }}>Insumos mensais (R$)</span>
                  {money(monthlyCost, setMonthlyCost, "w-24")}
                </div>
              </div>
            </CollapsibleCard>

            {/* Diagnóstico */}
            <CollapsibleCard
              title="Diagnóstico do projeto"
              subtitle={`${alerts.length} alerta(s)`}
              T={T} dark={dark}>
              <ul className="space-y-2">
                {alerts.map((a, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-snug" style={{ color: alertColor(a.level) }}>
                    <span className="shrink-0 mt-[5px] w-1.5 h-1.5 rounded-full" style={{ background: alertColor(a.level) }} />
                    <span>{a.text}</span>
                  </li>
                ))}
              </ul>
            </CollapsibleCard>

            {/* Lista de materiais & custos */}
            <CollapsibleCard
              title="Lista de materiais & custos"
              subtitle={`CAPEX ${fmtBRL(capex)}`}
              action={<span className="text-[11px]" style={{ color: T.faint }}>edite o R$ unitário</span>}
              T={T} dark={dark}>
              <ul className="text-sm">
                {materialRows.map((r) => (
                  <li key={r.key + r.label} className="py-2 flex items-center justify-between gap-3 flex-wrap"
                    style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                    <span className="min-w-0 flex-1" style={{ color: T.muted }}>
                      {r.label} <span style={{ color: T.faint }}>· {r.qty} {r.unitLabel}</span>
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px]" style={{ color: T.faint }}>R$</span>
                        <MoneyInput value={r.unitCost}
                          onCommit={(n) => (r.customId ? updCustom(r.customId, { cost: n }) : setCost(r.key, n))}
                          className={`w-20 h-7 ${inputCls}`} style={inputStyle} />
                      </div>
                      <span className="font-semibold w-20 text-right">{fmtBRL(r.subtotal)}</span>
                      <button
                        onClick={() => removeMaterialRow(r)}
                        title={`Remover "${r.label}"`}
                        aria-label={`Remover ${r.label}`}
                        className="w-7 h-7 rounded-lg transition-all hover:opacity-80 flex items-center justify-center shrink-0"
                        style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.muted }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  </li>
                ))}
                <li className="py-2 flex items-center justify-between gap-3"
                  style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                  <span style={{ color: T.muted }}>Custos extras (frete, elétrica, estrutura…)</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {money(extraCost, setExtraCost)}
                    <span className="font-semibold w-24 text-right">{fmtBRL(extraCost)}</span>
                  </div>
                </li>
                <li className="pt-3 flex items-center justify-between">
                  <span className="text-sm font-bold">Investimento total (CAPEX)</span>
                  <span className="text-lg font-extrabold">{fmtBRL(capex)}</span>
                </li>
              </ul>
            </CollapsibleCard>

            <button onClick={() => setShowReport(true)}
              className="w-full py-3.5 rounded-2xl text-sm font-bold transition-opacity hover:opacity-85 flex items-center justify-center gap-2"
              style={{ background: T.text, color: T.bg }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <span>Exportar relatório completo (PDF)</span>
            </button>
          </div>
        </div>
        ) : (
          <ComparisonView
            allPresets={allPresets}
            loadPreset={loadPreset}
            removePreset={removePreset}
            restoreDefaultPresets={restoreDefaultPresets}
            addCurrentAsPreset={addCurrentAsPreset}
            T={T}
            dark={dark}
          />
        )}

        <p className="text-xs mt-10 text-center" style={{ color: T.faint }}>
          Estimativas para planejamento — produtividade, preços e consumo variam com genética, manejo e tarifas locais.
        </p>
      </main>

      {/* Subdomain Publisher Modal */}
      {publishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg p-6 rounded-2xl shadow-2xl space-y-5" style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text }}>
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: T.borderSoft }}>
              <h3 className="text-lg font-extrabold flex items-center gap-2" style={{ color: T.text }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.71 1.26-1.5 1.74-2.3L4.5 16.5z"/><path d="M12 15l-3-3 7.5-7.5c1.4-1.4 3.7-1.4 5.1 0s1.4 3.7 0 5.1L12 15z"/></svg>
                <span>Publicar Grow em Subdomínio</span>
              </h3>
              <button onClick={() => { setPublishModalOpen(false); setPublishResult(null); }} className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: T.surface2, color: T.muted }}>✕</button>
            </div>

            <p className="text-xs" style={{ color: T.muted }}>
              Crie um subdomínio exclusivo e um link permanente para visualizar este dashboard interativo e mapa hidráulico em qualquer dispositivo.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-bold block" style={{ color: T.text }}>Nome do Subdomínio:</label>
              <div className="flex items-center rounded-xl overflow-hidden border" style={{ background: T.surface2, borderColor: T.border }}>
                <span className="pl-3 text-xs font-bold" style={{ color: T.muted }}>https://</span>
                <input
                  type="text"
                  value={subdomainInput}
                  onChange={(e) => setSubdomainInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="meu-setup-dwc"
                  maxLength={35}
                  className="flex-1 px-2 py-2.5 text-xs font-bold outline-none bg-transparent"
                  style={{ color: T.text }}
                />
                <span className="pr-3 text-xs font-bold" style={{ color: T.muted }}>.thegrowinstones.com</span>
              </div>
              <div className="text-[10.5px]" style={{ color: T.faint }}>
                Apenas letras minúsculas, números e hífens. Ex: <code style={{ color: T.text }}>projeto-organico-01</code>
              </div>
            </div>

            {publishResult && (
              <div className={`p-4 rounded-xl border space-y-2 ${publishResult.success ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
                {publishResult.success ? (
                  <div>
                    <div className="font-extrabold text-xs flex items-center gap-1.5 text-emerald-400">
                      <span>✓ Subdomínio Publicado com Sucesso!</span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: T.text }}>
                      Seu projeto já está online e acessível em:
                    </p>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <a href={publishResult.url} target="_blank" rel="noopener noreferrer"
                        className="px-3.5 py-1.5 rounded-lg text-xs font-extrabold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-colors flex items-center gap-1">
                        <span>🚀 Abrir {publishResult.slug}.thegrowinstones.com</span>
                      </a>
                      <button onClick={() => { navigator.clipboard.writeText(publishResult.url); showToast("✓ URL copiada!"); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors" style={{ background: T.surface, borderColor: T.border, color: T.text }}>
                        📋 Copiar Link
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs font-semibold text-red-400">
                    ⚠️ {publishResult.error}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: T.borderSoft }}>
              <button onClick={() => { setPublishModalOpen(false); setPublishResult(null); }} className="px-4 py-2 rounded-xl text-xs font-bold" style={{ background: T.surface2, color: T.muted }}>
                Cancelar
              </button>
              <button
                onClick={handlePublishSubdomain}
                disabled={isPublishing || !subdomainInput.trim()}
                className="px-5 py-2 rounded-xl text-xs font-extrabold transition-all shadow-md disabled:opacity-50"
                style={{ background: dark ? "#0284c7" : "#0369a1", color: "#ffffff" }}>
                {isPublishing ? "Publicando no Servidor..." : "🚀 Publicar Agora"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-xl text-xs font-bold transition-all animate-bounce"
          style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}>
          {toastMsg}
        </div>
      )}
          </div>
          </>
        )}
      </div>
    </div>
  );
}