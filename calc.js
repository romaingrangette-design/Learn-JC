/* Calculs des simulateurs (règles au 16 novembre 2026). Fonctions pures, testables hors navigateur. */
(function (root) {
  "use strict";
  const R = {
    PS_STD: 0.186, PS_AV: 0.172, IR_PFU: 0.128, PFU: 0.314, PFU_LOGEMENT: 0.30,
    AV_ABATT_SEUL: 4600, AV_ABATT_COUPLE: 9200, AV_TAUX_8ANS: 0.075, AV_SEUIL_VERS: 150000,
    AV_990I_ABATT: 152500, AV_990I_SEUIL: 700000, AV_757B_ABATT: 30500,
    HCSF: 0.35, PER_MIN: 4710, PER_MAX: 37680
  };
  const round2 = x => Math.round(x * 100) / 100;

  /* Barèmes de droits de mutation à titre gratuit */
  const BAREMES = {
    direct: [[8072, .05], [12109, .10], [15932, .15], [552324, .20], [902838, .30], [1805677, .40], [Infinity, .45]],
    epoux: [[8072, .05], [15932, .10], [31865, .15], [552324, .20], [902838, .30], [1805677, .40], [Infinity, .45]],
    fratrie: [[24430, .35], [Infinity, .45]],
    neveu: [[Infinity, .55]],
    autre: [[Infinity, .60]]
  };
  function bareme(base, tranches) {
    let reste = Math.max(0, base), bas = 0, total = 0;
    for (const [haut, taux] of tranches) {
      if (reste <= 0) break;
      const part = Math.min(reste, haut - bas);
      total += part * taux; reste -= part; bas = haut;
    }
    return total;
  }
  /* Détail tranche par tranche : [[de, à, taux, montant taxé, droits]] */
  function baremeDetail(base, tranches) {
    let reste = Math.max(0, base), bas = 0; const out = [];
    for (const [haut, taux] of tranches) {
      if (reste <= 0) break;
      const part = Math.min(reste, haut - bas);
      out.push([bas, bas + part, taux, part, round2(part * taux)]); reste -= part; bas = haut;
    }
    return out;
  }
  /* liens : enfant, petitenfant (donation), conjoint_don, conjoint_succ, fratrie, neveu, autre */
  const LIENS = {
    enfant: {abatt: 100000, bar: "direct"},
    petitenfant: {abatt: 31865, bar: "direct"},
    conjoint_don: {abatt: 80724, bar: "epoux"},
    conjoint_succ: {exonere: true},
    fratrie: {abatt: 15932, bar: "fratrie"},
    neveu: {abatt: 7967, bar: "neveu"},
    autre: {abatt: 1594, bar: "autre"}
  };
  function droits(montant, lien, opts) {
    opts = opts || {};
    const L = LIENS[lien];
    if (!L) throw new Error("lien inconnu");
    if (L.exonere) return {abattement: 0, base: 0, droits: 0, exonere: true};
    let abatt = Math.max(0, L.abatt - (opts.dejaUtilise || 0));
    if (opts.handicap) abatt += 159325;
    if (opts.donFamilial && (lien === "enfant" || lien === "petitenfant")) abatt += 31865;
    const base = Math.max(0, montant - abatt);
    return {abattement: abatt, base, droits: round2(bareme(base, BAREMES[L.bar])), detail: baremeDetail(base, BAREMES[L.bar]), abattBase: L.abatt};
  }

  /* Assurance vie au décès, pour UN bénéficiaire */
  function avDeces(o) {
    // o.capitalAvant70 : capital reçu par ce bénéficiaire au titre des primes versées avant 70 ans
    // o.primesApres70Total : primes versées après 70 ans (tous bénéficiaires), o.partApres70 : part de ce bénéficiaire (0-1)
    if (o.conjoint) return {taxe990I: 0, base990I: 0, reintegre757B: 0, exonere: true};
    const base = Math.max(0, (o.capitalAvant70 || 0) - R.AV_990I_ABATT);
    const taxe = Math.min(base, R.AV_990I_SEUIL) * 0.20 + Math.max(0, base - R.AV_990I_SEUIL) * 0.3125;
    const reint = Math.max(0, (o.primesApres70Total || 0) - R.AV_757B_ABATT) * (o.partApres70 === undefined ? 1 : o.partApres70);
    return {base990I: base, taxe990I: round2(taxe), reintegre757B: round2(reint)};
  }

  /* Rachat d'assurance vie */
  function avRachat(o) {
    const valeur = o.valeur, gainsTot = o.gains, rachat = Math.min(o.rachat, o.valeur);
    if (!(valeur > 0)) return null;
    const partGains = rachat * gainsTot / valeur;
    let ir;
    if (!o.plus8ans) ir = partGains * R.IR_PFU;
    else {
      const abatt = o.couple ? R.AV_ABATT_COUPLE : R.AV_ABATT_SEUL;
      const taxable = Math.max(0, partGains - abatt);
      const vers = o.versementsNets || 0;
      const ratio75 = vers <= R.AV_SEUIL_VERS ? 1 : R.AV_SEUIL_VERS / vers;
      ir = taxable * ratio75 * R.AV_TAUX_8ANS + taxable * (1 - ratio75) * R.IR_PFU;
    }
    const ps = o.psDejaPayes ? 0 : partGains * R.PS_AV;
    return {partGains: round2(partGains), ir: round2(ir), ps: round2(ps), net: round2(rachat - ir - ps)};
  }

  /* Placements réglementés et bancaires sur n années (intérêts capitalisés annuellement) */
  const PRODUITS = {
    livretA: {nom: "Livret A", taux: 1.7, fisc: 0},
    ldds: {nom: "LDDS", taux: 1.7, fisc: 0},
    lep: {nom: "LEP", taux: 2.5, fisc: 0},
    cel: {nom: "CEL", taux: 1.25, fisc: R.PFU_LOGEMENT},
    pel2026: {nom: "PEL ouvert en 2026", taux: 2, fisc: R.PFU_LOGEMENT},
    superlivret: {nom: "Livret bancaire", taux: null, fisc: R.PFU}
  };
  function placement(o) {
    const p = PRODUITS[o.produit];
    const taux = (p.taux === null ? o.taux : p.taux) / 100;
    let cap = o.montant, brut = 0, net = 0;
    for (let i = 0; i < o.annees; i++) {
      const it = cap * taux; brut += it; const n = it * (1 - p.fisc); net += n; cap += n;
    }
    return {brut: round2(brut), net: round2(net), final: round2(cap), fisc: p.fisc};
  }

  /* Règle des quinzaines du Livret A. Dates ISO AAAA-MM-JJ */
  function quinzaineIndex(y, m, d) { return (y * 12 + (m - 1)) * 2 + (d >= 16 ? 1 : 0); }
  function quinzaines(depot, retrait) {
    const [y1, m1, d1] = depot.split("-").map(Number), [y2, m2, d2] = retrait.split("-").map(Number);
    const debut = quinzaineIndex(y1, m1, d1) + 1;      // rapporte à partir de la quinzaine suivante
    const fin = quinzaineIndex(y2, m2, d2);             // ne rapporte plus dès la quinzaine du retrait
    return Math.max(0, fin - debut);
  }
  function interetsQuinzaines(montant, taux, depot, retrait) {
    const n = quinzaines(depot, retrait);
    return {quinzaines: n, interets: round2(montant * taux / 100 * n / 24)};
  }

  /* Capacité d'emprunt HCSF */
  function capacite(o) {
    const mensMax = Math.max(0, o.revenus * R.HCSF - (o.autresCredits || 0));
    const n = o.annees * 12, r = o.taux / 100 / 12, ta = (o.tauxAssurance || 0) / 100 / 12;
    const facteur = (r === 0 ? 1 / n : r / (1 - Math.pow(1 + r, -n))) + ta;
    const capital = mensMax / facteur;
    const actuel = o.revenus > 0 ? (o.autresCredits || 0) / o.revenus : 0;
    return {mensualiteMax: round2(mensMax), capital: Math.floor(capital / 100) * 100, endettementActuel: round2(actuel * 100)};
  }
  function mensualite(capital, tauxAnnuel, annees) {
    const n = annees * 12, r = tauxAnnuel / 100 / 12;
    return round2(r === 0 ? capital / n : capital * r / (1 - Math.pow(1 + r, -n)));
  }

  /* PER */
  function per(o) {
    const plafond = Math.min(R.PER_MAX, Math.max(R.PER_MIN, (o.revenusPro || 0) * 0.10));
    const deductible = o.age >= 70 ? 0 : Math.min(o.versement, plafond + (o.reports || 0));
    return {plafond: round2(plafond), deductible: round2(deductible), economie: round2(deductible * o.tmi / 100)};
  }

  /* Bonus-malus */
  const tronc = x => Math.floor(x * 100 + 1e-9) / 100;
  function bonusMalus(o) {
    let c = o.coef;
    for (let i = 0; i < (o.anneesSans || 0); i++) c = Math.max(0.5, tronc(c * 0.95));
    if ((o.responsables || 0) + (o.partages || 0) > 0) {
      c = c * Math.pow(1.25, o.responsables || 0) * Math.pow(1.125, o.partages || 0);
      c = Math.min(3.5, tronc(c));
    }
    return round2(c);
  }

  /* Indemnités de remboursement anticipé (crédit immobilier) */
  /* Indemnité de remboursement anticipé (crédit immobilier) : 6 mois d'intérêts sur la somme remboursée,
     plafonnés à 3 % du capital restant dû avant le remboursement */
  function ira(capitalRembourse, tauxAnnuel, crdAvant) {
    const crd = crdAvant > 0 ? crdAvant : capitalRembourse;
    const sixMois = capitalRembourse * tauxAnnuel / 100 / 2, trois = crd * 0.03;
    return {sixMois: round2(sixMois), troisPourcent: round2(trois), ira: round2(Math.min(sixMois, trois))};
  }


  /* Barème de l'usufruit (art. 669 CGI) : valeur de l'usufruit selon l'âge de l'usufruitier */
  function usufruit(age) {
    const t = [[21, .9], [31, .8], [41, .7], [51, .6], [61, .5], [71, .4], [81, .3], [91, .2]];
    for (const [a, v] of t) if (age < a) return v;
    return 0.1;
  }
  const QD = n => n <= 0 ? 1 : n === 1 ? 1 / 2 : n === 2 ? 1 / 3 : 1 / 4;

  /* Simulation complète d'une succession.
     o.situation : seul | marie | pacs | concubin
     o.biens : [{type, montant, commun}]  (commun = détenu à deux : 50 % au défunt)
     o.dettes : dettes du défunt (hors prêts couverts par l'assurance emprunteur)
     o.enfants, o.enfantsCommuns, o.ageConjoint, o.option (quart | usufruit | qd | quart_us), o.testament (partenaire ou concubin)
     o.parents (0-2), o.freres, o.donations (par enfant, < 15 ans), o.rpOccupee
     o.av : {avant70, apres70, benef: conjoint | enfants | aucun} */
  function succession(o) {
    const couple = o.situation !== "seul", n = Math.max(0, Math.floor(o.enfants || 0));
    const lignes = []; let brut = 0, abattRP = 0;
    for (const b of (o.biens || [])) {
      const m = Math.max(0, b.montant || 0); if (!m) continue;
      const part = couple && b.commun ? 0.5 : 1; let v = m * part, ab = 0;
      if (b.type === "rp" && o.rpOccupee) { ab = v * 0.2; abattRP += ab; }
      lignes.push({type: b.type, montant: m, part, valeur: v, abattRP: ab}); brut += v - ab;
    }
    const OBS = 1500, dettes = Math.max(0, o.dettes || 0);
    const net = Math.max(0, brut - dettes - OBS);
    const h = []; // héritiers : {qui, nb, lien, fraction (valeur taxable), pp, us, np, texte}
    let regle = "", option = o.option;
    const u = usufruit(o.ageConjoint || 70);
    if (n > 0) {
      if (o.situation === "marie") {
        if (option === "usufruit" && !o.enfantsCommuns) option = "quart";
        if (option === "usufruit") { h.push({qui: "conjoint", nb: 1, lien: "conjoint", frac: u, desc: "100 % en usufruit"}); h.push({qui: "enfant", nb: n, lien: "enfant", frac: (1 - u) / n, desc: "nue-propriété, 1/" + n + " chacun"}); regle = "usufruit"; }
        else if (option === "qd") { const q = QD(n); h.push({qui: "conjoint", nb: 1, lien: "conjoint", frac: q, desc: "quotité disponible en pleine propriété"}); h.push({qui: "enfant", nb: n, lien: "enfant", frac: (1 - q) / n, desc: "le reste à parts égales"}); regle = "qd"; }
        else if (option === "quart_us") { h.push({qui: "conjoint", nb: 1, lien: "conjoint", frac: 0.25 + 0.75 * u, desc: "1/4 en pleine propriété + 3/4 en usufruit"}); h.push({qui: "enfant", nb: n, lien: "enfant", frac: 0.75 * (1 - u) / n, desc: "nue-propriété des 3/4"}); regle = "quart_us"; }
        else { h.push({qui: "conjoint", nb: 1, lien: "conjoint", frac: 0.25, desc: "1/4 en pleine propriété"}); h.push({qui: "enfant", nb: n, lien: "enfant", frac: 0.75 / n, desc: "3/4 à parts égales"}); regle = "quart"; }
      } else if ((o.situation === "pacs" || o.situation === "concubin") && o.testament) {
        const q = QD(n); h.push({qui: o.situation === "pacs" ? "partenaire" : "concubin", nb: 1, lien: o.situation === "pacs" ? "conjoint" : "autre", frac: q, desc: "quotité disponible par testament"}); h.push({qui: "enfant", nb: n, lien: "enfant", frac: (1 - q) / n, desc: "la réserve à parts égales"}); regle = "testament";
      } else { h.push({qui: "enfant", nb: n, lien: "enfant", frac: 1 / n, desc: "tout, à parts égales"}); regle = "enfants"; }
    } else {
      const p = Math.min(2, Math.max(0, Math.floor(o.parents || 0))), f = Math.max(0, Math.floor(o.freres || 0));
      if (o.situation === "marie") {
        if (option === "qd" || p === 0) { h.push({qui: "conjoint", nb: 1, lien: "conjoint", frac: 1, desc: "tout"}); regle = p ? "ddv0" : "conjoint0"; }
        else { h.push({qui: "conjoint", nb: 1, lien: "conjoint", frac: 1 - p / 4, desc: (p === 2 ? "1/2" : "3/4") + " en pleine propriété"}); h.push({qui: "parent", nb: p, lien: "enfant", frac: 0.25, desc: "1/4 chacun"}); regle = "parents_conjoint"; }
      } else if ((o.situation === "pacs" || o.situation === "concubin") && o.testament) {
        h.push({qui: o.situation === "pacs" ? "partenaire" : "concubin", nb: 1, lien: o.situation === "pacs" ? "conjoint" : "autre", frac: 1, desc: "tout, par testament"}); regle = "testament0";
      } else if (f > 0) {
        if (p) h.push({qui: "parent", nb: p, lien: "enfant", frac: 0.25, desc: "1/4 chacun"});
        h.push({qui: "frere", nb: f, lien: "fratrie", frac: (1 - p / 4) / f, desc: (p === 2 ? "1/2" : p === 1 ? "3/4" : "tout") + " à partager"}); regle = "fratrie";
      } else if (p > 0) { h.push({qui: "parent", nb: p, lien: "enfant", frac: 1 / p, desc: p === 2 ? "1/2 chacun" : "tout (ou la moitié si des grands-parents de l'autre côté sont en vie)"}); regle = "parents"; }
      else return {erreur: "Sans enfant, conjoint, parents ni frères et sœurs, les héritiers sont plus éloignés (neveux, oncles, cousins) : ce cas n'est pas géré ici."};
    }
    // Assurance vie
    const av = o.av || {}, avant = Math.max(0, av.avant70 || 0), apres = Math.max(0, av.apres70 || 0);
    let benefAV = av.benef;
    if (benefAV === "enfants" && n === 0) benefAV = "aucun";
    const reint757 = Math.max(0, apres - R.AV_757B_ABATT);
    for (const x of h) {
      x.valeur = round2(net * x.frac); x.av990 = 0; x.avCapital = 0; x.av757 = 0; x.taxe990 = 0;
      const conj = x.lien === "conjoint";
      if (benefAV === "enfants" && x.qui === "enfant") { x.avCapital = avant / n; x.av757 = reint757 / n; }
      if (benefAV === "conjoint" && (x.qui === "conjoint" || x.qui === "partenaire")) { x.avCapital = avant; x.av757 = reint757; }
      if (x.avCapital && !conj) { const d = avDeces({capitalAvant70: x.avCapital}); x.taxe990 = d.taxe990I; x.base990 = d.base990I; }
      if (conj) { x.droits = 0; x.base = 0; x.abattement = 0; x.detail = []; }
      else { const d = droits(x.valeur + x.av757, x.lien, {dejaUtilise: x.qui === "enfant" ? (o.donations || 0) : 0}); Object.assign(x, {droits: d.droits, base: d.base, abattement: d.abattement, detail: d.detail}); }
      x.total = round2(x.droits + x.taxe990);
      x.recu = round2(x.valeur + x.avCapital + (benefAV === "enfants" && x.qui === "enfant" ? apres / n : benefAV === "conjoint" && conj ? apres : 0));
      x.netRecu = round2(x.recu - x.total);
    }
    const totalDroits = round2(h.reduce((s, x) => s + x.total * x.nb, 0));
    return {lignes, brut: round2(brut), abattRP: round2(abattRP), dettes, obseques: OBS, net: round2(net), heritiers: h, regle, option, usufruitPct: u, totalDroits, benefAV};
  }

  /* ===== Outils v3 ===== */
  /* Frais de notaire (règles 2026). Émoluments : art. A444-91 C. com. ; DMTO : LF 2025 art. 116 (départements à 5 %, primo-accédants exclus de la hausse). */
  const EMOL = [[6500, .03870], [17000, .01596], [60000, .01064], [Infinity, .00799]];
  function notaire(o) {
    const prix = Math.max(0, o.prix || 0), meubles = Math.min(prix, Math.max(0, o.meubles || 0)), base = prix - meubles;
    let tauxDroits;
    if (o.neuf) tauxDroits = 0.00715;
    else tauxDroits = (o.dep45 || o.primo) ? 0.0580665 : 0.063185;
    const droits = base * tauxDroits;
    const emolHT = bareme(base, EMOL), emol = emolHT * 1.2;
    const csi = Math.max(15, base * 0.001), debours = o.debours === undefined ? 1200 : o.debours;
    const total = droits + emol + csi + debours;
    return {base, tauxDroits, droits: round2(droits), emolHT: round2(emolHT), emolTVA: round2(emolHT * 0.2), emol: round2(emol), emolDetail: baremeDetail(base, EMOL), csi: round2(csi), debours: round2(debours), total: round2(total), pct: prix ? round2(total / prix * 100) : 0};
  }
  /* Tableau d'amortissement (mensualités constantes) */
  function amortissement(capital, tauxAnnuel, annees, tauxAss, assSurCRD) {
    const n = Math.round(annees * 12), r = tauxAnnuel / 100 / 12, M = r === 0 ? capital / n : capital * r / (1 - Math.pow(1 + r, -n));
    let crd = capital, ans = [], cur = {annee: 1, interets: 0, capital: 0, assurance: 0}, totI = 0, totA = 0;
    for (let m = 1; m <= n; m++) {
      const i = crd * r, c = M - i, a = assSurCRD ? crd * (tauxAss || 0) / 100 / 12 : capital * (tauxAss || 0) / 100 / 12;
      crd = Math.max(0, crd - c); cur.interets += i; cur.capital += c; cur.assurance += a; totI += i; totA += a;
      if (m % 12 === 0 || m === n) { cur.crd = crd; ans.push(Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, k === "annee" ? v : round2(v)]))); cur = {annee: cur.annee + 1, interets: 0, capital: 0, assurance: 0}; }
    }
    return {mensualite: round2(M), mensAss: round2(assSurCRD ? capital * (tauxAss || 0) / 1200 : capital * (tauxAss || 0) / 1200), interets: round2(totI), assurance: round2(totA), cout: round2(totI + totA), annees: ans};
  }
  /* Budget d'achat : prix maximum du logement */
  function budgetAchat(o) {
    const cap = capacite(o), pret = o.pretSouhaite > 0 ? Math.min(o.pretSouhaite, cap.capital) : cap.capital;
    const garantie = pret * (o.tauxGarantie || 0) / 100, dispo = pret + (o.apport || 0) - garantie - (o.fraisDossier || 0);
    let lo = 0, hi = dispo;
    for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (mid + notaire({prix: mid, neuf: o.neuf, primo: o.primo, dep45: o.dep45, debours: o.debours}).total <= dispo) lo = mid; else hi = mid; }
    const prix = Math.floor(lo / 1000) * 1000, nt = notaire({prix, neuf: o.neuf, primo: o.primo, dep45: o.dep45, debours: o.debours});
    return {cap, pret, garantie: round2(garantie), dispo: round2(dispo), prix, notaire: nt, marge: round2(dispo - prix - nt.total)};
  }
  /* Épargne régulière, intérêts capitalisés chaque mois */
  function epargne(o) {
    const n = Math.round(o.annees * 12), r = Math.pow(1 + (o.taux || 0) / 100, 1 / 12) - 1;
    let cap = o.initial || 0, verse = o.initial || 0; const ans = [];
    for (let m = 1; m <= n; m++) { cap = cap * (1 + r) + (o.mensuel || 0); verse += (o.mensuel || 0); if (m % 12 === 0) ans.push({annee: m / 12, verse: round2(verse), capital: round2(cap)}); }
    return {capital: round2(cap), verse: round2(verse), gains: round2(cap - verse), annees: ans, tauxMensuel: r};
  }
  function objectifEpargne(o) {
    const n = Math.round(o.annees * 12), r = Math.pow(1 + (o.taux || 0) / 100, 1 / 12) - 1, f = Math.pow(1 + r, n);
    const futInit = (o.initial || 0) * f, reste = o.objectif - futInit;
    const mensuel = reste <= 0 ? 0 : (r === 0 ? reste / n : reste * r / (f - 1));
    return {mensuel: Math.ceil(mensuel), futInit: round2(futInit), reste: round2(reste), n};
  }
  /* Impôt sur le revenu 2026 (revenus 2025) */
  const IR = {tranches: [[11600, 0], [29579, .11], [84577, .30], [181917, .41], [Infinity, .45]], plafondDemiPart: 1807, decoteSeul: 897, decoteCouple: 1483, decoteTaux: .4525};
  function partsFiscales(couple, enfants) { let p = couple ? 2 : 1; for (let i = 1; i <= enfants; i++) p += i <= 2 ? .5 : 1; return p; }
  function impotRevenu(o) {
    const base = o.couple ? 2 : 1, parts = partsFiscales(o.couple, o.enfants || 0), R0 = Math.max(0, o.revenu);
    const brutParts = bareme(R0 / parts, IR.tranches) * parts, brutBase = bareme(R0 / base, IR.tranches) * base;
    const demi = (parts - base) * 2, avantage = brutBase - brutParts, plafond = demi * IR.plafondDemiPart;
    const plafonne = avantage > plafond, apresQF = plafonne ? brutBase - plafond : brutParts;
    const dPlaf = o.couple ? IR.decoteCouple : IR.decoteSeul, seuil = dPlaf / IR.decoteTaux;
    const decote = apresQF > 0 && apresQF < seuil ? Math.min(apresQF, dPlaf - IR.decoteTaux * apresQF) : 0;
    let net = Math.max(0, apresQF - decote); if (net < 61) net = 0;
    const q = R0 / parts; let tmi = 0; for (const [lim, t] of IR.tranches) { tmi = t; if (q <= lim) break; }
    return {parts, quotient: round2(q), detail: baremeDetail(q, IR.tranches), brutParts: Math.round(brutParts), brutBase: Math.round(brutBase), avantage: Math.round(avantage), plafond, plafonne, apresQF: Math.round(apresQF), decote: Math.round(decote), net: Math.round(net), tmi: tmi * 100, tauxMoyen: R0 ? round2(net / R0 * 100) : 0};
  }
  /* Fiscalité d'un gain selon l'enveloppe */
  function enveloppes(o) {
    const G = Math.max(0, o.gain), ab = o.couple ? R.AV_ABATT_COUPLE : R.AV_ABATT_SEUL;
    const L = [
      {id: "livret", nom: "Livret A, LDDS, LEP", impot: 0, detail: "Aucun impôt ni prélèvement social"},
      {id: "pea5", nom: "PEA de plus de 5 ans", impot: G * R.PS_STD, detail: "Pas d'impôt, seulement 18,6 % de prélèvements sociaux"},
      {id: "av8", nom: "Assurance vie de plus de 8 ans", impot: Math.max(0, G - ab) * R.AV_TAUX_8ANS + G * R.PS_AV, detail: "Abattement de " + ab.toLocaleString("fr-FR") + " € puis 7,5 % d'impôt, + 17,2 % de prélèvements sociaux"},
      {id: "av", nom: "Assurance vie de moins de 8 ans", impot: G * (R.IR_PFU + R.PS_AV), detail: "12,8 % d'impôt + 17,2 % de prélèvements sociaux = 30 %"},
      {id: "pel", nom: "PEL ou CEL ouvert depuis 2018", impot: G * R.PFU_LOGEMENT, detail: "12,8 % d'impôt + 17,2 % de prélèvements sociaux = 30 %"},
      {id: "cto", nom: "Compte-titres ou PEA de moins de 5 ans", impot: G * R.PFU, detail: "Flat tax : 12,8 % d'impôt + 18,6 % de prélèvements sociaux = 31,4 %"}
    ].map(x => Object.assign(x, {impot: round2(x.impot), net: round2(G - x.impot)}));
    return L;
  }
  /* Remboursement anticipé partiel : réduire la durée ou la mensualité */
  function rembPartiel(o) {
    const r = o.taux / 100 / 12, n = Math.round(o.annees * 12), M = r === 0 ? o.crd / n : o.crd * r / (1 - Math.pow(1 + r, -n));
    const crd2 = Math.max(0, o.crd - o.somme), avant = M * n;
    const n2 = crd2 <= 0 ? 0 : r === 0 ? crd2 / M : -Math.log(1 - r * crd2 / M) / Math.log(1 + r);
    const M2 = crd2 <= 0 ? 0 : r === 0 ? crd2 / n : crd2 * r / (1 - Math.pow(1 + r, -n));
    const iraR = ira(o.somme, o.taux, o.crd);
    return {mensualite: round2(M), crd2: round2(crd2), interetsAvant: round2(avant - o.crd),
      duree: {mois: Math.ceil(n2), gagnes: n - Math.ceil(n2), economie: round2(avant - o.somme - M * n2)},
      mens: {mensualite: round2(M2), baisse: round2(M - M2), economie: round2(avant - o.somme - M2 * n)}, ira: iraR};
  }
  /* Assurance emprunteur : banque vs délégation */
  function assurance(o) {
    const a = amortissement(o.capital, o.taux, o.annees, o.tauxA, o.crdA), b = amortissement(o.capital, o.taux, o.annees, o.tauxB, o.crdB);
    return {coutA: a.assurance, coutB: b.assurance, economie: round2(a.assurance - b.assurance), mensA: round2(a.assurance / (o.annees * 12)), mensB: round2(b.assurance / (o.annees * 12))};
  }

  /* Impôt sur le revenu complet (revenus 2025, imposition 2026) */
  Object.assign(IR, {salMin: 509, salMax: 14555, penMin: 454, penMax: 4439, isole: 4262, microFoncier: 0.30, microFoncierMax: 15000,
    donsCol: 2000, emploiBase: 12000, emploiParEnfant: 1500, emploiMax: 15000, gardeMax: 3500});
  function abatSal(x) { return x > 0 ? Math.min(x, Math.min(IR.salMax, Math.max(IR.salMin, x * 0.10))) : 0; }
  function impotComplet(o) {
    const couple = !!o.couple, enf = Math.max(0, o.enfants || 0), isole = !couple && !!o.parentIsole && enf > 0;
    const D = couple ? [o.d1, o.d2] : [o.d1];
    const lignes = [];
    let salNet = 0, salBrut = 0;
    D.forEach((d, k) => { const a = abatSal(d.salaires || 0); salBrut += d.salaires || 0; salNet += (d.salaires || 0) - a; if (d.salaires) lignes.push({k: "sal", who: k, brut: d.salaires, abat: a}); });
    const penBrut = D.reduce((t, d) => t + (d.pensions || 0), 0);
    let penAbat = D.reduce((t, d) => t + (d.pensions > 0 ? Math.min(d.pensions, Math.max(IR.penMin, d.pensions * 0.10)) : 0), 0); penAbat = Math.min(penAbat, IR.penMax);
    const loyers = Math.max(0, o.loyers || 0), foncier = loyers * (1 - IR.microFoncier);
    const global = Math.max(0, salNet + penBrut - penAbat + foncier);
    const per = Math.max(0, o.per || 0), rni = Math.max(0, Math.floor(global - per));
    // Parts
    let parts = couple ? 2 : 1; for (let i = 1; i <= enf; i++) parts += i <= 2 ? .5 : 1; if (isole) parts += .5;
    const base = couple ? 2 : 1;
    const brutParts = bareme(rni / parts, IR.tranches) * parts, brutBase = bareme(rni / base, IR.tranches) * base;
    let plafond; if (isole) { const demi = (parts - base) * 2; plafond = IR.isole + (demi - 2) * IR.plafondDemiPart; } else plafond = (parts - base) * 2 * IR.plafondDemiPart;
    const avantage = brutBase - brutParts, plafonne = avantage > plafond + 0.5, apresQF = plafonne ? brutBase - plafond : brutParts;
    const dPlaf = couple ? IR.decoteCouple : IR.decoteSeul;
    const decote = apresQF > 0 && apresQF < dPlaf / IR.decoteTaux ? Math.min(apresQF, dPlaf - IR.decoteTaux * apresQF) : 0;
    const apresDecote = Math.max(0, apresQF - decote);
    // Réductions (plafonnées à l'impôt) puis crédits (remboursables)
    const donsCol = Math.min(Math.max(0, o.donsCol || 0), IR.donsCol), donsColSurplus = Math.max(0, (o.donsCol || 0) - IR.donsCol);
    const donsAutres = Math.min(Math.max(0, o.dons || 0) + donsColSurplus, rni * 0.20);
    const redDons = donsCol * 0.75 + donsAutres * 0.66;
    const redApplied = Math.min(apresDecote, redDons);
    const emploiPlaf = Math.min(IR.emploiMax, IR.emploiBase + IR.emploiParEnfant * enf), emploi = Math.min(Math.max(0, o.emploi || 0), emploiPlaf) * 0.5;
    const nbG = Math.min(enf, Math.max(0, o.enfantsMoins6 || 0)), garde = Math.min(Math.max(0, o.garde || 0), IR.gardeMax * nbG) * 0.5;
    const credits = emploi + garde;
    let bareNet = apresDecote - redApplied; if (bareNet > 0 && bareNet < 61 && credits === 0) bareNet = 0;
    const pfu = Math.max(0, o.capitaux || 0) * 0.128;
    const net = bareNet + pfu - credits;
    const q = rni / parts; let tmi = 0; for (const [lim, t] of IR.tranches) { tmi = t; if (q <= lim) break; }
    const pasBase = salBrut + penBrut + loyers, tauxPAS = pasBase > 0 ? Math.max(0, apresDecote) / pasBase * 100 : 0;
    return {couple, isole, parts, lignes, salBrut, salNet: Math.round(salNet), penBrut, penAbat: Math.round(penAbat), loyers, foncier: Math.round(foncier), global: Math.round(global), per, rni,
      quotient: round2(q), detail: baremeDetail(q, IR.tranches), brutParts: Math.round(brutParts), brutBase: Math.round(brutBase), avantage: Math.round(avantage), plafond, plafonne,
      apresQF: Math.round(apresQF), decote: Math.round(decote), apresDecote: Math.round(apresDecote), redDons: Math.round(redDons), redApplied: Math.round(redApplied), donsCol, donsAutres: Math.round(donsAutres),
      emploi: Math.round(emploi), emploiPlaf, garde: Math.round(garde), credits: Math.round(credits), bareNet: Math.round(bareNet), pfu: Math.round(pfu), net: Math.round(net), tmi: tmi * 100,
      tauxMoyen: rni ? round2(Math.max(0, net) / rni * 100) : 0, tauxPAS: Math.round(tauxPAS * 10) / 10};
  }

  const C = {R, EMOL, impotComplet, abatSal, IR, notaire, amortissement, budgetAchat, epargne, objectifEpargne, partsFiscales, impotRevenu, enveloppes, rembPartiel, assurance, LIENS, usufruit, QD, succession, droits, bareme, baremeDetail, BAREMES, avDeces, avRachat, placement, PRODUITS, quinzaines, interetsQuinzaines, capacite, mensualite, per, bonusMalus, ira};
  if (typeof module !== "undefined" && module.exports) module.exports = C; else root.Calc = C;
})(typeof window !== "undefined" ? window : this);
