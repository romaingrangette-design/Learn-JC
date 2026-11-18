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
  function ira(capitalRembourse, tauxAnnuel) {
    const sixMois = capitalRembourse * tauxAnnuel / 100 / 2, trois = capitalRembourse * 0.03;
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

  const C = {R, LIENS, usufruit, QD, succession, droits, bareme, baremeDetail, BAREMES, avDeces, avRachat, placement, PRODUITS, quinzaines, interetsQuinzaines, capacite, mensualite, per, bonusMalus, ira};
  if (typeof module !== "undefined" && module.exports) module.exports = C; else root.Calc = C;
})(typeof window !== "undefined" ? window : this);
