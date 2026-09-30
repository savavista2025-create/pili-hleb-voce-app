"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

const supabase = createClient(supabaseUrl, supabaseKey);

const STORES = ["PILI 1", "PILI 2", "PILI PLUS", "PILI BEČMEN", "PILI BOLJEVCI"];
const ADMIN_PASSWORD = "1111";
const TODAY = new Date().toISOString().slice(0, 10);

type Article = {
  id: string;
  sifra: string;
  naziv: string;
  jedinica: "KG" | "KOM";
  glavna_grupa: "VOĆE" | "POVRĆE";
  podgrupa: string;
  emoji: string | null;
  barkod: string | null;
  druga_klasa_sifra: string | null;
  aktivan: boolean;
};

type PrometRow = {
  id: string;
  datum: string;
  prodavnica: string;
  artikal_id: string;
  vrsta: "OTPIS" | "II_KLASA";
  kolicina: number;
  jedinica: "KG" | "KOM";
  created_at?: string;
  radnik_username?: string | null;
  radnik_ime?: string | null;
  vp_artikli?: Article | null;
};

type VpUser = {
  id: number;
  ime: string;
  username: string;
  pin: string;
  prodavnica: string | null;
  aktivan: boolean;
};

type Step = "login" | "store" | "main" | "subgroup" | "articles" | "admin";

type ArchiveDay = {
  datum: string;
  kg: number;
  kom: number;
  count: number;
  otpis: number;
  ii: number;
};

const DEFAULT_SUBGROUPS: Record<"VOĆE" | "POVRĆE", string[]> = {
  VOĆE: ["DOMAĆE VOĆE", "JUŽNO / CITRUSNO", "EGZOTIČNO", "ORAŠASTO / OSTALO"],
  POVRĆE: [
    "KROMPIR, LUK I KORENASTO",
    "PARADAJZ, PAPRIKA I PLODOVITO",
    "KUPUSNJAČE",
    "ZELENIŠ I SALATE",
    "PASULJ / MAHUNARKE",
    "PEČURKE",
    "KISELO / PRIPREMLJENO",
  ],
};

