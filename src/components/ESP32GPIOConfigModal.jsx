import React, { useState, useEffect } from "react";

const STANDARD_OPENAGRO_PRESET = [
  { gpio: 36, name: "Sensor pH", customLabel: "pH da Água", mode: "SENSOR_WATER_PH", calibMultiplier: -0.005, calibOffset: 16.0 },
  { gpio: 34, name: "Sensor EC", customLabel: "EC da Água", mode: "SENSOR_WATER_EC", calibMultiplier: 0.0008, calibOffset: 0.0 },
  { gpio: 32, name: "Sensor Temp", customLabel: "Temp da Água", mode: "SENSOR_WATER_TEMP", calibMultiplier: -0.015, calibOffset: 45.0 },
  { gpio: 14, name: "Bomba pH Down", customLabel: "Bomba pH Down", mode: "DOSING_PUMP", dosingVolume: -0.5, dosingFlowRate: 60.0 },
  { gpio: 12, name: "Bomba pH Up", customLabel: "Bomba pH Up", mode: "DOSING_PUMP", dosingVolume: 0.5, dosingFlowRate: 60.0 },
  { gpio: 27, name: "Bomba Nutriente A", customLabel: "Bomba Nutriente A", mode: "DOSING_PUMP", dosingVolume: 1.0, dosingFlowRate: 60.0 },
  { gpio: 26, name: "Bomba Nutriente B", customLabel: "Bomba Nutriente B", mode: "DOSING_PUMP", dosingVolume: 1.0, dosingFlowRate: 60.0 },
  { gpio: 25, name: "Bomba Nutriente C", customLabel: "Bomba Nutriente C", mode: "DOSING_PUMP", dosingVolume: 1.0, dosingFlowRate: 60.0 },
  { gpio: 33, name: "Bomba Água", customLabel: "Bomba Água Flush", mode: "DOSING_PUMP", dosingVolume: 10.0, dosingFlowRate: 100.0 },
  { gpio: 19, name: "Painel LED", customLabel: "Painel LED", mode: "DIGITAL_OUTPUT", value: 0 },
  { gpio: 18, name: "Exaustor", customLabel: "Exaustor", mode: "DIGITAL_OUTPUT", value: 0 }
];

const PIN_MODES = [
  { id: "DIGITAL_OUTPUT", label: "Saída Digital (Relé / LED / Exaustor)" },
  { id: "DOSING_PUMP", label: "Bomba Dosadora Peristáltica (Dose ml)" },
  { id: "SENSOR_WATER_PH", label: "Sensor de pH da Água" },
  { id: "SENSOR_WATER_EC", label: "Sensor de Condutividade (EC)" },
  { id: "SENSOR_WATER_TEMP", label: "Sensor de Temperatura da Água" },
  { id: "PWM_OUTPUT", label: "Saída PWM (Dimerização)" },
  { id: "DIGITAL_INPUT", label: "Entrada Digital (Boia / Nível)" }
];

