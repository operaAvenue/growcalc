import React, { useState, useRef, useEffect } from "react";
import CryptoJS from "crypto-js";

export default function ESP32WebFlasherModal({ isOpen, onClose, currentUser, T, dark, showToast }) {
  const [isSupported, setIsSupported] = useState(true);
  const [baudRate, setBaudRate] = useState(921600);
  const [wifiSsid, setWifiSsid] = useState(() => localStorage.getItem("growcalc_esp32_wifi_ssid") || "");
  const [wifiPass, setWifiPass] = useState(() => localStorage.getItem("growcalc_esp32_wifi_pass") || "");
  const [showPass, setShowPass] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [statusText, setStatusText] = useState("Pronto para conectar");
  const [currentStep, setCurrentStep] = useState(0); // 0: Idle, 1: Connecting, 2: Fetching Binaries, 3: Flashing, 4: Provisioning, 5: Done, 6: Error
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

    // Salvar credenciais no localStorage se preenchidas
    if (wifiSsid.trim()) {
      localStorage.setItem("growcalc_esp32_wifi_ssid", wifiSsid.trim());
      localStorage.setItem("growcalc_esp32_wifi_pass", wifiPass.trim());
    }

    setFlashing(true);
    setLogs([]);
    setProgressPercent(0);
    setFileProgress("");
    setChipInfo(null);
    setCurrentStep(1);
    setStatusText("Solicitando porta USB...");

    let port = null;
    let transport = null;
    let esploader = null;

    try {
      appendLog("[WEB-SERIAL] Solicitando seleção da porta USB ao usuário...");
      port = await navigator.serial.requestPort();

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
      setStatusText("Baixando binários do firmware openAgro...");
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
        flashMode: "keep",
        flashFreq: "keep",
        flashSize: "keep",
        eraseAll: false,
        compress: true,
        reportProgress: (fileIndex, written, total) => {
          const pct = Math.round((written / total) * 100);
          setProgressPercent(pct);
          const currentFile = fileArray[fileIndex] ? fileArray[fileIndex].name : `Partição ${fileIndex + 1}`;
          setFileProgress(`${currentFile}: ${pct}% (${(written / 1024).toFixed(0)} / ${(total / 1024).toFixed(0)} KB)`);
        },
        calculateMD5Hash: (image) => {
          if (typeof image === "string") {
            return CryptoJS.MD5(CryptoJS.enc.Latin1.parse(image)).toString();
          }
          let binary = "";
          const len = image.length;
          const chunk = 0x8000;
          for (let i = 0; i < len; i += chunk) {
            binary += String.fromCharCode.apply(null, image.subarray(i, Math.min(i + chunk, len)));
          }
          return CryptoJS.MD5(CryptoJS.enc.Latin1.parse(binary)).toString();
        }
      });

      appendLog("[ESPTOOL] Gravação concluída e verificada com sucesso!");
      setStatusText("Reiniciando ESP32 em modo de execução...");

      await esploader.hardReset();
      await transport.disconnect();

      // Etapa 4: Provisionamento de Wi-Fi e MQTT via Serial (Se fornecido)
      if (wifiSsid.trim()) {
        setCurrentStep(4);
        setStatusText("Configurando Wi-Fi & MQTT no ESP32...");
        appendLog(`[PROV] Abrindo porta serial para enviar credenciais Wi-Fi (${wifiSsid.trim()})...`);
        
        try {
          await new Promise((r) => setTimeout(r, 1500)); // Aguarda inicialização do ESP32
          await port.open({ baudRate: 115200 });

          const provCmd = `PROV|${wifiSsid.trim()}|${wifiPass.trim()}|grow.thegrowinstones.com|1883||\n`;
          const encoder = new TextEncoder();
          const writer = port.writable.getWriter();
          await writer.write(encoder.encode(provCmd));
          writer.releaseLock();

          appendLog("[PROV] Pacote de Wi-Fi e MQTT gravado na NVS do ESP32 com sucesso!");
          await new Promise((r) => setTimeout(r, 1000));
          await port.close();
        } catch (provErr) {
          appendLog(`[PROV] Aviso na porta serial: ${provErr.message || provErr}`);
        }
      }

      setCurrentStep(5);
      setStatusText("ESP32 Gravado e Configurado com Sucesso!");
      showToast("ESP32 gravado e configurado com sucesso! Conectando ao Wi-Fi e MQTT...");
    } catch (err) {
      console.error("Erro na gravação do ESP32:", err);
      setCurrentStep(6);
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
        className="w-full max-w-2xl p-6 rounded-3xl text-left shadow-2xl relative space-y-5 max-h-[90vh] overflow-y-auto"
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

        {/* Seção 1: Pré-Configuração de Wi-Fi Local */}
        <div className="p-4 rounded-2xl space-y-3" style={{ background: T.surface2, border: `1px solid ${T.border}` }}>
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: T.text }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
              <span>Pré-Configuração de Wi-Fi do ESP32</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}>
              Auto-Provisioning
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold block mb-1" style={{ color: T.text }}>Nome da Rede Wi-Fi (SSID):</label>
              <input
                type="text"
                placeholder="Ex: MinhaCasa_2.4G"
                value={wifiSsid}
                onChange={(e) => setWifiSsid(e.target.value)}
                disabled={flashing}
                className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold transition-all"
                style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text }}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold block" style={{ color: T.text }}>Senha do Wi-Fi:</label>
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="text-[10px] underline"
                  style={{ color: T.muted }}
                >
                  {showPass ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              <input
                type={showPass ? "text" : "password"}
                placeholder="Senha da rede Wi-Fi"
                value={wifiPass}
                onChange={(e) => setWifiPass(e.target.value)}
                disabled={flashing}
                className="w-full px-3 py-2 rounded-xl text-xs font-mono font-bold transition-all"
                style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text }}
              />
            </div>
          </div>
          <p className="text-[11px]" style={{ color: T.muted }}>
            O gravador enviará as credenciais de Wi-Fi e os parâmetros MQTT para a memória NVS do ESP32 assim que o firmware for gravado.
          </p>
        </div>

        {/* Parâmetros de Telemetria e Serial */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: T.text }}>Broker MQTT (Nativo):</label>
            <div className="px-3 py-2 rounded-xl text-xs font-mono font-bold truncate" style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}>
              grow.thegrowinstones.com:1883
            </div>
          </div>

          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: T.text }}>Velocidade de Gravação:</label>
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
            className="p-3.5 rounded-2xl font-mono text-xs overflow-y-auto max-h-40 space-y-1 select-text"
            style={{ background: T.inset, border: `1px solid ${T.border}`, color: T.text }}
          >
            {logs.length === 0 ? (
              <div style={{ color: T.muted }}>// Preencha o Wi-Fi (opcional) e clique em "Conectar & Gravar ESP32"...</div>
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
            Conecte o ESP32 na porta USB do computador.
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
