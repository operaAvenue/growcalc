import React, { useState, useEffect, useRef, useMemo } from "react";
import ESP32WebFlasherModal from "./components/ESP32WebFlasherModal";
import ESP32GPIOConfigModal from "./components/ESP32GPIOConfigModal";
import { UserProfileView, parseObsidianMarkdown } from "./UserProfileView";

// ————————————————————————— ESP32 TELEMETRY & CONTROLE —————————————————————————
function MQTTMonitorView({ currentUser, T, dark, showToast }) {
  const [telemetry, setTelemetry] = useState(null);
  const [logs, setLogs] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [flasherModalOpen, setFlasherModalOpen] = useState(false);
  const [gpioModalOpen, setGpioModalOpen] = useState(false);
  const [togglingKeys, setTogglingKeys] = useState({});
  const [loading, setLoading] = useState(true);

  const userSlug = currentUser?.username || "guest";
  const activeId = selectedDevice || (devices.length > 0 ? devices[0].id : "melkweg003");

  const fetchTelemetry = async () => {
    try {
      const res = await fetch(`https://grow.thegrowinstones.com/api/mqtt/telemetry/${activeId}`);
      if (res.ok) {
        const result = await res.json();
        setTelemetry(result);
        if (result.devices && Array.isArray(result.devices)) setDevices(result.devices);
        if (result.recentLogs && Array.isArray(result.recentLogs)) setLogs(result.recentLogs);
      }
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 3000);
    return () => clearInterval(interval);
  }, [activeId]);

  const deviceIp = telemetry?.data?.ip || "192.168.1.141";

  const toggleESP32Relay = async (key, currentVal) => {
    const isCurrentlyOn = currentVal === true || currentVal === "ON" || currentVal === "1" || currentVal === 1;
    const nextState = isCurrentlyOn ? "OFF" : "ON";
    const nextValNum = isCurrentlyOn ? 0 : 1;

    setTogglingKeys((prev) => ({ ...prev, [key]: true }));

    // Extract GPIO number from key if present
    let gpioNum = null;
    const match = key.match(/\d+/);
    if (match) gpioNum = parseInt(match[0], 10);
    else if (key.includes("painel")) gpioNum = 19;
    else if (key.includes("exaustor")) gpioNum = 18;
    else if (key.includes("ph_down")) gpioNum = 14;
    else if (key.includes("ph_up")) gpioNum = 12;
    else if (key.includes("nutriente_a")) gpioNum = 27;
    else if (key.includes("nutriente_b")) gpioNum = 26;
    else if (key.includes("nutriente_c")) gpioNum = 25;
    else if (key.includes("agua")) gpioNum = 33;

    // 1. Direct local IP toggle if accessible
    if (deviceIp && gpioNum !== null) {
      try {
        await fetch(`http://${deviceIp}/api/toggle?pin=${gpioNum}&val=${nextValNum}`, { mode: 'no-cors' });
      } catch (e) {}
    }

    // 2. Publish command via server MQTT
    try {
      const res = await fetch("https://grow.thegrowinstones.com/api/mqtt/cmd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: activeId,
          pin: key,
          topic: `openagro/${activeId}/${key}/set`,
          payload: nextState
        })
      });
      if (res.ok) {
        showToast(`Comando enviado ao ESP32: ${key} -> ${nextState}`);
        setTimeout(fetchTelemetry, 600);
      }
    } catch (e) {
      showToast("Erro ao enviar comando para o ESP32.");
    } finally {
      setTogglingKeys((prev) => ({ ...prev, [key]: false }));
    }
  };

  const triggerDose = async (key, doseMl = 0.5) => {
    setTogglingKeys((prev) => ({ ...prev, [key]: true }));
    let gpioNum = 14;
    if (key.includes("ph_up")) gpioNum = 12;
    else if (key.includes("nutriente_a")) gpioNum = 27;
    else if (key.includes("nutriente_b")) gpioNum = 26;
    else if (key.includes("nutriente_c")) gpioNum = 25;
    else if (key.includes("agua")) gpioNum = 33;
    else {
      const match = key.match(/\d+/);
      if (match) gpioNum = parseInt(match[0], 10);
    }

    if (deviceIp) {
      try {
        await fetch(`http://${deviceIp}/api/toggle?pin=${gpioNum}&val=1`, { mode: 'no-cors' });
      } catch (e) {}
    }

    try {
      await fetch("https://grow.thegrowinstones.com/api/mqtt/cmd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: activeId,
          pin: key,
          topic: `openagro/${activeId}/${key}/set`,
          payload: "ON"
        })
      });
      showToast(`Pulso de dosagem disparado: ${key} (${doseMl} ml)`);
      setTimeout(fetchTelemetry, 800);
    } catch (e) {
      showToast("Erro ao acionar bomba dosadora.");
    } finally {
      setTogglingKeys((prev) => ({ ...prev, [key]: false }));
    }
  };

  const parseDynamicData = (data) => {
    if (!data || typeof data !== "object") return { sensors: [], pumps: [], actuators: [], info: [] };

    const sensors = [];
    const pumps = [];
    const actuators = [];
    const info = [];

    Object.entries(data).forEach(([key, val]) => {
      const lower = key.toLowerCase();
      if (lower === "hostname" || lower === "ip" || lower === "rssi" || lower === "state") {
        return; // Handled in device header badges
      }

      const label = key
        .replace(/_/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/^./, (str) => str.toUpperCase());

      const isBoolVal = typeof val === "boolean" || val === "ON" || val === "OFF" || val === "1" || val === "0" || val === 1 || val === 0;

      if (lower.includes("bomba") || lower.includes("pump") || lower.includes("dose")) {
        const isTrue = val === true || val === "ON" || val === "1" || val === 1;
        pumps.push({ key, label, val: isTrue, rawVal: val });
      } else if (isBoolVal && (lower.includes("gpio") || lower.includes("painel") || lower.includes("exaustor") || lower.includes("rele") || lower.includes("relay") || lower.includes("luz") || typeof val === "boolean")) {
        const isTrue = val === true || val === "ON" || val === "1" || val === 1;
        actuators.push({ key, label, val: isTrue, rawVal: val });
      } else if (typeof val === "number" || (!isNaN(val) && typeof val === "string" && val.trim() !== "" && !isNaN(Number(val)))) {
        const numVal = Number(val);
        let unit = "";
        if (lower.includes("temp") || lower.includes("temperatura")) unit = "°C";
        else if (lower.includes("umid") || lower.includes("hum") || lower.includes("humidity")) unit = "%";
        else if (lower.includes("ph")) unit = "pH";
        else if (lower.includes("ec")) unit = "mS/cm";
        else if (lower.includes("co2")) unit = "PPM";
        else if (lower.includes("lux") || lower.includes("luz")) unit = "Lux";
        else if (lower.includes("nivel") || lower.includes("level") || lower.includes("litro")) unit = lower.includes("litro") ? "L" : "%";
        else if (lower.includes("vazao") || lower.includes("flow")) unit = "L/min";
        else if (lower.includes("volt") || lower.includes("tensao")) unit = "V";

        sensors.push({ key, label, val: numVal, unit });
      } else if (val !== null && val !== undefined) {
        info.push({ key, label, val: String(val) });
      }
    });

    return { sensors, pumps, actuators, info };
  };

  const isConnected = telemetry && telemetry.connected && telemetry.data;
  const currentPayload = isConnected ? telemetry.data : null;
  const { sensors, pumps, actuators, info } = parseDynamicData(currentPayload);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 w-full space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: T.text }}><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9c3.9 3.9 3.9 10.3 0 14.2"/></svg>
            <h1 className="text-2xl font-bold" style={{ color: T.text }}>Telemetria & Controle ESP32-IoT-Controller</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1.5" style={{ background: isConnected ? T.surface2 : T.bg, borderColor: T.border, color: T.text }}>
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`}></span>
              {isConnected ? "HARDWARE ESP32 CONECTADO (100% REAL)" : "AGUARDANDO ESP32"}
            </span>
          </div>
          <p className="text-xs mt-1" style={{ color: T.muted }}>
            Comunicação bidirecional direta com o firmware <b>ESP32-IoT-Controller (openAgro v2.4)</b> via Mosquitto MQTT nativo.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setGpioModalOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all shadow flex items-center gap-1.5"
            style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="15" x2="23" y2="15"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="15" x2="4" y2="15"/></svg>
            <span>Configurar Pinos GPIO</span>
          </button>

          <button
            onClick={() => setCodeModalOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all shadow flex items-center gap-1.5"
            style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span>Instruções NVS</span>
          </button>

          <button
            onClick={() => setFlasherModalOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all shadow flex items-center gap-2"
            style={{ background: T.text, color: T.bg }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="15" x2="23" y2="15"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="15" x2="4" y2="15"/></svg>
            <span>Gravar ESP32 via USB</span>
          </button>
        </div>
      </div>

      {/* Selector de Dispositivos Reais & Connection Info */}
      <div className="p-5 rounded-2xl space-y-4" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: T.text }}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="15" x2="23" y2="15"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="15" x2="4" y2="15"/></svg>
            <div>
              <div className="text-xs font-bold" style={{ color: T.text }}>Dispositivos ESP32 Descobertos na Rede ({devices.length})</div>
              <div className="text-[11px]" style={{ color: T.muted }}>Hardware físico transmitindo telemetria real em tempo real.</div>
            </div>
          </div>

          {devices.length > 0 && (
            <select
              value={activeId}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="px-3 py-2 rounded-xl text-xs font-mono font-bold transition-all"
              style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
            >
              {devices.map((d) => (
                <option key={d.id} value={d.id}>Hardware: {d.originalName} ({d.topicCount} pacotes)</option>
              ))}
            </select>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2 border-t" style={{ borderColor: T.borderSoft }}>
          <div>
            <div className="text-[11px]" style={{ color: T.muted }}>Broker Mosquitto TCP:</div>
            <div className="text-xs font-bold font-mono" style={{ color: T.text }}>grow.thegrowinstones.com:1883</div>
          </div>
          <div>
            <div className="text-[11px]" style={{ color: T.muted }}>IP Local do ESP32:</div>
            <div className="text-xs font-bold font-mono" style={{ color: T.text }}>{telemetry?.data?.ip || "192.168.1.141"}</div>
          </div>
          <div>
            <div className="text-[11px]" style={{ color: T.muted }}>Sinal Wi-Fi RSSI:</div>
            <div className="text-xs font-bold font-mono" style={{ color: T.text }}>
              {telemetry?.data?.rssi ? `${telemetry.data.rssi} dBm (Excelente)` : "Detectando..."}
            </div>
          </div>
          <div>
            <div className="text-[11px]" style={{ color: T.muted }}>Último Pacote Real:</div>
            <div className="text-xs font-bold font-mono" style={{ color: isConnected ? T.text : T.muted }}>
              {isConnected ? new Date(telemetry.timestamp).toLocaleTimeString() : "Aguardando"}
            </div>
          </div>
        </div>
      </div>

      {/* Estado sem Dispositivo Conectado */}
      {!isConnected && (
        <div className="p-8 rounded-2xl text-center space-y-4" style={{ background: T.surface, border: `1px dashed ${T.border}` }}>
          <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center" style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.muted }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: T.text }}>Nenhum dispositivo ESP32 transmitindo no momento</h3>
            <p className="text-xs max-w-md mx-auto mt-1" style={{ color: T.muted }}>
              Certifique-se de que seu ESP32 com o firmware <b>ESP32-IoT-Controller</b> está ligado e conectado à sua rede Wi-Fi.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setFlasherModalOpen(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-2"
              style={{ background: T.text, color: T.bg }}
            >
              <span>Gravar ESP32 via USB</span>
            </button>
            <button
              onClick={() => setGpioModalOpen(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-2"
              style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
            >
              <span>Configurar Pinos GPIO</span>
            </button>
          </div>
        </div>
      )}

      {/* Seção 1: Sensores / Medições Numéricas Reais */}
      {isConnected && (
        <>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: T.text }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              <span>Leitura de Sensores Físicos ({sensors.length})</span>
            </h2>
            {sensors.length === 0 ? (
              <div className="p-6 rounded-2xl text-center" style={{ background: T.surface, border: `1px dashed ${T.border}` }}>
                <p className="text-xs" style={{ color: T.muted }}>Nenhum sensor numérico configurado no ESP32. Clique em "Configurar Pinos GPIO" para adicionar.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sensors.map((s) => (
                  <div key={s.key} className="p-5 rounded-2xl transition-all shadow-sm" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs font-bold uppercase tracking-wider truncate" style={{ color: T.muted }} title={s.key}>{s.label}</div>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                    </div>
                    <div className="text-3xl font-extrabold font-mono flex items-baseline gap-1.5 my-2" style={{ color: T.text }}>
                      <span>{s.val.toFixed(2)}</span>
                      {s.unit && <span className="text-sm font-bold" style={{ color: T.muted }}>{s.unit}</span>}
                    </div>
                    <div className="text-[10px] font-mono mt-1 truncate" style={{ color: T.faint }}>Tópico: <code style={{ color: T.text }}>openagro/{activeId}/{s.key}/state</code></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Seção 2: Bombas Dosadoras com Disparo de Pulso */}
          {pumps.length > 0 && (
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: T.text }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
                <span>Bombas Dosadoras Peristálticas ({pumps.length})</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pumps.map((p) => (
                  <div key={p.key} className="p-5 rounded-2xl space-y-3 transition-all" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold truncate" style={{ color: T.text }}>{p.label}</div>
                        <div className="text-[10px] font-mono" style={{ color: T.muted }}>{p.key}</div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold" style={{ background: p.val ? T.surface2 : T.bg, border: `1px solid ${T.border}`, color: T.text }}>
                        {p.val ? "DOSANDO..." : "PRONTA"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => triggerDose(p.key, 0.5)}
                        disabled={!!togglingKeys[p.key]}
                        className="flex-1 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5"
                        style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
                        <span>{togglingKeys[p.key] ? "Enviando..." : "Pulsar 0.5 ml"}</span>
                      </button>

                      <button
                        onClick={() => toggleESP32Relay(p.key, p.val)}
                        disabled={!!togglingKeys[p.key]}
                        className="px-3 py-2 rounded-xl text-xs font-bold font-mono transition-all"
                        style={{
                          background: p.val ? T.text : T.bg,
                          border: `1px solid ${T.border}`,
                          color: p.val ? T.bg : T.text
                        }}
                      >
                        {p.val ? "STOP" : "LIGAR"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Seção 3: Relés & Saídas Digitais com Controle Bidirecional */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: T.text }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              <span>Relés & Saídas Digitais ({actuators.length})</span>
            </h2>
            {actuators.length === 0 ? (
              <div className="p-6 rounded-2xl text-center" style={{ background: T.surface, border: `1px dashed ${T.border}` }}>
                <p className="text-xs" style={{ color: T.muted }}>Nenhum relé digital detectado no dispositivo.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {actuators.map((a) => (
                  <div key={a.key} className="p-5 rounded-2xl flex items-center justify-between gap-3" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate" style={{ color: T.text }}>{a.label}</div>
                      <div className="text-[10px] font-mono truncate" style={{ color: T.muted }}>openagro/{activeId}/{a.key}/set</div>
                    </div>
                    <button
                      onClick={() => toggleESP32Relay(a.key, a.val)}
                      disabled={!!togglingKeys[a.key]}
                      className="px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-1.5 shadow-sm"
                      style={{
                        background: a.val ? T.text : T.surface2,
                        border: `1px solid ${T.border}`,
                        color: a.val ? T.bg : T.text
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
                      <span>{togglingKeys[a.key] ? "..." : (a.val ? "LIGADO" : "DESLIGADO")}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inspeção do JSON Bruto Real */}
          <div className="p-6 rounded-2xl space-y-3" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: T.text }}>Inspeção de Payload Real Recebido do Hardware</h3>
              <span className="text-[11px] font-mono" style={{ color: T.muted }}>Tópico: {telemetry.topic}</span>
            </div>
            <pre className="p-4 rounded-xl font-mono text-xs overflow-x-auto max-h-60" style={{ background: T.inset, border: `1px solid ${T.border}`, color: T.text }}>
              {JSON.stringify(currentPayload, null, 2)}
            </pre>
          </div>
        </>
      )}

      {/* Feed de Tópicos MQTT em Tempo Real */}
      <div className="p-6 rounded-2xl" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: T.text }}>Feed de Mensagens MQTT em Tempo Real</h3>
          <span className="text-[10px] font-mono" style={{ color: T.muted }}>Mosquitto Broker :1883</span>
        </div>
        {logs.length === 0 ? (
          <p className="text-xs" style={{ color: T.muted }}>Nenhuma mensagem MQTT trafegada no broker recentemente.</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {logs.map((log, i) => (
              <div key={i} className="p-3 rounded-xl font-mono text-xs flex items-center justify-between gap-3 overflow-x-auto" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                <span className="shrink-0" style={{ color: T.muted }}>{log.time}</span>
                <span className="shrink-0 font-bold" style={{ color: T.text }}>{log.topic}</span>
                <span className="truncate" style={{ color: T.muted }}>{log.payload}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Instruções de Conexão ESP32-IoT-Controller */}
      {codeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-xl p-6 rounded-2xl text-left shadow-2xl relative space-y-4" style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text }}>
            <button
              onClick={() => setCodeModalOpen(false)}
              className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              style={{ background: T.surface2, color: T.text, border: `1px solid ${T.border}` }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>

            <div className="flex items-center gap-3 border-b pb-3" style={{ borderColor: T.borderSoft }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: T.text }}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/></svg>
              <div>
                <h3 className="font-bold text-base" style={{ color: T.text }}>Configuração do ESP32-IoT-Controller</h3>
                <p className="text-xs" style={{ color: T.muted }}>Instruções de apontamento NVS no firmware openAgro v2.4</p>
              </div>
            </div>

            <div className="space-y-3 text-xs" style={{ color: T.text }}>
              <div className="p-3.5 rounded-xl space-y-2 font-mono" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                <div><b>Broker MQTT Server:</b> grow.thegrowinstones.com</div>
                <div><b>Porta MQTT TCP:</b> 1883</div>
                <div><b>Tópico de Leitura:</b> openagro/{activeId}/state</div>
                <div><b>Tópico de Comando:</b> openagro/{activeId}/[pin]/set</div>
              </div>
              <p style={{ color: T.muted }}>
                No firmware <b>ESP32-IoT-Controller</b>, o servidor MQTT padrão já vem pré-configurado como <code className="font-mono" style={{ color: T.text }}>grow.thegrowinstones.com</code> e porta <code className="font-mono" style={{ color: T.text }}>1883</code>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gravador USB Web */}
      <ESP32WebFlasherModal
        isOpen={flasherModalOpen}
        onClose={() => setFlasherModalOpen(false)}
        currentUser={currentUser}
        T={T}
        dark={dark}
        showToast={showToast}
      />

      {/* Modal Gerenciador de Pinos GPIO */}
      <ESP32GPIOConfigModal
        isOpen={gpioModalOpen}
        onClose={() => {
          setGpioModalOpen(false);
          fetchTelemetry();
        }}
        T={T}
        dark={dark}
        showToast={showToast}
        deviceIp={deviceIp}
        activeId={activeId}
      />
    </div>
  );
}

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

function NumInput({ value, onCommit, min = 0, max = 999999, className, style }) {
  const [draft, setDraft] = useState(null);
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

function IsometricPotSVG({ potW, potD, potH, potLiters, isRect, isSquare, isCalha, dark, T }) {
  const svgW = 340;
  const svgH = 210;

  // Dimensões reais em centímetros
  const W = Math.max(5, Number(potW) || 20);
  const L = Math.max(5, Number(potD) || 20);
  const H = Math.max(5, Number(potH) || 25);
  const isBox = isRect || isSquare || isCalha;

  // Projeção isométrica verdadeira com ângulo de 30 graus
  // Eixo X (largura): vetor (cos 30°, sin 30°) = (0.866, 0.5)
  // Eixo Y (comprimento): vetor (-cos 30°, sin 30°) = (-0.866, 0.5)
  // Eixo Z (altura/profundidade): vetor (0, 1)

  // Cálculo da envergadura total projetada para escala uniforme 1:1:1
  const projWidth = (W + L) * 0.866;
  const projHeight = (W + L) * 0.5 + H;

  // Fator de escala estritamente proporcional
  const maxWAvailable = 250;
  const maxHAvailable = 135;
  const scale = Math.min(maxWAvailable / projWidth, maxHAvailable / projHeight, 3.2);

  const wPx = W * scale;
  const lPx = L * scale;
  const hPx = H * scale;

  const cx = svgW / 2;
  const cy = svgH / 2;

  // Posicionamento vertical para manter o objeto centralizado no viewBox
  const topCenterY = cy - (hPx / 2) - ((wPx + lPx) * 0.25) + 12;
  const topCenterX = cx - ((wPx - lPx) * 0.433);

  if (isBox) {
    // Vértices do topo (plano superior)
    const T_back = { x: topCenterX, y: topCenterY };
    const T_right = { x: topCenterX + wPx * 0.866, y: topCenterY + wPx * 0.5 };
    const T_front = { x: topCenterX + (wPx - lPx) * 0.866, y: topCenterY + (wPx + lPx) * 0.5 };
    const T_left = { x: topCenterX - lPx * 0.866, y: topCenterY + lPx * 0.5 };

    // Tapering sutil para vaso afunilado (calha possui paredes retas 0.98)
    const taper = isCalha ? 0.98 : (isRect ? 0.92 : 0.84);
    const topCenter = { x: (T_back.x + T_front.x) / 2, y: (T_back.y + T_front.y) / 2 };
    const botCenter = { x: topCenter.x, y: topCenter.y + hPx };

    const getTaperedBot = (pt) => ({
      x: botCenter.x + (pt.x - topCenter.x) * taper,
      y: botCenter.y + (pt.y - topCenter.y) * taper
    });

    const B_back = getTaperedBot(T_back);
    const B_right = getTaperedBot(T_right);
    const B_front = getTaperedBot(T_front);
    const B_left = getTaperedBot(T_left);

    // Interior rebaixado (substrato / solução nutritiva)
    const inScale = 0.88;
    const inDrop = Math.min(6, hPx * 0.2);
    const getInnerPt = (pt) => ({
      x: topCenter.x + (pt.x - topCenter.x) * inScale,
      y: topCenter.y + (pt.y - topCenter.y) * inScale + inDrop
    });

    const In_back = getInnerPt(T_back);
    const In_right = getInnerPt(T_right);
    const In_front = getInnerPt(T_front);
    const In_left = getInnerPt(T_left);

    const polyStr = (pts) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

    return (
      <svg width="100%" height="210" viewBox={`0 0 ${svgW} ${svgH}`} fill="none" className="select-none">
        <defs>
          <linearGradient id="isoBoxLeft" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={dark ? "#262626" : "#e5e5e5"} />
            <stop offset="100%" stopColor={dark ? "#171717" : "#d4d4d4"} />
          </linearGradient>
          <linearGradient id="isoBoxRight" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={dark ? "#383838" : "#f5f5f5"} />
            <stop offset="100%" stopColor={dark ? "#262626" : "#e5e5e5"} />
          </linearGradient>
          <linearGradient id="isoBoxTop" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={dark ? "#404040" : "#ffffff"} />
            <stop offset="100%" stopColor={dark ? "#2a2a2a" : "#f0f0f0"} />
          </linearGradient>
          <linearGradient id="isoSubstrate" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={dark ? "#1c1917" : "#e7e5e4"} />
            <stop offset="100%" stopColor={dark ? "#0c0a09" : "#d6d3d1"} />
          </linearGradient>
        </defs>

        {/* Sombra de projeção na base */}
        <polygon
          points={polyStr([
            { x: B_back.x, y: B_back.y + 4 },
            { x: B_right.x + 6, y: B_right.y + 4 },
            { x: B_front.x, y: B_front.y + 8 },
            { x: B_left.x - 6, y: B_left.y + 4 }
          ])}
          fill={dark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.08)"}
        />

        {/* Parede Esquerda (Comprimento / Face Lateral) */}
        <polygon
          points={polyStr([T_left, T_front, B_front, B_left])}
          fill="url(#isoBoxLeft)"
          stroke={T.border}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />

        {/* Parede Direita (Largura / Face Frontal) */}
        <polygon
          points={polyStr([T_front, T_right, B_right, B_front])}
          fill="url(#isoBoxRight)"
          stroke={T.border}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />

        {/* Borda / Boca Superior */}
        <polygon
          points={polyStr([T_back, T_right, T_front, T_left])}
          fill="url(#isoBoxTop)"
          stroke={T.border}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Interior do Vaso / Calha (Substrato / Solução) */}
        <polygon
          points={polyStr([In_back, In_right, In_front, In_left])}
          fill="url(#isoSubstrate)"
          stroke={T.borderSoft}
          strokeWidth="1"
          strokeLinejoin="round"
        />

        {/* Cotas Técnicas Isométricas */}
        {/* Cota Largura (W) */}
        <line
          x1={T_right.x + 6} y1={T_right.y - 2}
          x2={T_front.x + 6} y2={T_front.y - 2}
          stroke={dark ? "#f59e0b" : "#d97706"}
          strokeWidth="1.2"
          strokeDasharray="3 2"
        />
        <text
          x={(T_right.x + T_front.x) / 2 + 14}
          y={(T_right.y + T_front.y) / 2}
          fill={dark ? "#fbbf24" : "#b45309"}
          fontSize="9.5"
          fontWeight="700"
          textAnchor="start"
        >
          L: {W}cm
        </text>

        {/* Cota Comprimento (L) */}
        <line
          x1={T_left.x - 6} y1={T_left.y - 2}
          x2={T_front.x - 6} y2={T_front.y - 2}
          stroke={dark ? "#f59e0b" : "#d97706"}
          strokeWidth="1.2"
          strokeDasharray="3 2"
        />
        <text
          x={(T_left.x + T_front.x) / 2 - 12}
          y={(T_left.y + T_front.y) / 2}
          fill={dark ? "#fbbf24" : "#b45309"}
          fontSize="9.5"
          fontWeight="700"
          textAnchor="end"
        >
          C: {L}cm
        </text>

        {/* Cota Profundidade / Altura (H) */}
        <line
          x1={T_right.x + 4} y1={T_right.y + 4}
          x2={B_right.x + 4} y2={B_right.y}
          stroke={dark ? "#38bdf8" : "#0284c7"}
          strokeWidth="1.2"
          strokeDasharray="3 2"
        />
        <text
          x={B_right.x + 10}
          y={(T_right.y + B_right.y) / 2 + 3}
          fill={dark ? "#38bdf8" : "#0284c7"}
          fontSize="9.5"
          fontWeight="700"
          textAnchor="start"
        >
          {isCalha ? "P" : "Alt"}: {H}cm
        </text>

        {/* Badge Central com Volume */}
        <g transform={`translate(${topCenter.x}, ${topCenter.y + inDrop})`}>
          <rect x="-34" y="-9" width="68" height="18" rx="9" fill={dark ? "#1c1917" : "#ffffff"} stroke={T.accentBorder} strokeWidth="1.2" />
          <text x="0" y="3.5" fill={T.text} fontSize="10.5" fontWeight="800" textAnchor="middle">{potLiters} L</text>
        </g>
      </svg>
    );
  }

  // Vaso Cilíndrico / Redondo com Proporção Isométrica Real
  const D = W;
  const radius = (D / 2) * scale;
  const rx = radius * 0.866;
  const ry = radius * 0.5;
  const taper = 0.82;
  const botRx = rx * taper;
  const botRy = ry * taper;
  const topY = cy - (hPx / 2) + 12;
  const botY = topY + hPx;

  return (
    <svg width="100%" height="210" viewBox={`0 0 ${svgW} ${svgH}`} fill="none" className="select-none">
      <defs>
        <linearGradient id="isoCylBody" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={dark ? "#1c1917" : "#e5e5e5"} />
          <stop offset="50%" stopColor={dark ? "#383838" : "#ffffff"} />
          <stop offset="100%" stopColor={dark ? "#262626" : "#d4d4d4"} />
        </linearGradient>
      </defs>

      {/* Sombra base */}
      <ellipse cx={cx} cy={botY + 4} rx={botRx + 4} ry={botRy + 2} fill={dark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.08)"} />

      {/* Base */}
      <ellipse cx={cx} cy={botY} rx={botRx} ry={botRy} fill={T.surface2} stroke={T.border} strokeWidth="1.2" />

      {/* Corpo Cilíndrico com Taper */}
      <path
        d={`M ${cx - rx} ${topY} A ${rx} ${ry} 0 0 0 ${cx + rx} ${topY} L ${cx + botRx} ${botY} A ${botRx} ${botRy} 0 0 1 ${cx - botRx} ${botY} Z`}
        fill="url(#isoCylBody)"
        stroke={T.border}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />

      {/* Borda Superior */}
      <ellipse cx={cx} cy={topY} rx={rx} ry={ry} fill={T.surface2} stroke={T.border} strokeWidth="1.5" />

      {/* Substrato Interior */}
      <ellipse cx={cx} cy={topY + 3} rx={rx * 0.88} ry={ry * 0.88} fill={T.inset} stroke={T.borderSoft} strokeWidth="1" />

      {/* Cotas */}
      <line x1={cx - rx} y1={topY - 10} x2={cx + rx} y2={topY - 10} stroke={dark ? "#f59e0b" : "#d97706"} strokeWidth="1.2" strokeDasharray="3 2" />
      <text x={cx} y={topY - 14} fill={dark ? "#fbbf24" : "#b45309"} fontSize="9.5" fontWeight="700" textAnchor="middle">⌀ {D}cm</text>

      <line x1={cx + rx + 8} y1={topY} x2={cx + botRx + 8} y2={botY} stroke={dark ? "#38bdf8" : "#0284c7"} strokeWidth="1.2" strokeDasharray="3 2" />
      <text x={cx + rx + 14} y={(topY + botY) / 2 + 3} fill={dark ? "#38bdf8" : "#0284c7"} fontSize="9.5" fontWeight="700" textAnchor="start">Alt: {H}cm</text>

      {/* Badge com Volume */}
      <g transform={`translate(${cx}, ${topY + 3})`}>
        <rect x="-30" y="-8" width="60" height="16" rx="8" fill={dark ? "#1c1917" : "#ffffff"} stroke={T.accentBorder} strokeWidth="1.2" />
        <text x="0" y="3.5" fill={T.text} fontSize="10" fontWeight="800" textAnchor="middle">{potLiters} L</text>
      </g>
    </svg>
  );
}

function CollapsibleCard({ title, subtitle, isOpen, onToggle, defaultOpen = false, children, action, className = "", T, dark }) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = isOpen !== undefined ? isOpen : internalOpen;
  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalOpen((o) => !o);
    }
  };

  return (
    <section className={`rounded-2xl transition-all duration-200 w-full max-w-full overflow-hidden min-w-0 ${open ? "p-3.5 sm:p-5" : "px-3.5 sm:px-5 py-3 sm:py-3.5"} ${className}`}
      style={{
        background: T.surface,
        border: `1px solid ${T.borderSoft}`,
        boxShadow: dark ? "none" : "0 1px 2px rgba(31,27,22,0.04)"
      }}>
      <div
        onClick={handleToggle}
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
            onClick={handleToggle}
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
                  <span>{isChecked ? "" : "○"}</span>
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
                      {fmtG(m.yieldYearG)} {isTop && ""}
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
                      {fmtBRL(m.costPerGramOpex)} / g {isLowG && ""}
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
                      {fmtBRL(m.capex)} {isLow && ""}
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
                      {m.paybackMonths ? `${m.paybackMonths.toFixed(1)} m (${(m.paybackMonths / (m.cDays / 30)).toFixed(1)} safras)` : "—"} {isBestPayback && ""}
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


function GrowinStones() {
  const [dark, setDark] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // identificação
  const [growName, setGrowName] = useState("");
  const [owner, setOwner] = useState("");
  const [strain, setStrain] = useState(""); // Variedade / Genética da planta
  const [isGrowPublic, setIsGrowPublic] = useState(true); // Se o projeto do grow é público no subdomínio
  const [openConfigCard, setOpenConfigCard] = useState("estufa"); // Accordion de cards: apenas 1 aberto por vez
  const toggleConfigCard = (id) => setOpenConfigCard((cur) => (cur === id ? null : id));
  const [openDataCard, setOpenDataCard] = useState(true); // Card dos dados sticky no topo
  const [openMapCard, setOpenMapCard] = useState(true); // Card do mapa logo abaixo

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
  const [equipList, setEquipList] = useState([]); // Lista dinâmica de equipamentos adicionados pelo usuário
  const [watts, setWatts] = useState({ led: 240 });

  const addEquipItem = () => {
    const newItem = {
      id: "eq_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      name: "",
      qty: 1,
      cost: 0,
      watts: 0,
      hours: 24,
      inShoppingList: true,
      url: "",
      isCollapsed: false,
    };
    setEquipList((prev) => [newItem, ...prev]);
  };

  const updEquip = (id, patch) => {
    setEquipList((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const delEquip = (id) => {
    setEquipList((prev) => prev.filter((it) => it.id !== id));
    showToast("Equipamento removido!");
  };

  const toggleEquipCollapse = (id) => {
    setEquipList((prev) => prev.map((it) => (it.id === id ? { ...it, isCollapsed: !it.isCollapsed } : it)));
  };

  // cultivo & mercado & ciclo de luz
  const [vegaHours, setVegaHours] = useState(18);
  const [floraHours, setFloraHours] = useState(12);
  const [vegaDays, setVegaDays] = useState(30);
  const [floraDays, setFloraDays] = useState(60);
  const cycleDays = Math.max(1, (Number(vegaDays) || 0) + (Number(floraDays) || 0));

  const [yieldPerPlant, setYieldPerPlant] = useState(80); // g/planta/safra
  const [priceG, setPriceG] = useState(0); // R$/g
  const [tariff, setTariff] = useState(0.95); // R$/kWh

  // custos base estruturais
  const [costs, setCosts] = useState({ ...BASE_COSTS });
  const [extraCost, setExtraCost] = useState(0); // investimento extra (único)
  const [monthlyCost, setMonthlyCost] = useState(0); // insumos mensais

  const removeMaterialRow = (r) => {
    if (r.equipId) {
      delEquip(r.equipId);
    } else {
      setCost(r.key, 0);
      showToast(`Custo do item "${r.label}" zerado!`);
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

    // Sincronização em segundo plano na inicialização
    if (currentUser && (currentUser.email || currentUser.username)) {
      const fetchCloudSync = async () => {
        try {
          const syncUrl = `https://grow.thegrowinstones.com/api/user/sync?email=${encodeURIComponent(currentUser.email || "")}&username=${encodeURIComponent(currentUser.username || "")}`;
          const res = await fetch(syncUrl);
          if (res.ok) {
            const data = await res.json();
            if (data && data.exists && data.user) {
              setCurrentUser((prev) => ({ ...prev, ...data.user }));
              if (data.user.username) setSubdomainInput(data.user.username);
            }
          }
        } catch (e) {}
      };
      fetchCloudSync();
    }
  }, []);

  const triggerGoogleOAuth = () => {
    if (typeof window.google === "undefined" || !window.google.accounts) {
      showToast("SDK do Google está carregando... Tente novamente em instantes.");
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
            showToast(`Falha no Google Auth: ${response.error_description || response.error}`);
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

            // 1. Consultar a nuvem por dados existentes vinculados a este e-mail da conta Google
            let cloudData = null;
            try {
              const syncUrl = `https://grow.thegrowinstones.com/api/user/sync?email=${encodeURIComponent(googleUser.email)}&name=${encodeURIComponent(googleUser.name || "")}&googleSub=${encodeURIComponent(googleUser.sub || "")}&username=${encodeURIComponent(defaultSlug)}`;
              const syncRes = await fetch(syncUrl);
              if (syncRes.ok) {
                const syncJson = await syncRes.json();
                if (syncJson && syncJson.exists) {
                  cloudData = syncJson;
                }
              }
            } catch (e) {
              console.warn("Aviso ao buscar sync na nuvem:", e);
            }

            // 2. Se já tem cadastro na nuvem, restaurar completamente a sessão
            if (cloudData && cloudData.user) {
              const restoredUser = {
                name: cloudData.user.name || googleUser.name || "Cultivador",
                email: googleUser.email,
                username: cloudData.user.username || defaultSlug,
                avatarUrl: cloudData.user.avatarUrl || googleUser.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${defaultSlug}`,
                bannerUrl: cloudData.user.bannerUrl || "",
                bio: cloudData.user.bio || "",
                location: cloudData.user.location || "Brasil",
                strainFocus: cloudData.user.strainFocus || "",
                googleSub: googleUser.sub
              };

              // Restaurar presets da nuvem se houver
              if (Array.isArray(cloudData.presets) && cloudData.presets.length > 0) {
                setAllPresets(cloudData.presets);
                localStorage.setItem("growinstones_all_presets_v2", JSON.stringify(cloudData.presets));
              }

              // Restaurar posts da nuvem se houver
              if (Array.isArray(cloudData.posts)) {
                localStorage.setItem(`growcalc_posts_${restoredUser.username}`, JSON.stringify(cloudData.posts));
              }

              // Restaurar setup de cultivo da nuvem se houver
              if (cloudData.setup) {
                try {
                  loadUserSetupFromData(cloudData.setup);
                } catch(e) {
                  console.warn("Aviso ao carregar setup:", e);
                }
              }

              localStorage.setItem("growcalc_user", JSON.stringify(restoredUser));
              setCurrentUser(restoredUser);
              setSubdomainInput(restoredUser.username);
              setActiveTab("profile");
              setAuthModalOpen(false);
              showToast(`Sessão sincronizada! Bem-vindo de volta, ${restoredUser.name} (@${restoredUser.username}).`);
              return;
            }

            // 3. Caso seja o primeiro acesso deste usuário, autenticar e registrar na nuvem automaticamente
            const autoUser = {
              name: googleUser.name || "Cultivador",
              email: googleUser.email,
              username: defaultSlug,
              avatarUrl: googleUser.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${defaultSlug}`,
              bannerUrl: "",
              bio: "Cultivador apaixonado por hidroponia e automação.",
              location: "Brasil",
              strainFocus: "",
              googleSub: googleUser.sub
            };

            localStorage.setItem("growcalc_user", JSON.stringify(autoUser));
            setCurrentUser(autoUser);
            setSubdomainInput(defaultSlug);
            setActiveTab("profile");
            setAuthModalOpen(false);

            // Salvar imediatamente na nuvem para persistência em todos os dispositivos
            fetch("https://grow.thegrowinstones.com/api/user/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ user: autoUser, setup: getSetupData(), presets: allPresets })
            }).catch(() => {});

            showToast(`Bem-vindo, ${autoUser.name}! Subdomínio @${defaultSlug} ativado e sincronizado.`);
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


  const [activeTab, setActiveTab] = useState(() => (currentUser?.username ? "profile" : "configurator")); // "profile" | "configurator" | "my_grows" | "comparison" | "settings"
 // "configurator" | "comparison"

  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [subdomainInput, setSubdomainInput] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const syncAllToCloud = (overrideSetup = null, overridePresets = null) => {
    if (!currentUser || (!currentUser.username && !currentUser.email)) return;
    const setupData = overrideSetup || {
      growName, owner, strain,
      width, depth, height,
      potCount, potIdx, potShape, potFlipped, customPotW, customPotL, customPotH,
      gaugeIdx, spacing, cols, conn, recirculate,
      equip, perPot, watts, equipUrls, equipShopping, customItems,
      vegaHours, floraHours, vegaDays, floraDays, yieldPerPlant, priceG, tariff,
      costs, extraCost, monthlyCost,
      notes, instructions, terms,
      dark
    };
    const presetsData = overridePresets || allPresets || [];

    fetch("https://grow.thegrowinstones.com/api/user/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: currentUser,
        setup: setupData,
        presets: presetsData
      })
    }).catch(() => {});
  };

  const saveAllPresetsToStorage = (list) => {
    setAllPresets(list);
    try {
      localStorage.setItem("growinstones_all_presets_v2", JSON.stringify(list));
    } catch (e) {}
    if (currentUser && (currentUser.email || currentUser.username)) {
      syncAllToCloud(null, list);
    }
  };

  const removePreset = (id, name) => {
    if (window.confirm(`Deseja remover o chip "${name}"?`)) {
      const updated = allPresets.filter((p) => (p.id || p.name) !== id);
      saveAllPresetsToStorage(updated);
      showToast(` Preset "${name}" removido.`);
    }
  };

  const restoreDefaultPresets = () => {
    saveAllPresetsToStorage(INITIAL_PRESETS);
    showToast(` Presets padrão restaurados!`);
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
    showToast(` Preset "${name.trim()}" adicionado!`);
  };

  const loadPreset = (preset) => {
    if (!preset) return;
    if (preset.data) {
      loadSetupData(preset.data);
    }
    if (preset.apply) {
      applyPreset(preset);
    }
    showToast(` Setup "${preset.name}" carregado!`);
  };

  const fileInputRef = useRef(null);
  const [toastMsg, setToastMsg] = useState("");

  // ————— SISTEMA DE PERSISTÊNCIA E ISOLAMENTO DE USUÁRIOS —————
  const loadUserSetupFromData = (data) => {
    if (!data || typeof data !== "object") return;
    if (data.growName !== undefined) setGrowName(data.growName);
    if (data.owner !== undefined) setOwner(data.owner);
    if (data.strain !== undefined) setStrain(data.strain);
    if (data.width !== undefined) setWidth(data.width);
    if (data.depth !== undefined) setDepth(data.depth);
    if (data.height !== undefined) setHeight(data.height);
    if (data.potCount !== undefined) setPotCount(data.potCount);
    if (data.potIdx !== undefined) setPotIdx(data.potIdx);
    if (data.potShape !== undefined) setPotShape(data.potShape);
    if (data.potFlipped !== undefined) setPotFlipped(data.potFlipped);
    if (data.customPotW !== undefined) setCustomPotW(data.customPotW);
    if (data.customPotL !== undefined) setCustomPotL(data.customPotL);
    if (data.customPotH !== undefined) setCustomPotH(data.customPotH);
    if (data.gaugeIdx !== undefined) setGaugeIdx(data.gaugeIdx);
    if (data.spacing !== undefined) setSpacing(data.spacing);
    if (data.cols !== undefined) setCols(data.cols);
    if (data.conn !== undefined) setConn(data.conn);
    if (data.recirculate !== undefined) setRecirculate(data.recirculate);
    if (data.equip !== undefined) setEquip(data.equip);
    if (data.perPot !== undefined) setPerPot(data.perPot);
    if (data.watts !== undefined) setWatts(data.watts);
    if (data.equipUrls !== undefined) setEquipUrls(data.equipUrls);
    if (data.equipShopping !== undefined) setEquipShopping(data.equipShopping);
    if (data.customItems !== undefined) setCustomItems(data.customItems);
    if (data.vegaHours !== undefined) setVegaHours(data.vegaHours);
    if (data.floraHours !== undefined) setFloraHours(data.floraHours);
    if (data.vegaDays !== undefined) setVegaDays(data.vegaDays);
    if (data.floraDays !== undefined) setFloraDays(data.floraDays);
    if (data.yieldPerPlant !== undefined) setYieldPerPlant(data.yieldPerPlant);
    if (data.priceG !== undefined) setPriceG(data.priceG);
    if (data.tariff !== undefined) setTariff(data.tariff);
    if (data.costs !== undefined) setCosts(data.costs);
    if (data.extraCost !== undefined) setExtraCost(data.extraCost);
    if (data.monthlyCost !== undefined) setMonthlyCost(data.monthlyCost);
    if (data.notes !== undefined) setNotes(data.notes);
    if (data.instructions !== undefined) setInstructions(data.instructions);
    if (data.terms !== undefined) setTerms(data.terms);
    if (data.isGrowPublic !== undefined) setIsGrowPublic(Boolean(data.isGrowPublic));
    if (data.dark !== undefined) setDark(Boolean(data.dark));
    if (data.allPresets !== undefined && Array.isArray(data.allPresets) && data.allPresets.length > 0) {
      setAllPresets(data.allPresets);
    }
  };

  const loadUserSetup = (user) => {
    if (!user || !user.username) return;
    const key = `growcalc_user_setup_${user.username}`;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        loadUserSetupFromData(JSON.parse(saved));
      }
    } catch (e) {}
  };

  // Carregar dados salvos do usuário e sincronizar com a nuvem
  const fetchCloudUserSync = async () => {
    if (!currentUser || (!currentUser.email && !currentUser.username)) return;
    try {
      const syncUrl = `https://grow.thegrowinstones.com/api/user/sync?email=${encodeURIComponent(currentUser.email || "")}&username=${encodeURIComponent(currentUser.username || "")}&name=${encodeURIComponent(currentUser.name || "")}`;
      const res = await fetch(syncUrl);
      if (res.ok) {
        const data = await res.json();
        if (data && data.exists) {
          if (data.user) {
            setCurrentUser((prev) => ({ ...prev, ...data.user }));
            if (data.user.username) setSubdomainInput(data.user.username);
          }
          if (Array.isArray(data.presets) && data.presets.length > 0) {
            setAllPresets(data.presets);
            try { localStorage.setItem("growinstones_all_presets_v2", JSON.stringify(data.presets)); } catch(e) {}
          } else {
            // Se a nuvem não tem presets salvos mas o dispositivo atual tem, envia para a nuvem
            const localPresets = allPresets;
            if (Array.isArray(localPresets) && localPresets.length > 0) {
              syncAllToCloud(null, localPresets);
            }
          }
          if (data.setup) {
            loadUserSetupFromData(data.setup);
          }
        }
      }
    } catch (e) {
      console.warn("Aviso ao buscar sync na nuvem:", e);
    }
  };

  // Carregar dados salvos do usuário ao iniciar/mudar usuário
  useEffect(() => {
    if (currentUser && (currentUser?.username || currentUser?.email)) {
      loadUserSetup(currentUser);
      if (currentUser.username) setSubdomainInput(currentUser.username);
      fetchCloudUserSync();
    }
  }, [currentUser?.username, currentUser?.email]);

  // Sincronizar automaticamente quando a janela ganha foco ou muda de aba + polling suave
  useEffect(() => {
    const handleSync = () => {
      if (currentUser && (currentUser.email || currentUser.username)) {
        fetchCloudUserSync();
      }
    };
    window.addEventListener("focus", handleSync);
    document.addEventListener("visibilitychange", handleSync);
    const syncTimer = setInterval(handleSync, 10000); // Sincroniza em segundo plano a cada 10s entre dispositivos

    return () => {
      window.removeEventListener("focus", handleSync);
      document.removeEventListener("visibilitychange", handleSync);
      clearInterval(syncTimer);
    };
  }, [currentUser]);

  // Salvar automaticamente todas as alterações do usuário no localStorage e na nuvem
  useEffect(() => {
    if (!currentUser || !currentUser?.username) return;
    const userSetup = {
      growName, owner, strain,
      width, depth, height,
      potCount, potIdx, potShape, potFlipped, customPotW, customPotL, customPotH,
      gaugeIdx, spacing, cols, conn, recirculate,
      equip, perPot, watts, equipUrls, equipShopping, customItems,
      vegaHours, floraHours, vegaDays, floraDays, yieldPerPlant, priceG, tariff,
      costs, extraCost, monthlyCost,
      notes, instructions, terms,
      allPresets,
      dark
    };
    try {
      localStorage.setItem(`growcalc_user_setup_${currentUser?.username}`, JSON.stringify(userSetup));
    } catch (e) {}

    // Sincronizar na nuvem após debounce de 1 segundo
    const timer = setTimeout(() => {
      syncAllToCloud(userSetup, allPresets);
    }, 1200);
    return () => clearTimeout(timer);
  }, [
    currentUser, growName, owner, strain, width, depth, height,
    potCount, potIdx, potShape, potFlipped, customPotW, customPotL, customPotH,
    gaugeIdx, spacing, cols, conn, recirculate,
    equip, perPot, watts, equipUrls, equipShopping, customItems,
    vegaHours, floraHours, vegaDays, floraDays, yieldPerPlant, priceG, tariff,
    costs, extraCost, monthlyCost, notes, instructions, terms, allPresets, dark
  ]);

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
    equipList,
    watts,
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
    notes,
    instructions,
    terms,
    isGrowPublic,
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
    if (Array.isArray(data.equipList)) {
      setEquipList(data.equipList);
    } else if (data.equip && typeof data.equip === "object") {
      // Conversão retrocompatível de setups antigos
      const converted = [];
      EQUIPMENT.forEach((eq) => {
        const q = data.equip[eq.id] || 0;
        if (q > 0) {
          converted.push({
            id: "eq_" + eq.id + "_" + Date.now(),
            name: eq.name,
            qty: q,
            cost: (data.costs && data.costs[eq.id]) || eq.defCost,
            watts: (data.watts && data.watts[eq.id]) || eq.defW,
            hours: (data.watts && data.watts[eq.id] === 0) ? 0 : eq.hours,
            inShoppingList: !!(data.equipShopping && data.equipShopping[eq.id]),
            url: (data.equipUrls && data.equipUrls[eq.id]) || "",
            isCollapsed: true,
          });
        }
      });
      if (converted.length > 0) setEquipList(converted);
    }
    if (data.watts && typeof data.watts === "object") setWatts((prev) => ({ ...prev, ...data.watts }));
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
    if (typeof data.notes === "string") setNotes(data.notes);
    if (typeof data.instructions === "string") setInstructions(data.instructions);
    if (typeof data.terms === "string") setTerms(data.terms);
    if (typeof data.isGrowPublic === "boolean") setIsGrowPublic(data.isGrowPublic);
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
    spacing, cols, conn, recirculate, equipList, watts, vegaHours, floraHours, vegaDays, floraDays, cycleDays, yieldPerPlant, priceG,
    tariff, costs, extraCost, monthlyCost, notes, instructions, terms, isGrowPublic, dark
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
      showToast("Setup exportado em arquivo JSON!");
    } catch (err) {
      console.error("Erro ao exportar JSON", err);
      showToast("Erro ao exportar o arquivo JSON.");
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
            showToast("Setup importado com sucesso!");
          } else {
            showToast("Arquivo JSON inválido.");
          }
        }
      } catch (err) {
        console.error("Erro ao ler JSON", err);
        showToast("Erro ao ler o arquivo JSON.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const isCustomCalha = potIdx === POT_SIZES.length;
  const isCustomPot = potIdx >= POT_SIZES.length;
  const customLiters = Math.round(((customPotW * customPotL * customPotH) / 1000) * 10) / 10;
  const customDiameter = Math.round(Math.sqrt((customPotW * customPotL * 4) / Math.PI));

  const pot = isCustomCalha
    ? {
        label: `Calha ${customLiters} L (${customPotW}×${customPotL}×${customPotH} cm)`,
        liters: customLiters,
        widthCm: customPotW,
        depthCm: customPotL,
        heightCm: customPotH,
        diameter: customDiameter,
        shape: "calha",
        isCustom: true,
        isCalha: true,
      }
    : isCustomPot
    ? {
        label: potShape === "calha"
          ? `Calha ${customLiters} L (${customPotW}×${customPotL}×${customPotH} cm)`
          : `${customLiters} L (Custom)`,
        liters: customLiters,
        widthCm: customPotW,
        depthCm: customPotL,
        heightCm: customPotH,
        diameter: customDiameter,
        shape: potShape,
        isCustom: true,
        isCalha: potShape === "calha",
      }
    : (POT_SIZES[potIdx] || POT_SIZES[2]);

  const isCalha = pot.shape === "calha" || potShape === "calha" || isCustomCalha;
  const isRect = isCalha || pot.shape === "rect" || (pot.isCustom && pot.widthCm !== pot.depthCm && potShape !== "circle");
  const isSquare = !isCalha && !isRect && potShape === "square";
  const potW = isRect || isCalha ? (potFlipped ? (pot.depthCm || 40) : (pot.widthCm || 60)) : (pot.diameter || 26);
  const potD = isRect || isCalha ? (potFlipped ? (pot.widthCm || 60) : (pot.depthCm || 40)) : (pot.diameter || 26);
  const potH = pot.heightCm || Math.round(pot.diameter ? pot.diameter * 0.95 : 28);

  const potDesc = isCalha
    ? `Calha hidropônica ${potW}×${potD} cm (profundidade ${potH} cm)`
    : isRect
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
    if (!p) return;
    if (p.apply) {
      if (p.apply.width !== undefined) setWidth(p.apply.width);
      if (p.apply.depth !== undefined) setDepth(p.apply.depth);
      if (p.apply.height !== undefined) setHeight(p.apply.height);
      if (p.apply.potCount !== undefined) setPotCount(p.apply.potCount);
      if (p.apply.potIdx !== undefined) setPotIdx(p.apply.potIdx);
      if (p.apply.gaugeIdx !== undefined) setGaugeIdx(p.apply.gaugeIdx);
      if (p.apply.spacing !== undefined) setSpacing(p.apply.spacing);
      if (p.apply.cols !== undefined) setCols(p.apply.cols);
      if (p.apply.conn !== undefined) setConn(p.apply.conn);
      if (p.apply.recirculate !== undefined) setRecirculate(p.apply.recirculate);
      if (p.equip) setEquip({ ...p.equip });
      if (p.data) loadUserSetupFromData(p.data);
    } else if (p.data) {
      loadUserSetupFromData(p.data);
    } else {
      loadUserSetupFromData(p);
    }
  };

  // ————— Tema Tom sobre Tom (Duotone Sidebar) —————
  const T = dark
    ? {
        bg: "#141210", surface: "#1c1916", surface2: "#26221d", inset: "#110f0d",
        border: "#37322a", borderSoft: "#2a2620",
        text: "#ece5d8", muted: "#a89f90", faint: "#6e675c",
        brand: "#d97706", accentBg: "#2e2a23", accentBorder: "#57503f",
        sidebarBg: "#1c1916", sidebarBorder: "#37322a", sidebarText: "#ece5d8", sidebarActiveBg: "#29241f",
        pipe: "#c8bda4", pipeReturn: "#8a9a7b",
        potFill: "#3b422f", potStroke: "#76856a", potNum: "#cdd6bd",
        tank: "#3d4a4a", tankStroke: "#6b7d7d",
        pump: "#4a4f5c", pumpStroke: "#7d84a0",
      }
    : {
        bg: "#f7f4ed", surface: "#efebe2", surface2: "#e4dec6", inset: "#e9e3d3",
        border: "#d8cfbe", borderSoft: "#e2d9c8",
        text: "#292524", muted: "#78716c", faint: "#a89f8d",
        brand: "#b45309", accentBg: "#e4dec6", accentBorder: "#d8cfbe",
        sidebarBg: "#efebe2", sidebarBorder: "#d8cfbe", sidebarText: "#292524", sidebarActiveBg: "#e4dec6",
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
  const equipWatts = (equipList || []).reduce((s, it) => s + (Number(it.watts) || 0) * (Number(it.qty) || 1), 0);
  const equipKwhMonth = (equipList || []).reduce((s, it) => s + (((Number(it.watts) || 0) * (Number(it.hours) || 0) * (Number(it.qty) || 1) * 30) / 1000), 0);
  const ledWatts = Number(watts?.led) || 0;
  const totalWatts = ledWatts + equipWatts;
  const ledHours = cycleDays > 0 ? Math.round(((vegaHours * vegaDays) + (floraHours * floraDays)) / cycleDays) : 18;
  const ledKwhMonth = (ledWatts * ledHours * 30) / 1000;
  const kwhMonth = ledKwhMonth + equipKwhMonth;
  const ledPerM2 = areaM2 > 0 ? Math.round(ledWatts / areaM2) : 0;
  const airFlowNeeded = Math.ceil(volumeM3 * 60);
  const pipeTotal = plumbing.len + 60;
  const pipeMeters = Math.ceil((pipeTotal / 100) * 1.15);

  const harvestsYear = cycleDays > 0 ? 365 / cycleDays : 0;
  const yieldHarvest = plants * yieldPerPlant; // g
  const yieldYear = yieldHarvest * harvestsYear;
  const yieldM2 = areaM2 > 0 ? yieldHarvest / areaM2 : 0;
  const gPerW = totalWatts > 0 ? yieldHarvest / totalWatts : 0;

  // financeiro
  const materialRows = useMemo(() => {
    const baseRows = [
      { key: "pot", label: `Vasos ${pot.label} (${potDesc})`, qty: plants, unitLabel: "un", unitCost: costs.pot ?? 15, subtotal: (costs.pot ?? 15) * plants },
      { key: "pipeM", label: `Mangueira/tubo ${gauge.label} — ${connInfo.short}`, qty: pipeMeters, unitLabel: "m", unitCost: costs.pipeM ?? 4, subtotal: (costs.pipeM ?? 4) * pipeMeters },
      { key: "fitting", label: `Conexões ${gauge.label} (T, cotovelos, engates)`, qty: plumbing.fittings, unitLabel: "un", unitCost: costs.fitting ?? 3, subtotal: (costs.fitting ?? 3) * plumbing.fittings },
      { key: "reservoir", label: "Reservatório principal", qty: 1, unitLabel: `un (≥ ${reservoir} L)`, unitCost: costs.reservoir ?? 120, subtotal: costs.reservoir ?? 120 },
    ];
    const equipRows = (equipList || []).map((it) => ({
      key: it.id,
      equipId: it.id,
      label: `${it.name.trim() || "Equipamento"}${it.watts > 0 ? ` (${it.watts} W)` : ""}${it.hours > 0 ? ` · ${it.hours}h/dia` : ""}`,
      qty: it.qty || 1,
      unitLabel: "un",
      unitCost: it.cost || 0,
      subtotal: (it.cost || 0) * (it.qty || 1),
      url: it.url || "",
      inShoppingList: it.inShoppingList,
    }));
    return [...baseRows, ...equipRows];
  }, [pot, potDesc, plants, gauge, connInfo, pipeMeters, plumbing.fittings, reservoir, costs, equipList]);

  const shoppingListItems = useMemo(() => {
    return (equipList || [])
      .filter((it) => it.inShoppingList && (it.qty > 0))
      .map((it) => ({
        id: it.id,
        name: `${it.name.trim() || "Equipamento"}${it.watts > 0 ? ` (${it.watts} W)` : ""}`,
        qty: it.qty || 1,
        unitCost: it.cost || 0,
        subtotal: (it.cost || 0) * (it.qty || 1),
        url: it.url || "",
      }));
  }, [equipList]);

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
  if ((gauge.mm === 16 && plants > 4) || (gauge.mm === 20 && plants > 8) || (gauge.mm === 25 && plants > 16))
    alerts.push({ level: "mid", text: `Bitola ${gauge.label} pode limitar a vazão para ${plants} vasos — considere subir um degrau.` });
  if (ledWatts > 0 && ledPerM2 < 150)
    alerts.push({ level: "mid", text: `Luz em ${ledPerM2} W/m² — abaixo dos ~150 W/m² recomendados para flora.` });
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
  const showRes = true;

  const resItems = useMemo(() => {
    const items = [
      {
        id: "tk_0",
        label: `${reservoir} L`,
        w: 54,
        h: 32,
        type: "tank",
      },
    ];
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
    const isDark = Boolean(dark);
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
        const stroke = isRet ? (isDark ? "#9ca3af" : "#6b7280") : "#2563eb";
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
          <line x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}" stroke="${isDark ? '#f59e0b' : '#d97706'}" stroke-width="1.2" stroke-dasharray="3 2"/>
          <line x1="${c.tick1[0]}" y1="${c.tick1[1]}" x2="${c.tick1[2]}" y2="${c.tick1[3]}" stroke="${isDark ? '#f59e0b' : '#d97706'}" stroke-width="1.2"/>
          <line x1="${c.tick2[0]}" y1="${c.tick2[1]}" x2="${c.tick2[2]}" y2="${c.tick2[3]}" stroke="${isDark ? '#f59e0b' : '#d97706'}" stroke-width="1.2"/>
          <rect x="${rx}" y="${c.ty - 9}" width="36" height="12" rx="3" fill="${isDark ? '#1c1917' : '#ffffff'}" opacity="0.9"/>
          <text x="${c.tx}" y="${c.ty}" ${anchor} font-size="8.5" font-weight="700" fill="${isDark ? '#f59e0b' : '#b45309'}">${c.label}</text>
        </g>`;
      })
      .join("");

    const potFill = isDark ? "#292524" : "#dde3d0";
    const potStroke = isDark ? "#78716c" : "#7e8c6d";
    const potText = isDark ? "#f5f5f4" : "#3f4a33";

    const potsSvgReport = layout.grid
      .map((p, i) => {
        let potShapeSvg = "";
        if (isRect) {
          potShapeSvg = `<rect x="${px(p.x - potW / 2)}" y="${py(p.y - potD / 2)}" width="${potW * topScale}" height="${potD * topScale}" rx="5" fill="${potFill}" stroke="${potStroke}" stroke-width="1.5" />`;
        } else if (isSquare) {
          potShapeSvg = `<rect x="${px(p.x - potW / 2)}" y="${py(p.y - potD / 2)}" width="${potW * topScale}" height="${potD * topScale}" rx="4" fill="${potFill}" stroke="${potStroke}" stroke-width="1.5" />`;
        } else {
          potShapeSvg = `<circle cx="${px(p.x)}" cy="${py(p.y)}" r="${(potW / 2) * topScale}" fill="${potFill}" stroke="${potStroke}" stroke-width="1.5" />`;
        }
        return `<g>${potShapeSvg}<text x="${px(p.x)}" y="${py(p.y) + 3.5}" text-anchor="middle" font-size="10" font-weight="600" fill="${potText}">${i + 1}</text></g>`;
      })
      .join("");

    const dropLineSvgReport = plumbing.dropLine
      ? `<line x1="${px(plumbing.dropLine.a[0])}" y1="${py(plumbing.dropLine.a[1])}" x2="${px(plumbing.dropLine.b[0])}" y2="${py(plumbing.dropLine.b[1])}" stroke="#2563eb" stroke-width="${pipeWReport * 1.2}" stroke-linecap="round"/>`
      : "";

    const totalSvgH = showRes ? svgH : topH + OY * 2;
    const resSvgReport = showRes
      ? `<g>
          <text x="${OX}" y="${resY - 6}" font-size="9" fill="${isDark ? '#a8a29e' : '#6b6354'}" letter-spacing="0.1em">ZONA TÉCNICA</text>
          ${resItems
            .map(
              (it) => `
            <g>
              <rect x="${it.x}" y="${resY + (34 - it.h) / 2}" width="${it.w}" height="${it.h}" rx="6" fill="${isDark ? '#334155' : '#cbd5e1'}" stroke="${isDark ? '#64748b' : '#94a3b8'}" stroke-width="1.4"/>
              <text x="${it.x + it.w / 2}" y="${resY + 19}" text-anchor="middle" font-size="8.5" font-weight="600" fill="${isDark ? '#f8fafc' : '#0f172a'}">${esc(it.label)}</text>
            </g>`
            )
            .join("")}
        </g>`
      : "";

    const diagramSvgHtml = `<div style="background:${isDark ? '#141210' : '#f5f1e7'}; border-radius:12px; padding:14px 10px; text-align:center; margin:10px 0; border:1px solid ${isDark ? '#292524' : '#e2dccc'};">
      <svg width="${svgW}" height="${totalSvgH}" viewBox="0 0 ${svgW} ${totalSvgH}" style="width:100%; max-width:${svgW}px; height:auto; display:block; margin:0 auto;">
        <rect x="${OX}" y="${OY}" width="${topW}" height="${topH}" rx="10" fill="${isDark ? '#1c1917' : '#ffffff'}" stroke="${isDark ? '#57534e' : '#1f1b16'}" stroke-width="1.5"/>
        <text x="${OX + topW / 2}" y="${OY - 8}" text-anchor="middle" font-size="11" fill="${isDark ? '#a8a29e' : '#6b6354'}">${width} cm</text>
        <text x="${OX - 10}" y="${OY + topH / 2}" text-anchor="middle" font-size="11" fill="${isDark ? '#a8a29e' : '#6b6354'}" transform="rotate(-90, ${OX - 10}, ${OY + topH / 2})">${depth} cm</text>
        ${segsSvg}
        ${dropLineSvgReport}
        ${potsSvgReport}
        ${cotasSvg}
        ${resSvgReport}
      </svg>
      <div style="font-size:10.5px; color:${isDark ? '#a8a29e' : '#6b6354'}; margin-top:8px;">Planta baixa (${width} × ${depth} cm) · ${plants} vaso(s) de ${esc(pot.label)} (${esc(potDesc)})<br/>Afastamento paredes: E/D ${layout.wallLeft}/${layout.wallRight} cm, Sup/Inf ${layout.wallTop}/${layout.wallBottom} cm · Entre vasos: ${spacing} cm</div>
    </div>`;

    const presetMetrics = (Array.isArray(allPresets) && allPresets.length > 0)
      ? allPresets.map((p) => calculatePresetMetrics(p))
      : [];

    const comparisonReportHtml = presetMetrics.length > 0
      ? `<h2>8 · Comparativo entre Setups de Cultivo (Chips)</h2>
         <div style="background:${isDark ? '#292524' : '#f5f1e7'}; border-radius:12px; padding:12px 14px; margin-bottom:16px; border:1px solid ${isDark ? '#44403c' : '#e2dccc'};">
           <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">
             ${presetMetrics.map((m) => `
               <span style="display:inline-flex; align-items:center; gap:4px; padding:3px 10px; background:${isDark ? '#1c1917' : '#ffffff'}; border:1px solid ${isDark ? '#44403c' : '#d8cfbe'}; border-radius:16px; font-size:10px; font-weight:700; color:${isDark ? '#f5f5f4' : '#1f1b16'};">
                 <span>${esc(m.name)}</span>
                 <small style="color:${isDark ? '#a8a29e' : '#78716c'}; font-weight:500;">(${m.width}×${m.depth}cm · ${m.potCount}v)</small>
               </span>
             `).join("")}
           </div>
           <div style="overflow-x:auto;">
             <table style="width:100%; border-collapse:collapse; font-size:11px; text-align:left;">
               <thead>
                 <tr style="border-bottom:1.5px solid ${isDark ? '#44403c' : '#d8cfbe'}; color:${isDark ? '#a8a29e' : '#78716c'}; font-size:9.5px; text-transform:uppercase; letter-spacing:0.05em;">
                   <th style="padding:6px 6px;">Setup</th>
                   <th style="padding:6px 6px; text-align:right;">Invest. (CAPEX)</th>
                   <th style="padding:6px 6px; text-align:right;">OPEX / Mês</th>
                   <th style="padding:6px 6px; text-align:right;">Prod. Anual</th>
                   <th style="padding:6px 6px; text-align:right;">Custo / g</th>
                   <th style="padding:6px 6px; text-align:right;">Payback</th>
                 </tr>
               </thead>
               <tbody>
                 ${presetMetrics.map((m) => `
                   <tr style="border-bottom:1px dotted ${isDark ? '#44403c' : '#e2dccc'};">
                     <td style="padding:6px 6px; font-weight:700; color:${isDark ? '#f5f5f4' : '#1f1b16'};">
                       ${esc(m.name)}
                       <div style="font-size:9px; font-weight:400; color:${isDark ? '#a8a29e' : '#78716c'};">${m.width}×${m.depth}×${m.height} cm · ${m.potCount}× ${esc(m.potLabel)}</div>
                     </td>
                     <td style="padding:6px 6px; text-align:right; font-weight:600; color:${isDark ? '#38bdf8' : '#1f1b16'};">${fmtBRL(m.capex)}</td>
                     <td style="padding:6px 6px; text-align:right; color:${isDark ? '#f43f5e' : '#78716c'};">${fmtBRL(m.opexMonth)}</td>
                     <td style="padding:6px 6px; text-align:right; font-weight:600; color:${isDark ? '#34d399' : '#1f1b16'};">${fmtG(m.yieldYearG)}</td>
                     <td style="padding:6px 6px; text-align:right; font-weight:600; color:${isDark ? '#a3e635' : '#b45309'};">${fmtBRL(m.costPerGramOpex)}</td>
                     <td style="padding:6px 6px; text-align:right; font-weight:700; color:${isDark ? '#a78bfa' : '#1f1b16'};">${m.paybackMonths ? `${m.paybackMonths.toFixed(1)} m` : "—"}</td>
                   </tr>
                 `).join("")}
               </tbody>
             </table>
           </div>
         </div>`
      : "";

    const safeNotes = typeof notes === "string" ? notes.trim() : "";
    const safeInst = typeof instructions === "string" ? instructions.trim() : "";
    const safeTerms = typeof terms === "string" ? terms.trim() : "";

    const extraNotesHtml = (safeNotes || safeInst || safeTerms)
      ? `<h2>9 · Observações, instruções e termos</h2>
         <div style="background:${isDark ? '#292524' : '#f5f1e7'}; border-radius:12px; padding:12px 14px; margin-bottom:16px; font-size:11px; color:${isDark ? '#f5f5f4' : '#1f1b16'}; border:1px solid ${isDark ? '#44403c' : '#e2dccc'};">
           ${safeNotes ? `<div style="margin-bottom:10px;"><b style="display:block; text-transform:uppercase; font-size:9.5px; color:${isDark ? '#f59e0b' : '#6b6354'}; margin-bottom:3px; letter-spacing:0.05em;">Observações</b><div style="white-space:pre-wrap; line-height:1.4;">${esc(safeNotes)}</div></div>` : ""}
           ${safeInst ? `<div style="margin-bottom:10px;"><b style="display:block; text-transform:uppercase; font-size:9.5px; color:${isDark ? '#f59e0b' : '#6b6354'}; margin-bottom:3px; letter-spacing:0.05em;">Instruções de operação</b><div style="white-space:pre-wrap; line-height:1.4;">${esc(safeInst)}</div></div>` : ""}
           ${safeTerms ? `<div><b style="display:block; text-transform:uppercase; font-size:9.5px; color:${isDark ? '#f59e0b' : '#6b6354'}; margin-bottom:3px; letter-spacing:0.05em;">Termos & Condições</b><div style="white-space:pre-wrap; line-height:1.4;">${esc(safeTerms)}</div></div>` : ""}
         </div>`
      : "";

    const shoppingListHtml = (Array.isArray(shoppingListItems) && shoppingListItems.length > 0)
      ? `<h2>10 · Lista de compras & QR Codes</h2>
         <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:16px;">
           ${shoppingListItems.map((item) => {
             const itemUrl = typeof item?.url === "string" ? item.url.trim() : "";
             const qrImg = itemUrl
               ? `<img src="https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(itemUrl)}&size=200x200" alt="QR Code" style="width:108px; height:108px; max-width:100%; border-radius:8px; border:1px solid #e2e8f0; background:#ffffff; padding:4px;" />`
               : `<div style="width:108px; height:108px; max-width:100%; border-radius:8px; background:${isDark ? '#1c1917' : '#f1f5f9'}; border:1px solid ${isDark ? '#44403c' : '#e2e8f0'}; display:flex; align-items:center; justify-content:center; font-size:10px; color:#94a3b8; text-align:center;">Sem link</div>`;
             return `
               <div style="display:flex; align-items:center; justify-content:space-between; gap:14px; background:${isDark ? '#292524' : '#f5f1e7'}; border-radius:12px; padding:12px 14px; border:1px solid ${isDark ? '#44403c' : '#e2dccc'};">
                 <div style="width:50%; min-width:0;">
                   <b style="font-size:12px; color:${isDark ? '#f5f5f4' : '#1f1b16'}; display:block; margin-bottom:4px; line-height:1.3;">${esc(item.name)}</b>
                   <div style="font-size:10.5px; color:${isDark ? '#a8a29e' : '#6b6354'}; line-height:1.5;">
                     <div>Qtd: <b style="color:${isDark ? '#f5f5f4' : '#1f1b16'};">${item.qty} un</b></div>
                     <div>Unit.: <b>${fmtBRL(item.unitCost)}</b></div>
                     <div style="margin-top:2px;">Subtotal: <b style="font-size:11.5px; color:${isDark ? '#38bdf8' : '#1f1b16'};">${fmtBRL(item.subtotal)}</b></div>
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

    const logoSvg = getLogoSvgString(34, isDark ? "#f59e0b" : "#1f1b16");

    const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório — ${esc(growName || "GrowinStones")}</title>
<link href="https://fonts.googleapis.com/css2?family=Berkshire+Swash&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: 108mm 192mm; margin: 9mm; }
  * { box-sizing: border-box; }
  body { 
    font-family: Inter, system-ui, sans-serif; 
    color: ${isDark ? '#f5f5f4' : '#1f1b16'}; 
    margin: 0; 
    background: ${isDark ? '#0c0a09' : '#f5f1e7'}; 
    -webkit-print-color-adjust: exact; 
    print-color-adjust: exact; 
  }
  .toolbar { 
    position: sticky; 
    top: 0; 
    background: ${isDark ? '#1c1917' : '#f5f1e7'}; 
    border-bottom: 1px solid ${isDark ? '#292524' : '#e2dccc'}; 
    padding: 10px; 
    text-align: center; 
  }
  .toolbar button { 
    padding: 9px 20px; 
    border-radius: 10px; 
    border: none; 
    background: ${isDark ? '#0284c7' : '#1f1b16'}; 
    color: #ffffff; 
    font: 700 13px Inter; 
    cursor: pointer; 
  }
  .toolbar span { display: block; font-size: 11px; color: ${isDark ? '#a8a29e' : '#6b6354'}; margin-top: 6px; }
  .page { 
    max-width: 430px; 
    margin: 18px auto; 
    padding: 26px 24px; 
    background: ${isDark ? '#1c1917' : '#ffffff'}; 
    border: 1px solid ${isDark ? '#292524' : '#e2dccc'}; 
    border-radius: ${isDark ? '16px' : '0'}; 
  }
  .hd { border-bottom: 2px solid ${isDark ? '#292524' : '#1f1b16'}; padding-bottom: 14px; margin-bottom: 18px; }
  .hd .row { display: flex; align-items: center; gap: 10px; }
  .brand { font-family: 'Berkshire Swash', cursive; letter-spacing: -1px; font-size: 23px; line-height: 1; }
  .tag { font-size: 9px; text-transform: uppercase; letter-spacing: .18em; color: ${isDark ? '#a8a29e' : '#a39a87'}; margin-top: 3px; }
  .meta { margin-top: 10px; font-size: 11.5px; color: ${isDark ? '#a8a29e' : '#6b6354'}; }
  .meta b { font-size: 15px; color: ${isDark ? '#f5f5f4' : '#1f1b16'}; display: block; }
  .hl { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 22px; }
  .hl div { 
    background: ${isDark ? '#292524' : '#f5f1e7'}; 
    border: 1px solid ${isDark ? '#44403c' : 'transparent'}; 
    border-radius: 12px; 
    padding: 12px 14px; 
  }
  .hl b { font-size: 17px; font-weight: 800; display: block; color: ${isDark ? '#38bdf8' : '#1f1b16'}; }
  .hl small { font-size: 10.5px; color: ${isDark ? '#a8a29e' : '#6b6354'}; }
  h2 { 
    font-size: 12px; 
    text-transform: uppercase; 
    letter-spacing: .16em; 
    color: ${isDark ? '#f59e0b' : '#a39a87'}; 
    border-bottom: 1px solid ${isDark ? '#292524' : '#e2dccc'}; 
    padding-bottom: 6px; 
    margin: 26px 0 12px; 
    font-weight: 600; 
  }
  .kv { display: flex; justify-content: space-between; gap: 16px; padding: 5px 0; border-bottom: 1px dotted ${isDark ? '#292524' : '#e2dccc'}; font-size: 12.5px; }
  .kv span { color: ${isDark ? '#a8a29e' : '#6b6354'}; } 
  .kv b { font-weight: 600; text-align: right; color: ${isDark ? '#f5f5f4' : '#1f1b16'}; } 
  .kv.st b { font-weight: 800; color: ${isDark ? '#f59e0b' : '#1f1b16'}; }
  .mh, .mr { display: flex; gap: 4px; align-items: baseline; font-size: 11px; padding: 4px 0; border-bottom: 1px dotted ${isDark ? '#292524' : '#e2dccc'}; }
  .mh { text-transform: uppercase; letter-spacing: .08em; color: ${isDark ? '#a8a29e' : '#a39a87'}; font-size: 10px; }
  .ml { flex: 1; color: ${isDark ? '#e7e5e4' : '#6b6354'}; } 
  .mq { width: 40px; text-align: right; color: ${isDark ? '#a8a29e' : '#6b6354'}; } 
  .mu { width: 64px; text-align: right; color: ${isDark ? '#a8a29e' : '#6b6354'}; } 
  .ms { width: 74px; text-align: right; font-weight: 600; color: ${isDark ? '#f5f5f4' : '#1f1b16'}; }
  .tot { display: flex; justify-content: space-between; margin-top: 10px; font-size: 15px; font-weight: 800; color: ${isDark ? '#38bdf8' : '#1f1b16'}; }
  .sub { font-size: 11.5px; color: ${isDark ? '#a8a29e' : '#6b6354'}; margin-top: 2px; }
  .al { font-size: 12.5px; padding: 4px 8px; border-radius: 6px; margin-bottom: 4px; } 
  .al.hi { background: ${isDark ? 'rgba(239,68,68,0.15)' : '#fef2f2'}; color: ${isDark ? '#f87171' : '#8c3b3b'}; border: 1px solid ${isDark ? 'rgba(239,68,68,0.3)' : '#fecaca'}; } 
  .al.mid { background: ${isDark ? 'rgba(245,158,11,0.15)' : '#fffbeb'}; color: ${isDark ? '#fbbf24' : '#8a6a2a'}; border: 1px solid ${isDark ? 'rgba(245,158,11,0.3)' : '#fde68a'}; } 
  .al.low { background: ${isDark ? 'rgba(16,185,129,0.15)' : '#f0fdf4'}; color: ${isDark ? '#34d399' : '#2d6a4f'}; border: 1px solid ${isDark ? 'rgba(16,185,129,0.3)' : '#bbf7d0'}; }
  .note { font-size: 12.5px; color: ${isDark ? '#a8a29e' : '#6b6354'}; }
  .ft { font-size: 10.5px; color: ${isDark ? '#78716c' : '#a39a87'}; border-top: 1px solid ${isDark ? '#292524' : '#e2dccc'}; padding-top: 10px; margin-top: 20px; }
  @media print { 
    .toolbar { display: none; } 
    body { background: ${isDark ? '#0c0a09' : '#ffffff'}; } 
    .page { margin: 0; max-width: none; padding: 0; border: none; } 
  }
</style></head><body>
<div class="toolbar">
  <button onclick="window.print()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;margin-right:6px"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>Salvar como PDF (9:16)</button>
  <span>Se o diálogo não abrir sozinho, clique no botão acima e escolha “Salvar como PDF”.</span>
</div>
<div class="page">
  <div class="hd">
    <div class="row" style="display:flex; align-items:center; gap:12px;">
      ${logoSvg}
      <div class="tag" style="font-size:9.5px; text-transform:uppercase; letter-spacing:0.18em; color:${isDark ? '#a8a29e' : '#78716c'}; border-left:1px solid ${isDark ? '#44403c' : '#d6d3d1'}; padding-left:10px;">Relatório de projeto hidropônico</div>
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
  ${comparisonReportHtml}
  ${extraNotesHtml}
  ${shoppingListHtml}
  <p class="ft">Documento gerado pelo GrowinStones em ${today}. Valores estimados para planejamento — produtividade, preços e consumo variam com genética, manejo, fase do cultivo e tarifas locais. Não constitui aconselhamento financeiro.</p>
</div>
<script>${isStandalonePage ? "" : 'window.addEventListener("load", () => setTimeout(() => { try { window.print(); } catch (e) {} }, 500));'}</script>
</body></html>`;

    return html;
  };

  const generateWebDashboardHtmlString = (slug = "") => {
    const isDark = Boolean(dark);
    const safeNotes = typeof notes === "string" ? notes.trim() : "";
    const safeInst = typeof instructions === "string" ? instructions.trim() : "";
    const safeTerms = typeof terms === "string" ? terms.trim() : "";
    const displaySlug = slug || subdomainInput || (currentUser?.username) || "grow";

    // Retrieve user profile information
    const userDisplayName = currentUser?.name || owner || "Cultivador GrowinStones";
    const userHandle = currentUser?.username || displaySlug || "grower";
    const userBio = currentUser?.bio || "Cultivador apaixonado por hidroponia, automação e genéticas de alta performance.";
    const userLocation = currentUser?.location || "Brasil";
    const userStrainFocus = currentUser?.strainFocus || strain || "DWC & Living Soil";
    const userAvatarUrl = currentUser?.avatarUrl || "";
    const userBannerUrl = currentUser?.bannerUrl || "";

    // Retrieve user posts from localStorage
    let userPosts = [];
    try {
      const postsKey = `growcalc_posts_${currentUser?.username || displaySlug || "default"}`;
      const savedPosts = localStorage.getItem(postsKey);
      if (savedPosts) userPosts = JSON.parse(savedPosts);
    } catch (e) {}

    if (!userPosts || !Array.isArray(userPosts) || userPosts.length === 0) {
      userPosts = [
        {
          id: "post_sub_1",
          author: {
            name: userDisplayName,
            username: userHandle,
            avatarUrl: userAvatarUrl
          },
          createdAt: new Date().toISOString(),
          text: `Setup oficial do grow "${growName || "GrowinStones"}" publicado e online! Sistema configurado com ${plants} vasos de ${pot.label} (${esc(potDesc)}), iluminação LED de ${ledWatts > 0 ? `${ledWatts}W` : "alta eficiência"} e telemetria 24/7 conectada.`,
          stage: "Setup & Automação",
          images: [],
          videos: [],
          likes: 28,
          comments: [
            { id: "c1", author: "Comunidade GrowinStones", text: "Parabéns pelo projeto! Excelente dimensionamento hidráulico.", time: "recente" }
          ]
        }
      ];
    }

    const presetMetrics = (Array.isArray(allPresets) && allPresets.length > 0)
      ? allPresets.map((p) => calculatePresetMetrics(p))
      : [];

    const webComparisonHtml = presetMetrics.length > 0
      ? `<div class="sec-card">
          <h2 class="sec-title">Comparativo de Setups & Presets Selecionados</h2>
          <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:18px;">
            ${presetMetrics.map((m) => `
              <span style="display:inline-flex; align-items:center; gap:6px; padding:6px 14px; background:${isDark ? '#292524' : '#f5f1e7'}; border:1px solid ${isDark ? '#44403c' : '#d8cfbe'}; border-radius:20px; font-size:12px; font-weight:700; color:${isDark ? '#f5f5f4' : '#1f1b16'};">
                <span style="width:6px; height:6px; border-radius:50%; background:${isDark ? '#f59e0b' : '#b45309'};"></span>
                <span>${esc(m.name)}</span>
                <span style="font-size:11px; color:${isDark ? '#a8a29e' : '#78716c'}; font-weight:400;">(${m.width}×${m.depth}cm · ${m.potCount} vasos)</span>
              </span>
            `).join("")}
          </div>
          <div style="overflow-x:auto;">
            <table>
              <thead>
                <tr>
                  <th>Setup</th>
                  <th style="text-align:right;">Investimento (CAPEX)</th>
                  <th style="text-align:right;">OPEX / Mês</th>
                  <th style="text-align:right;">Produção / Ano</th>
                  <th style="text-align:right;">Receita / Ano</th>
                  <th style="text-align:right;">Custo / Grama</th>
                  <th style="text-align:right;">Payback</th>
                </tr>
              </thead>
              <tbody>
                ${presetMetrics.map((m) => `
                  <tr>
                    <td>
                      <b style="color:${isDark ? '#ffffff' : '#1f1b16'}; font-size:13.5px;">${esc(m.name)}</b>
                      <div style="font-size:11px; color:${isDark ? '#a8a29e' : '#78716c'};">${m.width}×${m.depth}×${m.height} cm · ${m.potCount}× ${esc(m.potLabel)}</div>
                    </td>
                    <td style="text-align:right; font-weight:700; color:${isDark ? '#38bdf8' : '#0284c7'};">${fmtBRL(m.capex)}</td>
                    <td style="text-align:right; color:#f43f5e;">${fmtBRL(m.opexMonth)}</td>
                    <td style="text-align:right; font-weight:700; color:${isDark ? '#34d399' : '#059669'};">${fmtG(m.yieldYearG)}</td>
                    <td style="text-align:right; font-weight:700; color:${isDark ? '#f59e0b' : '#b45309'};">${m.priceG > 0 ? fmtBRL(m.revYear) : "—"}</td>
                    <td style="text-align:right; font-weight:700; color:${isDark ? '#a3e635' : '#15803d'};">${fmtBRL(m.costPerGramOpex)}</td>
                    <td style="text-align:right; font-weight:700; color:${isDark ? '#a78bfa' : '#7c3aed'};">${m.paybackMonths ? `${m.paybackMonths.toFixed(1)} m` : "—"}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>`
      : "";

    const rowsHtml = materialRows
      .map((r) => `<tr>
        <td style="padding:10px 14px; font-weight:600; color:${isDark ? '#e7e5e4' : '#1f1b16'};">${esc(r.label)}</td>
        <td style="padding:10px 14px; text-align:right; color:${isDark ? '#a8a29e' : '#6b6354'};">${r.qty} un</td>
        <td style="padding:10px 14px; text-align:right; color:${isDark ? '#a8a29e' : '#6b6354'};">${fmtBRL(r.unitCost)}</td>
        <td style="padding:10px 14px; text-align:right; font-weight:700; color:${isDark ? '#f5f5f4' : '#1f1b16'};">${fmtBRL(r.subtotal)}</td>
      </tr>`)
      .join("");

    const pipeWReport = Math.max(2, gauge.mm * topScale * 0.1 + 1.2);
    const segsSvg = plumbing.segs
      .map((s) => {
        const x1 = px(s.a[0]), y1 = py(s.a[1]), x2 = px(s.b[0]), y2 = py(s.b[1]);
        const isRet = s.kind === "return";
        const isBr = s.kind === "branch";
        const stroke = isRet ? (isDark ? "#9ca3af" : "#6b7280") : "#2563eb";
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
          <line x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}" stroke="${isDark ? '#f59e0b' : '#d97706'}" stroke-width="1.2" stroke-dasharray="3 2"/>
          <line x1="${c.tick1[0]}" y1="${c.tick1[1]}" x2="${c.tick1[2]}" y2="${c.tick1[3]}" stroke="${isDark ? '#f59e0b' : '#d97706'}" stroke-width="1.2"/>
          <line x1="${c.tick2[0]}" y1="${c.tick2[1]}" x2="${c.tick2[2]}" y2="${c.tick2[3]}" stroke="${isDark ? '#f59e0b' : '#d97706'}" stroke-width="1.2"/>
          <rect x="${rx}" y="${c.ty - 9}" width="36" height="12" rx="3" fill="${isDark ? '#1c1917' : '#ffffff'}" opacity="0.9"/>
          <text x="${c.tx}" y="${c.ty}" ${anchor} font-size="8.5" font-weight="700" fill="${isDark ? '#f59e0b' : '#b45309'}">${c.label}</text>
        </g>`;
      })
      .join("");

    const potFill = isDark ? "#292524" : "#dde3d0";
    const potStroke = isDark ? "#78716c" : "#7e8c6d";
    const potText = isDark ? "#f5f5f4" : "#3f4a33";

    const potsSvgReport = layout.grid
      .map((p, i) => {
        let potShapeSvg = "";
        if (isRect) {
          potShapeSvg = `<rect x="${px(p.x - potW / 2)}" y="${py(p.y - potD / 2)}" width="${potW * topScale}" height="${potD * topScale}" rx="5" fill="${potFill}" stroke="${potStroke}" stroke-width="1.5" />`;
        } else if (isSquare) {
          potShapeSvg = `<rect x="${px(p.x - potW / 2)}" y="${py(p.y - potD / 2)}" width="${potW * topScale}" height="${potD * topScale}" rx="4" fill="${potFill}" stroke="${potStroke}" stroke-width="1.5" />`;
        } else {
          potShapeSvg = `<circle cx="${px(p.x)}" cy="${py(p.y)}" r="${(potW / 2) * topScale}" fill="${potFill}" stroke="${potStroke}" stroke-width="1.5" />`;
        }
        return `<g>${potShapeSvg}<text x="${px(p.x)}" y="${py(p.y) + 3.5}" text-anchor="middle" font-size="10" font-weight="600" fill="${potText}">${i + 1}</text></g>`;
      })
      .join("");

    const dropLineSvgReport = plumbing.dropLine
      ? `<line x1="${px(plumbing.dropLine.a[0])}" y1="${py(plumbing.dropLine.a[1])}" x2="${px(plumbing.dropLine.b[0])}" y2="${py(plumbing.dropLine.b[1])}" stroke="#2563eb" stroke-width="${pipeWReport * 1.2}" stroke-linecap="round"/>`
      : "";

    const totalSvgH = showRes ? svgH : topH + OY * 2;
    const resSvgReport = showRes
      ? `<g>
          <text x="${OX}" y="${resY - 6}" font-size="9" fill="${isDark ? '#a8a29e' : '#6b6354'}" letter-spacing="0.1em">ZONA TÉCNICA</text>
          ${resItems
            .map(
              (it) => `
            <g>
              <rect x="${it.x}" y="${resY + (34 - it.h) / 2}" width="${it.w}" height="${it.h}" rx="6" fill="${isDark ? '#334155' : '#cbd5e1'}" stroke="${isDark ? '#64748b' : '#94a3b8'}" stroke-width="1.4"/>
              <text x="${it.x + it.w / 2}" y="${resY + 19}" text-anchor="middle" font-size="8.5" font-weight="600" fill="${isDark ? '#f8fafc' : '#0f172a'}">${esc(it.label)}</text>
            </g>`
            )
            .join("")}
        </g>`
      : "";

    const logoSvg = getLogoSvgString(32, "#f59e0b");

    // Posts Feed HTML
    const postsFeedHtml = userPosts.map((p) => {
      const pAuthor = userDisplayName;
      const pUser = userHandle;
      const pAvatar = userAvatarUrl;
      const pDate = p.createdAt ? new Date(p.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : today;
      const pStage = p.stage || "";

      return `
        <div class="post-card">
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
            <div style="width:44px; height:44px; min-width:44px; min-height:44px; max-width:44px; max-height:44px; aspect-ratio:1/1; flex-shrink:0; border-radius:50%; overflow:hidden; background:${isDark ? '#292524' : '#e2dccc'}; border:1px solid ${isDark ? '#44403c' : '#d8cfbe'}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:15px; color:${isDark ? '#f59e0b' : '#b45309'}; position:relative;">
              <img src="${pAvatar || ''}" alt="Avatar" style="width:100%; height:100%; aspect-ratio:1/1; object-fit:cover; display:${pAvatar ? 'block' : 'none'}; border-radius:50%;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
              <span style="display:${pAvatar ? 'none' : 'flex'}; align-items:center; justify-content:center; width:100%; height:100%;">${esc(pAuthor ? pAuthor.charAt(0).toUpperCase() : 'G')}</span>
            </div>
            <div>
              <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <b style="font-size:14.5px; color:${isDark ? '#ffffff' : '#1f1b16'};">${esc(pAuthor)}</b>
                <span style="font-size:12px; font-family:monospace; color:${isDark ? '#a8a29e' : '#6b6354'};">@${esc(pUser)}</span>
                <span style="font-size:11px; color:${isDark ? '#78716c' : '#a39a87'};">· ${pDate}</span>
              </div>
              ${pStage ? `<span style="display:inline-block; margin-top:3px; font-size:10.5px; font-weight:700; padding:2px 8px; border-radius:12px; background:${isDark ? 'rgba(245,158,11,0.15)' : '#fef3c7'}; color:${isDark ? '#f59e0b' : '#b45309'};">${esc(pStage)}</span>` : ""}
            </div>
          </div>

          <div class="obsidian-rendered-post" style="font-size:14px; line-height:1.6; color:${isDark ? '#f5f5f4' : '#1f1b16'}; margin-bottom:14px;">
            ${parseObsidianMarkdown(p.text, isDark)}
          </div>

          ${p.images && p.images.length > 0 ? `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:10px; border-radius:14px; overflow:hidden; margin-bottom:14px;">
              ${p.images.map((img) => `<img src="${img}" alt="Mídia de Cultivo" onclick="openLightbox('${img}')" style="width:100%; max-height:360px; object-fit:cover; border-radius:12px; border:1px solid ${isDark ? '#292524' : '#e2dccc'}; cursor:zoom-in;" onerror="this.parentElement.style.display='none';" title="Clique para ver a foto em tamanho real 100%" />`).join("")}
            </div>
          ` : ""}

          ${p.videos && p.videos.length > 0 ? `
            <div style="border-radius:14px; overflow:hidden; margin-bottom:14px; background:#000;">
              ${p.videos.map((vid) => `<video src="${vid}" controls playsinline style="width:100%; max-height:360px; border-radius:12px; display:block;"></video>`).join("")}
            </div>
          ` : ""}

          <div style="display:flex; align-items:center; justify-content:space-between; padding-top:10px; border-top:1px solid ${isDark ? '#292524' : '#e2dccc'}; font-size:12px; color:${isDark ? '#a8a29e' : '#6b6354'};">
            <div style="display:flex; align-items:center; gap:5px; font-weight:700; color:${p.liked ? '#f43f5e' : (isDark ? '#a8a29e' : '#6b6354')};">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="${p.liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              <span>${p.likes || 0} curtidas</span>
            </div>
            <div>${p.comments?.length || 0} comentários</div>
          </div>
        </div>
      `;
    }).join("");

    return `<!DOCTYPE html>
<html lang="pt-BR" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>${esc(userDisplayName)} (@${esc(userHandle)}) — GrowinStones</title>
<link href="https://fonts.googleapis.com/css2?family=Berkshire+Swash&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    min-height: 100vh;
    min-height: 100dvh;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    background: #0c0a09;
    color: #f5f5f4;
  }
  header { 
    background: #1c1917; 
    border-bottom: 1px solid #292524; 
    position: sticky; 
    top: 0; 
    z-index: 50; 
  }
  .header-in { max-width: 1080px; margin: 0 auto; padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .badge-live { 
    display: inline-flex; 
    align-items: center; 
    gap: 6px; 
    padding: 5px 12px; 
    background: rgba(16,185,129,0.15); 
    border: 1px solid #10b981; 
    color: #34d399; 
    font-size: 12px; 
    font-weight: 700; 
    border-radius: 20px; 
    text-decoration: none; 
  }
  .badge-live::before { content: ""; width: 7px; height: 7px; background: #10b981; border-radius: 50%; display: inline-block; box-shadow: 0 0 8px #10b981; }
  
  .container { max-width: 1080px; margin: 20px auto; padding: 0 20px 60px; }

  .profile-card {
    background: #1c1917;
    border: 1px solid #292524;
    border-radius: 20px;
    overflow: hidden;
    margin-bottom: 20px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
  }

  .profile-banner {
    height: 180px;
    width: 100%;
    position: relative;
    overflow: hidden;
    background: #292524;
  }

  .profile-content {
    padding: 0 24px 22px;
    position: relative;
  }

  .tabs-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid #292524;
    margin-bottom: 20px;
    padding-bottom: 2px;
    overflow-x: auto;
  }
  .tab-btn {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 10px 18px;
    font-family: inherit;
    font-size: 13.5px;
    font-weight: 700;
    color: #a8a29e;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .tab-btn:hover { color: #f5f5f4; }
  .tab-btn.active {
    color: #f59e0b;
    border-bottom-color: #f59e0b;
  }

  .tab-content { display: none; }
  .tab-content.active { display: block; }

  .hero-card { 
    background: linear-gradient(135deg, #1c1917 0%, #292524 100%); 
    border: 1px solid #44403c; 
    border-radius: 20px; 
    padding: 24px; 
    margin-bottom: 20px; 
    box-shadow: 0 10px 25px rgba(0,0,0,0.25); 
  }
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 20px; }
  .kpi-card { 
    background: #1c1917; 
    border: 1px solid #292524; 
    border-radius: 16px; 
    padding: 18px; 
  }
  .kpi-val { font-size: 22px; font-weight: 800; margin: 4px 0 2px; }
  .kpi-lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #a8a29e; }
  
  .sec-card { 
    background: #1c1917; 
    border: 1px solid #292524; 
    border-radius: 18px; 
    padding: 22px; 
    margin-bottom: 20px; 
  }
  .sec-title { 
    font-size: 14px; 
    font-weight: 700; 
    text-transform: uppercase; 
    letter-spacing: 0.1em; 
    color: #f59e0b; 
    border-bottom: 1px solid #292524; 
    padding-bottom: 10px; 
    margin-top: 0; 
    margin-bottom: 16px; 
  }
  .kv-row { display: flex; justify-content: space-between; gap: 16px; padding: 9px 0; border-bottom: 1px solid #292524; font-size: 13px; }
  .kv-row span { color: #a8a29e; } 
  .kv-row b { font-weight: 600; color: #f5f5f4; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
  th { text-align: left; padding: 10px 12px; border-bottom: 2px solid #292524; color: #a8a29e; font-size: 11px; text-transform: uppercase; }
  td { padding: 10px 12px; border-bottom: 1px solid #292524; color: #e7e5e4; }
  
  .post-card {
    background: #1c1917;
    border: 1px solid #292524;
    border-radius: 18px;
    padding: 20px;
    margin-bottom: 16px;
    box-shadow: 0 4px 14px rgba(0,0,0,0.15);
  }

  .footer { text-align: center; font-size: 12px; color: #78716c; margin-top: 40px; }

  /* RESPONSIVE MOBILE */
  @media (max-width: 768px) {
    .container { padding: 0 16px 40px; margin: 16px auto; }
    .header-in { padding: 12px 16px; }
    .kpi-grid { grid-template-columns: 1fr; }
    .profile-card { margin-bottom: 16px; border-radius: 18px; }
    .profile-banner { height: 160px; }
    .profile-content { padding: 0 16px 18px; }
    .sec-card, .post-card, .hero-card { border-radius: 16px; padding: 16px; }
  }
</style>
</head>
<body>
<header>
  <div class="header-in">
    <div style="display:flex; align-items:center; gap:12px;">
      <a href="https://grow.thegrowinstones.com" style="display:inline-flex; align-items:center; text-decoration:none;" title="GrowinStones App">
        ${logoSvg}
      </a>
      <span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.14em; color:#a8a29e; border-left:1px solid #44403c; padding-left:10px;">Perfil do Cultivador</span>
    </div>
  </div>
</header>

<div class="container">
  <!-- CARD PRINCIPAL: PERFIL DO CULTIVADOR -->
  <div class="profile-card">
    <!-- FOTO DE CAPA -->
    <div class="profile-banner">
      <img id="user-banner-img" src="${userBannerUrl || ''}" alt="Capa do Perfil" style="width:100%; height:100%; object-fit:cover; display:${userBannerUrl ? 'block' : 'none'};" onerror="this.style.display='none'; document.getElementById('user-banner-placeholder').style.display='block';" />
      <div id="user-banner-placeholder" style="display:${userBannerUrl ? 'none' : 'block'}; width:100%; height:100%; background:linear-gradient(135deg, #1c1917 0%, #292524 50%, #44403c 100%);"></div>
    </div>

    <div class="profile-content">
      <!-- AVATAR & BADGES -->
      <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:16px; margin-top:-50px; margin-bottom:14px;">
        <div style="width:100px; height:100px; min-width:100px; min-height:100px; max-width:100px; max-height:100px; aspect-ratio:1/1; flex-shrink:0; border-radius:50%; overflow:hidden; border:4px solid #1c1917; background:#292524; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:32px; color:#f59e0b; box-shadow:0 10px 25px rgba(0,0,0,0.3); position:relative;">
          <img id="user-avatar-img" src="${userAvatarUrl || ''}" alt="Avatar" style="width:100%; height:100%; aspect-ratio:1/1; object-fit:cover; display:${userAvatarUrl ? 'block' : 'none'}; border-radius:50%;" onerror="this.style.display='none'; document.getElementById('user-avatar-text').style.display='flex';" />
          <span id="user-avatar-text" style="display:${userAvatarUrl ? 'none' : 'flex'}; align-items:center; justify-content:center; width:100%; height:100%;">${esc(userDisplayName ? userDisplayName.charAt(0).toUpperCase() : 'G')}</span>
        </div>

        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span class="badge-live">Cultivador Pro</span>
          ${isGrowPublic ? `
            <span style="display:inline-flex; align-items:center; gap:5px; padding:5px 12px; border-radius:20px; font-size:11.5px; font-weight:700; background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid #f59e0b;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-9"/><path d="M12 13a6 6 0 0 1 6-6c0 6-6 6-6 6z"/><path d="M12 13a6 6 0 0 0-6-6c0 6 6 6 6 6z"/></svg>
              <span>Projeto Público</span>
            </span>
          ` : `
            <span style="display:inline-flex; align-items:center; gap:5px; padding:5px 12px; border-radius:20px; font-size:11.5px; font-weight:700; background:rgba(255,255,255,0.06); color:#a8a29e; border:1px solid #44403c;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              <span>Projeto Privado</span>
            </span>
          `}
        </div>
      </div>

      <div style="flex:1;">
        <h1 id="user-name-title" style="font-size:22px; font-weight:800; margin:0 0 2px; color:#ffffff;">${esc(userDisplayName)}</h1>
        <div id="user-handle-subtitle" style="font-size:12.5px; font-family:monospace; font-weight:600; color:#f59e0b; margin-bottom:12px;">@${esc(userHandle)}</div>
        <p id="user-bio-text" style="font-size:13.5px; line-height:1.6; margin:0 0 16px; color:#f5f5f4; max-width:700px;">${esc(userBio)}</p>
      </div>

      <div style="display:flex; flex-wrap:wrap; gap:16px; font-size:12px; color:#a8a29e; padding-top:14px; border-top:1px solid #292524; margin-top:auto;">
        <div>Localização: <b id="user-location-text" style="color:#f5f5f4;">${esc(userLocation)}</b></div>
        <div>Foco: <b id="user-strain-text" style="color:#f59e0b;">${esc(userStrainFocus)}</b></div>
        <div>Publicações: <b id="user-posts-count" style="color:#f5f5f4;">${userPosts.length}</b></div>
        <div>Automação: <b style="color:#10b981;">Online 24/7</b></div>
      </div>
    </div>
  </div>

  <!-- NAVEGAÇÃO POR ABAS -->
  <div class="tabs-bar">
    <button class="tab-btn active" id="tab-btn-posts" onclick="switchTab('posts')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span>Publicações & Diário</span>
    </button>
    ${isGrowPublic ? `
      <button class="tab-btn" id="tab-btn-grow" onclick="switchTab('grow')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-9"/><path d="M12 13a6 6 0 0 1 6-6c0 6-6 6-6 6z"/><path d="M12 13a6 6 0 0 0-6-6c0 6 6 6 6 6z"/></svg>
        <span>Projeto do Grow</span>
      </button>
    ` : ""}
    <button class="tab-btn" id="tab-btn-about" onclick="switchTab('about')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <span>Sobre o Cultivador</span>
    </button>
  </div>

  <!-- ABA 1: PUBLICAÇÕES & DIÁRIO DE CULTIVO -->
  <div id="tab-content-posts" class="tab-content active">
    <div id="posts-feed-container">
      ${postsFeedHtml}
    </div>
  </div>

  <!-- ABA 2: PROJETO DO GROW (SE PÚBLICO) -->
  ${isGrowPublic ? `
  <div id="tab-content-grow" class="tab-content">
    <div class="hero-card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
        <div>
          <h2 style="font-size:24px; font-weight:800; margin:0 0 6px; color:#ffffff;">${esc(growName || "Projeto do Grow")}</h2>
          <div style="font-size:13px; color:#a8a29e;">
            ${owner ? `Responsável: <b style="color:#f5f5f4;">${esc(owner)}</b> · ` : ""}Genética: <b style="color:#f5f5f4;">${esc(strain || "Não informada")}</b> · Atualizado em ${today}
          </div>
        </div>
        <button onclick="window.print()" style="background:#0284c7; color:#ffffff; border:none; padding:10px 18px; border-radius:12px; font:700 13px Inter; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          <span>Exportar PDF</span>
        </button>
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

    ${webComparisonHtml}

    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:20px; margin-bottom:20px;">
      <div class="sec-card">
        <h2 class="sec-title">Estrutura & Dimensões</h2>
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
        <h2 class="sec-title">Custos Operacionais & Energia</h2>
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
      <h2 class="sec-title">Planta Baixa Interativa</h2>
      <div style="background:#141210; border-radius:14px; padding:16px; text-align:center; border:1px solid #292524;">
        <svg width="${svgW}" height="${totalSvgH}" viewBox="0 0 ${svgW} ${totalSvgH}" style="width:100%; max-width:${svgW}px; height:auto; display:block; margin:0 auto;">
          <rect x="${OX}" y="${OY}" width="${topW}" height="${topH}" rx="10" fill="#1c1917" stroke="#57534e" stroke-width="1.5"/>
          <text x="${OX + topW / 2}" y="${OY - 8}" text-anchor="middle" font-size="11" fill="#a8a29e">${width} cm</text>
          <text x="${OX - 10}" y="${OY + topH / 2}" text-anchor="middle" font-size="11" fill="#a8a29e" transform="rotate(-90, ${OX - 10}, ${OY + topH / 2})">${depth} cm</text>
          ${segsSvg}
          ${dropLineSvgReport}
          ${potsSvgReport}
          ${cotasSvg}
          ${resSvgReport}
        </svg>
        <div style="font-size:11px; color:#a8a29e; margin-top:10px;">Planta baixa (${width} × ${depth} cm) · ${plants} vaso(s) de ${esc(pot.label)} (${esc(potDesc)})</div>
      </div>
    </div>

    <div class="sec-card">
      <h2 class="sec-title">Equipamentos e Materiais (CAPEX)</h2>
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
          ${rowsHtml}
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

    ${safeNotes || safeInst || safeTerms ? `
    <div class="sec-card">
      <h2 class="sec-title">Notas, Instruções & Termos</h2>
      ${safeNotes ? `<div style="margin-bottom:12px;"><b style="color:#f59e0b; display:block; font-size:11px; text-transform:uppercase; margin-bottom:4px;">Observações</b><div style="white-space:pre-wrap; line-height:1.5;">${esc(safeNotes)}</div></div>` : ""}
      ${safeInst ? `<div style="margin-bottom:12px;"><b style="color:#f59e0b; display:block; font-size:11px; text-transform:uppercase; margin-bottom:4px;">Instruções de Operação</b><div style="white-space:pre-wrap; line-height:1.5;">${esc(safeInst)}</div></div>` : ""}
      ${safeTerms ? `<div><b style="color:#f59e0b; display:block; font-size:11px; text-transform:uppercase; margin-bottom:4px;">Termos & Condições</b><div style="white-space:pre-wrap; line-height:1.5;">${esc(safeTerms)}</div></div>` : ""}
    </div>` : ""}
  </div>
  ` : ""}

  <!-- ABA 3: SOBRE O CULTIVADOR -->
  <div id="tab-content-about" class="tab-content">
    <div class="sec-card">
      <h2 class="sec-title">Biografia & Filosofia de Cultivo</h2>
      <p style="font-size:14px; line-height:1.7; color:#f5f5f4; margin-bottom:16px;">
        ${esc(userBio)}
      </p>
      <div class="kv-row"><span>Nome</span><b>${esc(userDisplayName)}</b></div>
      <div class="kv-row"><span>Identificador (@handle)</span><b>@${esc(userHandle)}</b></div>
      <div class="kv-row"><span>Localização</span><b>${esc(userLocation)}</b></div>
      <div class="kv-row"><span>Especialidade / Foco</span><b>${esc(userStrainFocus)}</b></div>
      <div class="kv-row"><span>Status do Sistema</span><b style="color:#10b981;">Online & Monitorado 24/7</b></div>
    </div>
  </div>

  <div class="footer">
    Perfil e Diário de Cultivo gerado pelo <b>GrowinStones</b> em ${today}.<br/>
    Hospedado exclusivamente em <b>https://${displaySlug}.thegrowinstones.com</b>
  </div>
</div>

<script>
  function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(function(el) { el.classList.remove('active'); });
    document.querySelectorAll('.tab-btn').forEach(function(btn) {
      btn.classList.remove('active');
    });
    var activeContent = document.getElementById('tab-content-' + tabId);
    var activeBtn = document.getElementById('tab-btn-' + tabId);
    if (activeContent) activeContent.classList.add('active');
    if (activeBtn) activeBtn.classList.add('active');
  }

  (function() {
    var slug = "${displaySlug}";
    var syncUrl = "https://grow.thegrowinstones.com/api/user/sync?username=" + encodeURIComponent(slug);
    var container = document.getElementById("posts-feed-container");
    var bioEl = document.getElementById("user-bio-text");
    var bannerEl = document.getElementById("user-banner-img");
    var avatarEl = document.getElementById("user-avatar-img");
    var postsCountEl = document.getElementById("user-posts-count");
    var lastPostsJson = "";

    function escapeHtml(str) {
      if (!str) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function timeAgo(dateStr) {
      if (!dateStr) return "recente";
      try {
        var now = new Date();
        var d = new Date(dateStr);
        var diffSec = Math.floor((now - d) / 1000);
        if (diffSec < 60) return "agora há pouco";
        var diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return "há " + diffMin + " min";
        var diffHour = Math.floor(diffMin / 60);
        if (diffHour < 24) return "há " + diffHour + " h";
        var diffDays = Math.floor(diffHour / 24);
        if (diffDays < 7) return "há " + diffDays + " d";
        return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
      } catch (e) {
        return dateStr;
      }
    }

    var parseObsidianMarkdownClient = (${parseObsidianMarkdown.toString()});

    function renderFeed(posts, user) {
      if (!container) return;
      if (!Array.isArray(posts) || posts.length === 0) {
        container.innerHTML = '<div style="padding:32px 20px; text-align:center; color:#a8a29e; font-size:13px; background:#1c1917; border-radius:16px; border:1px solid #292524;">Nenhuma publicação adicionada ainda ao diário.</div>';
        return;
      }

      var html = "";
      for (var i = 0; i < posts.length; i++) {
        var p = posts[i];
        var authorName = (p.author && p.author.name) || (user && user.name) || "${esc(userDisplayName)}";
        var authorUser = (p.author && p.author.username) || (user && user.username) || slug;
        var authorAvatar = (p.author && p.author.avatarUrl) || (user && user.avatarUrl) || "${userAvatarUrl}";
        var pDate = timeAgo(p.createdAt);
        var pStage = p.stage || "";

        html += '<div class="post-card">';
        html += '  <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">';
        html += '    <div style="width:44px; height:44px; min-width:44px; min-height:44px; max-width:44px; max-height:44px; aspect-ratio:1/1; flex-shrink:0; border-radius:50%; overflow:hidden; background:#292524; border:1px solid #44403c; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:15px; color:#f59e0b; position:relative;">';
        if (authorAvatar) {
          html += '    <img src="' + escapeHtml(authorAvatar) + '" alt="Avatar" style="width:100%; height:100%; aspect-ratio:1/1; object-fit:cover; display:block; border-radius:50%;" onerror="this.style.display=\\'none\\'; this.nextElementSibling.style.display=\\'flex\\';" />';
          html += '    <span style="display:none; align-items:center; justify-content:center; width:100%; height:100%;">' + escapeHtml(authorName.charAt(0).toUpperCase()) + '</span>';
        } else {
          html += '    <span>' + escapeHtml(authorName.charAt(0).toUpperCase()) + '</span>';
        }
        html += '    </div>';
        html += '    <div style="min-width:0; flex:1;">';
        html += '      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">';
        html += '        <b style="font-size:14.5px; color:#ffffff;">' + escapeHtml(authorName) + '</b>';
        html += '        <span style="font-size:12px; font-family:monospace; color:#a8a29e;">@' + escapeHtml(authorUser) + '</span>';
        html += '        <span style="font-size:11px; color:#78716c;">· ' + escapeHtml(pDate) + '</span>';
        html += '      </div>';
        if (pStage) {
          html += '    <span style="display:inline-block; margin-top:3px; font-size:10.5px; font-weight:700; padding:2px 8px; border-radius:12px; background:rgba(245,158,11,0.15); color:#f59e0b;">' + escapeHtml(pStage) + '</span>';
        }
        html += '    </div>';
        html += '  </div>';

        if (p.text) {
          html += '  <div class="obsidian-rendered-post" style="font-size:14px; line-height:1.6; color:#f5f5f4; margin-bottom:14px;">' + parseObsidianMarkdownClient(p.text) + '</div>';
        }

        if (Array.isArray(p.images) && p.images.length > 0) {
          html += '  <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:10px; border-radius:14px; overflow:hidden; margin-bottom:14px;">';
          for (var j = 0; j < p.images.length; j++) {
            html += '    <img src="' + escapeHtml(p.images[j]) + '" alt="Foto do cultivo" onclick="openLightbox(\\'' + escapeHtml(p.images[j]) + '\\')" style="width:100%; max-height:360px; object-fit:cover; border-radius:12px; border:1px solid #292524; display:block; cursor:zoom-in;" onerror="this.parentElement.style.display=\\'none\\';" title="Clique para ver a foto em tamanho real 100%" />';
          }
          html += '  </div>';
        }

        if (Array.isArray(p.videos) && p.videos.length > 0) {
          html += '  <div style="border-radius:14px; overflow:hidden; margin-bottom:14px; background:#000;">';
          for (var k = 0; k < p.videos.length; k++) {
            html += '    <video src="' + escapeHtml(p.videos[k]) + '" controls playsinline style="width:100%; max-height:360px; border-radius:12px; display:block;"></video>';
          }
          html += '  </div>';
        }

        html += '  <div style="display:flex; align-items:center; justify-content:space-between; padding-top:10px; border-top:1px solid #292524; font-size:12px; color:#a8a29e;">';
        html += '    <div style="display:flex; align-items:center; gap:5px; font-weight:700; color:' + (p.liked ? '#f43f5e' : '#a8a29e') + ';">';
        html += '      <svg width="15" height="15" viewBox="0 0 24 24" fill="' + (p.liked ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
        html += '      <span>' + (p.likes || 0) + ' curtidas</span>';
        html += '    </div>';
        html += '    <div>' + (p.comments ? p.comments.length : 0) + ' comentários</div>';
        html += '  </div>';
        html += '</div>';
      }

      container.innerHTML = html;
    }

    async function fetchLiveFeed() {
      try {
        var res = await fetch(syncUrl + "&t=" + Date.now());
        if (!res.ok) return;
        var data = await res.json();
        if (data && data.exists) {
          if (data.user) {
            if (bioEl && data.user.bio) bioEl.textContent = data.user.bio;
            if (bannerEl && data.user.bannerUrl) bannerEl.src = data.user.bannerUrl;
            if (avatarEl && data.user.avatarUrl) avatarEl.src = data.user.avatarUrl;
          }

          if (Array.isArray(data.posts)) {
            var postsStr = JSON.stringify(data.posts);
            if (postsStr !== lastPostsJson) {
              lastPostsJson = postsStr;
              renderFeed(data.posts, data.user);
              if (postsCountEl) postsCountEl.textContent = data.posts.length;
            }
          }
        }
      } catch (err) {
        console.log("Sync feed:", err);
      }
    }

    fetchLiveFeed();
    setInterval(fetchLiveFeed, 5000);
  })();

  function openLightbox(url) {
    var modal = document.getElementById("lightbox-modal");
    var img = document.getElementById("lightbox-modal-img");
    var link = document.getElementById("lightbox-modal-link");
    if (modal && img) {
      img.src = url;
      if (link) link.href = url;
      modal.style.display = "flex";
      document.body.style.overflow = "hidden";
    }
  }

  function closeLightbox() {
    var modal = document.getElementById("lightbox-modal");
    if (modal) {
      modal.style.display = "none";
      document.body.style.overflow = "auto";
    }
  }

  function autoFitDisplayCanvas() {
    if (window.innerWidth <= 768) {
      var vh = window.innerHeight;
      var headerEl = document.querySelector("header");
      var headerH = headerEl ? headerEl.offsetHeight : 56;
      var profileCard = document.querySelector(".profile-card");
      if (profileCard) {
        profileCard.style.minHeight = (vh - headerH) + "px";
      }
    } else {
      var profileCard = document.querySelector(".profile-card");
      if (profileCard) {
        profileCard.style.minHeight = "";
      }
    }
  }
  window.addEventListener("resize", autoFitDisplayCanvas);
  window.addEventListener("orientationchange", autoFitDisplayCanvas);
  document.addEventListener("DOMContentLoaded", autoFitDisplayCanvas);
  autoFitDisplayCanvas();
</script>

<!-- LIGHTBOX MODAL EM TELA CHEIA 100% -->
<div id="lightbox-modal" style="display:none; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.92); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); align-items:center; justify-content:center; padding:16px; cursor:zoom-out;" onclick="closeLightbox()">
  <div style="position:relative; max-width:96vw; max-height:92vh; display:flex; align-items:center; justify-content:center;" onclick="event.stopPropagation()">
    <img id="lightbox-modal-img" src="" alt="Tamanho Real" style="max-width:96vw; max-height:92vh; object-fit:contain; border-radius:12px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.7);" />
    <button onclick="closeLightbox()" style="position:absolute; top:12px; right:12px; width:40px; height:40px; border-radius:50%; background:rgba(0,0,0,0.75); color:#ffffff; border:1px solid rgba(255,255,255,0.25); font-size:20px; font-weight:800; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(0,0,0,0.4);" title="Fechar (Esc)">✕</button>
    <a id="lightbox-modal-link" href="" target="_blank" rel="noopener noreferrer" style="position:absolute; bottom:12px; right:12px; padding:7px 16px; border-radius:20px; background:rgba(0,0,0,0.75); color:#ffffff; border:1px solid rgba(255,255,255,0.25); font-size:12px; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:6px; box-shadow:0 4px 12px rgba(0,0,0,0.4);" title="Abrir imagem original em nova aba">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      <span>Ver Original 100%</span>
    </a>
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
      showToast("O seu navegador bloqueou a abertura de abas. Habilite pop-ups para visualizar o PDF.");
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
      showToast("O seu navegador bloqueou a abertura de abas. Habilite pop-ups.");
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
            <span> Engenharia de Cultivo & Subdomínios Exclusivos</span>
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
              <div className="mb-2">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
              </div>
              <h3 className="font-bold text-sm mb-1 text-white">Dimensionamento de Vasos</h3>
              <p className="text-xs text-stone-400">Arranjo de linhas e colunas com afastamento ajustável e cálculo exato de milímetros.</p>
            </div>
            <div className="p-6 rounded-2xl" style={{ background: "#1c1917", border: "1px solid #292524" }}>
              <div className="mb-2">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sky-400"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
              </div>
              <h3 className="font-bold text-sm mb-1 text-white">Engenharia Hidráulica</h3>
              <p className="text-xs text-stone-400">Cálculo de bitola de tubos, bombas de água/ar, anéis recirculantes e reservatórios.</p>
            </div>
            <div className="p-6 rounded-2xl" style={{ background: "#1c1917", border: "1px solid #292524" }}>
              <div className="mb-2">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              </div>
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
              <button onClick={() => setGoogleClientIdModalOpen(false)} className="absolute top-4 right-4 text-stone-400 hover:text-white font-bold text-sm flex items-center justify-center w-6 h-6 rounded-md">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-amber-400 text-lg bg-amber-500/10 border border-amber-500/30 shrink-0">
                  
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Configuração do Google OAuth 2.0</h3>
                  <p className="text-xs text-stone-400">O Google exige um Client ID válido para o domínio grow.thegrowinstones.com</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 space-y-2">
                <p className="font-bold text-amber-200"> Origem não registrada no Google Cloud (no registered origin)</p>
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
                     Entrar no Modo Direto (Acessar Agora)
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-stone-300 pt-3 border-t border-stone-800 space-y-1.5">
                <p className="font-bold text-sky-400"> Como autorizar o domínio no Google Cloud (em 15 segundos):</p>
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
              <button onClick={() => setAuthModalOpen(false)} className="absolute top-4 right-4 text-stone-400 hover:text-white font-bold text-sm flex items-center justify-center w-6 h-6 rounded-md">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>

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
                      <><span> {pendingGoogleUser.email}</span></>
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
                      avatarUrl: pendingGoogleUser && pendingGoogleUser.picture ? pendingGoogleUser.picture : `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanSlug}`,
                      bannerUrl: "",
                      bio: "",
                      location: "Brasil",
                      strainFocus: "",
                      googleSub: pendingGoogleUser ? pendingGoogleUser.sub : null
                    };
                    localStorage.setItem("growcalc_user", JSON.stringify(newUser));
                    setCurrentUser(newUser);
                    setSubdomainInput(cleanSlug);
                    setAuthModalOpen(false);

                    // Sync to Cloud immediately
                    fetch("https://grow.thegrowinstones.com/api/user/sync", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ user: newUser, setup: getSetupData(), presets: allPresets })
                    }).catch(() => {});

                    showToast(`Bem-vindo, ${cleanName}! Subdomínio @${cleanSlug} ativado e sincronizado.`);
                  }}
                  className="w-full py-3 rounded-xl font-bold text-xs transition-all hover:opacity-90 shadow-lg flex items-center justify-center gap-2 mt-2"
                  style={{ background: "#0284c7", color: "#ffffff" }}
                >
                  Confirmar & Acessar Configurador
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

// ————————————————————————— LAYOUT COM SIDEBAR LATERAL & TOPBAR MOBILE —————————————————————————
  return (
    <div className="min-h-screen flex flex-col md:flex-row w-full max-w-full relative" style={{ background: T.bg, color: T.text, fontFamily: "'Inter', system-ui, sans-serif", transition: "background 0.3s, color 0.3s" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Berkshire+Swash&display=swap');
        input[type=number]::-webkit-inner-spin-button{ -webkit-appearance:none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* BARRA SUPERIOR EXCLUSIVA PARA MOBILE (< md) */}
      <header
        className="md:hidden sticky top-0 z-50 w-full backdrop-blur-md px-3.5 py-2.5 border-b shadow-sm"
        style={{ background: T.surface, borderColor: T.border }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Logo height={24} color={T.brand} />
          </div>

          <div className="flex items-center gap-2 relative">
            {currentUser?.username && (
              <a
                href={`https://${currentUser.username}.thegrowinstones.com`}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold flex items-center gap-1.5 transition-opacity hover:opacity-85"
                style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.brand }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="truncate max-w-[110px]">@{currentUser.username}</span>
              </a>
            )}

            {/* BOTÃO DO AVATAR QUE ACIONA O MENU MOBILE */}
            <button
              onClick={() => setMobileMenuOpen((o) => !o)}
              className="w-8 h-8 min-w-[32px] min-h-[32px] aspect-square rounded-full flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden border shadow-sm transition-all active:scale-95 cursor-pointer"
              style={{
                background: T.surface2,
                borderColor: mobileMenuOpen ? T.brand : T.border,
                color: T.text,
                outline: mobileMenuOpen ? `2px solid ${T.brand}` : "none"
              }}
              title="Menu do Usuário"
              aria-label="Abrir Menu de Navegação"
            >
              {currentUser?.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser?.name || "Avatar"}
                  className="w-full h-full object-cover rounded-full block"
                  style={{ aspectRatio: "1 / 1" }}
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              ) : (
                <span>{currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "G"}</span>
              )}
            </button>

            {/* DROPDOWN MENU MOBILE */}
            {mobileMenuOpen && (
              <>
                <div
                  className="fixed inset-0 bg-black/35 z-40 backdrop-blur-xs transition-opacity"
                  onClick={() => setMobileMenuOpen(false)}
                />
                <div
                  className="absolute top-full right-0 mt-2 w-64 rounded-2xl border shadow-2xl p-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                  style={{ background: T.surface, borderColor: T.border, color: T.text }}
                >
                  {/* Header do Perfil no Menu */}
                  <div className="flex items-center gap-2.5 pb-3 mb-2 border-b" style={{ borderColor: T.borderSoft }}>
                    <div
                      className="w-10 h-10 min-w-[40px] min-h-[40px] aspect-square rounded-full flex items-center justify-center font-bold text-sm shrink-0 border overflow-hidden"
                      style={{
                        background: T.surface2,
                        borderColor: T.border,
                        color: T.brand
                      }}
                    >
                      {currentUser?.avatarUrl ? (
                        <img
                          src={currentUser.avatarUrl}
                          alt={currentUser?.name || "Avatar"}
                          className="w-full h-full object-cover rounded-full block"
                          style={{ aspectRatio: "1 / 1" }}
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                      ) : (
                        <span>{currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "G"}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate" style={{ color: T.text }}>
                        {currentUser?.name || "Cultivador"}
                      </div>
                      <div className="text-[11px] font-mono font-medium truncate" style={{ color: T.brand }}>
                        {currentUser?.username ? `@${currentUser.username}` : "Modo Visitante"}
                      </div>
                    </div>
                    <button
                      onClick={() => setMobileMenuOpen(false)}
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-xs opacity-70 hover:opacity-100"
                      style={{ color: T.faint }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Lista de Navegação */}
                  <div className="space-y-1">
                    {[
                      { id: "profile", label: "Perfil & Diário", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
                      { id: "configurator", label: "Configurador de Grow", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg> },
                      { id: "my_grows", label: "Meus Grows", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22v-9"/><path d="M12 13a6 6 0 0 1 6-6c0 6-6 6-6 6z"/><path d="M12 13a6 6 0 0 0-6-6c0 6 6 6 6 6z"/></svg> },
                      { id: "comparison", label: "Comparador de Setups", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
                      { id: "mqtt", label: "Controlador ESP32", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/></svg> },
                      { id: "settings", label: "Ajustes & Subdomínio", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> }
                    ].map((item) => {
                      const active = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveTab(item.id);
                            setMobileMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left"
                          style={{
                            background: active ? T.sidebarActiveBg : "transparent",
                            color: active ? T.brand : T.text,
                            border: active ? `1px solid ${T.accentBorder}` : "1px solid transparent"
                          }}
                        >
                          <span style={{ color: active ? T.brand : T.muted }}>{item.icon}</span>
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Ações de Conta */}
                  <div className="pt-2.5 mt-2.5 border-t" style={{ borderColor: T.borderSoft }}>
                    {currentUser?.username ? (
                      <button
                        onClick={() => {
                          if (window.confirm("Deseja desconectar sua conta?")) {
                            localStorage.removeItem("growcalc_user");
                            setCurrentUser(null);
                            setMobileMenuOpen(false);
                          }
                        }}
                        className="w-full py-2 px-3 rounded-xl text-xs font-bold text-red-500 hover:bg-red-500/10 flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <span>Desconectar Conta</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setAuthModalOpen(true);
                          setMobileMenuOpen(false);
                        }}
                        className="w-full py-2.5 px-3 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 flex items-center justify-center gap-1.5 shadow"
                      >
                        <span>Entrar ou Cadastrar</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* SIDEBAR LATERAL DESKTOP (hidden on mobile, fixed on md+) */}
      <aside
        className={`hidden md:flex fixed top-0 left-0 bottom-0 h-screen max-h-screen overflow-y-auto no-scrollbar flex-col justify-between transition-all duration-300 z-40 shrink-0 ${sidebarCollapsed ? "w-16 px-2 py-4" : "w-64 px-4 py-4"}`}
        style={{ background: T.surface, borderRight: `1px solid ${T.border}` }}
      >
        {/* Top Header Sidebar */}
        <div>
          {/* Linha do Logo e Botão de Recolher/Expandir */}
          <div className="flex items-center justify-between mb-4 min-h-[34px] px-1">
            {!sidebarCollapsed ? (
              <>
                <div className="flex items-center justify-start min-w-0">
                  <Logo height={26} color={T.brand} />
                </div>
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="p-1.5 rounded-xl flex items-center justify-center transition-all hover:bg-black/5 dark:hover:bg-white/5"
                  style={{ color: T.muted }}
                  title="Recolher Menu"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <line x1="9" y1="3" x2="9" y2="21"/>
                    <polyline points="15 9 12 12 15 15"/>
                  </svg>
                </button>
              </>
            ) : (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="w-10 h-10 mx-auto rounded-xl flex items-center justify-center transition-all hover:bg-black/5 dark:hover:bg-white/5 group cursor-pointer"
                title="Clique para Expandir Menu"
              >
                <svg xmlns="http://www.w3.org/2000/svg" id="Layer_1" version="1.1" viewBox="0 0 128.38 168.24" className="w-6 h-7 fill-current transition-transform group-hover:scale-110" style={{ color: T.brand }}>
                  <g id="H8AvKh">
                    <path d="M105.41,132.58h0v-6.99c0-1.28-2.1-6.84-2.8-8.28-9.04-18.66-35.46-16.44-46.77-1.28-8.66,11.62-11.28,28.4-1.03,39.92,4.68,5.26,14.22,5.98,19.27,11.34-12.46-4.63-25.99-6.6-39.04-3.13-3.7.98-7.09,2.67-10.61,4.09,3.87-4.86,10.57-7.39,16.47-8.84,2.4-.59,5.07-.56,7.42-1.27.36-.11,1.04.17.69-.73-.77-1.95-4.69-5.72-5.21-7.85-.23-.96.47-3.61.26-5.52-.23-2.2-1.08-4.46-2.51-6.16-.08,1.62,1.01,2.79,1.21,4.58.18,1.6.15,4.43-.32,5.95-.82,2.64-5.54,5.32-7.34,2.67-2.77-7.38-10.82-24.23-20.3-14.4-.78.81-1,2.23-1.93,2.65.44-6.95,3.82-10.96,11.08-10.36-14.91-13.69-32.89-36.11-18.91-56.52,2.91-4.25,7.54-8.59,12.16-10.74.35-1.35-1.03-.98-1.9-1.7-4.97-4.14-4.29-10.9.45-14.93,5.07-4.32,22.25-8.78,21.68-16.81-.37-5.16-6.82-9.45-10.11-12.83,5.83-.32,11.59-.93,17.35.47-4.38-3.95-9.1-8.34-10.12-14.46,2.56,1.92,5.15,2.62,8.14,1.15C43.57,2.16,45.5-.14,45.63,0c.09.09.24.98.71,1.46,3.46,3.58,7.67,4.6,11.83,1.43.77,6.44,5.19,8.59,11.09,6.27.27,4.65,4.54,6.42,8.68,6.51-5.68,6.06-14.25,7.98-22.17,5.55.94,2.04,1.87,3.69,2.53,5.9,5.31,17.77-5.14,31.41-10.11,47.02-1.96,6.16-4.79,17.48,3.95,19.4l4.59-1.71c-1.7,3.18-2.99,6.24-6.09,8.37l-3.54,1.51c11.16-.98,11.28-14,13.63-22.27,10.65-37.52,58.19-30.79,66.06,5.98,5.93,27.7-5.06,55.06-27.15,71.96-.38.29-.93,1.3-1.44.49,15.59-14.76,26.98-40.3,19.17-61.59-6.76-18.42-26.04-20.48-42.79-15.29-.12.85,1.09.48,1.62.42,8.12-.88,14.38-1.86,22.46.8,19.21,6.33,19.5,29.87,14.34,46.12-2.21,6.94-5.72,13.63-9.75,19.66l4.82-13.01c2.63-10.65,2.02-23.1-4.19-32.45-7.57-11.41-20.6-12.86-31.72-5.39,2.42-.09,4.53-1.5,7.13-2.03,20.41-4.14,28.54,15.88,27.11,32.9l-.98,4.56h0ZM43.07,25.01c3.28,1.09,4.4-3.78,1.25-4.21-2.39-.32-3.41,3.49-1.25,4.21ZM22.99,61.22h0c-.11.85,1.09.45,1.68.48,14.78.66,19.8-12.51,20.97-25.06l-3.76,11.42c-3.63,7.73-10.07,12.93-18.89,13.17h0ZM13.35,81.47c-2.92,12.71-2,26.63,8.67,35.44,4.55,3.75,11.46,6.93,17.37,7.22-10.19-3.37-18.92-9.63-23.23-19.68-.96-2.24-2.81-7.47-2.81-9.72,0-3.61-.21-7.53,0-11.09,0-.33,1.27-2.07,0-2.17Z" />
                  </g>
                </svg>
              </button>
            )}
          </div>

          {/* Subdomain Badge link */}
          {!sidebarCollapsed && (
            <a
              href={`https://${currentUser?.username}.thegrowinstones.com`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between px-3 py-2 rounded-xl mb-5 text-xs font-mono transition-opacity hover:opacity-85"
              style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
            >
              <span className="truncate">https://{currentUser?.username}.grow...</span>
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 animate-pulse"></span>
            </a>
          )}

          {/* Menu Items com Ícones Vetoriais Monocromáticos */}
          <nav className="space-y-1.5">
            {[
              { id: "profile", label: "Meu Perfil", badge: "NOVO", icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              )},
              { id: "configurator", label: "Configurador de Grow", icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>
              )},
              { id: "my_grows", label: "Meus Grows", badge: "LIVE", icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M12 22v-9"/><path d="M12 13a6 6 0 0 1 6-6c0 6-6 6-6 6z"/><path d="M12 13a6 6 0 0 0-6-6c0 6 6 6 6 6z"/></svg>
              )},
              { id: "comparison", label: "Comparar Setups", icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              )},
              { id: "mqtt", label: "Telemetria ESP32", badge: "MQTT", icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="15" x2="23" y2="15"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="15" x2="4" y2="15"/></svg>
              )},
              { id: "settings", label: "Configurações", icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              )}
            ].map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${active ? "shadow-sm" : "hover:opacity-85"}`}
                  style={{
                    background: active ? T.sidebarActiveBg : "transparent",
                    color: active ? T.text : T.muted,
                    border: active ? `1px solid ${T.border}` : "1px solid transparent"
                  }}
                >
                  {item.icon}
                  {!sidebarCollapsed && (
                    <div className="flex items-center justify-between w-full">
                      <span>{item.label}</span>
                      {item.badge && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Card at bottom of Sidebar */}
        <div className="pt-4 border-t" style={{ borderColor: T.border }}>
          {!sidebarCollapsed ? (
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setActiveTab("profile")}
                className="flex items-center gap-2.5 min-w-0 flex-1 text-left p-1 rounded-xl transition-opacity hover:opacity-85"
              >
                <div
                  className="w-8 h-8 min-w-[32px] min-h-[32px] aspect-square rounded-full flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden"
                  style={{
                    background: T.surface2,
                    border: `1px solid ${T.border}`,
                    color: T.text
                  }}
                >
                  {currentUser?.avatarUrl ? (
                    <img
                      src={currentUser.avatarUrl}
                      alt={currentUser?.name || "Avatar"}
                      className="w-full h-full object-cover rounded-full block"
                      style={{ aspectRatio: "1 / 1" }}
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  ) : (
                    <span>{currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "G"}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate" style={{ color: T.text }}>{currentUser?.name}</div>
                  <div className="text-[11px] font-mono truncate" style={{ color: T.textMuted }}>@{currentUser?.username}</div>
                </div>
              </button>
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
      <div className={`flex-1 min-w-0 w-full overflow-x-hidden flex flex-col min-h-screen transition-all duration-300 ${sidebarCollapsed ? "md:pl-16" : "md:pl-64"}`}>
        {/* Render Tab Content */}
        {activeTab === "profile" && (
          <UserProfileView currentUser={currentUser} setCurrentUser={setCurrentUser} T={T} dark={dark} showToast={showToast} />
        )}

        {activeTab === "mqtt" && (
          <MQTTMonitorView currentUser={currentUser} T={T} dark={dark} showToast={showToast} />
        )}

        {activeTab === "my_grows" && (
          <div className="max-w-5xl mx-auto px-6 py-8 w-full">
            <h1 className="text-2xl font-bold mb-2" style={{ color: T.text }}>Meus Grows & Subdomínios</h1>
            <p className="text-xs mb-6" style={{ color: T.textMuted }}>Gerencie os setups salvos e seu subdomínio exclusivo em funcionamento.</p>
            
            <div className="p-6 rounded-2xl mb-8" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">SUBDOMÍNIO ATIVO</span>
                  <h3 className="text-lg font-extrabold mt-2 font-mono" style={{ color: T.brand }}>https://{currentUser?.username}.thegrowinstones.com</h3>
                  <p className="text-xs mt-1" style={{ color: T.textMuted }}>Status: Online com Certificado SSL (HTTPS) Let's Encrypt</p>
                </div>
                <div className="flex gap-2">
                  <a
                    href={`https://${currentUser?.username}.thegrowinstones.com`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow"
                    style={{ background: "#0284c7" }}
                  >
                    Ver Subdomínio ao Vivo
                  </a>
                  <button
                    onClick={() => {
                      setSubdomainInput(currentUser?.username);
                      setPublishModalOpen(true);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold"
                    style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                  >
                    Re-publicar Setup Atual
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
                      showToast(`Setup "${p.name}" carregado!`);
                    }}
                    className="w-full py-2 rounded-lg text-xs font-semibold"
                    style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                  >
                    Carregar no Configurador
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="max-w-3xl mx-auto px-6 py-8 w-full">
            <h1 className="text-2xl font-bold mb-2" style={{ color: T.text }}>Configurações da Conta</h1>
            <p className="text-xs mb-6" style={{ color: T.textMuted }}>Ajuste seu perfil, subdomínio base e preferências de visualização.</p>

            <div className="p-6 rounded-2xl space-y-6" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: T.text }}>Nome de Usuário (Subdomínio Exclusivo)</label>
                <div className="flex items-center rounded-xl px-3 py-2" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                  <span className="text-xs text-stone-400 font-mono">https://</span>
                  <input
                    type="text"
                    value={currentUser?.username}
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
                  <span>{dark ? "Tema Escuro (Ativo)" : "Tema Claro (Ativo)"}</span>
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
                  Desconectar Conta
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CONFIGURADOR & COMPARADOR VIEWS */}
        {(activeTab === "configurator" || activeTab === "comparison") && (
          <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3.5 sm:py-6 w-full max-w-full overflow-x-hidden flex-1 flex flex-col">
            {/* Cabeçalho Principal com Barra de Ações ACIMA do Título */}
            <div className="pb-4 mb-4 sm:mb-6" style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
              {/* Linha ACIMA: Botões de Ação em Ícones */}
              <div className="flex items-center justify-end gap-1.5 sm:gap-2 mb-3">
                <input type="file" ref={fileInputRef} accept=".json,application/json" onChange={handleImportJson} className="hidden" />
                
                <button
                  onClick={() => fileInputRef.current?.click()}
                  title="Importar Configuração JSON"
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-all hover:opacity-85 shadow-sm"
                  style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>

                <button
                  onClick={exportSetupJson}
                  title="Exportar Configuração JSON"
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-all hover:opacity-85 shadow-sm"
                  style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </button>

                <button
                  onClick={openStaticDashboardHtml}
                  title="Abrir Web Dashboard HTML Interativo (Nova Aba)"
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-all hover:opacity-85 shadow-sm"
                  style={{ background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.brand }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="9" y1="21" x2="9" y2="9" />
                  </svg>
                </button>

                <button
                  onClick={() => {
                    if (!subdomainInput && currentUser?.username) setSubdomainInput(currentUser?.username);
                    setPublishModalOpen(true);
                  }}
                  title="Publicar Grow no Subdomínio Exclusivo (*Publicar Grow)"
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-all hover:opacity-90 shadow-sm"
                  style={{ background: dark ? "#0284c7" : "#0369a1", color: "#ffffff" }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.71 1.26-1.5 1.74-2.3L4.5 16.5z"/>
                    <path d="M12 15l-3-3 7.5-7.5c1.4-1.4 3.7-1.4 5.1 0s1.4 3.7 0 5.1L12 15z"/>
                  </svg>
                </button>

                <button
                  onClick={openReportHtml}
                  title="Exportar Relatório em PDF (Impressão)"
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-all hover:opacity-85 shadow-sm"
                  style={{ background: T.text, color: T.bg }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </button>

                <button
                  onClick={() => setDark((d) => !d)}
                  title={dark ? "Alternar para Tema Claro" : "Alternar para Tema Escuro"}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-colors shrink-0"
                  style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                >
                  {dark ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="5" />
                      <line x1="12" y1="1" x2="12" y2="3" />
                      <line x1="12" y1="21" x2="12" y2="23" />
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
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

              {/* Linha Principal com Título e Subtítulo */}
              <div className="mb-6">
                <h1 className="text-xl sm:text-3xl font-bold tracking-tight leading-tight" style={{ color: T.text }}>
                  Projete seu grow <span style={{ color: T.muted, fontStyle: "italic", fontWeight: 500 }}>em segundos</span>
                </h1>
                <p className="text-[11px] sm:text-xs mt-1" style={{ color: T.muted }}>
                  Estrutura, ligações, custos, produção e retorno — com planta baixa em tempo real e relatório completo em PDF.
                </p>
              </div>
            </div>

            {activeTab === "configurator" ? (
          <div className="w-full max-w-full space-y-4 sm:space-y-6 min-w-0">
            {/* ————— 1. TOP STICKY: CARD DE DADOS & MÉTRICAS (COLAPSÁVEL) ————— */}
            <CollapsibleCard
              title="Dados & Métricas do Grow"
              subtitle={`${priceG > 0 ? fmtBRL(revenueHarvest) : fmtG(yieldHarvest)} / safra · ${harvestsYear.toFixed(1)} safras/ano · CAPEX ${fmtBRL(capex)} · OPEX ${fmtBRL(opexMonth)}/mês`}
              isOpen={openDataCard}
              onToggle={() => setOpenDataCard((o) => !o)}
              className="sticky top-2 sm:top-4 z-30 shadow-md backdrop-blur-md"
              T={T}
              dark={dark}
            >
              <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 pt-1">
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
                  <div key={s.label} className="rounded-2xl p-3.5 sm:p-4 transition-all"
                    style={{ background: T.surface2, border: `1px solid ${T.borderSoft}` }}>
                    <p className="text-lg sm:text-xl font-bold tracking-tight" style={{ color: T.text }}>{s.value}</p>
                    <p className="text-xs font-medium mt-0.5" style={{ color: T.muted }}>{s.label}</p>
                    <p className="text-[10px]" style={{ color: T.faint }}>{s.sub}</p>
                  </div>
                ))}
              </section>
            </CollapsibleCard>

            {/* ————— 2. TOP: CARD DO MAPA (PLANTA BAIXA & DISPOSIÇÃO) (COLAPSÁVEL) ————— */}
            <CollapsibleCard
              title={growName ? growName : "Planta Baixa & Disposição"}
              subtitle={`${layout.nRows} × ${Math.min(layout.useCols, layout.placed)} · ${plants} vasos · ${width} × ${depth} cm · ${connInfo.name}`}
              isOpen={openMapCard}
              onToggle={() => setOpenMapCard((o) => !o)}
              className="shadow-sm"
              T={T}
              dark={dark}
            >
              {/* ————— IDENTIFICAÇÃO DO PROJETO DENTRO DO CARD DO MAPA ————— */}
              <div className="p-3 sm:p-4 rounded-xl mb-4 space-y-3 transition-all"
                style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider block" style={{ color: T.faint }}>
                    Identificação do Projeto
                  </span>
                  {strain && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ background: T.surface, border: `1px solid ${T.border}`, color: "#f59e0b" }}>
                      {strain}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-[11px] font-semibold block mb-1" style={{ color: T.muted }}>Nome do grow</label>
                    <input type="text" value={growName} placeholder="Ex.: Grow Sala Verde"
                      onChange={(e) => setGrowName(e.target.value)}
                      className="w-full h-8 px-2.5 rounded-lg text-xs font-medium focus:outline-none" style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold block mb-1" style={{ color: T.muted }}>Responsável</label>
                    <input type="text" value={owner} placeholder="Seu nome"
                      onChange={(e) => setOwner(e.target.value)}
                      className="w-full h-8 px-2.5 rounded-lg text-xs font-medium focus:outline-none" style={inputStyle} />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold block mb-1" style={{ color: T.muted }}>Variedade / Genética da planta</label>
                    <input type="text" value={strain} placeholder="Ex.: White Widow, Gorilla Glue..."
                      onChange={(e) => setStrain(e.target.value)}
                      className="w-full h-8 px-2.5 rounded-lg text-xs font-medium focus:outline-none" style={inputStyle} />
                  </div>
                </div>

                {/* Toggle: Projeto Público / Privado no Subdomínio */}
                <div className="pt-2.5 mt-1 border-t flex items-center justify-between gap-3" style={{ borderColor: T.borderSoft }}>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold" style={{ color: T.text }}>
                      Projeto Público no Subdomínio
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: T.muted }}>
                      {isGrowPublic ? "Visível no seu subdomínio exclusivo" : "Oculto (Apenas seu perfil e posts serão públicos)"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsGrowPublic((p) => !p)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isGrowPublic ? "bg-emerald-600" : "bg-stone-600"}`}
                    title={isGrowPublic ? "Projeto Público" : "Projeto Privado"}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isGrowPublic ? "translate-x-5" : "translate-x-0"}`}
                    />
                  </button>
                </div>
              </div>

              <div className="p-3 sm:p-3.5 rounded-xl mb-4 flex items-center justify-between gap-3 flex-wrap"
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

              <div className="flex justify-center rounded-xl p-2 sm:p-4 overflow-x-auto w-full max-w-full"
                style={{ background: T.inset, border: `1px solid ${T.borderSoft}` }}>
                <svg
                  viewBox={`0 0 ${svgW} ${showRes ? svgH : topH + OY * 2}`}
                  className="w-full h-auto max-w-full"
                  style={{ maxWidth: `${svgW}px`, maxHeight: 420 }}
                >
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

            {/* ————— 3. SÓ ASSIM O RESTANTE DO CONFIGURADOR (FORMULÁRIOS & OPÇÕES) ————— */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start w-full max-w-full min-w-0">
              {/* Coluna 1: Estrutura, Vasos, Presets, Iluminação, Equipamentos, Observações */}
              <div className="space-y-4 sm:space-y-5 w-full max-w-full min-w-0">
                <CollapsibleCard
                  title="Setups & Presets"
                  subtitle={`${allPresets.length} setups salvos`}
                  isOpen={openConfigCard === "presets"}
                  onToggle={() => toggleConfigCard("presets")}
                  T={T} dark={dark}>
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2 items-center">
                      {allPresets.map((p) => (
                        <div key={p.id || p.name} className="flex items-center rounded-full transition-all shrink-0 shadow-sm"
                          style={{ background: T.surface2, border: `1px solid ${T.accentBorder}`, color: T.text }}>
                          <button onClick={() => loadPreset(p)}
                            className="pl-3.5 pr-2 py-1.5 text-xs font-semibold hover:opacity-85 flex items-center gap-1.5 cursor-pointer"
                            title={`Carregar setup "${p.name}"`}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: T.accentBorder }}>
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                            <span>{p.name}</span>
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); removePreset(p.id || p.name, p.name); }}
                            title={`Remover chip "${p.name}"`}
                            className="pr-3 pl-1 py-1.5 text-xs font-bold transition-colors hover:text-red-500 rounded-r-full cursor-pointer"
                            style={{ color: T.faint }}>
                            ×
                          </button>
                        </div>
                      ))}

                      <button onClick={addCurrentAsPreset}
                        title="Salvar a configuração atual como um novo chip de preset"
                        className="px-3.5 py-1.5 rounded-full text-xs font-bold transition-all hover:opacity-85 flex items-center gap-1.5 shrink-0 cursor-pointer"
                        style={{ background: T.surface2, border: `1.5px dashed ${T.accentBorder}`, color: T.text }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        <span>Salvar preset atual</span>
                      </button>

                      {allPresets.length === 0 && (
                        <button onClick={restoreDefaultPresets}
                          className="px-3.5 py-1.5 rounded-full text-xs font-bold transition-all hover:opacity-85 flex items-center gap-1.5 shrink-0 cursor-pointer"
                          style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.muted }}>
                          Restaurar presets padrão
                        </button>
                      )}
                    </div>
                  </div>
                </CollapsibleCard>

                <CollapsibleCard
                  title="1 · Estufa (cm)"
                  subtitle={`${width} × ${depth} × ${height} cm (${areaM2.toFixed(2)} m²)`}
                  isOpen={openConfigCard === "estufa"}
                  onToggle={() => toggleConfigCard("estufa")}
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
                  isOpen={openConfigCard === "vasos"}
                  onToggle={() => toggleConfigCard("vasos")}
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
                      isCalha={isCalha}
                      dark={dark}
                      T={T}
                    />
                  </div>

                  {/* Escolha do Vaso em Linha com Select */}
                  <div className="mb-3 p-2.5 rounded-xl space-y-1"
                    style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
                    <label className="text-[11px] font-bold block" style={{ color: T.text }}>
                      Tipo de vaso / recipiente
                    </label>
                    <select
                      value={potIdx}
                      onChange={(e) => {
                        const idx = Number(e.target.value);
                        setPotIdx(idx);
                        if (idx === POT_SIZES.length) {
                          setPotShape("calha");
                        } else if (idx === POT_SIZES.length + 1) {
                          if (potShape === "calha") setPotShape("square");
                        } else if (POT_SIZES[idx] && POT_SIZES[idx].shape) {
                          setPotShape(POT_SIZES[idx].shape);
                        }
                      }}
                      className="w-full h-8 px-2.5 rounded-lg text-xs font-semibold focus:outline-none cursor-pointer transition-all truncate"
                      style={{ background: T.surface, border: `1px solid ${T.accentBorder}`, color: T.text }}>
                      {POT_SIZES.map((p, idx) => (
                        <option key={p.label + idx} value={idx}>
                          {p.label} · {p.desc}
                        </option>
                      ))}
                      <option value={POT_SIZES.length}>
                        Calha Hidropônica (Sob Medida)
                      </option>
                      <option value={POT_SIZES.length + 1}>
                        Vaso Sob Medida / Customizado
                      </option>
                    </select>
                  </div>

                  {/* Controles customizados se for vaso sob medida ou calha */}
                  {isCustomPot && (
                    <div className="space-y-3 mb-3 p-3 rounded-xl"
                      style={{ background: T.surface2, border: `1px dashed ${T.accentBorder}` }}>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-xs font-bold" style={{ color: T.text }}>Formato do recipiente</span>
                        <div className="flex items-center gap-1 flex-wrap">
                          <button onClick={() => setPotShape("calha")}
                            className="px-2.5 py-1 rounded-md text-[11px] font-bold transition-all"
                            style={potShape === "calha"
                              ? { background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }
                              : { background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}>
                            Calha
                          </button>
                          <button onClick={() => setPotShape("circle")}
                            className="px-2.5 py-1 rounded-md text-[11px] font-bold transition-all"
                            style={potShape === "circle"
                              ? { background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }
                              : { background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}>
                            Redondo
                          </button>
                          <button onClick={() => setPotShape("square")}
                            className="px-2.5 py-1 rounded-md text-[11px] font-bold transition-all"
                            style={potShape === "square"
                              ? { background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }
                              : { background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}>
                            Quadrado
                          </button>
                          <button onClick={() => setPotShape("rect")}
                            className="px-2.5 py-1 rounded-md text-[11px] font-bold transition-all"
                            style={potShape === "rect"
                              ? { background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }
                              : { background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}>
                            Retangular
                          </button>
                        </div>
                      </div>

                      {potShape === "calha" ? (
                        <div className="space-y-2.5 pt-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs font-semibold block" style={{ color: T.text }}>Largura da calha</span>
                              <span className="text-[10px]" style={{ color: T.faint }}>Seção transversal</span>
                            </div>
                            {num(customPotW, setCustomPotW, 5, 200, 1)}
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs font-semibold block" style={{ color: T.text }}>Comprimento da calha</span>
                              <span className="text-[10px]" style={{ color: T.faint }}>Extensão longitudinal</span>
                            </div>
                            {num(customPotL, setCustomPotL, 10, 1000, 5)}
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs font-semibold block" style={{ color: T.text }}>Profundidade da calha</span>
                              <span className="text-[10px]" style={{ color: T.faint }}>Altura útil do leito</span>
                            </div>
                            {num(customPotH, setCustomPotH, 5, 150, 1)}
                          </div>
                          <p className="text-[11px] font-medium pt-1" style={{ color: T.muted }}>
                            Volume total da calha: <strong style={{ color: T.text }}>{customLiters} Litros</strong>
                          </p>
                        </div>
                      ) : potShape === "circle" ? (
                        <div className="space-y-2.5 pt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold" style={{ color: T.text }}>Diâmetro (cm)</span>
                            {num(customPotW, setCustomPotW, 10, 150, 1)}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold" style={{ color: T.text }}>Altura (cm)</span>
                            {num(customPotH, setCustomPotH, 10, 150, 1)}
                          </div>
                        </div>
                      ) : potShape === "square" ? (
                        <div className="space-y-2.5 pt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold" style={{ color: T.text }}>Lado / Largura (cm)</span>
                            {num(customPotW, (v) => { setCustomPotW(v); setCustomPotL(v); }, 10, 150, 1)}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold" style={{ color: T.text }}>Altura (cm)</span>
                            {num(customPotH, setCustomPotH, 10, 150, 1)}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2.5 pt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold" style={{ color: T.text }}>Largura (cm)</span>
                            {num(customPotW, setCustomPotW, 10, 150, 1)}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold" style={{ color: T.text }}>Comprimento (cm)</span>
                            {num(customPotL, setCustomPotL, 10, 150, 1)}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold" style={{ color: T.text }}>Altura (cm)</span>
                            {num(customPotH, setCustomPotH, 10, 150, 1)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Botão de girar vaso retangular se aplicável */}
                  {isRect && (
                    <div className="mt-3 p-2.5 rounded-xl flex items-center justify-between transition-all"
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
                         Girar ({potW}×{potD})
                      </button>
                    </div>
                  )}
                </CollapsibleCard>

                <CollapsibleCard
                  title="3 · Iluminação & fotoperíodo"
                  subtitle={`${ledWatts}W LED · ${vegaHours}h/${floraHours}h · ${fmtG(yieldHarvest)}/safra`}
                  isOpen={openConfigCard === "iluminacao"}
                  onToggle={() => toggleConfigCard("iluminacao")}
                  T={T} dark={dark}>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium block" style={{ color: T.text }}>Potência do LED</span>
                        <span className="text-xs" style={{ color: T.faint }}>Consumo total de iluminação</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <NumInput value={watts?.led || 0} onCommit={(n) => setW("led", n)} min={0} max={10000}
                          className={`w-20 h-8 ${inputCls}`} style={inputStyle} />
                        <span className="text-xs font-medium" style={{ color: T.muted }}>W</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2" style={{ borderTop: `1px solid ${T.borderSoft}` }}>
                      <div>
                        <span className="text-xs font-medium block mb-1" style={{ color: T.muted }}>Vegetativo</span>
                        <div className="flex items-center justify-between p-2 rounded-xl" style={{ background: T.surface2 }}>
                          <span className="text-xs" style={{ color: T.faint }}>Luz</span>
                          {numSm(vegaHours, setVegaHours, 0, 24, 1)}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs font-medium block mb-1" style={{ color: T.muted }}>Floração</span>
                        <div className="flex items-center justify-between p-2 rounded-xl" style={{ background: T.surface2 }}>
                          <span className="text-xs" style={{ color: T.faint }}>Luz</span>
                          {numSm(floraHours, setFloraHours, 0, 24, 1)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2" style={{ borderTop: `1px solid ${T.borderSoft}` }}>
                      <div>
                        <span className="text-xs font-medium block mb-1" style={{ color: T.muted }}>Duração Vega</span>
                        <div className="flex items-center justify-between p-2 rounded-xl" style={{ background: T.surface2 }}>
                          <span className="text-xs" style={{ color: T.faint }}>Dias</span>
                          {numSm(vegaDays, setVegaDays, 1, 180, 5)}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs font-medium block mb-1" style={{ color: T.muted }}>Duração Flora</span>
                        <div className="flex items-center justify-between p-2 rounded-xl" style={{ background: T.surface2 }}>
                          <span className="text-xs" style={{ color: T.faint }}>Dias</span>
                          {numSm(floraDays, setFloraDays, 1, 180, 5)}
                        </div>
                      </div>
                    </div>
                  </div>
                </CollapsibleCard>

                <CollapsibleCard
                  title="4 · Equipamentos & custos"
                  subtitle={`${equipList.length} equipamento(s) · ${fmtBRL(equipCapex)} CAPEX · ${equipWatts}W`}
                  isOpen={openConfigCard === "equipamentos"}
                  onToggle={() => toggleConfigCard("equipamentos")}
                  T={T} dark={dark}>
                  <div className="space-y-4">
                    {/* Botão de Adicionar Novo Equipamento */}
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium" style={{ color: T.muted }}>
                        Cadastre os aparelhos elétricos do seu cultivo:
                      </p>
                      <button
                        type="button"
                        onClick={addEquipItem}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 shrink-0 hover:scale-105"
                        style={{ background: "#f59e0b", color: "#1c1917" }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        <span>Adicionar Equipamento</span>
                      </button>
                    </div>

                    {/* Lista Vazia */}
                    {equipList.length === 0 ? (
                      <div className="text-center py-6 px-4 rounded-xl border border-dashed flex flex-col items-center justify-center gap-2"
                        style={{ borderColor: T.borderSoft, background: T.surface2 }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: T.faint }}>
                          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                        </svg>
                        <p className="text-xs font-medium" style={{ color: T.muted }}>Nenhum equipamento cadastrado</p>
                        <p className="text-[11px]" style={{ color: T.faint }}>Cadastre exaustores, bombas, timers, medidores, desumidificadores, etc.</p>
                        <button
                          type="button"
                          onClick={addEquipItem}
                          className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text }}
                        >
                          + Adicionar primeiro equipamento
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {equipList.map((eq, idx) => {
                          const isCollapsed = !!eq.isCollapsed;
                          const hasUrl = typeof eq.url === "string" && eq.url.trim().length > 0;
                          const itemSubtotal = (Number(eq.cost) || 0) * (Number(eq.qty) || 1);
                          const itemWatts = (Number(eq.watts) || 0) * (Number(eq.qty) || 1);
                          const safeUrl = hasUrl ? (eq.url.trim().startsWith("http") ? eq.url.trim() : `https://${eq.url.trim()}`) : "";

                          return (
                            <div
                              key={eq.id}
                              className="rounded-xl overflow-hidden transition-all"
                              style={{ background: T.surface2, border: `1px solid ${T.border}` }}
                            >
                              {/* Header do Equipamento (Colapsável & Excluível) */}
                              <div
                                className="p-3 flex items-center justify-between gap-2 cursor-pointer select-none"
                                onClick={() => toggleEquipCollapse(eq.id)}
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <div className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
                                    style={{ background: T.surface, color: T.muted, border: `1px solid ${T.border}` }}>
                                    {idx + 1}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-bold truncate" style={{ color: T.text }}>
                                        {eq.name?.trim() || `Equipamento #${idx + 1}`}
                                      </span>
                                      {eq.inShoppingList && (
                                        <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
                                          Lista de compras
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 text-[10.5px] mt-0.5 flex-wrap" style={{ color: T.faint }}>
                                      <span>Qtd: <b style={{ color: T.muted }}>{eq.qty} un</b></span>
                                      <span>·</span>
                                      <span>Total: <b style={{ color: "#38bdf8" }}>{fmtBRL(itemSubtotal)}</b></span>
                                      <span>·</span>
                                      <span>{itemWatts > 0 ? `${itemWatts}W` : "0W"}</span>
                                      <span>·</span>
                                      <span>{eq.hours || 0}h/dia</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                  {/* Botão COMPRAR */}
                                  {hasUrl && (
                                    <a
                                      href={safeUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold transition-transform hover:scale-105 flex items-center gap-1 shrink-0 shadow-sm"
                                      style={{ background: "#f59e0b", color: "#1c1917" }}
                                      title="Abrir link de compra"
                                    >
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="9" cy="21" r="1"/>
                                        <circle cx="20" cy="21" r="1"/>
                                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                                      </svg>
                                      <span>COMPRAR</span>
                                    </a>
                                  )}

                                  {/* Toggle Chevron */}
                                  <button
                                    type="button"
                                    onClick={() => toggleEquipCollapse(eq.id)}
                                    className="p-1 rounded-lg hover:bg-stone-700/30 transition-colors"
                                    style={{ color: T.muted }}
                                    title={isCollapsed ? "Expandir" : "Recolher"}
                                  >
                                    <svg
                                      width="15"
                                      height="15"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      className={`transition-transform duration-200 ${isCollapsed ? "-rotate-90" : "rotate-0"}`}
                                    >
                                      <polyline points="6 9 12 15 18 9" />
                                    </svg>
                                  </button>

                                  {/* Botão Excluir */}
                                  <button
                                    type="button"
                                    onClick={() => delEquip(eq.id)}
                                    className="p-1 rounded-lg hover:bg-red-500/20 text-stone-400 hover:text-red-400 transition-colors"
                                    title="Excluir equipamento"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    </svg>
                                  </button>
                                </div>
                              </div>

                              {/* Corpo Editável do Equipamento */}
                              {!isCollapsed && (
                                <div className="p-3 pt-2 space-y-3 border-t" style={{ borderColor: T.borderSoft, background: T.surface }}>
                                  {/* Nome do Equipamento */}
                                  <div>
                                    <label className="text-[11px] font-semibold block mb-1" style={{ color: T.muted }}>
                                      Nome do equipamento
                                    </label>
                                    <input
                                      type="text"
                                      value={eq.name}
                                      placeholder="Ex: Exaustor Turbo 150mm, Bomba de Ar Boyu, Timer Digital..."
                                      onChange={(e) => updEquip(eq.id, { name: e.target.value })}
                                      className="w-full h-8 px-2.5 rounded-lg text-xs font-medium focus:outline-none"
                                      style={inputStyle}
                                    />
                                  </div>

                                  {/* Grid de Quantidade, Valor Unitário, Watts e Horas por Dia */}
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    <div>
                                      <label className="text-[11px] font-semibold block mb-1" style={{ color: T.muted }}>
                                        Quantidade
                                      </label>
                                      <NumInput
                                        value={eq.qty}
                                        min={1}
                                        max={999}
                                        onCommit={(n) => updEquip(eq.id, { qty: n })}
                                        className={`w-full h-8 ${inputCls}`}
                                        style={inputStyle}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[11px] font-semibold block mb-1" style={{ color: T.muted }}>
                                        Valor unit. (R$)
                                      </label>
                                      <MoneyInput
                                        value={eq.cost}
                                        onCommit={(n) => updEquip(eq.id, { cost: n })}
                                        className={`w-full h-8 ${inputCls}`}
                                        style={inputStyle}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[11px] font-semibold block mb-1" style={{ color: T.muted }}>
                                        Potência (Watts)
                                      </label>
                                      <NumInput
                                        value={eq.watts}
                                        min={0}
                                        max={10000}
                                        onCommit={(n) => updEquip(eq.id, { watts: n })}
                                        className={`w-full h-8 ${inputCls}`}
                                        style={inputStyle}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[11px] font-semibold block mb-1" style={{ color: T.muted }}>
                                        Ligada (h/dia)
                                      </label>
                                      <NumInput
                                        value={eq.hours}
                                        min={0}
                                        max={24}
                                        onCommit={(n) => updEquip(eq.id, { hours: n })}
                                        className={`w-full h-8 ${inputCls}`}
                                        style={inputStyle}
                                      />
                                    </div>
                                  </div>

                                  {/* Checkbox Lista de Compras */}
                                  <div className="pt-1">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={!!eq.inShoppingList}
                                        onChange={(e) => updEquip(eq.id, { inShoppingList: e.target.checked })}
                                        className="rounded w-4 h-4 accent-amber-500 cursor-pointer"
                                      />
                                      <span className="text-xs font-semibold" style={{ color: T.text }}>
                                        Incluir na lista de compras e relatório
                                      </span>
                                    </label>
                                  </div>

                                  {/* URL para Compra do Produto */}
                                  <div>
                                    <label className="text-[11px] font-semibold block mb-1" style={{ color: T.muted }}>
                                      URL / Link para compra do produto (gera QR Code no relatório impresso):
                                    </label>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="url"
                                        value={eq.url || ""}
                                        placeholder="https://mercadolivre.com.br/... ou https://..."
                                        onChange={(e) => updEquip(eq.id, { url: e.target.value })}
                                        className="flex-1 h-8 px-2.5 rounded-lg text-xs font-medium focus:outline-none"
                                        style={inputStyle}
                                      />
                                      {hasUrl && (
                                        <a
                                          href={safeUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 transition-transform hover:scale-105 shadow-sm"
                                          style={{ background: "#f59e0b", color: "#1c1917" }}
                                        >
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <circle cx="9" cy="21" r="1"/>
                                            <circle cx="20" cy="21" r="1"/>
                                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                                          </svg>
                                          <span>COMPRAR</span>
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CollapsibleCard>

                <CollapsibleCard
                  title="5 · Observações, instruções e termos"
                  subtitle={notes || instructions || terms ? "Preenchido" : undefined}
                  isOpen={openConfigCard === "observacoes"}
                  onToggle={() => toggleConfigCard("observacoes")}
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

              {/* Coluna 2: Produtividade/Custos, Diagnóstico, Lista de Materiais, Botão PDF */}
              <div className="space-y-4 sm:space-y-5 w-full max-w-full min-w-0">
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
                  className="w-full py-3.5 rounded-2xl text-sm font-bold transition-opacity hover:opacity-85 flex items-center justify-center gap-2 shadow-sm"
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
      </div>
    )}

      {/* Subdomain Publisher Modal */}
      {publishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg p-6 rounded-2xl shadow-2xl space-y-5" style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text }}>
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: T.borderSoft }}>
              <h3 className="text-lg font-extrabold flex items-center gap-2" style={{ color: T.text }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.71 1.26-1.5 1.74-2.3L4.5 16.5z"/><path d="M12 15l-3-3 7.5-7.5c1.4-1.4 3.7-1.4 5.1 0s1.4 3.7 0 5.1L12 15z"/></svg>
                <span>Publicar Grow em Subdomínio</span>
              </h3>
              <button onClick={() => { setPublishModalOpen(false); setPublishResult(null); }} className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all" style={{ background: T.surface2, color: T.text, border: `1px solid ${T.border}` }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
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

            {/* Toggle: Projeto Público / Privado no Subdomínio */}
            <div className="p-3 rounded-xl flex items-center justify-between border gap-3" style={{ background: T.surface2, borderColor: T.borderSoft }}>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold" style={{ color: T.text }}>
                  Tornar este projeto visível no subdomínio
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: T.muted }}>
                  {isGrowPublic ? "Público (planta baixa, equipamentos e custos visíveis)" : "Privado (somente seu perfil e posts ficarão visíveis)"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGrowPublic((p) => !p)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isGrowPublic ? "bg-emerald-600" : "bg-stone-600"}`}
                title={isGrowPublic ? "Projeto Público" : "Projeto Privado"}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isGrowPublic ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>

            {publishResult && (
              <div className={`p-4 rounded-xl border space-y-2 ${publishResult.success ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
                {publishResult.success ? (
                  <div>
                    <div className="font-extrabold text-xs flex items-center gap-1.5 text-emerald-400">
                      <span> Subdomínio Publicado com Sucesso!</span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: T.text }}>
                      Seu projeto já está online e acessível em:
                    </p>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <a href={publishResult.url} target="_blank" rel="noopener noreferrer"
                        className="px-3.5 py-1.5 rounded-lg text-xs font-extrabold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-colors flex items-center gap-1">
                        <span> Abrir {publishResult.slug}.thegrowinstones.com</span>
                      </a>
                      <button onClick={() => { navigator.clipboard.writeText(publishResult.url); showToast("URL copiada!"); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors" style={{ background: T.surface, borderColor: T.border, color: T.text }}>
                         Copiar Link
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs font-semibold text-red-400">
                     {publishResult.error}
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
                {isPublishing ? "Publicando no Servidor..." : " Publicar Agora"}
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
    </div>
  );
}

export default GrowinStones;