export default function ESP32GPIOConfigModal({ isOpen, onClose, T, dark, showToast, deviceIp, activeId }) {
  const [pins, setPins] = useState(STANDARD_OPENAGRO_PRESET);
  const [espIp, setEspIp] = useState(deviceIp || "192.168.1.141");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // New pin form state
  const [newGpio, setNewGpio] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newMode, setNewMode] = useState("DIGITAL_OUTPUT");

  useEffect(() => {
    if (deviceIp) setEspIp(deviceIp);
  }, [deviceIp]);

  const loadPinsFromDevice = async () => {
    if (!espIp) return;
    setLoading(true);
    try {
      const res = await fetch(`http://${espIp}/api/status`);
      if (res.ok) {
        const data = await res.json();
        if (data.pins && Array.isArray(data.pins) && data.pins.length > 0) {
          setPins(data.pins);
          showToast(`Carregados ${data.pins.length} pinos do ESP32 (${espIp})`);
        }
      }
    } catch (e) {
      showToast(`Não foi possível conectar ao IP local ${espIp}. Usando lista configurada.`);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPreset = () => {
    setPins([...STANDARD_OPENAGRO_PRESET]);
    showToast("Preset padrão openAgro aplicado (11 pinos)");
  };

  const handleAddPin = () => {
    const gpioNum = parseInt(newGpio, 10);
    if (isNaN(gpioNum) || gpioNum < 0 || gpioNum > 39) {
      showToast("Número de GPIO inválido (deve ser entre 0 e 39).");
      return;
    }
    if (pins.some((p) => p.gpio === gpioNum)) {
      showToast(`O GPIO ${gpioNum} já está configurado na lista.`);
      return;
    }

    const label = newLabel.trim() || `Pino GPIO ${gpioNum}`;
    const newPinObj = {
      gpio: gpioNum,
      name: label,
      customLabel: label,
      mode: newMode,
      value: 0
    };

    setPins([...pins, newPinObj]);
    setNewGpio("");
    setNewLabel("");
    showToast(`Pino GPIO ${gpioNum} adicionado.`);
  };

  const handleRemovePin = (gpio) => {
    setPins(pins.filter((p) => p.gpio !== gpio));
    showToast(`Pino GPIO ${gpio} removido.`);
  };

  const handleSaveToDevice = async () => {
    setSaving(true);
    let successCount = 0;

    for (const p of pins) {
      try {
        const res = await fetch(`http://${espIp}/api/pins`, {
          method: "POST",
          headers: {
            "Authorization": "Bearer admin",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(p)
        });
        if (res.ok) successCount++;
      } catch (e) {
        // Fallback: send via server MQTT proxy
        try {
          await fetch("https://grow.thegrowinstones.com/api/mqtt/cmd", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              topic: `openagro/${activeId || "melkweg003"}/config/set`,
              payload: JSON.stringify(p)
            })
          });
          successCount++;
        } catch (err) {}
      }
    }

    setSaving(false);
    showToast(`Configuração de ${successCount} pinos sincronizada com sucesso!`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}>
      <div
        className="w-full max-w-3xl rounded-3xl p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto shadow-2xl transition-all"
        style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: T.borderSoft }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: T.text }}>
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <rect x="9" y="9" width="6" height="6" />
                <line x1="9" y1="1" x2="9" y2="4" />
                <line x1="15" y1="1" x2="15" y2="4" />
                <line x1="9" y1="20" x2="9" y2="23" />
                <line x1="15" y1="20" x2="15" y2="23" />
                <line x1="20" y1="9" x2="23" y2="9" />
                <line x1="20" y1="15" x2="23" y2="15" />
                <line x1="1" y1="9" x2="4" y2="9" />
                <line x1="1" y1="15" x2="4" y2="15" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: T.text }}>Gerenciador de Pinos GPIO & Dispositivos</h2>
              <p className="text-xs" style={{ color: T.muted }}>Configure e sincronize sensores, bombas e relés com o firmware do ESP32.</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
            style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* IP do ESP32 & Ações Rápidas */}
        <div className="p-4 rounded-2xl flex items-center justify-between flex-wrap gap-3" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold" style={{ color: T.text }}>IP Local do ESP32:</span>
            <input
              type="text"
              value={espIp}
              onChange={(e) => setEspIp(e.target.value)}
              className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold"
              style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.text }}
              placeholder="192.168.1.141"
            />
            <button
              onClick={loadPinsFromDevice}
              disabled={loading}
              className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.text }}
            >
              {loading ? "Lendo..." : "Ler do ESP32"}
            </button>
          </div>

          <button
            onClick={handleApplyPreset}
            className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.text }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Preset Padrão openAgro (11 Pinos)</span>
          </button>
        </div>

        {/* Lista de Pinos Configurados */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: T.text }}>Pinos Configurados ({pins.length})</h3>
            <span className="text-[11px]" style={{ color: T.muted }}>Sensores analógicos e saídas digitais ativas</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
            {pins.map((p) => (
              <div
                key={p.gpio}
                className="p-3 rounded-2xl flex items-center justify-between gap-3 transition-all"
                style={{ background: T.surface2, border: `1px solid ${T.border}` }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold" style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.text }}>
                      GPIO {p.gpio}
                    </span>
                    <span className="text-xs font-bold truncate" style={{ color: T.text }}>{p.customLabel || p.name}</span>
                  </div>
                  <div className="text-[10px] font-mono mt-1 truncate" style={{ color: T.muted }}>
                    {PIN_MODES.find((m) => m.id === p.mode)?.label || p.mode}
                  </div>
                </div>

                <button
                  onClick={() => handleRemovePin(p.gpio)}
                  className="w-7 h-7 rounded-xl flex items-center justify-center transition-all flex-shrink-0"
                  style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.muted }}
                  title="Remover pino"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Adicionar Novo Pino */}
        <div className="p-4 rounded-2xl space-y-3" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
          <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: T.text }}>Adicionar Novo Pino GPIO</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: T.muted }}>Número GPIO (0-39)</label>
              <input
                type="number"
                min="0"
                max="39"
                value={newGpio}
                onChange={(e) => setNewGpio(e.target.value)}
                placeholder="Ex: 23"
                className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold"
                style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.text }}
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: T.muted }}>Rótulo / Nome</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Ex: Bomba Circulação"
                className="w-full px-3 py-2 rounded-xl text-xs font-bold"
                style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.text }}
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: T.muted }}>Tipo / Função</label>
              <select
                value={newMode}
                onChange={(e) => setNewMode(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs font-bold"
                style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.text }}
              >
                {PIN_MODES.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              onClick={handleAddPin}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              style={{ background: T.text, color: T.bg }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>Adicionar Pino à Lista</span>
            </button>
          </div>
        </div>

        {/* Rodapé / Botão de Gravação */}
        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: T.borderSoft }}>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-bold transition-all"
            style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
          >
            Cancelar
          </button>

          <button
            onClick={handleSaveToDevice}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2"
            style={{ background: T.text, color: T.bg }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
            <span>{saving ? "Gravando Pinos no ESP32..." : "Salvar & Gravar no ESP32"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
