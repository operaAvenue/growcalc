import React, { useState, useEffect } from "react";

export default function SuperuserUsersCrudView({ currentUser, T, dark }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Form State
  const [formName, setFormName] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formBio, setFormBio] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formStrainFocus, setFormStrainFocus] = useState("");
  const [formRole, setFormRole] = useState("Cultivador");
  const [formAvatarUrl, setFormAvatarUrl] = useState("");

  const loadUsers = async () => {
    try {
      setLoading(true);
      setErrorMsg("");
      const res = await fetch("https://grow.thegrowinstones.com/api/admin/users", {
        headers: { "x-superuser-email": currentUser?.email || "roger.ra@gmail.com" },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.users)) {
        setUsers(data.users);
      } else {
        setErrorMsg(data.error || "Erro ao carregar lista de usuários.");
      }
    } catch (err) {
      console.error("Erro ao carregar usuários:", err);
      setErrorMsg("Falha ao comunicar com o servidor administrativo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openCreateModal = () => {
    setEditingUser(null);
    setFormName("");
    setFormUsername("");
    setFormEmail("");
    setFormBio("");
    setFormLocation("Brasil");
    setFormStrainFocus("");
    setFormRole("Cultivador");
    setFormAvatarUrl("");
    setIsModalOpen(true);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setFormName(user.name || "");
    setFormUsername(user.username || "");
    setFormEmail(user.email || "");
    setFormBio(user.bio || "");
    setFormLocation(user.location || "Brasil");
    setFormStrainFocus(user.strainFocus || "");
    setFormRole(user.role || "Cultivador");
    setFormAvatarUrl(user.avatarUrl || "");
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!formUsername.trim() && !formEmail.trim()) {
      alert("Informe ao menos o nome de usuário ou email.");
      return;
    }

    setIsSaving(true);
    try {
      const isEdit = Boolean(editingUser);
      const url = isEdit
        ? `https://grow.thegrowinstones.com/api/admin/users/${encodeURIComponent(editingUser.username || editingUser.email)}`
        : "https://grow.thegrowinstones.com/api/admin/users";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-superuser-email": currentUser?.email || "roger.ra@gmail.com",
        },
        body: JSON.stringify({
          user: {
            name: formName,
            username: formUsername.toLowerCase().trim().replace(/[^a-z0-9-]/g, ""),
            email: formEmail.toLowerCase().trim(),
            bio: formBio,
            location: formLocation,
            strainFocus: formStrainFocus,
            role: formRole,
            avatarUrl: formAvatarUrl,
          },
        }),
      });

      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        loadUsers();
      } else {
        alert(data.error || "Erro ao salvar usuário.");
      }
    } catch (err) {
      console.error("Erro ao salvar usuário:", err);
      alert("Falha na conexão com o servidor.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteUser = async (user) => {
    if (user.email?.toLowerCase() === "roger.ra@gmail.com" || user.isSuperuser) {
      alert("O Superuser principal (roger.ra@gmail.com) é protegido e não pode ser excluído.");
      return;
    }
    const confirmDelete = window.confirm(
      `Tem certeza que deseja excluir o usuário @${user.username} (${user.email})?\n\nEsta ação removerá todos os dados do cultivador.`
    );
    if (!confirmDelete) return;

    try {
      const res = await fetch(
        `https://grow.thegrowinstones.com/api/admin/users/${encodeURIComponent(user.username || user.email)}`,
        {
          method: "DELETE",
          headers: { "x-superuser-email": currentUser?.email || "roger.ra@gmail.com" },
        }
      );
      const data = await res.json();
      if (data.success) {
        setUsers((prev) => prev.filter((u) => u.username !== user.username && u.email !== user.email));
      } else {
        alert(data.error || "Erro ao excluir usuário.");
      }
    } catch (err) {
      console.error("Erro ao excluir:", err);
      alert("Falha na conexão ao excluir usuário.");
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (u.name || "").toLowerCase().includes(q) ||
      (u.username || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.role || "").toLowerCase().includes(q) ||
      (u.strainFocus || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 w-full min-w-0">
      {/* Superuser Banner & Stats */}
      <div
        className="p-5 sm:p-6 rounded-3xl shadow-lg mb-6 border transition-all"
        style={{
          background: "linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(2, 132, 199, 0.12) 100%)",
          borderColor: "rgba(245, 158, 11, 0.3)",
        }}
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-extrabold mb-2" style={{ background: "#f59e0b", color: "#1c1917" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span>SUPERUSER ADMIN PANEL</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight" style={{ color: T.text }}>
              Gestão de Usuários & Subdomínios
            </h1>
            <p className="text-xs mt-1" style={{ color: T.muted }}>
              Controle total da rede GrowinStones: cadastro, edição de perfis, subdomínios e privilégios.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={openCreateModal}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all hover:scale-105 shadow-md flex items-center gap-2"
              style={{ background: "#f59e0b", color: "#1c1917" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span>Novo Usuário</span>
            </button>

            <button
              onClick={loadUsers}
              className="px-3 py-2 rounded-xl text-xs font-bold transition-all"
              style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text }}
              title="Atualizar lista"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Resumo em Cards de Métricas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="p-3 rounded-2xl" style={{ background: T.surface, border: `1px solid ${T.borderSoft}` }}>
            <p className="text-lg font-bold" style={{ color: "#38bdf8" }}>{users.length}</p>
            <p className="text-[11px] font-semibold" style={{ color: T.muted }}>Usuários Cadastrados</p>
          </div>
          <div className="p-3 rounded-2xl" style={{ background: T.surface, border: `1px solid ${T.borderSoft}` }}>
            <p className="text-lg font-bold" style={{ color: "#34d399" }}>{users.filter(u => u.username).length}</p>
            <p className="text-[11px] font-semibold" style={{ color: T.muted }}>Subdomínios Ativos</p>
          </div>
          <div className="p-3 rounded-2xl" style={{ background: T.surface, border: `1px solid ${T.borderSoft}` }}>
            <p className="text-lg font-bold" style={{ color: "#f59e0b" }}>{users.reduce((acc, u) => acc + (u.postCount || 0), 0)}</p>
            <p className="text-[11px] font-semibold" style={{ color: T.muted }}>Posts Publicados</p>
          </div>
          <div className="p-3 rounded-2xl" style={{ background: T.surface, border: `1px solid ${T.borderSoft}` }}>
            <p className="text-lg font-bold" style={{ color: "#a78bfa" }}>{users.filter(u => u.isSuperuser).length}</p>
            <p className="text-[11px] font-semibold" style={{ color: T.muted }}>Superusers</p>
          </div>
        </div>
      </div>

      {/* Busca de Usuários */}
      <div className="mb-4 relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, @username, email ou cargo..."
          className="w-full h-10 pl-4 pr-10 rounded-xl text-xs font-medium focus:outline-none shadow-sm"
          style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400"
          >
            ×
          </button>
        )}
      </div>

      {/* Lista de Usuários */}
      {loading ? (
        <div className="text-center py-12" style={{ color: T.muted }}>
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs">Carregando usuários do sistema...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-12 rounded-2xl border border-dashed" style={{ borderColor: T.border, background: T.surface }}>
          <p className="text-sm font-bold" style={{ color: T.text }}>Nenhum usuário encontrado</p>
          <p className="text-xs mt-1" style={{ color: T.muted }}>Tente ajustar a busca ou cadastre um novo usuário.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredUsers.map((u) => {
            const isSuper = u.isSuperuser || u.email?.toLowerCase() === "roger.ra@gmail.com";
            const subUrl = `https://${u.username || "grow"}.thegrowinstones.com`;

            return (
              <div
                key={u.id || u.username || u.email}
                className="p-4 rounded-2xl shadow-sm flex items-center justify-between gap-4 flex-wrap transition-all hover:border-amber-500/50"
                style={{ background: T.surface, border: `1px solid ${T.border}` }}
              >
                {/* Info do Usuário */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div
                    className="w-11 h-11 rounded-full overflow-hidden shrink-0 flex items-center justify-center font-bold text-sm shadow-sm"
                    style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                  >
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <span>{u.name ? u.name.charAt(0).toUpperCase() : "G"}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold truncate" style={{ color: T.text }}>
                        {u.name}
                      </span>
                      {isSuper ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#f59e0b", color: "#1c1917" }}>
                          SUPERUSER
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.muted }}>
                          {u.role || "Cultivador"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs mt-0.5 flex-wrap" style={{ color: T.muted }}>
                      <a href={subUrl} target="_blank" rel="noreferrer" className="font-mono text-sky-400 hover:underline">
                        @{u.username}
                      </a>
                      <span>·</span>
                      <span className="truncate">{u.email || "Sem email"}</span>
                      {u.strainFocus && (
                        <>
                          <span>·</span>
                          <span className="text-amber-400 truncate">{u.strainFocus}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] mt-1" style={{ color: T.faint }}>
                      <span>{u.postCount || 0} posts</span>
                      <span>·</span>
                      <span>{u.presetsCount || 0} setups</span>
                      <span>·</span>
                      <span>{u.location || "Brasil"}</span>
                    </div>
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={subUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:bg-stone-700/20"
                    style={{ border: `1px solid ${T.borderSoft}`, color: T.text }}
                  >
                    Ver Subdomínio
                  </a>
                  <button
                    onClick={() => openEditModal(u)}
                    className="p-2 rounded-xl text-xs font-bold transition-all hover:bg-amber-500/20 text-amber-400"
                    title="Editar usuário"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  {u.isSuperuser || u.email?.toLowerCase() === "roger.ra@gmail.com" ? (
                    <button
                      disabled
                      className="p-2 rounded-xl text-xs font-bold opacity-30 cursor-not-allowed"
                      title="Superuser protegido (não pode ser excluído)"
                      style={{ color: T.faint }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDeleteUser(u)}
                      className="p-2 rounded-xl text-xs font-bold transition-all hover:bg-red-500/20 text-red-400"
                      title="Excluir usuário"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Criar / Editar Usuário */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
            style={{ background: T.surface, border: `1px solid ${T.border}` }}
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: T.borderSoft }}>
              <h3 className="text-base font-bold" style={{ color: T.text }}>
                {editingUser ? `Editar Usuário: @${editingUser.username}` : "Cadastrar Novo Usuário"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-stone-400 hover:text-white"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: T.muted }}>Nome Completo</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Roger Santos"
                  className="w-full h-9 px-3 rounded-xl text-xs font-medium focus:outline-none"
                  style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: T.muted }}>Username / Subdomínio</label>
                  <input
                    type="text"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="ex: rogergrow"
                    className="w-full h-9 px-3 rounded-xl text-xs font-medium font-mono focus:outline-none"
                    style={{ background: T.surface2, border: `1px solid ${T.border}`, color: "#38bdf8" }}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: T.muted }}>Email</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="email@dominio.com"
                    className="w-full h-9 px-3 rounded-xl text-xs font-medium focus:outline-none"
                    style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: T.muted }}>Cargo / Papel</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl text-xs font-medium focus:outline-none"
                    style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                  >
                    <option value="Cultivador">Cultivador</option>
                    <option value="Grower Pro">Grower Pro</option>
                    <option value="Engenheiro Agrônomo">Engenheiro Agrônomo</option>
                    <option value="Superuser">Superuser</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: T.muted }}>Genética em Destaque</label>
                  <input
                    type="text"
                    value={formStrainFocus}
                    onChange={(e) => setFormStrainFocus(e.target.value)}
                    placeholder="Ex: Amnesia Haze"
                    className="w-full h-9 px-3 rounded-xl text-xs font-medium focus:outline-none"
                    style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: T.muted }}>Bio / Descrição</label>
                <textarea
                  rows={2}
                  value={formBio}
                  onChange={(e) => setFormBio(e.target.value)}
                  placeholder="Descrição do cultivador..."
                  className="w-full p-2.5 rounded-xl text-xs font-medium focus:outline-none resize-y"
                  style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                />
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: T.muted }}>URL do Avatar</label>
                <input
                  type="url"
                  value={formAvatarUrl}
                  onChange={(e) => setFormAvatarUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full h-9 px-3 rounded-xl text-xs font-medium focus:outline-none"
                  style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t" style={{ borderColor: T.borderSoft }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold"
                  style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white shadow-md disabled:opacity-50"
                  style={{ background: "#f59e0b", color: "#1c1917" }}
                >
                  {isSaving ? "Salvando..." : editingUser ? "Atualizar Usuário" : "Cadastrar Usuário"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
