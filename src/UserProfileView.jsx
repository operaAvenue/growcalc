import React, { useState, useEffect, useRef } from "react";

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
  const [attachedImages, setAttachedImages] = useState([]);
  const [attachedVideos, setAttachedVideos] = useState([]);
  const [isPosting, setIsPosting] = useState(false);

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

    // Default sample posts
    return [
      {
        id: "post_1",
        author: {
          name: currentUser?.name || "Cultivador",
          username: currentUser?.username || "grower",
          avatarUrl: currentUser?.avatarUrl || ""
        },
        createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
        text: "Hoje entramos na 4ª semana de floração! O sistema de recirculação DWC com pedras expandidas está mantendo o EC em 1.4 mS/cm e o pH cravado em 5.9. O desenvolvimento das flores está surpreendente.",
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
        text: "Novo setup configurado no GrowinStones e sincronizado com o controlador ESP32 via MQTT. Telemetria em tempo real 24/7 funcionando perfeitamente!",
        stage: "Setup & Automação",
        images: [],
        videos: [],
        likes: 24,
        liked: true,
        comments: []
      }
    ];
  });

  // Save posts locally and in cloud
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(posts));
      if (currentUser && (currentUser.email || currentUser.username)) {
        fetch("https://grow.thegrowinstones.com/api/user/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user: currentUser, posts })
        }).catch(() => {});
      }
    } catch (e) {}
  }, [posts, storageKey, currentUser]);

  // Handle Avatar Change
  const handleAvatarFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast("A imagem deve ter no máximo 5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // Handle Banner Change
  const handleBannerFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      showToast("O banner deve ter no máximo 8MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setBannerPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // Save Profile
  const handleSaveProfile = () => {
    const updated = {
      ...currentUser,
      name: editName.trim() || currentUser.name,
      bio: editBio.trim(),
      location: editLocation.trim(),
      strainFocus: editStrainFocus.trim(),
      avatarUrl: avatarPreview || currentUser?.avatarUrl,
      bannerUrl: bannerPreview || currentUser?.bannerUrl
    };
    setCurrentUser(updated);
    localStorage.setItem("growcalc_user", JSON.stringify(updated));
    
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
  const handleAttachImages = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    files.forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        showToast("Imagem muito grande (máx 10MB)");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedImages((prev) => [...prev, reader.result]);
      };
      reader.readAsDataURL(file);
    });
  };

  // Handle Attach Video
  const handleAttachVideo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      showToast("Vídeo muito grande (máx 50MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachedVideos((prev) => [...prev, reader.result]);
    };
    reader.readAsDataURL(file);
  };

  // Create Post
  const handleCreatePost = () => {
    if (!postText.trim() && attachedImages.length === 0 && attachedVideos.length === 0) {
      showToast("Escreva algo ou anexe uma mídia para publicar.");
      return;
    }

    setIsPosting(true);
    setTimeout(() => {
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

      setPosts([newPost, ...posts]);
      setPostText("");
      setAttachedImages([]);
      setAttachedVideos([]);
      setIsPosting(false);
      showToast("Publicação compartilhada no seu diário!");
    }, 400);
  };

  // Toggle Like
  const handleToggleLike = (postId) => {
    setPosts(posts.map((p) => {
      if (p.id === postId) {
        return {
          ...p,
          liked: !p.liked,
          likes: p.liked ? Math.max(0, p.likes - 1) : p.likes + 1
        };
      }
      return p;
    }));
  };

  // Delete Post
  const handleDeletePost = (postId) => {
    if (window.confirm("Deseja excluir esta publicação?")) {
      setPosts(posts.filter((p) => p.id !== postId));
      showToast("Publicação removida.");
    }
  };

  // Add Comment
  const handleAddComment = (postId, commentText) => {
    if (!commentText || !commentText.trim()) return;
    setPosts(posts.map((p) => {
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
    }));
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
    <div className="max-w-4xl mx-auto w-full px-3 sm:px-6 py-4 sm:py-6 pb-24 overflow-x-hidden">
      {/* HIDDEN INPUTS FOR MEDIA */}
      <input type="file" ref={avatarInputRef} accept="image/*" onChange={handleAvatarFile} className="hidden" />
      <input type="file" ref={bannerInputRef} accept="image/*" onChange={handleBannerFile} className="hidden" />
      <input type="file" ref={imageAttachRef} accept="image/*" multiple onChange={handleAttachImages} className="hidden" />
      <input type="file" ref={videoAttachRef} accept="video/*" onChange={handleAttachVideo} className="hidden" />

      {/* ————————————————— PROFILE HEADER (TWITTER / X STYLE) ————————————————— */}
      <div className="rounded-2xl sm:rounded-3xl overflow-hidden shadow-lg border mb-5 w-full max-w-full" style={{ background: T.surface, borderColor: T.border }}>
        {/* BANNER */}
        <div className="relative h-36 sm:h-56 w-full" style={bannerStyle}>
          <button
            onClick={() => bannerInputRef.current?.click()}
            className="absolute top-3 right-3 px-3 py-1.5 rounded-full text-[11px] font-bold backdrop-blur-md transition-all hover:scale-105 flex items-center gap-1.5 shadow"
            style={{ background: "rgba(0, 0, 0, 0.65)", color: "#ffffff", border: "1px solid rgba(255, 255, 255, 0.25)" }}
            title="Trocar Foto de Capa"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            <span>Alterar Capa</span>
          </button>
        </div>

        {/* PROFILE INFO BAR */}
        <div className="px-4 sm:px-6 pb-5 pt-0 relative w-full max-w-full">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 -mt-12 sm:-mt-20 mb-3">
            {/* AVATAR OVERLAY */}
            <div className="relative group shrink-0 self-start">
              <div
                className="w-20 h-20 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 shadow-xl flex items-center justify-center font-extrabold text-2xl sm:text-3xl"
                style={{
                  background: T.surface2,
                  borderColor: T.surface,
                  color: T.brand,
                  backgroundImage: (avatarPreview || currentUser?.avatarUrl) ? `url(${avatarPreview || currentUser?.avatarUrl})` : "none",
                  backgroundSize: "cover",
                  backgroundPosition: "center"
                }}
              >
                {!(avatarPreview || currentUser?.avatarUrl) && (currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "G")}
              </div>

              <button
                onClick={() => avatarInputRef.current?.click()}
                className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] sm:text-[11px] font-bold"
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
            <div className="text-xs font-mono font-semibold mt-0.5" style={{ color: T.brand }}>
              @{currentUser?.username || "grower"}
            </div>

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

      {/* ————————————————— POST CREATOR (TWITTER STYLE) ————————————————— */}
      <div className="p-5 rounded-2xl border shadow-sm mb-8" style={{ background: T.surface, borderColor: T.border }}>
        <div className="flex items-start gap-3.5">
          <div
            className="w-10 h-10 rounded-full overflow-hidden shrink-0 font-bold flex items-center justify-center text-sm border"
            style={{
              background: T.surface2,
              borderColor: T.border,
              color: T.brand,
              backgroundImage: (avatarPreview || currentUser?.avatarUrl) ? `url(${avatarPreview || currentUser?.avatarUrl})` : "none",
              backgroundSize: "cover",
              backgroundPosition: "center"
            }}
          >
            {!(avatarPreview || currentUser?.avatarUrl) && (currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "G")}
          </div>

          <div className="flex-1 min-w-0">
            <textarea
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              placeholder="O que está acontecendo no seu grow? Compartilhe medições, fotos, podas, floração..."
              rows={3}
              className="w-full bg-transparent outline-none text-sm resize-none"
              style={{ color: T.text }}
            />

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
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                  title="Anexar Fotos"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#38bdf8" }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  <span>Foto</span>
                </button>

                {/* ATTACH VIDEO BUTTON */}
                <button
                  onClick={() => videoAttachRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
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
                className="px-5 py-2 rounded-xl text-xs font-extrabold text-white transition-all shadow-md disabled:opacity-40 flex items-center gap-1.5"
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
    </div>
  );
}

