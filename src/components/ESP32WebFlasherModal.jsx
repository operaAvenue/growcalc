import React, { useState, useRef, useEffect } from "react";
import CryptoJS from "crypto-js";

export default function ESP32WebFlasherModal({ isOpen, onClose, currentUser, T, dark, showToast }) {
  const [isSupported, setIsSupported] = useState(true);
  const [baudRate, setBaudRate] = useState(921600);
  const [flashing, setFlashing] = useState(false);
  const [statusText, setStatusText] = useState("Pronto para conectar");
  const [currentStep, setCurrentStep] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [fileProgress, setFileProgress] = useState("");
  const [logs, setLogs] = useState([]);
  const [chipInfo, setChipInfo] = useState(null);

  const logContainerRef = useRef(null);

  useEffect(() => {
    if (typeof navigator !== "undefined" && !("serial" in navigator)) {
      setIsSupported(false);
    }
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  if (!isOpen) return null;

  const appendLog = (msg) => {
    if (typeof msg !== "string") msg = String(msg);
    setLogs((prev) => [...prev.slice(-200), msg]);
  };

  const bufferToBinaryString = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const len = bytes.byteLength;
    const chunkSize = 0x8000;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, len)));
    }
    return binary;
  };

  const handleStartFlashing = async () => {
    if (!("serial" in navigator)) {
      showToast("Seu navegador não suporta Web Serial. Use Google Chrome, Edge, Brave ou Opera.");
      return;
    }

    setFlashing(true);
    setLogs([]);
    setProgressPercent(0);
    setFileProgress("");
    setChipInfo(null);
    setCurrentStep(1);
    setStatusText("Solicitando porta USB...");

    let transport = null;
    let esploader = null;

    try {
      appendLog("[WEB-SERIAL] Solicitando porta USB ao usuário...");
      const port = await navigator.serial.requestPort();

      const { ESPLoader, Transport } = await import("esptool-js/bundle.js");

      transport = new Transport(port, true);

      const customTerminal = {
        clean: () => setLogs([]),
        writeLine: (data) => appendLog(data),
        write: (data) => appendLog(data)
      };

      esploader = new ESPLoader({
        transport,
        baudrate: Number(baudRate),
        terminal: customTerminal,
        romBaudrate: 115200
      });

      appendLog(`[ESPTOOL] Conectando ao bootloader ROM com baudrate ${baudRate}...`);
      setStatusText("Conectando ao ESP32...");
      
      const chip = await esploader.main();
      appendLog(`[ESPTOOL] Chip conectado com sucesso: ${chip}`);
      setChipInfo(chip);

      // Etapa 2: Carregar Binários de Firmware
      setCurrentStep(2);
      setStatusText("Baixando binários do firmware...");
      appendLog("[FIRMWARE] Baixando bootloader.bin (0x1000)...");
      const bootloaderRes = await fetch("/firmware/bootloader.bin");
      if (!bootloaderRes.ok) throw new Error("Falha ao baixar bootloader.bin");
      const bootloaderBuf = await bootloaderRes.arrayBuffer();

      appendLog("[FIRMWARE] Baixando partitions.bin (0x8000)...");
      const partitionsRes = await fetch("/firmware/partitions.bin");
      if (!partitionsRes.ok) throw new Error("Falha ao baixar partitions.bin");
      const partitionsBuf = await partitionsRes.arrayBuffer();

      appendLog("[FIRMWARE] Baixando firmware.bin (0x10000)...");
      const firmwareRes = await fetch("/firmware/firmware.bin");
      if (!firmwareRes.ok) throw new Error("Falha ao baixar firmware.bin");
      const firmwareBuf = await firmwareRes.arrayBuffer();

      appendLog("[FIRMWARE] Baixando littlefs.bin (0x2D0000)...");
      const littlefsRes = await fetch("/firmware/littlefs.bin");
      if (!littlefsRes.ok) throw new Error("Falha ao baixar littlefs.bin");
      const littlefsBuf = await littlefsRes.arrayBuffer();

      const fileArray = [
        { data: bufferToBinaryString(bootloaderBuf), address: 0x1000, name: "bootloader.bin" },
        { data: bufferToBinaryString(partitionsBuf), address: 0x8000, name: "partitions.bin" },
        { data: bufferToBinaryString(firmwareBuf), address: 0x10000, name: "firmware.bin (openAgro core)" },
        { data: bufferToBinaryString(littlefsBuf), address: 0x2D0000, name: "littlefs.bin (Web App UI)" }
      ];

      // Etapa 3: Gravação da Flash
      setCurrentStep(3);
      setStatusText("Gravando partições no ESP32...");
      appendLog("[ESPTOOL] Iniciando gravação de flash em 4 partições...");

      await esploader.writeFlash({
        fileArray,
        flashSize: "keep",
        eraseAll: false,
        compress: true,
        reportProgress: (fileIndex, written, total) => {
          const pct = Math.round((written / total) * 100);
          setProgressPercent(pct);
          const currentFile = fileArray[fileIndex] ? fileArray[fileIndex].name : `Partição ${fileIndex + 1}`;
          setFileProgress(`${currentFile}: ${pct}% (${(written / 1024).toFixed(0)} / ${(total / 1024).toFixed(0)} KB)`);
        },
        calculateMD5Hash: (image) => CryptoJS.MD5(CryptoJS.enc.Latin1.parse(image)).toString()
      });

      appendLog("[ESPTOOL] Gravação concluída com verificação de hash SHA/MD5 com sucesso!");
      setStatusText("Reiniciando ESP32 em modo de execução...");

      // Etapa 4: Reinicialização & Finalização
      await esploader.hardReset();
      await transport.disconnect();

      setCurrentStep(4);
      setStatusText("ESP32 Gravado e Inicializado com Sucesso!");
      showToast("ESP32 gravado com sucesso! O dispositivo está pronto para operar.");
    } catch (err) {
      console.error("Erro na gravação do ESP32:", err);
      setCurrentStep(5);
      setStatusText("Falha na gravação");
      appendLog(`[ERRO] ${err.message || err}`);
      showToast(`Falha na gravação: ${err.message || "Erro desconhecido"}`);
      if (transport) {
        try {
          await transport.disconnect();
        } catch (e) {}
      }
    } finally {
      setFlashing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div
        className="w-full max-w-2xl p-6 rounded-3xl text-left shadow-2xl relative space-y-6 max-h-[90vh] overflow-y-auto"
        style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: T.borderSoft }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold shrink-0" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
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
              <h2 className="font-bold text-lg" style={{ color: T.text }}>
                Gravação USB do ESP32 (Web Flasher)
              </h2>
              <p className="text-xs" style={{ color: T.muted }}>
                Instale o firmware <b>ESP32-IoT-Controller (openAgro v2.4)</b> diretamente pelo navegador via cabo USB.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={flashing}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-50"
            style={{ background: T.surface2, color: T.text, border: `1px solid ${T.border}` }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Warning se não suportar Web Serial */}
        {!isSupported && (
          <div className="p-4 rounded-2xl border flex items-start gap-3" style={{ background: T.surface2, borderColor: T.border }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5" style={{ color: T.text }}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div className="text-xs space-y-1">
              <div className="font-bold" style={{ color: T.text }}>Navegador incompatível com Web Serial</div>
              <p style={{ color: T.muted }}>
                Para gravar o ESP32 via USB pelo navegador, utilize o <b>Google Chrome</b>, <b>Microsoft Edge</b>, <b>Brave</b> ou <b>Opera</b> no computador (Windows, Mac ou Linux).
              </p>
            </div>
          </div>
        )}

        {/* Informações de Auto-Configuração */}
        <div className="p-4 rounded-2xl space-y-3" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
          <div className="text-xs font-bold uppercase tracking-wider" style={{ color: T.text }}>
            Parâmetros de Telemetria Vinculados
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-2.5 rounded-xl border" style={{ background: T.surface, borderColor: T.borderSoft }}>
              <div className="text-[10px] text-stone-400 font-sans">Broker MQTT Servidor:</div>
              <div className="font-bold" style={{ color: T.text }}>grow.thegrowinstones.com:1883</div>
            </div>
            <div className="p-2.5 rounded-xl border" style={{ background: T.surface, borderColor: T.borderSoft }}>
              <div className="text-[10px] text-stone-400 font-sans">Namespace / Usuário:</div>
              <div className="font-bold" style={{ color: T.text }}>openagro/{currentUser?.username || "default"}</div>
            </div>
          </div>
        </div>

        {/* Opções de Conexão Serial */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: T.text }}>Velocidade de Gravação (Baudrate):</label>
            <select
              value={baudRate}
              onChange={(e) => setBaudRate(Number(e.target.value))}
              disabled={flashing}
              className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold transition-all"
              style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
            >
              <option value={921600}>921600 bps (Ultra-Rápido ~40s)</option>
              <option value={460800}>460800 bps (Rápido e Estável)</option>
              <option value={115200}>115200 bps (Padrão de Segurança)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: T.text }}>Chip Alvo:</label>
            <div className="px-3 py-2 rounded-xl text-xs font-mono font-bold" style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}>
              {chipInfo ? `Detectado: ${chipInfo}` : "ESP32 Standard (Dual Core 240MHz)"}
            </div>
          </div>
        </div>

        {/* Barra de Progresso */}
        {flashing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold" style={{ color: T.text }}>{statusText}</span>
              <span className="font-bold" style={{ color: T.text }}>{progressPercent}%</span>
            </div>
            <div className="w-full h-3 rounded-full overflow-hidden border" style={{ background: T.surface2, borderColor: T.border }}>
              <div
                className="h-full transition-all duration-150"
                style={{ width: `${progressPercent}%`, background: T.text }}
              ></div>
            </div>
            {fileProgress && (
              <div className="text-[11px] font-mono text-center truncate" style={{ color: T.muted }}>
                {fileProgress}
              </div>
            )}
          </div>
        )}

        {/* Terminal Console Output */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider" style={{ color: T.text }}>
            <span>Terminal de Gravação Serial</span>
            <span className="text-[10px] font-mono" style={{ color: T.muted }}>Web Serial Driver</span>
          </div>
          <div
            ref={logContainerRef}
            className="p-3.5 rounded-2xl font-mono text-xs overflow-y-auto max-h-48 space-y-1 select-text"
            style={{ background: T.inset, border: `1px solid ${T.border}`, color: T.text }}
          >
            {logs.length === 0 ? (
              <div style={{ color: T.muted }}>// Clique em "Conectar & Gravar ESP32" para iniciar a comunicação serial...</div>
            ) : (
              logs.map((line, idx) => (
                <div key={idx} className="leading-relaxed whitespace-pre-wrap">{line}</div>
              ))
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t" style={{ borderColor: T.borderSoft }}>
          <div className="text-xs" style={{ color: T.muted }}>
            Certifique-se de usar um cabo USB com dados (não apenas de carga).
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={flashing}
              className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
              style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
            >
              Fechar
            </button>

            <button
              onClick={handleStartFlashing}
              disabled={flashing || !isSupported}
              className="px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow flex items-center gap-2 disabled:opacity-50"
              style={{ background: T.text, color: T.bg }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77 0"/></svg>
              <span>{flashing ? "Gravando ESP32..." : "Conectar & Gravar ESP32"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
