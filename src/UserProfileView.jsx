import React, { useState, useEffect, useRef } from "react";

// ————————————————— OBSIDIAN MARKDOWN PARSER & RENDERER —————————————————
export function parseObsidianMarkdown(markdown, isDark = true) {
  if (!markdown) return "";

  // 1. Initial sanitize: encode HTML tags
  let src = String(markdown)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Restore blockquote markers
  src = src.replace(/^&gt;\s?/gm, "> ");

  // 2. Fenced Code Blocks: ```lang\ncode\n```
  const codeBlocks = [];
  src = src.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const id = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(`
      <div class="obsidian-code-block" style="background:#141210; border:1px solid #292524; border-radius:10px; margin:10px 0; overflow:hidden; font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">
        ${lang ? `<div style="background:#1c1917; padding:4px 10px; font-size:10.5px; font-weight:700; color:#a8a29e; border-bottom:1px solid #292524; text-transform:uppercase;">${lang}</div>` : ''}
        <pre style="margin:0; padding:10px 12px; overflow-x:auto; font-size:12px; line-height:1.5; color:#38bdf8; white-space:pre-wrap; word-break:break-all;"><code>${code.trim()}</code></pre>
      </div>
    `);
    return id;
  });

  // 3. Obsidian Callouts: > [!NOTE], > [!TIP], > [!WARNING], > [!DANGER], > [!INFO], > [!SUCCESS], etc.
  const calloutColors = {
    note: { bg: 'rgba(2,132,199,0.12)', border: '#0284c7', text: '#38bdf8', icon: 'ℹ️', title: 'Nota' },
    info: { bg: 'rgba(2,132,199,0.12)', border: '#0284c7', text: '#38bdf8', icon: 'ℹ️', title: 'Informação' },
    tip: { bg: 'rgba(16,185,129,0.12)', border: '#10b981', text: '#34d399', icon: '💡', title: 'Dica' },
    success: { bg: 'rgba(16,185,129,0.12)', border: '#10b981', text: '#34d399', icon: '✅', title: 'Sucesso' },
    check: { bg: 'rgba(16,185,129,0.12)', border: '#10b981', text: '#34d399', icon: '✅', title: 'Check' },
    warning: { bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', text: '#fbbf24', icon: '⚠️', title: 'Aviso' },
    danger: { bg: 'rgba(239,68,68,0.12)', border: '#ef4444', text: '#f87171', icon: '🚨', title: 'Atenção' },
    error: { bg: 'rgba(239,68,68,0.12)', border: '#ef4444', text: '#f87171', icon: '❌', title: 'Erro' },
    quote: { bg: 'rgba(168,162,158,0.12)', border: '#a8a29e', text: '#e7e5e4', icon: '💬', title: 'Citação' }
  };

  src = src.replace(/^>\s*\[!([a-zA-Z]+)\]\s*(.*)?(?:\n(?:>\s*.*(?:\n|$))*)?/gm, (match, typeRaw, customTitle) => {
    const type = typeRaw.toLowerCase();
    const cfg = calloutColors[type] || calloutColors.note;
    const title = (customTitle && customTitle.trim()) ? customTitle.trim() : (cfg.title || type.toUpperCase());
    
    const lines = match.split('\n');
    let bodyLines = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].replace(/^>\s?/, '');
      if (line) bodyLines.push(line);
    }
    const bodyContent = bodyLines.join('<br />').trim();

    return `
      <div class="obsidian-callout" style="background:${cfg.bg}; border-left:4px solid ${cfg.border}; border-radius:8px; padding:10px 14px; margin:10px 0;">
        <div style="display:flex; align-items:center; gap:6px; font-weight:700; font-size:12.5px; color:${cfg.text};">
          <span>${cfg.icon}</span>
          <span>${title}</span>
        </div>
        ${bodyContent ? `<div style="font-size:13px; line-height:1.5; color:#f5f5f4; margin-top:6px;">${bodyContent}</div>` : ''}
      </div>
    `;
  });

  // Standard blockquotes: > quote
  src = src.replace(/^>\s+(.+)$/gm, `
    <blockquote style="margin:8px 0; padding:6px 12px; border-left:3px solid #78716c; background:rgba(255,255,255,0.03); color:#d6d3d1; font-style:italic; border-radius:0 6px 6px 0;">$1</blockquote>
  `);

  // 4. Tables (Obsidian / Markdown Tables)
  src = src.replace(/(?:^\|.+?\|$\n?)+/gm, (tableMatch) => {
    const rows = tableMatch.trim().split('\n').filter(r => r.trim().startsWith('|'));
    if (rows.length < 2) return tableMatch;
    
    let html = '<div style="overflow-x:auto; margin:10px 0;"><table style="width:100%; border-collapse:collapse; font-size:12.5px; border-radius:8px; overflow:hidden;">';
    let isHeader = true;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].trim();
      if (row.match(/^\|\s*[-:]+[-| :]*\|$/)) {
        isHeader = false;
        continue;
      }
      const cols = row.split('|').slice(1, -1);
      html += '<tr>';
      for (let c of cols) {
        const cell = c.trim();
        if (isHeader && i === 0) {
          html += `<th style="text-align:left; padding:6px 10px; background:#1c1917; border-bottom:2px solid #44403c; color:#a8a29e; font-weight:700; font-size:11px; text-transform:uppercase;">${cell}</th>`;
        } else {
          html += `<td style="padding:6px 10px; border-bottom:1px solid #292524; color:#e7e5e4;">${cell}</td>`;
        }
      }
      html += '</tr>';
      if (i === 0) isHeader = false;
    }
    html += '</table></div>';
    return html;
  });

  // 5. Headings (Obsidian standard #, ##, ###, ####, #####, ######)
  src = src.replace(/^######\s+(.+)$/gm, '<h6 style="font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:#a8a29e; margin:12px 0 4px;">$1</h6>');
  src = src.replace(/^#####\s+(.+)$/gm, '<h5 style="font-size:13px; font-weight:800; color:#cbd5e1; margin:12px 0 4px;">$1</h5>');
  src = src.replace(/^####\s+(.+)$/gm, '<h4 style="font-size:14px; font-weight:800; color:#e2e8f0; margin:14px 0 6px;">$1</h4>');
  src = src.replace(/^###\s+(.+)$/gm, '<h3 style="font-size:15.5px; font-weight:800; color:#f8fafc; margin:16px 0 6px;">$1</h3>');
  src = src.replace(/^##\s+(.+)$/gm, '<h2 style="font-size:17.5px; font-weight:800; color:#ffffff; border-bottom:1px solid #292524; padding-bottom:4px; margin:18px 0 8px;">$1</h2>');
  src = src.replace(/^#\s+(.+)$/gm, '<h1 style="font-size:20px; font-weight:900; color:#f59e0b; border-bottom:2px solid rgba(245,158,11,0.3); padding-bottom:5px; margin:20px 0 10px;">$1</h1>');

  // 6. Horizontal Rules: ---, ***, ___
  src = src.replace(/^(?:---|\*\*\*|___)$/gm, '<hr style="border:none; border-top:1px solid #292524; margin:14px 0;" />');

  // 7. Obsidian Task Lists (Checkboxes): - [ ] and - [x]
  src = src.replace(/^-\s+\[ \]\s+(.+)$/gm, `
    <div style="display:flex; align-items:center; gap:8px; margin:3px 0; font-size:13px;">
      <input type="checkbox" disabled style="accent-color:#f59e0b; cursor:default; width:14px; height:14px;" />
      <span style="color:#e7e5e4;">$1</span>
    </div>
  `);
  src = src.replace(/^-\s+\[x\]\s+(.+)$/gim, `
    <div style="display:flex; align-items:center; gap:8px; margin:3px 0; font-size:13px;">
      <input type="checkbox" checked disabled style="accent-color:#10b981; cursor:default; width:14px; height:14px;" />
      <span style="color:#78716c; text-decoration:line-through;">$1</span>
    </div>
  `);

  // 8. Lists: Unordered (- or *) & Ordered (1., 2.)
  src = src.replace(/^[-*]\s+(.+)$/gm, '<li style="margin-left:18px; list-style-type:disc; margin-bottom:3px; font-size:13px;">$1</li>');
  src = src.replace(/^\d+\.\s+(.+)$/gm, '<li style="margin-left:18px; list-style-type:decimal; margin-bottom:3px; font-size:13px;">$1</li>');

  // 9. Obsidian Highlights: ==text==
  src = src.replace(/==([^=]+)==/g, '<mark style="background:rgba(245,158,11,0.28); color:#fef08a; padding:1px 5px; border-radius:4px; font-weight:600;">$1</mark>');

  // 10. Obsidian Wikilinks: [[Target|Alias]] or [[Target]]
  src = src.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '<span class="obsidian-wikilink" style="color:#38bdf8; text-decoration:underline; font-weight:600; cursor:pointer;" title="Link interno: $1">$2</span>');
  src = src.replace(/\[\[([^\]]+)\]\]/g, '<span class="obsidian-wikilink" style="color:#38bdf8; text-decoration:underline; font-weight:600; cursor:pointer;" title="Link interno">$1</span>');

  // 11. Obsidian Tags: #tag
  src = src.replace(/(^|\s)#([a-zA-Z0-9_\-\/]+)/g, '$1<span class="obsidian-tag" style="display:inline-block; background:rgba(245,158,11,0.14); color:#f59e0b; border:1px solid rgba(245,158,11,0.3); padding:0 6px; border-radius:10px; font-size:11px; font-weight:700; margin:0 2px;">#$2</span>');

  // 12. Text styles: Bold, Italic, Strikethrough, Inline Code
  src = src.replace(/\*\*\*([^*]+)\*\*\*/g, '<b><i>$1</i></b>');
  src = src.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  src = src.replace(/__([^_]+)__/g, '<b>$1</b>');
  src = src.replace(/\*([^*]+)\*/g, '<i>$1</i>');
  src = src.replace(/_([^_]+)_/g, '<i>$1</i>');
  src = src.replace(/~~([^~]+)~~/g, '<del style="color:#78716c;">$1</del>');
  src = src.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08); color:#38bdf8; padding:1px 5px; border-radius:4px; font-size:12px; font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">$1</code>');

  // 13. Standard Markdown Links: [text](url)
  src = src.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#38bdf8; text-decoration:underline; font-weight:600;">$1</a>');

  // 14. Restore Code Blocks
  for (let i = 0; i < codeBlocks.length; i++) {
    src = src.replace(`__CODE_BLOCK_${i}__`, codeBlocks[i]);
  }

  // 15. Paragraphs & Line Breaks
  src = src.replace(/\n\n+/g, '<div style="height:8px;"></div>');
  src = src.replace(/\n/g, '<br />');

  return src;
}

export function UserProfileView({ currentUser, setCurrentUser, T, dark, showToast }) {
  const [activeTab, setActiveTab] = useState("posts"); // "posts" | "media" | "about"
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  
  // Profile edit fields
  const [editName, setEditName] = useState(currentUser?.name || "");
  const [editBio, setEditBio] = useState(currentUser?.bio || "Cultivador apaixonado por hidroponia e automação.");
  const [editLocation, setEditLocation] = useState(currentUser?.location || "Brasil");
  const [editStrainFocus, setEditStrainFocus] = useState(currentUser?.strainFocus || "DWC & Living Soil");
  const [avatarPreview, setAvatarPreview] = useState(currentUser?.avatarUrl || "");
  const [bannerPreview, setBannerPreview] = useState(currentUser?.bannerUrl || "");

  // Post Creator State
  const [postText, setPostText] = useState("");
  const [postStage, setPostStage] = useState("Floração");
  const [postEditorMode, setPostEditorMode] = useState("write"); // "write" | "preview"
  const [attachedImages, setAttachedImages] = useState([]);
  const [attachedVideos, setAttachedVideos] = useState([]);
  const [isPosting, setIsPosting] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [cropImageSrc, setCropImageSrc] = useState(null);
  const [isCropperOpen, setIsCropperOpen] = useState(false);

  const postTextareaRef = useRef(null);

  // Sync whenever currentUser updates from cloud or login
  useEffect(() => {
    if (currentUser?.avatarUrl) setAvatarPreview(currentUser.avatarUrl);
    if (currentUser?.bannerUrl) setBannerPreview(currentUser.bannerUrl);
    if (currentUser?.name) setEditName(currentUser.name);
    if (currentUser?.bio) setEditBio(currentUser.bio);
    if (currentUser?.location) setEditLocation(currentUser.location);
    if (currentUser?.strainFocus) setEditStrainFocus(currentUser.strainFocus);
  }, [currentUser]);

  // Close lightbox on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setLightboxImage(null);
        setIsCropperOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // File Inputs
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);
  const imageAttachRef = useRef(null);
  const videoAttachRef = useRef(null);

  // Posts State
  const storageKey = `growcalc_posts_${currentUser?.username || "default"}`;
  const [posts, setPosts] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch (e) {}

    // Default sample posts with Obsidian Markdown formatting
    return [
      {
        id: "post_1",
        author: {
          name: currentUser?.name || "Cultivador",
          username: currentUser?.username || "grower",
          avatarUrl: currentUser?.avatarUrl || ""
        },
        createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
        text: `# 🌸 4ª Semana de Floração: Setup DWC Estabilizado

Hoje completamos 28 dias de 12/12. O sistema de recirculação **GrowinStones** está mantendo os parâmetros cravados!

## 📊 Medições do Dia
| Parâmetro | Alvo | Medido | Status |
|---|---|---|---|
| pH | 5.8 | **5.9** | ✅ Perfeito |
| EC | 1.4 mS/cm | **1.42** | ✅ Estável |
| Temp. Solução | 20°C | **19.8°C** | ❄️ Ideal |

> [!TIP] Dica de Manejo
> A desfolha realizada na semana 3 abriu espaço para os buds inferiores receberem iluminação direta. Resina começando a pipocar forte! ==Tricomas leitosos iniciando==.

### Checklist Semanal
- [x] Troca parcial da solução nutritiva
- [x] Calibração da sonda de pH e EC
- [x] Limpeza do biofiltro
- [ ] Flush preventivo na semana 6

#hidroponia #dwc #cultivoindoor`,
        stage: "Floração",
        images: [
          "https://images.unsplash.com/photo-1536939459926-301728717817?auto=format&fit=crop&w=800&q=80"
        ],
        videos: [],
        likes: 12,
        liked: false,
        comments: [
          { id: "c1", author: "OpenAgro Team", text: "Excelente estabilidade de parâmetros! Parabéns pelo manejo.", time: "há 2 horas" }
        ]
      },
      {
        id: "post_2",
        author: {
          name: currentUser?.name || "Cultivador",
          username: currentUser?.username || "grower",
          avatarUrl: currentUser?.avatarUrl || ""
        },
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        text: `# ⚡ Automação com ESP32 Conectada

Novo setup configurado no GrowinStones e sincronizado com o controlador via **MQTT**.

> [!SUCCESS] Telemetria Ativa
> Sensores transmitindo temperatura, umidade, VPD e nível do reservatório **24/7** com envio de alertas automáticos.

\`\`\`javascript
// Payload de telemetria MQTT
{
  "temp": 24.5,
  "humidity": 58.2,
  "vpd": 1.24,
  "status": "OPTIMAL"
}
\`\`\`

#automacao #iot #esp32`,
        stage: "Setup & Automação",
        images: [],
        videos: [],
        likes: 24,
        liked: true,
        comments: []
      }
    ];
  });

  // 1. Fetch posts and profile directly from cloud on mount or user switch
  useEffect(() => {
    if (!currentUser || (!currentUser.email && !currentUser.username)) return;
    const email = currentUser.email || "";
    const username = currentUser.username || "";
    const syncUrl = `https://grow.thegrowinstones.com/api/user/sync?email=${encodeURIComponent(email)}&username=${encodeURIComponent(username)}&t=${Date.now()}`;

    fetch(syncUrl)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.exists) {
          if (Array.isArray(data.posts) && data.posts.length > 0) {
            setPosts(data.posts);
            try {
              localStorage.setItem(storageKey, JSON.stringify(data.posts));
            } catch (e) {}
          }
          if (data.user) {
            if (data.user.avatarUrl && !avatarPreview) setAvatarPreview(data.user.avatarUrl);
            if (data.user.bannerUrl && !bannerPreview) setBannerPreview(data.user.bannerUrl);
          }
        }
      })
      .catch((err) => console.warn("Erro ao carregar posts da nuvem:", err));
  }, [currentUser?.email, currentUser?.username, storageKey]);

  // 2. Save posts locally
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(posts));
    } catch (e) {}
  }, [posts, storageKey]);

  // Função para comprimir e fazer upload permanente de mídia
  const uploadMediaFile = async (file, type = "media", maxW = 1600, maxH = 1600, quality = 0.82) => {
    if (!file) return null;
    return new Promise((resolve, reject) => {
      if (file.type.startsWith("video/")) {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const res = await fetch("https://grow.thegrowinstones.com/api/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ file: reader.result, type })
            });
            const json = await res.json();
            if (json.success && json.url) resolve(json.url);
            else resolve(reader.result);
          } catch (e) {
            resolve(reader.result);
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = async () => {
          let { width, height } = img;
          if (width > maxW || height > maxH) {
            if (width > height) {
              height = Math.round((height * maxW) / width);
              width = maxW;
            } else {
              width = Math.round((width * maxH) / height);
              height = maxH;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
          const compressedDataUrl = canvas.toDataURL(mime, quality);

          try {
            const res = await fetch("https://grow.thegrowinstones.com/api/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ image: compressedDataUrl, type })
            });
            const json = await res.json();
            if (json.success && json.url) {
              resolve(json.url);
            } else {
              resolve(compressedDataUrl);
            }
          } catch (err) {
            console.warn("Upload falhou, usando dataURL local:", err);
            resolve(compressedDataUrl);
          }
        };
        img.onerror = () => resolve(reader.result);
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Handle Avatar Change: Abre modal interativo de ajuste e corte 1:1
  const handleAvatarFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCropImageSrc(ev.target.result);
      setIsCropperOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Upload e salvamento instantâneo permanente do avatar cortado
  const handleAvatarCropComplete = async (croppedDataUrl) => {
    showToast("Enviando foto de perfil cortada...");
    try {
      const res = await fetch("https://grow.thegrowinstones.com/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: croppedDataUrl, type: "avatar" })
      });
      const json = await res.json();
      const uploadedUrl = (json && json.success && json.url) ? json.url : croppedDataUrl;

      setAvatarPreview(uploadedUrl);
      const updated = {
        ...currentUser,
        avatarUrl: uploadedUrl
      };
      setCurrentUser(updated);
      try { localStorage.setItem("growcalc_user", JSON.stringify(updated)); } catch(e) {}
      fetch("https://grow.thegrowinstones.com/api/user/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: updated, posts })
      }).catch(() => {});

      setIsCropperOpen(false);
      setCropImageSrc(null);
      showToast("Foto de perfil atualizada e salva com sucesso!");
    } catch (err) {
      console.warn("Erro ao salvar avatar:", err);
      showToast("Erro ao processar imagem de avatar.");
      setIsCropperOpen(false);
    }
  };

  // Handle Banner Change (Upload e salvamento instantâneo permanente)
  const handleBannerFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    showToast("Enviando foto de capa...");
    try {
      const uploadedUrl = await uploadMediaFile(file, "banner", 1600, 1600, 0.82);
      if (uploadedUrl) {
        setBannerPreview(uploadedUrl);
        const updated = {
          ...currentUser,
          bannerUrl: uploadedUrl
        };
        setCurrentUser(updated);
        try { localStorage.setItem("growcalc_user", JSON.stringify(updated)); } catch(e) {}
        fetch("https://grow.thegrowinstones.com/api/user/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user: updated, posts })
        }).catch(() => {});
        showToast("Foto de capa atualizada e salva na nuvem!");
      }
    } catch (err) {
      showToast("Erro ao processar imagem de capa.");
    }
  };

  // Save Profile
  const handleSaveProfile = () => {
    const updated = {
      ...currentUser,
      name: editName.trim() || currentUser?.name || "Cultivador",
      bio: editBio.trim(),
      location: editLocation.trim(),
      strainFocus: editStrainFocus.trim(),
      avatarUrl: avatarPreview || currentUser?.avatarUrl || "",
      bannerUrl: bannerPreview || currentUser?.bannerUrl || ""
    };
    setCurrentUser(updated);
    try { localStorage.setItem("growcalc_user", JSON.stringify(updated)); } catch(e) {}
    
    // Sync immediately to cloud
    fetch("https://grow.thegrowinstones.com/api/user/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: updated, posts })
    }).catch(() => {});

    setIsEditingProfile(false);
    showToast("Perfil atualizado e sincronizado na nuvem!");
  };

  // Handle Attach Images
  const handleAttachImages = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    showToast(`Processando ${files.length} imagem(ns)...`);

    for (const file of files) {
      try {
        const url = await uploadMediaFile(file, "post", 1400, 1400, 0.82);
        if (url) {
          setAttachedImages((prev) => [...prev, url]);
        }
      } catch (err) {
        console.warn("Erro ao anexar imagem:", err);
      }
    }
  };

  // Handle Attach Video
  const handleAttachVideo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    showToast("Processando vídeo...");
    try {
      const url = await uploadMediaFile(file, "video");
      if (url) {
        setAttachedVideos((prev) => [...prev, url]);
      }
    } catch (err) {
      showToast("Erro ao processar vídeo.");
    }
  };

  // Create Post
  const handleCreatePost = async () => {
    if (!postText.trim() && attachedImages.length === 0 && attachedVideos.length === 0) {
      showToast("Escreva algo ou anexe uma mídia para publicar.");
      return;
    }

    setIsPosting(true);
    const newPost = {
      id: `post_${Date.now()}`,
      author: {
        name: currentUser?.name || "Cultivador",
        username: currentUser?.username || "grower",
        avatarUrl: currentUser?.avatarUrl || avatarPreview || ""
      },
      createdAt: new Date().toISOString(),
      text: postText.trim(),
      stage: postStage,
      images: [...attachedImages],
      videos: [...attachedVideos],
      likes: 0,
      liked: false,
      comments: []
    };

    const updatedPosts = [newPost, ...posts];
    setPosts(updatedPosts);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updatedPosts));
    } catch (e) {}

    setPostText("");
    setAttachedImages([]);
    setAttachedVideos([]);
    setIsPosting(false);
    showToast("Publicação compartilhada e sincronizada na nuvem!");

    // Sincronização direta e instantânea com a nuvem
    if (currentUser && (currentUser.email || currentUser.username)) {
      try {
        await fetch("https://grow.thegrowinstones.com/api/user/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user: currentUser, posts: updatedPosts })
        });
      } catch (err) {
        console.warn("Erro ao sincronizar post na nuvem:", err);
      }
    }
  };

  // Toggle Like
  const handleToggleLike = async (postId) => {
    const updatedPosts = posts.map((p) => {
      if (p.id === postId) {
        return {
          ...p,
          liked: !p.liked,
          likes: p.liked ? Math.max(0, p.likes - 1) : p.likes + 1
        };
      }
      return p;
    });
    setPosts(updatedPosts);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updatedPosts));
    } catch (e) {}

    if (currentUser && (currentUser.email || currentUser.username)) {
      try {
        fetch("https://grow.thegrowinstones.com/api/user/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user: currentUser, posts: updatedPosts })
        }).catch(() => {});
      } catch (e) {}
    }
  };

  // Delete Post (Exclusão definitiva local e na nuvem)
  const handleDeletePost = async (postId) => {
    if (window.confirm("Deseja excluir esta publicação definitivamente?")) {
      const updatedPosts = posts.filter((p) => String(p.id) !== String(postId));
      setPosts(updatedPosts);
      try {
        localStorage.setItem(storageKey, JSON.stringify(updatedPosts));
      } catch (e) {}

      // Sincronizar exclusão definitiva no servidor imediatamente
      if (currentUser && (currentUser.email || currentUser.username)) {
        try {
          await fetch("https://grow.thegrowinstones.com/api/post/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user: currentUser,
              email: currentUser.email,
              username: currentUser.username,
              postId
            })
          });
        } catch (err) {
          console.warn("Erro ao deletar post:", err);
        }

        try {
          await fetch("https://grow.thegrowinstones.com/api/user/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user: currentUser, posts: updatedPosts })
          });
        } catch (e) {}
      }

      showToast("Publicação removida com sucesso!");
    }
  };

  // Add Comment
  const handleAddComment = async (postId, commentText) => {
    if (!commentText || !commentText.trim()) return;
    const updatedPosts = posts.map((p) => {
      if (p.id === postId) {
        return {
          ...p,
          comments: [
            ...p.comments,
            {
              id: `c_${Date.now()}`,
              author: currentUser?.name || "Cultivador",
              text: commentText.trim(),
              time: "agora mesmo"
            }
          ]
        };
      }
      return p;
    });
    setPosts(updatedPosts);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updatedPosts));
    } catch (e) {}

    if (currentUser && (currentUser.email || currentUser.username)) {
      try {
        fetch("https://grow.thegrowinstones.com/api/user/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user: currentUser, posts: updatedPosts })
        }).catch(() => {});
      } catch (e) {}
    }
  };

  const defaultBanner = dark
    ? "linear-gradient(135deg, #1c1917 0%, #292524 50%, #44403c 100%)"
    : "linear-gradient(135deg, #e2dccc 0%, #d8cfbe 50%, #c4b9a3 100%)";

  const bannerStyle = (bannerPreview || currentUser?.bannerUrl)
    ? { backgroundImage: `url(${bannerPreview || currentUser?.bannerUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: defaultBanner };

  const filteredPosts = activeTab === "media"
    ? posts.filter((p) => (p.images && p.images.length > 0) || (p.videos && p.videos.length > 0))
    : posts;

  return (
    <div className="max-w-4xl mx-auto w-full px-0 sm:px-6 py-0 sm:py-6 pb-24 overflow-x-hidden">
      {/* HIDDEN INPUTS FOR MEDIA */}
      <input type="file" ref={avatarInputRef} accept="image/*" onChange={handleAvatarFile} className="hidden" />
      <input type="file" ref={bannerInputRef} accept="image/*" onChange={handleBannerFile} className="hidden" />
      <input type="file" ref={imageAttachRef} accept="image/*" multiple onChange={handleAttachImages} className="hidden" />
      <input type="file" ref={videoAttachRef} accept="video/*" onChange={handleAttachVideo} className="hidden" />

      {/* ————————————————— PROFILE HEADER (FULL CANVAS RESPONSIVE NO MOBILE) ————————————————— */}
      <div
        className="rounded-none sm:rounded-3xl overflow-hidden border-0 sm:border border-b sm:border-b shadow-none sm:shadow-sm relative group mb-3 sm:mb-6 min-h-[calc(100dvh-58px)] sm:min-h-0 flex flex-col justify-between"
        style={{ background: T.surface, borderColor: T.border }}
      >
        <div className="h-44 sm:h-64 w-full relative overflow-hidden shrink-0" style={{ background: T.surface2 }}>
          {(bannerPreview || currentUser?.bannerUrl) ? (
            <img
              src={bannerPreview || currentUser?.bannerUrl}
              alt="Banner"
              className="w-full h-full object-cover"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : (
            <div className="w-full h-full" style={{ background: dark ? "linear-gradient(135deg, #1c1917 0%, #292524 50%, #44403c 100%)" : "linear-gradient(135deg, #e2dccc 0%, #d8cfbe 50%, #c4b9a3 100%)" }} />
          )}

          {/* EDIT BANNER BUTTON */}
          <button
            onClick={() => bannerInputRef.current?.click()}
            className="absolute top-4 right-4 px-3 py-1.5 rounded-xl bg-black/60 hover:bg-black/80 text-white text-xs font-bold transition-all backdrop-blur-md flex items-center gap-1.5 opacity-90 hover:opacity-100 shadow-md cursor-pointer"
            title="Alterar Capa"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            <span>Alterar Capa</span>
          </button>
        </div>

        {/* PROFILE INFO BAR */}
        <div className="px-4 sm:px-6 pb-6 pt-0 relative w-full max-w-full flex-1 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 -mt-12 sm:-mt-20 mb-3">
            {/* AVATAR OVERLAY */}
            <div className="relative group shrink-0 self-start">
              <div
                className="w-20 h-20 sm:w-32 sm:h-32 min-w-[80px] min-h-[80px] sm:min-w-[128px] sm:min-h-[128px] aspect-square rounded-full overflow-hidden border-4 shadow-xl flex items-center justify-center font-extrabold text-2xl sm:text-3xl shrink-0 relative"
                style={{
                  background: T.surface2,
                  borderColor: T.surface,
                  color: T.brand
                }}
              >
                {(avatarPreview || currentUser?.avatarUrl) && (
                  <img
                    src={avatarPreview || currentUser?.avatarUrl}
                    alt={currentUser?.name || "Avatar"}
                    className="w-full h-full object-cover rounded-full block"
                    style={{ aspectRatio: "1 / 1" }}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      const fb = e.currentTarget.nextElementSibling;
                      if (fb) fb.style.display = "flex";
                    }}
                  />
                )}
                <span
                  style={{
                    display: (avatarPreview || currentUser?.avatarUrl) ? "none" : "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    height: "100%"
                  }}
                >
                  {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "G"}
                </span>
              </div>

              <button
                onClick={() => avatarInputRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] sm:text-[11px] font-bold cursor-pointer"
                title="Alterar Avatar"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                <span>Editar</span>
              </button>
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={`https://${currentUser?.username || "grow"}.thegrowinstones.com`}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all hover:opacity-90 flex items-center gap-1.5"
                style={{ background: dark ? "rgba(2, 132, 199, 0.15)" : "#e0f2fe", border: `1px solid ${dark ? "#0284c7" : "#38bdf8"}`, color: dark ? "#38bdf8" : "#0284c7" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                <span>Subdomínio Público</span>
              </a>

              <button
                onClick={() => setIsEditingProfile(true)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <span>Editar Perfil</span>
              </button>
            </div>
          </div>

          {/* USER BIO & DETAILS */}
          <div className="w-full max-w-full">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight" style={{ color: T.text }}>
              {currentUser?.name || "Cultivador GrowinStones"}
            </h1>
            <p className="text-xs sm:text-sm font-mono" style={{ color: T.brand }}>
              @{currentUser?.username || "grower"}
            </p>

            <p className="text-xs sm:text-sm mt-2.5 leading-relaxed max-w-2xl" style={{ color: T.text }}>
              {currentUser?.bio || editBio}
            </p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3.5 text-[11px] sm:text-xs" style={{ color: T.muted }}>
              <div className="flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>{currentUser?.location || editLocation}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                <span>Especialidade: <b>{currentUser?.strainFocus || editStrainFocus}</b></span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span>Membro desde 2026</span>
              </div>
            </div>

            <div className="flex items-center gap-4 sm:gap-6 mt-3.5 pt-3.5 border-t text-[11px] sm:text-xs flex-wrap" style={{ borderColor: T.borderSoft }}>
              <div><b style={{ color: T.text }}>{posts.length}</b> <span style={{ color: T.muted }}>Publicações</span></div>
              <div><b style={{ color: T.text }}>100%</b> <span style={{ color: T.muted }}>Automação IoT</span></div>
              <div><b style={{ color: T.text }}>1</b> <span style={{ color: T.muted }}>Subdomínio Ativo</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* ————————————————— TABS DE NAVEGAÇÃO DO PERFIL ————————————————— */}
      <div className="flex items-center gap-2 border-b pb-3 mb-5 overflow-x-auto no-scrollbar" style={{ borderColor: T.border }}>
        <button
          onClick={() => setActiveTab("posts")}
          className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
          style={activeTab === "posts"
            ? { background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }
            : { background: T.surface2, border: `1px solid ${T.border}`, color: T.muted }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          <span>Diário de Cultivo ({posts.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("media")}
          className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
          style={activeTab === "media"
            ? { background: T.accentBg, border: `1px solid ${T.accentBorder}`, color: T.text }
            : { background: T.surface2, border: `1px solid ${T.border}`, color: T.muted }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <span>Fotos & Vídeos</span>
        </button>
      </div>

      {/* ————————————————— POST CREATOR (OBSIDIAN MARKDOWN POWERED) ————————————————— */}
      <div className="p-4 sm:p-5 rounded-2xl border shadow-sm mb-8" style={{ background: T.surface, borderColor: T.border }}>
        <div className="flex items-start gap-3.5">
          <div
            className="w-10 h-10 min-w-[40px] min-h-[40px] aspect-square rounded-full overflow-hidden shrink-0 font-bold flex items-center justify-center text-sm border relative"
            style={{
              background: T.surface2,
              borderColor: T.border,
              color: T.brand
            }}
          >
            {(avatarPreview || currentUser?.avatarUrl) && (
              <img
                src={avatarPreview || currentUser?.avatarUrl}
                alt={currentUser?.name || "Avatar"}
                className="w-full h-full object-cover rounded-full block"
                style={{ aspectRatio: "1 / 1" }}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  const fb = e.currentTarget.nextElementSibling;
                  if (fb) fb.style.display = "flex";
                }}
              />
            )}
            <span
              style={{
                display: (avatarPreview || currentUser?.avatarUrl) ? "none" : "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                height: "100%"
              }}
            >
              {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "G"}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            {/* MARKDOWN OBSIDIAN TOOLBAR & TABS */}
            <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b flex-wrap" style={{ borderColor: T.borderSoft }}>
              {/* OBSIDIAN FORMATTING SHORTCUTS */}
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => insertMarkdown("# ")}
                  className="px-2 py-1 rounded text-xs font-black hover:bg-white/10 transition-colors"
                  style={{ color: T.brand }}
                  title="Título H1 (# )"
                >
                  H1
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown("## ")}
                  className="px-2 py-1 rounded text-xs font-extrabold hover:bg-white/10 transition-colors"
                  style={{ color: T.text }}
                  title="Título H2 (## )"
                >
                  H2
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown("### ")}
                  className="px-2 py-1 rounded text-xs font-bold hover:bg-white/10 transition-colors"
                  style={{ color: T.text }}
                  title="Título H3 (### )"
                >
                  H3
                </button>
                <span className="w-[1px] h-4 bg-stone-700/50 mx-1"></span>
                <button
                  type="button"
                  onClick={() => insertMarkdown("**", "**")}
                  className="px-2 py-1 rounded text-xs font-bold hover:bg-white/10 transition-colors"
                  style={{ color: T.text }}
                  title="Negrito (**texto**)"
                >
                  <b>B</b>
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown("*", "*")}
                  className="px-2 py-1 rounded text-xs italic font-serif hover:bg-white/10 transition-colors"
                  style={{ color: T.text }}
                  title="Itálico (*texto*)"
                >
                  I
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown("==", "==")}
                  className="px-2 py-1 rounded text-xs font-bold hover:bg-white/10 transition-colors"
                  style={{ color: "#fef08a", background: "rgba(245,158,11,0.25)" }}
                  title="Destaque Obsidian (==texto==)"
                >
                  ==
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown("- [ ] ")}
                  className="px-2 py-1 rounded text-xs font-semibold hover:bg-white/10 transition-colors"
                  style={{ color: T.text }}
                  title="Checklist (- [ ] item)"
                >
                  ☑ Task
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown("- ")}
                  className="px-2 py-1 rounded text-xs hover:bg-white/10 transition-colors"
                  style={{ color: T.text }}
                  title="Lista (- item)"
                >
                  • Lista
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown("> [!NOTE] Nota\n> ")}
                  className="px-2 py-1 rounded text-xs font-semibold hover:bg-white/10 transition-colors"
                  style={{ color: "#38bdf8" }}
                  title="Callout Obsidian (> [!NOTE])"
                >
                  [!Note]
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown("```javascript\n", "\n```")}
                  className="px-2 py-1 rounded text-xs font-mono hover:bg-white/10 transition-colors"
                  style={{ color: T.muted }}
                  title="Bloco de Código (```)"
                >
                  &lt;/&gt;
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdown("\n| Parâmetro | Valor |\n|---|---|\n| pH | 5.9 |\n| EC | 1.4 |\n")}
                  className="px-2 py-1 rounded text-xs hover:bg-white/10 transition-colors"
                  style={{ color: T.text }}
                  title="Tabela Markdown"
                >
                  ⊞ Tabela
                </button>
              </div>

              {/* EDITOR MODE TOGGLE */}
              <div className="flex items-center gap-1 bg-black/20 p-0.5 rounded-lg border" style={{ borderColor: T.borderSoft }}>
                <button
                  type="button"
                  onClick={() => setPostEditorMode("write")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${postEditorMode === "write" ? "bg-stone-800 text-amber-400 shadow-sm" : "text-stone-400 hover:text-stone-200"}`}
                >
                  ✏️ Markdown
                </button>
                <button
                  type="button"
                  onClick={() => setPostEditorMode("preview")}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${postEditorMode === "preview" ? "bg-stone-800 text-amber-400 shadow-sm" : "text-stone-400 hover:text-stone-200"}`}
                >
                  👁️ Prévia
                </button>
              </div>
            </div>

            {postEditorMode === "write" ? (
              <textarea
                ref={postTextareaRef}
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                placeholder="Escreva em formato Markdown (Obsidian)... Use # para H1, ## para H2, **negrito**, ==destaque==, - [ ] checklist, > [!NOTE]"
                rows={4}
                className="w-full bg-transparent outline-none text-sm resize-none font-mono"
                style={{ color: T.text }}
              />
            ) : (
              <div
                className="w-full min-h-[100px] max-h-[300px] overflow-y-auto p-3 rounded-xl border mb-2 text-sm leading-relaxed"
                style={{ background: T.surface2, borderColor: T.borderSoft, color: T.text }}
                dangerouslySetInnerHTML={{
                  __html: parseObsidianMarkdown(postText, dark) || `<span style="color:${T.faint}; font-style:italic;">A pré-visualização formatada do Obsidian aparecerá aqui...</span>`
                }}
              />
            )}

            {/* PREVIEWS OF ATTACHED MEDIA */}
            {(attachedImages.length > 0 || attachedVideos.length > 0) && (
              <div className="flex flex-wrap gap-2 pt-3 pb-2 border-t mt-2" style={{ borderColor: T.borderSoft }}>
                {attachedImages.map((img, idx) => (
                  <div key={idx} className="relative group w-20 h-20 rounded-xl overflow-hidden border" style={{ borderColor: T.border }}>
                    <img src={img} alt="Attachment" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setAttachedImages(attachedImages.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center text-[10px] font-bold"
                    >
                      ×
                    </button>
                  </div>
                ))}

                {attachedVideos.map((vid, idx) => (
                  <div key={idx} className="relative group w-28 h-20 rounded-xl overflow-hidden border bg-black flex items-center justify-center" style={{ borderColor: T.border }}>
                    <video src={vid} className="w-full h-full object-cover" />
                    <button
                      onClick={() => setAttachedVideos(attachedVideos.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center text-[10px] font-bold"
                    >
                      ×
                    </button>
                    <span className="absolute text-[10px] font-bold bg-black/60 px-1.5 py-0.5 rounded text-white bottom-1 left-1">VÍDEO</span>
                  </div>
                ))}
              </div>
            )}

            {/* TOOLBAR */}
            <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t mt-3" style={{ borderColor: T.borderSoft }}>
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* ATTACH IMAGE BUTTON */}
                <button
                  onClick={() => imageAttachRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                  title="Anexar Fotos"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#38bdf8" }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  <span>Foto</span>
                </button>

                {/* ATTACH VIDEO BUTTON */}
                <button
                  onClick={() => videoAttachRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                  title="Anexar Vídeo"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#a78bfa" }}><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                  <span>Vídeo</span>
                </button>

                {/* STAGE SELECTOR */}
                <select
                  value={postStage}
                  onChange={(e) => setPostStage(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold outline-none cursor-pointer"
                  style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                >
                  <option value="Vegetativo">🌱 Fase Vegetativa</option>
                  <option value="Floração">🌸 Fase de Floração</option>
                  <option value="Colheita">✂️ Colheita & Cura</option>
                  <option value="Nutrição & EC">🧪 Nutrição & EC</option>
                  <option value="Setup & Automação">⚡ Setup & Automação</option>
                  <option value="Geral">📝 Diário Geral</option>
                </select>
              </div>

              {/* POST BUTTON */}
              <button
                onClick={handleCreatePost}
                disabled={isPosting || (!postText.trim() && attachedImages.length === 0 && attachedVideos.length === 0)}
                className="px-5 py-2 rounded-xl text-xs font-extrabold text-white transition-all shadow-md disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                style={{ background: dark ? "#0284c7" : "#0369a1" }}
              >
                {isPosting ? "Publicando..." : "Publicar"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ————————————————— FEED DE POSTAGENS ————————————————— */}
      <div className="space-y-4">
        {filteredPosts.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border" style={{ background: T.surface, borderColor: T.border }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3" style={{ color: T.faint }}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            <p className="text-sm font-semibold" style={{ color: T.text }}>Nenhuma publicação encontrada.</p>
            <p className="text-xs mt-1" style={{ color: T.muted }}>Compartilhe sua primeira atualização de cultivo acima!</p>
          </div>
        ) : (
          filteredPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUser={currentUser}
              T={T}
              dark={dark}
              onToggleLike={() => handleToggleLike(post.id)}
              onDelete={() => handleDeletePost(post.id)}
              onAddComment={(text) => handleAddComment(post.id, text)}
              onImageClick={(url) => setLightboxImage(url)}
              showToast={showToast}
            />
          ))
        )}
      </div>

      {/* ————————————————— MODAL DE EDIÇÃO DO PERFIL ————————————————— */}
      {isEditingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg p-6 rounded-2xl shadow-2xl space-y-5 border" style={{ background: T.surface, borderColor: T.border, color: T.text }}>
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: T.borderSoft }}>
              <h3 className="text-lg font-extrabold flex items-center gap-2" style={{ color: T.text }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <span>Editar Informações do Perfil</span>
              </h3>
              <button
                onClick={() => setIsEditingProfile(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
                style={{ background: T.surface2, color: T.text, border: `1px solid ${T.border}` }}
              >
                ×
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-bold block mb-1" style={{ color: T.text }}>Nome de Exibição:</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border outline-none font-bold"
                  style={{ background: T.surface2, borderColor: T.border, color: T.text }}
                />
              </div>

              <div>
                <label className="font-bold block mb-1" style={{ color: T.text }}>Bio / Apresentação:</label>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl border outline-none resize-none leading-relaxed"
                  style={{ background: T.surface2, borderColor: T.border, color: T.text }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1" style={{ color: T.text }}>Localização / Estado:</label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border outline-none"
                    style={{ background: T.surface2, borderColor: T.border, color: T.text }}
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1" style={{ color: T.text }}>Foco / Sistema de Cultivo:</label>
                  <input
                    type="text"
                    value={editStrainFocus}
                    onChange={(e) => setEditStrainFocus(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border outline-none"
                    style={{ background: T.surface2, borderColor: T.border, color: T.text }}
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between border-t gap-3" style={{ borderColor: T.borderSoft }}>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="px-3.5 py-2 rounded-xl border font-bold flex items-center gap-1.5"
                  style={{ background: T.surface2, borderColor: T.border, color: T.text }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
                  <span>Alterar Avatar</span>
                </button>

                <button
                  type="button"
                  onClick={() => bannerInputRef.current?.click()}
                  className="px-3.5 py-2 rounded-xl border font-bold flex items-center gap-1.5"
                  style={{ background: T.surface2, borderColor: T.border, color: T.text }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>
                  <span>Alterar Capa</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t" style={{ borderColor: T.borderSoft }}>
              <button
                onClick={() => setIsEditingProfile(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold"
                style={{ background: T.surface2, color: T.muted }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveProfile}
                className="px-5 py-2 rounded-xl text-xs font-extrabold text-white transition-all shadow-md"
                style={{ background: dark ? "#0284c7" : "#0369a1" }}
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ————————————————— LIGHTBOX MODAL (IMAGEM 100% TAMANHO REAL) ————————————————— */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md cursor-zoom-out animate-fadeIn"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-full max-h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxImage}
              alt="Mídia em tamanho real"
              className="max-w-[96vw] max-h-[92vh] object-contain rounded-xl shadow-2xl transition-all"
            />
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/75 hover:bg-black text-white flex items-center justify-center font-extrabold text-xl shadow-2xl border border-white/20 transition-all hover:scale-105"
              title="Fechar (Esc)"
            >
              ✕
            </button>
            <a
              href={lightboxImage}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-3 right-3 px-3.5 py-2 rounded-full bg-black/75 hover:bg-black text-white text-xs font-bold shadow-2xl border border-white/20 flex items-center gap-1.5 transition-all hover:scale-105"
              title="Abrir imagem original em nova aba"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              <span>Ver Original 100%</span>
            </a>
          </div>
        </div>
      )}

      {/* ————————————————— MODAL DE AJUSTE E CORTE DO AVATAR ————————————————— */}
      <AvatarCropperModal
        isOpen={isCropperOpen}
        imageSrc={cropImageSrc}
        onClose={() => {
          setIsCropperOpen(false);
          setCropImageSrc(null);
        }}
        onCropComplete={handleAvatarCropComplete}
        T={T}
        dark={dark}
      />
    </div>
  );
}

// ————————————————— POST CARD COMPONENT —————————————————
function PostCard({ post, currentUser, T, dark, onToggleLike, onDelete, onAddComment, onImageClick, showToast }) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");

  // Obedecer sempre ao nome e avatar mais recentes configurados pelo usuário
  const isOwnPost = !post.author?.username || post.author.username === currentUser?.username;
  const authorName = isOwnPost ? (currentUser?.name || post.author?.name || "Cultivador") : (post.author?.name || "Cultivador");
  const authorUsername = isOwnPost ? (currentUser?.username || post.author?.username || "grower") : (post.author?.username || "grower");
  const authorAvatar = isOwnPost ? (currentUser?.avatarUrl || post.author?.avatarUrl || "") : (post.author?.avatarUrl || "");

  const timeAgo = (isoDate) => {
    try {
      const diffMs = Date.now() - new Date(isoDate).getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return "agora mesmo";
      if (diffMin < 60) return `há ${diffMin} min`;
      const diffH = Math.floor(diffMin / 60);
      if (diffH < 24) return `há ${diffH}h`;
      const diffDays = Math.floor(diffH / 24);
      return `há ${diffDays}d`;
    } catch (e) {
      return "recente";
    }
  };

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard?.writeText(url);
    showToast("Link da publicação copiado!");
  };

  return (
    <div className="p-5 rounded-2xl border shadow-sm transition-all" style={{ background: T.surface, borderColor: T.border }}>
      {/* AUTHOR & HEADER */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 min-w-[40px] min-h-[40px] aspect-square rounded-full overflow-hidden font-bold flex items-center justify-center text-xs shrink-0 border relative"
            style={{
              background: T.surface2,
              borderColor: T.border,
              color: T.brand
            }}
          >
            {authorAvatar && (
              <img
                src={authorAvatar}
                alt={authorName}
                className="w-full h-full object-cover rounded-full block"
                style={{ aspectRatio: "1 / 1" }}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  const fb = e.currentTarget.nextElementSibling;
                  if (fb) fb.style.display = "flex";
                }}
              />
            )}
            <span
              style={{
                display: authorAvatar ? "none" : "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                height: "100%"
              }}
            >
              {authorName ? authorName.charAt(0).toUpperCase() : "G"}
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-sm" style={{ color: T.text }}>{authorName}</span>
              <span className="text-xs font-mono" style={{ color: T.muted }}>@{authorUsername}</span>
              <span className="text-xs" style={{ color: T.faint }}>· {timeAgo(post.createdAt)}</span>
            </div>
            {post.stage && (
              <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: dark ? "rgba(245,158,11,0.15)" : "#fef3c7", color: dark ? "#f59e0b" : "#b45309" }}>
                {post.stage}
              </span>
            )}
          </div>
        </div>

        {/* DELETE BUTTON IF AUTHOR */}
        {isOwnPost && (
          <button
            onClick={onDelete}
            title="Excluir post"
            className="p-1 rounded-lg text-xs transition-colors hover:text-red-500"
            style={{ color: T.faint }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        )}
      </div>

      {/* POST TEXT (OBSIDIAN MARKDOWN RENDERED) */}
      {post.text && (
        <div
          className="text-sm leading-relaxed mb-3.5 obsidian-rendered-content"
          style={{ color: T.text }}
          dangerouslySetInnerHTML={{ __html: parseObsidianMarkdown(post.text, dark) }}
        />
      )}

      {/* MEDIA ATTACHMENTS WITH LIGHTBOX CLICK */}
      {post.images && post.images.length > 0 && (
        <div className={`grid gap-2 mb-3.5 rounded-xl overflow-hidden ${post.images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {post.images.map((img, idx) => (
            <div
              key={idx}
              onClick={() => onImageClick?.(img)}
              className="relative max-h-96 overflow-hidden rounded-xl bg-black/10 cursor-zoom-in group transition-transform hover:scale-[1.005]"
              title="Clique para ver a foto em tamanho real 100%"
            >
              <img
                src={img}
                alt="Post media"
                className="w-full h-full object-cover max-h-96 block"
                onError={(e) => {
                  e.currentTarget.parentElement.style.display = "none";
                }}
              />
              <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-black/70 text-white text-[11px] font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 backdrop-blur-md shadow-md">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                <span>Ver 100%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {post.videos && post.videos.length > 0 && (
        <div className="mb-3.5 rounded-xl overflow-hidden bg-black">
          {post.videos.map((vid, idx) => (
            <video key={idx} src={vid} controls playsInline className="w-full max-h-96 rounded-xl" />
          ))}
        </div>
      )}

      {/* ACTION BAR (TWITTER STYLE) */}
      <div className="flex items-center justify-between pt-3 border-t text-xs" style={{ borderColor: T.borderSoft }}>
        <button
          onClick={onToggleLike}
          className={`flex items-center gap-1.5 font-bold transition-all ${post.liked ? "text-rose-500" : "hover:text-rose-400"}`}
          style={!post.liked ? { color: T.muted } : {}}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={post.liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span>{post.likes}</span>
        </button>

        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1.5 font-bold transition-colors hover:opacity-85"
          style={{ color: T.muted }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>{post.comments?.length || 0} Comentários</span>
        </button>

        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 font-bold transition-colors hover:opacity-85"
          style={{ color: T.muted }}
          title="Compartilhar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          <span>Compartilhar</span>
        </button>
      </div>

      {/* COMMENTS SECTION */}
      {showComments && (
        <div className="mt-3 pt-3 border-t space-y-3" style={{ borderColor: T.borderSoft }}>
          {post.comments && post.comments.length > 0 && (
            <div className="space-y-2">
              {post.comments.map((c) => (
                <div key={c.id} className="p-2.5 rounded-xl text-xs" style={{ background: T.surface2 }}>
                  <div className="flex items-center justify-between font-bold" style={{ color: T.text }}>
                    <span>{c.author}</span>
                    <span className="text-[10px] font-normal" style={{ color: T.faint }}>{c.time}</span>
                  </div>
                  <p className="mt-1" style={{ color: T.text }}>{c.text}</p>
                </div>
              ))}
            </div>
          )}

          {/* ADD COMMENT INPUT */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && commentText.trim()) {
                  onAddComment(commentText);
                  setCommentText("");
                }
              }}
              placeholder="Escreva um comentário..."
              className="flex-1 px-3 py-2 rounded-xl text-xs outline-none border"
              style={{ background: T.surface2, borderColor: T.border, color: T.text }}
            />
            <button
              onClick={() => {
                if (commentText.trim()) {
                  onAddComment(commentText);
                  setCommentText("");
                }
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-85"
              style={{ background: dark ? "#0284c7" : "#0369a1" }}
            >
              Enviar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ————————————————— MODAL DE AJUSTE E CORTE DE AVATAR (1:1 CIRCULAR CROP) —————————————————
function AvatarCropperModal({ imageSrc, isOpen, onClose, onCropComplete, T, dark }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isProcessing, setIsProcessing] = useState(false);

  const containerRef = useRef(null);
  const imageRef = useRef(null);

  // Reset when opening with new image
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
      setIsProcessing(false);
    }
  }, [isOpen, imageSrc]);

  if (!isOpen || !imageSrc) return null;

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - offset.x,
        y: e.touches[0].clientY - offset.y
      });
    }
  };

  const handleTouchMove = (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    setOffset({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  const handleSaveCrop = async () => {
    if (!imageRef.current || isProcessing) return;
    setIsProcessing(true);

    try {
      const CROP_SIZE = 500; // Output square avatar resolution in px
      const canvas = document.createElement("canvas");
      canvas.width = CROP_SIZE;
      canvas.height = CROP_SIZE;
      const ctx = canvas.getContext("2d");

      const img = imageRef.current;
      const cropCircleDiameter = 260; // diameter of preview crop frame in px
      const scaleFactor = CROP_SIZE / cropCircleDiameter;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, CROP_SIZE, CROP_SIZE);

      ctx.save();
      ctx.translate(CROP_SIZE / 2, CROP_SIZE / 2);
      ctx.translate(offset.x * scaleFactor, offset.y * scaleFactor);
      ctx.rotate((rotation * Math.PI) / 180);

      const previewImgWidth = img.width || img.naturalWidth;
      const previewImgHeight = img.height || img.naturalHeight;

      const drawWidth = previewImgWidth * zoom * scaleFactor;
      const drawHeight = previewImgHeight * zoom * scaleFactor;

      ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      ctx.restore();

      const croppedDataUrl = canvas.toDataURL("image/jpeg", 0.9);
      await onCropComplete(croppedDataUrl);
    } catch (err) {
      console.error("Erro ao cortar avatar:", err);
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div
        className="w-full max-w-md rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden border flex flex-col"
        style={{ background: T.surface, borderColor: T.border, color: T.text }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: T.borderSoft }}>
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>
            </svg>
            <h3 className="font-extrabold text-sm sm:text-base">Ajustar e Cortar Avatar</h3>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm hover:opacity-75"
            style={{ background: T.surface2, color: T.text, border: `1px solid ${T.border}` }}
          >
            ✕
          </button>
        </div>

        {/* Viewport / Crop Canvas Area */}
        <div className="p-4 flex flex-col items-center select-none">
          <p className="text-[11px] text-center mb-3 font-medium" style={{ color: T.muted }}>
            Arraste para posicionar e use o slider para ampliar o seu avatar.
          </p>

          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="relative w-[280px] h-[280px] sm:w-[300px] sm:h-[300px] rounded-2xl bg-neutral-950 overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing border border-neutral-700 shadow-inner"
          >
            {/* The Scalable / Draggable Image */}
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Crop target"
              draggable={false}
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${zoom})`,
                transformOrigin: "center center",
                maxWidth: "260px",
                maxHeight: "260px",
                objectFit: "contain",
                userSelect: "none",
                pointerEvents: "none",
                transition: isDragging ? "none" : "transform 0.05s ease-out"
              }}
            />

            {/* Circular Mask Overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.65)",
                borderRadius: "50%",
                width: "260px",
                height: "260px",
                margin: "auto",
                border: "2px dashed rgba(255, 255, 255, 0.85)"
              }}
            />

            {/* Center target crosshair subtle icon */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.5">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="w-full mt-4 space-y-3 px-2">
            {/* Zoom Slider */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm border"
                style={{ background: T.surface2, borderColor: T.border, color: T.text }}
                title="Diminuir Zoom"
              >
                −
              </button>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.02"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="flex-1 accent-amber-600 h-1.5 rounded-lg bg-neutral-300 dark:bg-neutral-700 cursor-pointer"
              />
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3, Number((z + 0.1).toFixed(2))))}
                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm border"
                style={{ background: T.surface2, borderColor: T.border, color: T.text }}
                title="Aumentar Zoom"
              >
                +
              </button>
              <span className="text-[11px] font-mono w-10 text-right" style={{ color: T.muted }}>
                {Math.round(zoom * 100)}%
              </span>
            </div>

            {/* Rotation & Reset Buttons */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={handleRotate}
                className="px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 hover:opacity-85"
                style={{ background: T.surface2, borderColor: T.border, color: T.text }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                <span>Girar 90°</span>
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 hover:opacity-85"
                style={{ background: T.surface2, borderColor: T.border, color: T.muted }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                <span>Centralizar</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t" style={{ borderColor: T.borderSoft }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 rounded-xl text-xs font-bold hover:opacity-85"
            style={{ background: T.surface2, color: T.muted }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSaveCrop}
            disabled={isProcessing}
            className="px-5 py-2 rounded-xl text-xs font-extrabold text-white flex items-center gap-2 shadow-md transition-all hover:scale-[1.02] disabled:opacity-50"
            style={{ background: dark ? "#0284c7" : "#0369a1" }}
          >
            {isProcessing ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Processando...</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Cortar e Salvar</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