// ————————————————— POST CARD COMPONENT —————————————————
function PostCard({ post, currentUser, T, dark, onToggleLike, onDelete, onAddComment, showToast }) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");

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
            className="w-10 h-10 rounded-full overflow-hidden font-bold flex items-center justify-center text-xs shrink-0 border"
            style={{
              background: T.surface2,
              borderColor: T.border,
              color: T.brand,
              backgroundImage: post.author.avatarUrl ? `url(${post.author.avatarUrl})` : "none",
              backgroundSize: "cover",
              backgroundPosition: "center"
            }}
          >
            {!post.author.avatarUrl && (post.author.name ? post.author.name.charAt(0).toUpperCase() : "G")}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-sm" style={{ color: T.text }}>{post.author.name}</span>
              <span className="text-xs font-mono" style={{ color: T.muted }}>@{post.author.username}</span>
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
        {post.author.username === currentUser?.username && (
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

      {/* POST TEXT */}
      {post.text && (
        <div className="text-sm leading-relaxed mb-3.5 whitespace-pre-wrap" style={{ color: T.text }}>
          {post.text}
        </div>
      )}

      {/* MEDIA ATTACHMENTS */}
      {post.images && post.images.length > 0 && (
        <div className={`grid gap-2 mb-3.5 rounded-xl overflow-hidden ${post.images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {post.images.map((img, idx) => (
            <div key={idx} className="relative max-h-96 overflow-hidden rounded-xl bg-black/10">
              <img src={img} alt="Post media" className="w-full h-full object-cover max-h-96" />
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
