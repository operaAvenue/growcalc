import React, { useState, useEffect, useMemo } from "react";

export default function CommunityFeedView({ currentUser, T, dark, onNavigateToProfile }) {
  const [posts, setPosts] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [isPosting, setIsPosting] = useState(false);
  const [newPostText, setNewPostText] = useState("");
  const [newPostImages, setNewPostImages] = useState([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [zoomedImage, setZoomedImage] = useState(null);
  const [likedPosts, setLikedPosts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("growcalc_liked_posts") || "{}");
    } catch (e) {
      return {};
    }
  });

  // Carregar feed e usuários online
  const loadFeed = async (q = "") => {
    try {
      setLoading(true);
      const url = q
        ? `https://grow.thegrowinstones.com/api/community/feed?q=${encodeURIComponent(q)}`
        : "https://grow.thegrowinstones.com/api/community/feed";
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && Array.isArray(data.posts)) {
        setPosts(data.posts);
      }
    } catch (err) {
      console.error("Erro ao carregar feed:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadOnlineUsers = async () => {
    try {
      const res = await fetch("https://grow.thegrowinstones.com/api/community/online");
      const data = await res.json();
      if (data.success && Array.isArray(data.users)) {
        setOnlineUsers(data.users);
      }
    } catch (err) {
      console.error("Erro ao carregar usuários online:", err);
    }
  };

  useEffect(() => {
    loadFeed(searchQuery);
    loadOnlineUsers();

    // Heartbeat para marcar usuário atual online
    if (currentUser) {
      fetch("https://grow.thegrowinstones.com/api/community/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: currentUser }),
      }).catch(() => {});
    }

    const interval = setInterval(() => {
      loadOnlineUsers();
    }, 45000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Debounce busca de posts
  useEffect(() => {
    const handler = setTimeout(() => {
      loadFeed(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Upload de imagem no post
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert("A imagem deve ter no máximo 10MB.");
      return;
    }

    setImageUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result;
        const res = await fetch("https://grow.thegrowinstones.com/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: base64,
            filename: `post_${Date.now()}`,
          }),
        });
        const data = await res.json();
        if (data.success && data.url) {
          setNewPostImages((prev) => [...prev, data.url]);
        } else {
          alert("Erro no upload da imagem.");
        }
      } catch (err) {
        console.error("Erro no upload:", err);
        alert("Falha na conexão com o servidor de upload.");
      } finally {
        setImageUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Publicar post diretamente no feed
  const handlePublishPost = async () => {
    if (!newPostText.trim() && newPostImages.length === 0) return;
    setIsPosting(true);
    try {
      const author = currentUser || {
        name: "Cultivador",
        username: "grower",
        email: "grower@thegrowinstones.com",
      };

      const res = await fetch("https://grow.thegrowinstones.com/api/community/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: author,
          post: {
            text: newPostText,
            images: newPostImages,
            likes: 0,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewPostText("");
        setNewPostImages([]);
        loadFeed(searchQuery);
      } else {
        alert("Erro ao publicar post.");
      }
    } catch (err) {
      console.error("Erro ao publicar:", err);
      alert("Erro de conexão ao publicar post.");
    } finally {
      setIsPosting(false);
    }
  };

  // Like em post
  const toggleLike = (postId) => {
    setLikedPosts((prev) => {
      const isLiked = !!prev[postId];
      const nextState = { ...prev, [postId]: !isLiked };
      localStorage.setItem("growcalc_liked_posts", JSON.stringify(nextState));
      return nextState;
    });

    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          const currentlyLiked = !!likedPosts[postId];
          const curLikes = Number(p.likes) || 0;
          return {
            ...p,
            likes: currentlyLiked ? Math.max(0, curLikes - 1) : curLikes + 1,
          };
        }
        return p;
      })
    );
  };

  // Renderizador simplificado de Markdown (Obsidian style)
  const renderMarkdown = (content) => {
    if (!content) return null;
    const lines = content.split("\n");

    return lines.map((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("### ")) {
        return (
          <h3 key={idx} className="text-sm font-bold mt-2.5 mb-1" style={{ color: T.text }}>
            {trimmed.replace(/^###\s+/, "")}
          </h3>
        );
      }
      if (trimmed.startsWith("## ")) {
        return (
          <h2 key={idx} className="text-base font-bold mt-3 mb-1" style={{ color: T.text }}>
            {trimmed.replace(/^##\s+/, "")}
          </h2>
        );
      }
      if (trimmed.startsWith("# ")) {
        return (
          <h1 key={idx} className="text-lg font-extrabold mt-3.5 mb-1.5" style={{ color: T.text }}>
            {trimmed.replace(/^#\s+/, "")}
          </h1>
        );
      }
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        return (
          <li key={idx} className="text-xs ml-4 list-disc" style={{ color: T.muted }}>
            {trimmed.replace(/^[-*]\s+/, "")}
          </li>
        );
      }
      if (!trimmed) {
        return <div key={idx} className="h-1.5" />;
      }
      return (
        <p key={idx} className="text-xs leading-relaxed" style={{ color: T.text }}>
          {line}
        </p>
      );
    });
  };

  // Formatação de data relativa
  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return "recentemente";
    try {
      const d = new Date(dateStr);
      const diffMs = Date.now() - d.getTime();
      const diffMin = Math.floor(diffMs / (60 * 1000));
      const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
      const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

      if (diffMin < 2) return "agora mesmo";
      if (diffMin < 60) return `${diffMin}m atrás`;
      if (diffHours < 24) return `${diffHours}h atrás`;
      if (diffDays === 1) return "ontem";
      if (diffDays < 7) return `${diffDays}d atrás`;
      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    } catch (e) {
      return "recentemente";
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 w-full min-w-0">
      {/* Cabeçalho do Feed e Barra de Busca */}
      <div className="mb-6 space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight" style={{ color: T.text }}>
              Feed da Comunidade
            </h1>
            <p className="text-xs mt-0.5" style={{ color: T.muted }}>
              Acompanhe as atualizações, diários de cultivo e postagens de todos os cultivadores da rede.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadFeed(searchQuery)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
              title="Atualizar feed"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        {/* CAMPO DE BUSCA DE POSTS */}
        <div className="relative w-full">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: T.muted }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar nos posts da comunidade (palavras-chave, genética, autor...)"
            className="w-full h-11 pl-10 pr-10 rounded-2xl text-xs font-medium focus:outline-none transition-all shadow-sm"
            style={{
              background: T.surface2,
              border: `1px solid ${searchQuery ? "#f59e0b" : T.border}`,
              color: T.text,
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center hover:bg-stone-700/30"
              style={{ color: T.muted }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Grid Principal: Feed (2/3) + Painel Lateral de Usuários Online (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Coluna do Feed de Posts */}
        <div className="lg:col-span-2 space-y-4">
          {/* Card de Criação de Post */}
          <div
            className="p-4 rounded-2xl shadow-sm transition-all"
            style={{ background: T.surface, border: `1px solid ${T.border}` }}
          >
            <div className="flex gap-3">
              <div
                className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center font-bold text-xs"
                style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
              >
                {currentUser?.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt="Avatar" className="w-full h-full object-cover rounded-full" />
                ) : (
                  <span>{currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "G"}</span>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <textarea
                  rows={3}
                  value={newPostText}
                  onChange={(e) => setNewPostText(e.target.value)}
                  placeholder="O que está acontecendo no seu cultivo hoje? Suporta Markdown (# Titulo, - Lista, etc)..."
                  className="w-full p-2.5 rounded-xl text-xs font-medium focus:outline-none resize-y"
                  style={{ background: T.surface2, border: `1px solid ${T.borderSoft}`, color: T.text }}
                />

                {/* Previews de Imagens anexadas */}
                {newPostImages.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {newPostImages.map((img, i) => (
                      <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border" style={{ borderColor: T.border }}>
                        <img src={img} alt="Anexo" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setNewPostImages((prev) => prev.filter((_, idx) => idx !== i))}
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center font-bold"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: T.borderSoft }}>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg hover:opacity-80 transition-opacity" style={{ color: T.muted }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span>{imageUploading ? "Enviando..." : "Foto"}</span>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={imageUploading} />
                  </label>

                  <button
                    type="button"
                    onClick={handlePublishPost}
                    disabled={isPosting || (!newPostText.trim() && newPostImages.length === 0)}
                    className="px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                    style={{ background: "#0284c7", color: "#ffffff" }}
                  >
                    <span>{isPosting ? "Publicando..." : "Publicar"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Lista de Posts */}
          {loading ? (
            <div className="text-center py-12" style={{ color: T.muted }}>
              <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs">Carregando feed da comunidade...</p>
            </div>
          ) : posts.length === 0 ? (
            <div
              className="text-center py-12 px-6 rounded-2xl border border-dashed"
              style={{ borderColor: T.borderSoft, background: T.surface }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2" style={{ color: T.faint }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p className="text-sm font-bold" style={{ color: T.text }}>Nenhum post encontrado</p>
              <p className="text-xs mt-1" style={{ color: T.muted }}>
                {searchQuery ? `Nenhum resultado para a busca "${searchQuery}".` : "Seja o primeiro a publicar no feed da comunidade!"}
              </p>
            </div>
          ) : (
            posts.map((post) => {
              const isLiked = !!likedPosts[post.id];
              const author = post.author || {};
              const authorSubdomain = author.subdomainUrl || `https://${author.username || "grow"}.thegrowinstones.com`;
              const isSuper = author.role === "Superuser" || author.email?.toLowerCase() === "roger.ra@gmail.com";

              return (
                <article
                  key={post.id}
                  className="p-4 sm:p-5 rounded-2xl shadow-sm transition-all space-y-3"
                  style={{ background: T.surface, border: `1px solid ${T.border}` }}
                >
                  {/* Autor do Post */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <a
                        href={authorSubdomain}
                        target="_blank"
                        rel="noreferrer"
                        className="w-10 h-10 rounded-full overflow-hidden shrink-0 flex items-center justify-center font-bold text-xs shadow-sm hover:scale-105 transition-transform"
                        style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                      >
                        {author.avatarUrl ? (
                          <img src={author.avatarUrl} alt={author.name} className="w-full h-full object-cover rounded-full" />
                        ) : (
                          <span>{author.name ? author.name.charAt(0).toUpperCase() : "G"}</span>
                        )}
                      </a>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <a
                            href={authorSubdomain}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold hover:underline truncate"
                            style={{ color: T.text }}
                          >
                            {author.name || "Cultivador"}
                          </a>
                          {isSuper && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
                              SUPERUSER
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px]" style={{ color: T.muted }}>
                          <span className="font-mono truncate">@{author.username}</span>
                          <span>·</span>
                          <span>{formatTimeAgo(post.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    <a
                      href={authorSubdomain}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all hover:bg-stone-700/20 shrink-0"
                      style={{ border: `1px solid ${T.borderSoft}`, color: T.text }}
                    >
                      Ver Subdomínio
                    </a>
                  </div>

                  {/* Conteúdo do Post */}
                  <div className="space-y-1.5 text-xs leading-relaxed" style={{ color: T.text }}>
                    {renderMarkdown(post.text || post.content)}
                  </div>

                  {/* Imagens do Post */}
                  {Array.isArray(post.images) && post.images.length > 0 && (
                    <div className={`grid gap-2 pt-1 ${post.images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                      {post.images.map((img, idx) => (
                        <div
                          key={idx}
                          onClick={() => setZoomedImage(img)}
                          className="rounded-xl overflow-hidden cursor-pointer aspect-video bg-stone-900 border transition-transform hover:scale-[1.01]"
                          style={{ borderColor: T.border }}
                        >
                          <img src={img} alt="Foto do post" className="w-full h-full object-cover block" />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Rodapé do Post (Likes & Interação) */}
                  <div className="pt-3 border-t flex items-center justify-between gap-4" style={{ borderColor: T.borderSoft }}>
                    <button
                      onClick={() => toggleLike(post.id)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition-all hover:scale-105"
                      style={{
                        background: isLiked ? "rgba(244, 63, 94, 0.15)" : T.surface2,
                        color: isLiked ? "#f43f5e" : T.muted,
                        border: `1px solid ${isLiked ? "rgba(244, 63, 94, 0.4)" : T.borderSoft}`,
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                      <span>{post.likes || 0} curtidas</span>
                    </button>

                    <span className="text-[10.5px]" style={{ color: T.faint }}>
                      GrowinStones Community
                    </span>
                  </div>
                </article>
              );
            })
          )}
        </div>

        {/* Coluna Lateral: USUÁRIOS ONLINE & ESTATÍSTICAS DA REDE */}
        <div className="space-y-5">
          {/* Card Usuários Online */}
          <div
            className="p-4 rounded-2xl shadow-sm space-y-3"
            style={{ background: T.surface, border: `1px solid ${T.border}` }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: T.text }}>
                  Cultivadores Online ({onlineUsers.length})
                </h3>
              </div>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {onlineUsers.length === 0 ? (
                <p className="text-xs py-2" style={{ color: T.muted }}>Nenhum cultivador ativo agora.</p>
              ) : (
                onlineUsers.map((u, i) => {
                  const subUrl = `https://${u.username || "grow"}.thegrowinstones.com`;
                  const isSuper = u.role === "Superuser" || u.email?.toLowerCase() === "roger.ra@gmail.com";
                  return (
                    <div
                      key={u.username || i}
                      className="p-2 rounded-xl flex items-center justify-between gap-2 transition-all hover:bg-stone-700/20"
                      style={{ background: T.surface2, border: `1px solid ${T.borderSoft}` }}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-7 h-7 rounded-full overflow-hidden shrink-0 flex items-center justify-center font-bold text-[10px]"
                          style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text }}
                        >
                          {u.avatarUrl ? (
                            <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover rounded-full" />
                          ) : (
                            <span>{u.name ? u.name.charAt(0).toUpperCase() : "G"}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold truncate" style={{ color: T.text }}>
                              {u.name}
                            </span>
                            {isSuper && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Superuser" />
                            )}
                          </div>
                          <div className="text-[10px] font-mono truncate" style={{ color: T.muted }}>
                            @{u.username}
                          </div>
                        </div>
                      </div>

                      <a
                        href={subUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-1 rounded-lg text-[10px] font-bold shrink-0"
                        style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text }}
                      >
                        Ver Perfil
                      </a>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Card de Estatísticas da Rede */}
          <div
            className="p-4 rounded-2xl shadow-sm space-y-3"
            style={{ background: T.surface, border: `1px solid ${T.border}` }}
          >
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: T.text }}>
              Rede GrowinStones
            </h3>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-3 rounded-xl" style={{ background: T.surface2, border: `1px solid ${T.borderSoft}` }}>
                <p className="text-lg font-bold" style={{ color: "#38bdf8" }}>{posts.length}</p>
                <p className="text-[10px] font-semibold mt-0.5" style={{ color: T.muted }}>Posts na Rede</p>
              </div>
              <div className="p-3 rounded-xl" style={{ background: T.surface2, border: `1px solid ${T.borderSoft}` }}>
                <p className="text-lg font-bold" style={{ color: "#34d399" }}>{onlineUsers.length}</p>
                <p className="text-[10px] font-semibold mt-0.5" style={{ color: T.muted }}>Online Agora</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Zoom de Imagem */}
      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img src={zoomedImage} alt="Zoom" className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl object-contain" />
        </div>
      )}
    </div>
  );
}
