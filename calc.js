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
    return {abattement: abatt, base, droits: round2(bareme(base, BAREMES[L.bar]))};
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

  const C = {R, droits, bareme, BAREMES, avDeces, avRachat, placement, PRODUITS, quinzaines, interetsQuinzaines, capacite, mensualite, per, bonusMalus, ira};
  if (typeof module !== "undefined" && module.exports) module.exports = C; else root.Calc = C;
})(typeof window !== "undefined" ? window : this);