export default function Page() {
  const [step, setStep] = useState<Step>("login");
  const [store, setStore] = useState("");
  const [loggedUser, setLoggedUser] = useState<VpUser | null>(null);
  const [workerUsername, setWorkerUsername] = useState("");
  const [workerPin, setWorkerPin] = useState("");
  const [workerLoginLoading, setWorkerLoginLoading] = useState(false);
  const [mainGroup, setMainGroup] = useState<"VOĆE" | "POVRĆE" | "">("");
  const [subgroup, setSubgroup] = useState("");
  const [articles, setArticles] = useState<Article[]>([]);
  const [selected, setSelected] = useState<Article | null>(null);
  const [action, setAction] = useState<"OTPIS" | "II_KLASA">("OTPIS");
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPass, setAdminPass] = useState("");
  const [adminRows, setAdminRows] = useState<PrometRow[]>([]);
  const [archiveRows, setArchiveRows] = useState<PrometRow[]>([]);
  const [adminDate, setAdminDate] = useState(TODAY);
  const [adminStore, setAdminStore] = useState("SVE");
  const [adminType, setAdminType] = useState("SVE");
  const [adminGroup, setAdminGroup] = useState("SVE");
  const [loadingAdmin, setLoadingAdmin] = useState(false);

  const [showAddArticle, setShowAddArticle] = useState(false);
  const [showArticles, setShowArticles] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newUnit, setNewUnit] = useState<"KG" | "KOM">("KG");
  const [newMain, setNewMain] = useState<"VOĆE" | "POVRĆE">("VOĆE");
  const [newSub, setNewSub] = useState(DEFAULT_SUBGROUPS.VOĆE[0]);
  const [newEmoji, setNewEmoji] = useState("🍎");
  const [newBarcode, setNewBarcode] = useState("");

  useEffect(() => {
    loadArticles();
  }, []);

  async function loadArticles() {
    const { data, error } = await supabase
      .from("vp_artikli")
      .select("*")
      .order("naziv", { ascending: true });

    if (error) {
      notify(`Greška: ${error.message}`);
      return;
    }
    setArticles((data || []) as Article[]);
  }

  const activeArticles = useMemo(() => articles.filter((a) => a.aktivan), [articles]);

  const subgroups = useMemo(() => {
    if (!mainGroup) return [];
    const list = activeArticles
      .filter((a) => a.glavna_grupa === mainGroup && a.podgrupa !== "II KLASA")
      .map((a) => a.podgrupa);
    return Array.from(new Set(list));
  }, [activeArticles, mainGroup]);

  const shownArticles = useMemo(() => {
    return activeArticles.filter(
      (a) =>
        a.glavna_grupa === mainGroup &&
        a.podgrupa === subgroup &&
        a.podgrupa !== "II KLASA"
    );
  }, [activeArticles, mainGroup, subgroup]);

  const filteredAdminRows = useMemo(() => {
    return adminRows.filter((r) => {
      const a = r.vp_artikli;
      if (adminStore !== "SVE" && r.prodavnica !== adminStore) return false;
      if (adminType !== "SVE" && r.vrsta !== adminType) return false;
      if (adminGroup !== "SVE" && a?.glavna_grupa !== adminGroup) return false;
      return true;
    });
  }, [adminRows, adminStore, adminType, adminGroup]);

  const archiveDays = useMemo<ArchiveDay[]>(() => {
    const map = new Map<string, ArchiveDay>();
    for (const r of archiveRows) {
      // Past dates are automatically treated as locked.
      if (r.datum >= TODAY) continue;
      const d = map.get(r.datum) || {
        datum: r.datum,
        kg: 0,
        kom: 0,
        count: 0,
        otpis: 0,
        ii: 0,
      };
      d.count += 1;
      if (r.jedinica === "KG") d.kg += Number(r.kolicina || 0);
      else d.kom += Number(r.kolicina || 0);
      if (r.vrsta === "OTPIS") d.otpis += 1;
      else d.ii += 1;
      map.set(r.datum, d);
    }
    return Array.from(map.values()).sort((a, b) => b.datum.localeCompare(a.datum));
  }, [archiveRows]);

  const selectedDateLocked = adminDate < TODAY;

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  async function loginWorker() {
    const username = workerUsername.trim().toLowerCase();
    const pin = workerPin.trim();

    if (!username || !pin) {
      notify("Unesi korisničko ime i šifru");
      return;
    }

    setWorkerLoginLoading(true);
    const { data, error } = await supabase
      .from("vp_korisnici")
      .select("id, ime, username, pin, prodavnica, aktivan")
      .ilike("username", username)
      .eq("pin", pin)
      .eq("aktivan", true)
      .maybeSingle();
    setWorkerLoginLoading(false);

    if (error) {
      notify(`Greška prijave: ${error.message}`);
      return;
    }
    if (!data) {
      notify("Pogrešan korisnik ili šifra");
      return;
    }

    const user = data as VpUser;
    setLoggedUser(user);
    setWorkerPin("");

    if (user.prodavnica) {
      setStore(user.prodavnica);
      setStep("main");
    } else {
      setStore("");
      setStep("store");
      notify("Izaberi svoju prodavnicu. Sistem će je zapamtiti.");
    }
  }

  function logoutWorker() {
    setLoggedUser(null);
    setWorkerUsername("");
    setWorkerPin("");
    setStore("");
    setMainGroup("");
    setSubgroup("");
    setStep("login");
  }

  async function chooseStore(s: string) {
    setStore(s);

    if (loggedUser && !loggedUser.prodavnica) {
      const { error } = await supabase
        .from("vp_korisnici")
        .update({ prodavnica: s })
        .eq("id", loggedUser.id);

      if (error) {
        notify(`Prodavnica nije sačuvana: ${error.message}`);
        return;
      }

      setLoggedUser({ ...loggedUser, prodavnica: s });
      notify(`Prodavnica ${s} je povezana sa korisnikom ${loggedUser.username}`);
    }

    setStep("main");
  }

  function chooseMain(g: "VOĆE" | "POVRĆE") {
    setMainGroup(g);
    setStep("subgroup");
  }

  function chooseSubgroup(g: string) {
    setSubgroup(g);
    setStep("articles");
  }

  function openArticle(a: Article) {
    setSelected(a);
    setAction("OTPIS");
    setQty("");
  }

  async function saveEntry() {
    if (!selected) return;
    const amount = Number(String(qty).replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      notify("Unesi ispravnu količinu");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("vp_promet").insert({
      datum: TODAY,
      prodavnica: store,
      artikal_id: selected.id,
      vrsta: action,
      kolicina: amount,
      jedinica: selected.jedinica,
      radnik_username: loggedUser?.username || null,
      radnik_ime: loggedUser?.ime || null,
    });
    setSaving(false);

    if (error) {
      notify(`Nije sačuvano: ${error.message}`);
      return;
    }

    notify(`${selected.naziv}: sačuvano ${amount} ${selected.jedinica}`);
    setSelected(null);
    setQty("");
  }

  function openAdmin() {
    setAdminPass("");
    setShowAdminLogin(true);
  }

  async function loginAdmin() {
    if (adminPass !== ADMIN_PASSWORD) {
      notify("Pogrešna šifra");
      return;
    }
    setShowAdminLogin(false);
    setStep("admin");
    setStore("");
    await Promise.all([loadAdminRows(TODAY), loadArchive(), loadArticles()]);
  }

  async function loadAdminRows(date = adminDate) {
    setLoadingAdmin(true);
    const { data, error } = await supabase
      .from("vp_promet")
      .select(`
        id, datum, prodavnica, artikal_id, vrsta, kolicina, jedinica, created_at,
        radnik_username, radnik_ime,
        vp_artikli (*)
      `)
      .eq("datum", date)
      .order("created_at", { ascending: false });

    setLoadingAdmin(false);
    if (error) {
      notify(`Greška izveštaja: ${error.message}`);
      return;
    }
    setAdminRows((data || []) as unknown as PrometRow[]);
  }

  async function loadArchive() {
    const { data, error } = await supabase
      .from("vp_promet")
      .select(`
        id, datum, prodavnica, artikal_id, vrsta, kolicina, jedinica, created_at,
        radnik_username, radnik_ime,
        vp_artikli (*)
      `)
      .order("datum", { ascending: false })
      .limit(1500);

    if (error) {
      notify(`Greška arhive: ${error.message}`);
      return;
    }
    setArchiveRows((data || []) as unknown as PrometRow[]);
  }

  async function openArchiveDay(date: string) {
    setAdminDate(date);
    await loadAdminRows(date);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function updateAdminQty(id: string, value: string) {
    if (selectedDateLocked) {
      notify("Ovaj dnevni otpis je zaključan.");
      await loadAdminRows(adminDate);
      return;
    }
    const amount = Number(String(value).replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      notify("Količina mora biti veća od 0");
      return;
    }
    const { error } = await supabase.from("vp_promet").update({ kolicina: amount }).eq("id", id);
    if (error) {
      notify(`Nije sačuvano: ${error.message}`);
      return;
    }
    setAdminRows((rows) => rows.map((r) => (r.id === id ? { ...r, kolicina: amount } : r)));
    await loadArchive();
    notify("Količina izmenjena");
  }

  async function deleteAdminRow(id: string) {
    if (selectedDateLocked) {
      notify("Ovaj dnevni otpis je zaključan.");
      return;
    }
    if (!window.confirm("Obrisati ovaj unos?")) return;
    const { error } = await supabase.from("vp_promet").delete().eq("id", id);
    if (error) {
      notify(`Nije obrisano: ${error.message}`);
      return;
    }
    setAdminRows((rows) => rows.filter((r) => r.id !== id));
    await loadArchive();
    notify("Unos obrisan");
  }

  async function addArticle() {
    if (!newName.trim() || !newCode.trim()) {
      notify("Unesi naziv i šifru artikla");
      return;
    }
    const { error } = await supabase.from("vp_artikli").insert({
      naziv: newName.trim().toUpperCase(),
      sifra: newCode.trim(),
      jedinica: newUnit,
      glavna_grupa: newMain,
      podgrupa: newSub,
      emoji: newEmoji || "📦",
      barkod: newBarcode.trim() || null,
      aktivan: true,
    });
    if (error) {
      notify(`Artikal nije dodat: ${error.message}`);
      return;
    }
    setNewName("");
    setNewCode("");
    setNewBarcode("");
    setShowAddArticle(false);
    await loadArticles();
    notify("Artikal dodat");
  }

  async function toggleArticle(a: Article) {
    const { error } = await supabase
      .from("vp_artikli")
      .update({ aktivan: !a.aktivan })
      .eq("id", a.id);
    if (error) {
      notify(`Greška: ${error.message}`);
      return;
    }
    await loadArticles();
  }

  function back() {
    if (selected) {
      setSelected(null);
      return;
    }
    if (step === "articles") {
      setStep("subgroup");
      setSubgroup("");
    } else if (step === "subgroup") {
      setStep("main");
      setMainGroup("");
    } else if (step === "main") {
      logoutWorker();
    } else if (step === "store") {
      logoutWorker();
    } else if (step === "admin") {
      setStep("store");
    }
  }

  function printReport() {
    window.print();
  }

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brandIcon">🍎</div>
          <div>
            <strong>PILI VOĆE & POVRĆE</strong>
            <span>Otpis i II klasa</span>
          </div>
        </div>
        <div className="headerActions">
          {loggedUser && (
            <div className="storeBadge">
              {loggedUser.ime}{store ? ` · ${store}` : ""}
            </div>
          )}
          {loggedUser && step !== "admin" && (
            <button className="adminTopBtn" onClick={logoutWorker}>ODJAVA</button>
          )}
          {step !== "admin" && (
            <button className="adminTopBtn" onClick={openAdmin}>🔐 ADMIN</button>
          )}
        </div>
      </header>

      <section className="wrap">
        {step !== "login" && (
          <button className="backBtn" onClick={back}>← Nazad</button>
        )}

        {step === "login" && (
          <div
            style={{
              minHeight: "calc(100vh - 110px)",
              display: "grid",
              placeItems: "center",
              padding: "28px 16px 48px",
              background:
                "radial-gradient(circle at 20% 20%, rgba(255,145,77,.16), transparent 32%), radial-gradient(circle at 85% 15%, rgba(113,58,180,.12), transparent 30%)",
            }}
          >
            <div
              style={{
                width: "min(470px, 100%)",
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: 28,
                padding: "28px 26px 26px",
                boxShadow: "0 24px 70px rgba(15,23,42,.12)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginBottom: 10,
                }}
              >
                <img
                  src="/pili-logo.png"
                  alt="PILI logo"
                  style={{
                    width: "min(280px, 78vw)",
                    maxHeight: 150,
                    objectFit: "contain",
                    display: "block",
                  }}
                />
              </div>

              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    letterSpacing: ".16em",
                    color: "#6b7280",
                    marginBottom: 7,
                  }}
                >
                  PRIJAVA RADNIKA
                </div>
                <h1
                  style={{
                    margin: 0,
                    fontSize: "clamp(28px, 5vw, 38px)",
                    lineHeight: 1.05,
                    color: "#111827",
                  }}
                >
                  Otpis voća i povrća
                </h1>
              </div>

              <div style={{ marginBottom: 15 }}>
                <label
                  style={{
                    display: "block",
                    fontWeight: 800,
                    color: "#111827",
                    marginBottom: 7,
                  }}
                >
                  Korisničko ime
                </label>
                <input
                  className="adminPassInput"
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={workerUsername}
                  onChange={(e) => setWorkerUsername(e.target.value)}
                  style={{
                    width: "100%",
                    minHeight: 56,
                    borderRadius: 15,
                    border: "1px solid #d1d5db",
                    padding: "0 16px",
                    fontSize: 18,
                    background: "#f9fafb",
                  }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: "block",
                    fontWeight: 800,
                    color: "#111827",
                    marginBottom: 7,
                  }}
                >
                  Šifra
                </label>
                <input
                  className="adminPassInput"
                  type="password"
                  inputMode="numeric"
                  value={workerPin}
                  onChange={(e) => setWorkerPin(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loginWorker()}
                  style={{
                    width: "100%",
                    minHeight: 56,
                    borderRadius: 15,
                    border: "1px solid #d1d5db",
                    padding: "0 16px",
                    fontSize: 18,
                    background: "#f9fafb",
                  }}
                />
              </div>

              <button
                className="saveBtn"
                disabled={workerLoginLoading}
                onClick={loginWorker}
                style={{
                  width: "100%",
                  minHeight: 58,
                  borderRadius: 16,
                  fontSize: 17,
                  fontWeight: 900,
                  letterSpacing: ".04em",
                }}
              >
                {workerLoginLoading ? "PRIJAVA..." : "ULAZ"}
              </button>
            </div>
          </div>
        )}

        {step === "store" && (
          <>
            <div className="titleBlock">
              <p>POČETAK</p>
              <h1>Izaberi prodavnicu</h1>
              <span>Odaberi objekat za koji unosiš otpis.</span>
            </div>
            <div className="storeGrid">
              {STORES.map((s, i) => (
                <button key={s} className={`storeCard store${i + 1}`} onClick={() => chooseStore(s)}>
                  <span className="storeEmoji">🏪</span>
                  <strong>{s}</strong>
                  <small>Ulaz u evidenciju</small>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "main" && (
          <>
            <div className="titleBlock">
              <p>{store}</p>
              <h1>Izaberi kategoriju</h1>
              <span>Voće i povrće su odvojeni radi bržeg rada.</span>
            </div>
            <div className="mainCategoryGrid">
              <button className="mainCategory fruit" onClick={() => chooseMain("VOĆE")}>
                <span>🍎</span><strong>VOĆE</strong><small>Domaće, južno, egzotično...</small>
              </button>
              <button className="mainCategory veg" onClick={() => chooseMain("POVRĆE")}>
                <span>🥕</span><strong>POVRĆE</strong><small>Krompir, zeleniš, pasulj...</small>
              </button>
            </div>
          </>
        )}

        {step === "subgroup" && (
          <>
            <div className="titleBlock">
              <p>{store} · {mainGroup}</p>
              <h1>Izaberi grupu</h1>
              <span>Artikli su razdvojeni da radnik ne traži kroz dugu listu.</span>
            </div>
            <div className="subgroupGrid">
              {subgroups.map((g) => (
                <button className="subgroupCard" key={g} onClick={() => chooseSubgroup(g)}>
                  <span className="subgroupIcon">{groupEmoji(g)}</span>
                  <strong>{g}</strong>
                  <small>{activeArticles.filter(a => a.glavna_grupa === mainGroup && a.podgrupa === g).length} artikala</small>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "articles" && (
          <>
            <div className="titleBlock compact">
              <p>{store} · {mainGroup}</p>
              <h1>{subgroup}</h1>
              <span>Klikni na artikal koji otpisuješ ili prebacuješ u II klasu.</span>
            </div>
            <div className="articleGrid">
              {shownArticles.map((a) => (
                <button className="articleCard" key={a.id} onClick={() => openArticle(a)}>
                  <span className="articleEmoji">{a.emoji || "📦"}</span>
                  <strong>{a.naziv}</strong>
                  <small>Šifra {a.sifra} · {a.jedinica}</small>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "admin" && (
          <div className="adminPage">
            <div className="adminTitle">
              <div>
                <p>ADMINISTRACIJA</p>
                <h1>Izveštaj otpisa i II klase</h1>
              </div>
              <div className="adminSideActions">
                <button className="sideBanner greenBanner" onClick={() => setShowAddArticle(true)}>
                  <span>＋</span>
                  <div><strong>NOVI ARTIKAL</strong><small>Dodaj artikal u sistem</small></div>
                </button>
                <button className="sideBanner grayBanner" onClick={() => setShowArticles(true)}>
                  <span>📦</span>
                  <div><strong>ARTIKLI</strong><small>Aktivacija i pregled</small></div>
                </button>
                <button className="printBtn" onClick={printReport}>🖨️ ŠTAMPA / PDF</button>
              </div>
            </div>

            <div className="adminFilters">
              <label>
                Datum
                <input
                  type="date"
                  value={adminDate}
                  onChange={(e) => setAdminDate(e.target.value)}
                />
              </label>
              <label>
                Prodavnica
                <select value={adminStore} onChange={(e) => setAdminStore(e.target.value)}>
                  <option value="SVE">Sve prodavnice</option>
                  {STORES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label>
                Vrsta
                <select value={adminType} onChange={(e) => setAdminType(e.target.value)}>
                  <option value="SVE">Sve</option>
                  <option value="OTPIS">Otpis</option>
                  <option value="II_KLASA">II klasa</option>
                </select>
              </label>
              <label>
                Grupa
                <select value={adminGroup} onChange={(e) => setAdminGroup(e.target.value)}>
                  <option value="SVE">Voće + povrće</option>
                  <option value="VOĆE">Voće</option>
                  <option value="POVRĆE">Povrće</option>
                </select>
              </label>
              <button className="loadBtn" onClick={() => loadAdminRows(adminDate)}>
                {loadingAdmin ? "UČITAVAM..." : "PRIKAŽI"}
              </button>
            </div>

            {selectedDateLocked && (
              <div className="lockedNotice">
                🔒 Ovaj dnevni otpis je zaključan. Možeš da ga pregledaš i odštampaš, ali ne i da menjaš.
              </div>
            )}

            <div className="reportTableWrap topReport">
              <table className="reportTable">
                <thead>
                  <tr>
                    <th>Prodavnica</th>
                    <th>Radnik</th>
                    <th>Artikal</th>
                    <th>Grupa</th>
                    <th>Vrsta</th>
                    <th>Količina</th>
                    <th>JM</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdminRows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.prodavnica}</td>
                      <td>
                        <strong>{r.radnik_ime || "—"}</strong>
                        <small>{r.radnik_username || ""}</small>
                      </td>
                      <td>
                        <strong>{r.vp_artikli?.naziv || "—"}</strong>
                        <small>Šifra {r.vp_artikli?.sifra || "—"}</small>
                      </td>
                      <td>{r.vp_artikli?.glavna_grupa || "—"}</td>
                      <td>
                        <span className={r.vrsta === "OTPIS" ? "tag redTag" : "tag orangeTag"}>
                          {r.vrsta === "OTPIS" ? "OTPIS" : "II KLASA"}
                        </span>
                      </td>
                      <td>
                        {selectedDateLocked ? (
                          <strong>{Number(r.kolicina).toFixed(r.jedinica === "KG" ? 2 : 0)}</strong>
                        ) : (
                          <input
                            className="tableQty"
                            type="number"
                            defaultValue={r.kolicina}
                            step={r.jedinica === "KG" ? "0.01" : "1"}
                            onBlur={(e) => updateAdminQty(r.id, e.target.value)}
                          />
                        )}
                      </td>
                      <td>{r.jedinica}</td>
                      <td>
                        {selectedDateLocked ? (
                          <span className="lockedTag">🔒</span>
                        ) : (
                          <button className="deleteBtn" onClick={() => deleteAdminRow(r.id)}>Obriši</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!loadingAdmin && filteredAdminRows.length === 0 && (
                    <tr><td colSpan={8} className="emptyCell">Nema unosa za izabrane filtere.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="archiveSection">
              <div className="archiveHeading">
                <div>
                  <p>ARHIVA</p>
                  <h2>🔒 Zaključeni dnevni otpisi</h2>
                </div>
                <small>Klikni na dan da vidiš šta je tog dana otpisano.</small>
              </div>

              <div className="archiveGrid">
                {archiveDays.map((d) => (
                  <button
                    key={d.datum}
                    className={`archiveBanner ${adminDate === d.datum ? "selectedArchive" : ""}`}
                    onClick={() => openArchiveDay(d.datum)}
                  >
                    <div className="archiveDate">
                      <span>🔒</span>
                      <div>
                        <strong>{formatDate(d.datum)}</strong>
                        <small>{d.count} unosa</small>
                      </div>
                    </div>
                    <div className="archiveStats">
                      <span>{d.kg.toFixed(2)} KG</span>
                      <span>{d.kom.toFixed(0)} KOM</span>
                      <span>Otpis {d.otpis}</span>
                      <span>II klasa {d.ii}</span>
                    </div>
                    <b>›</b>
                  </button>
                ))}
                {archiveDays.length === 0 && (
                  <div className="archiveEmpty">Još nema zaključenih prethodnih dana.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {selected && (
        <div className="modalBackdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalArticle">
              <span>{selected.emoji || "📦"}</span>
              <div>
                <strong>{selected.naziv}</strong>
                <small>Šifra {selected.sifra} · {selected.jedinica}</small>
              </div>
            </div>

            <label>Šta radiš?</label>
            <div className="actionGrid">
              <button
                className={action === "OTPIS" ? "action active red" : "action"}
                onClick={() => setAction("OTPIS")}
              >
                🗑️ OTPIS
              </button>
              <button
                className={action === "II_KLASA" ? "action active orange" : "action"}
                onClick={() => setAction("II_KLASA")}
              >
                ♻️ II KLASA
              </button>
            </div>

            {action === "II_KLASA" && selected.druga_klasa_sifra && (
              <div className="mappingNote">
                Sistem je povezao II klasu sa šifrom <strong>{selected.druga_klasa_sifra}</strong>.
              </div>
            )}

            <label>Količina ({selected.jedinica})</label>
            <input
              className="qtyInput"
              type="number"
              inputMode="decimal"
              step={selected.jedinica === "KG" ? "0.01" : "1"}
              min="0"
              placeholder={selected.jedinica === "KG" ? "npr. 2,50" : "npr. 3"}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              autoFocus
            />

            <button className="saveBtn" disabled={saving} onClick={saveEntry}>
              {saving ? "ČUVAM..." : "SAČUVAJ"}
            </button>
            <button className="cancelBtn" onClick={() => setSelected(null)}>ODUSTANI</button>
          </div>
        </div>
      )}

      {showAdminLogin && (
        <div className="modalBackdrop" onClick={() => setShowAdminLogin(false)}>
          <div className="loginModal" onClick={(e) => e.stopPropagation()}>
            <div className="loginIcon">🔐</div>
            <h2>ADMIN</h2>
            <p>Unesi administratorsku šifru.</p>
            <input
              className="adminPassInput"
              type="password"
              inputMode="numeric"
              placeholder="Šifra"
              value={adminPass}
              onChange={(e) => setAdminPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loginAdmin()}
              autoFocus
            />
            <button className="saveBtn" onClick={loginAdmin}>ULAZ</button>
            <button className="cancelBtn" onClick={() => setShowAdminLogin(false)}>ODUSTANI</button>
          </div>
        </div>
      )}

      {showAddArticle && (
        <div className="modalBackdrop" onClick={() => setShowAddArticle(false)}>
          <div className="articleModal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <p>ADMIN</p>
                <h2>＋ Novi artikal</h2>
              </div>
              <button onClick={() => setShowAddArticle(false)}>✕</button>
            </div>
            <div className="articleForm">
              <label>Naziv<input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="npr. JABUKA FUJI" /></label>
              <label>Šifra<input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="šifra artikla" /></label>
              <label>Jedinica
                <select value={newUnit} onChange={(e) => setNewUnit(e.target.value as "KG" | "KOM")}>
                  <option>KG</option><option>KOM</option>
                </select>
              </label>
              <label>Glavna grupa
                <select
                  value={newMain}
                  onChange={(e) => {
                    const v = e.target.value as "VOĆE" | "POVRĆE";
                    setNewMain(v);
                    setNewSub(DEFAULT_SUBGROUPS[v][0]);
                    setNewEmoji(v === "VOĆE" ? "🍎" : "🥕");
                  }}
                >
                  <option>VOĆE</option><option>POVRĆE</option>
                </select>
              </label>
              <label>Podgrupa
                <select value={newSub} onChange={(e) => setNewSub(e.target.value)}>
                  {DEFAULT_SUBGROUPS[newMain].map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label>Ikonica<input value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} /></label>
              <label>Barkod<input value={newBarcode} onChange={(e) => setNewBarcode(e.target.value)} placeholder="opciono" /></label>
            </div>
            <button className="saveBtn" onClick={addArticle}>DODAJ ARTIKAL</button>
          </div>
        </div>
      )}

      {showArticles && (
        <div className="modalBackdrop" onClick={() => setShowArticles(false)}>
          <div className="articlesModal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <p>ADMIN</p>
                <h2>📦 Artikli u sistemu</h2>
              </div>
              <button onClick={() => setShowArticles(false)}>✕</button>
            </div>
            <div className="articleAdminList">
              {articles.map((a) => (
                <div className={`adminArticleRow ${!a.aktivan ? "inactiveRow" : ""}`} key={a.id}>
                  <span className="miniEmoji">{a.emoji || "📦"}</span>
                  <div>
                    <strong>{a.naziv}</strong>
                    <small>{a.glavna_grupa} · {a.podgrupa} · šifra {a.sifra} · {a.jedinica}</small>
                  </div>
                  <button onClick={() => toggleArticle(a)}>
                    {a.aktivan ? "Deaktiviraj" : "Aktiviraj"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function groupEmoji(group: string) {
  const map: Record<string, string> = {
    "DOMAĆE VOĆE": "🍎",
    "JUŽNO / CITRUSNO": "🍊",
    "EGZOTIČNO": "🥭",
    "ORAŠASTO / OSTALO": "🌰",
    "KROMPIR, LUK I KORENASTO": "🥔",
    "PARADAJZ, PAPRIKA I PLODOVITO": "🍅",
    "KUPUSNJAČE": "🥦",
    "ZELENIŠ I SALATE": "🥬",
    "PASULJ / MAHUNARKE": "🫘",
    "PEČURKE": "🍄",
    "KISELO / PRIPREMLJENO": "🥒",
  };
  return map[group] || "📦";
}

function formatDate(date: string) {
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}.`;
}
