/**
 * A plain-language reference for the compounds people ask this app about.
 *
 * The app answers questions of fact — what something is, what it has been
 * studied for, how good that evidence is, whether it is approved, what is
 * known to go wrong, whether it is banned in tested sport. It does not answer
 * questions of prescription: how much, how long, what to combine, whether to
 * start or stop. Those are decisions with a person's bloodwork and history in
 * them, and this app has neither.
 *
 * Every entry is written to be checkable and to age honestly: where the
 * evidence is thin it says so rather than hedging into vagueness.
 */

export type ApprovalStatus =
  /** Approved by a major regulator for a named indication. */
  | 'approved'
  /** Approved somewhere, but only lawfully obtained on prescription. */
  | 'prescription'
  /** No regulatory approval; sold as "research chemical" or grey market. */
  | 'unapproved'
  /** Sold as a food supplement rather than a drug. */
  | 'supplement';

export type SportStatus =
  /** On WADA's prohibited list, in or out of competition. */
  | 'prohibited'
  /** Not specifically listed, but unapproved substances fall under S0. */
  | 'prohibited_as_unapproved'
  /** Not prohibited as of the latest list this data was written against. */
  | 'permitted';

export interface Compound {
  id: string;
  name: string;
  /** Other names people type, lower-case, matched on word boundaries. */
  aliases: string[];
  /** Pharmacological class, in the words a label would use. */
  klass: string;
  /** What it is. One or two sentences, no claims. */
  what: string;
  /** What it is used or promoted for. Reporting, not endorsing. */
  usedFor: string;
  /** How strong the evidence actually is. The honest part. */
  evidence: string;
  status: ApprovalStatus;
  /** The regulatory situation in concrete terms. */
  statusNote: string;
  /** Known or suspected harms worth knowing before a conversation with a doctor. */
  risks: string[];
  sport: SportStatus;
  sportNote: string;
}

/**
 * WADA's list is revised annually, so the sport field is a prompt to check
 * rather than a ruling. Named here so the UI can say which year it reflects.
 */
export const SPORT_LIST_YEAR = 2025;

export const COMPOUNDS: Compound[] = [
  {
    id: 'bpc157',
    name: 'BPC-157',
    aliases: ['bpc', 'bpc157', 'bpc 157', 'body protection compound'],
    klass: 'Synthetic pentadecapeptide, derived from a sequence found in gastric juice',
    what: 'A fifteen–amino-acid peptide based on a fragment of a protein found in the stomach. It is not a licensed medicine anywhere.',
    usedFor: 'Promoted for tendon, ligament, muscle and gut healing, and for joint pain.',
    evidence:
      'Almost entirely rodent studies, many from a small number of related research groups. There are no published randomised human trials establishing that it works for any of these uses. "Studies show" in a sales page almost always means a rat study.',
    status: 'unapproved',
    statusNote:
      'Not approved by the FDA or EMA. In 2023 the FDA placed BPC-157 in Category 2 of its bulk drug substances review — the category for substances with significant safety risks — which means compounding pharmacies may not lawfully use it. Material sold online is labelled "research use only" and is not manufactured to pharmaceutical standards.',
    risks: [
      'No human safety data at all: unknown long-term effects, including on tissue growth.',
      'Purity and dose of grey-market vials are unverified — independent testing has repeatedly found products that were under-dosed, mislabelled or contaminated.',
      'Injectable use without sterile technique carries abscess and bloodstream infection risk.',
    ],
    sport: 'prohibited',
    sportNote: 'Covered by S0, the catch-all for substances with no regulatory approval, in and out of competition.',
  },
  {
    id: 'tb500',
    name: 'TB-500 (thymosin β4 fragment)',
    aliases: ['tb500', 'tb 500', 'tb-500', 'thymosin', 'thymosin beta 4', 'tb4'],
    klass: 'Synthetic fragment of thymosin β4, an actin-binding protein',
    what: 'A short synthetic peptide corresponding to part of thymosin β4, a naturally occurring protein involved in cell migration and wound repair.',
    usedFor: 'Promoted for soft-tissue repair, flexibility and recovery from injury.',
    evidence:
      'Animal and cell work on wound healing and blood-vessel formation. Human trials of full-length thymosin β4 have been small and have not established benefit for athletic injury.',
    status: 'unapproved',
    statusNote: 'No regulatory approval for any indication. Sold as a research chemical.',
    risks: [
      'No human safety data for this use.',
      'It promotes angiogenesis — new blood-vessel growth — which is a mechanism with obvious questions attached where a tumour is present or possible.',
      'Same purity and sterility problems as any grey-market injectable.',
    ],
    sport: 'prohibited',
    sportNote: 'Thymosin β4 and its derivatives are named explicitly on S2, peptide hormones and growth factors.',
  },
  {
    id: 'semaglutide',
    name: 'Semaglutide',
    aliases: ['semaglutide', 'ozempic', 'wegovy', 'rybelsus'],
    klass: 'GLP-1 receptor agonist',
    what: 'A long-acting analogue of the gut hormone GLP-1. It slows gastric emptying and acts on appetite regulation in the brain.',
    usedFor: 'Licensed for type 2 diabetes (Ozempic, Rybelsus) and for chronic weight management (Wegovy).',
    evidence:
      'Strong. Large randomised trials with tens of thousands of participants, and published cardiovascular outcome data. This is one of the few compounds on this list where the evidence is genuinely robust.',
    status: 'prescription',
    statusNote:
      'FDA and EMA approved, prescription only. Compounded "semaglutide" sold by wellness clinics and online sellers is not the approved product and has been the subject of FDA warnings about dosing errors and salt forms that are not semaglutide at all.',
    risks: [
      'Very common gastrointestinal effects: nausea, vomiting, diarrhoea, constipation.',
      'Boxed warning for thyroid C-cell tumours seen in rodents; contraindicated with a personal or family history of medullary thyroid carcinoma or MEN 2.',
      'Pancreatitis, gallbladder disease, and — with rapid weight loss — loss of lean mass if protein and resistance training are neglected.',
      'Interacts with insulin and sulfonylureas; hypoglycaemia risk needs managing by whoever prescribes it.',
    ],
    sport: 'permitted',
    sportNote: 'Incretin drugs are not classed as performance-enhancing.',
  },
  {
    id: 'tirzepatide',
    name: 'Tirzepatide',
    aliases: ['tirzepatide', 'mounjaro', 'zepbound'],
    klass: 'Dual GIP and GLP-1 receptor agonist',
    what: 'A single peptide that activates two incretin receptors, GIP and GLP-1.',
    usedFor: 'Licensed for type 2 diabetes (Mounjaro) and for chronic weight management (Zepbound).',
    evidence: 'Strong, from the SURPASS and SURMOUNT randomised trial programmes.',
    status: 'prescription',
    statusNote: 'FDA and EMA approved, prescription only. The same warnings about compounded copies apply.',
    risks: [
      'Gastrointestinal effects, as with other incretin drugs.',
      'Rodent thyroid C-cell tumour boxed warning; same contraindications as semaglutide.',
      'Pancreatitis and gallbladder disease.',
      'Rapid weight loss without adequate protein and resistance training costs lean mass.',
    ],
    sport: 'permitted',
    sportNote: 'Incretin drugs are not classed as performance-enhancing.',
  },
  {
    id: 'ipamorelin',
    name: 'Ipamorelin',
    aliases: ['ipamorelin', 'ipa'],
    klass: 'Growth hormone secretagogue (ghrelin receptor agonist)',
    what: 'A synthetic peptide that stimulates the pituitary to release growth hormone.',
    usedFor: 'Promoted for recovery, sleep, body composition and "anti-ageing".',
    evidence:
      'Studied in early-phase trials for post-operative ileus, where it did not meet its endpoints and was not developed further. No good evidence for the physique and recovery uses it is sold for.',
    status: 'unapproved',
    statusNote:
      'Never approved for any indication. Placed in FDA Category 2 for compounding in 2023, alongside several other growth hormone secretagogues.',
    risks: [
      'Raising growth hormone and IGF-1 has knock-on effects on glucose handling and, in theory, on the growth of tissue you would rather not grow.',
      'Little long-term human data.',
      'Grey-market purity problems.',
    ],
    sport: 'prohibited',
    sportNote: 'Growth hormone secretagogues sit under S2, in and out of competition.',
  },
  {
    id: 'cjc1295',
    name: 'CJC-1295',
    aliases: ['cjc', 'cjc1295', 'cjc 1295', 'cjc-1295', 'modified grf'],
    klass: 'Growth hormone releasing hormone (GHRH) analogue',
    what: 'A synthetic analogue of GHRH that increases growth hormone release from the pituitary. Often sold alongside a secretagogue such as ipamorelin.',
    usedFor: 'Promoted for the same recovery, sleep and body-composition claims.',
    evidence: 'Early pharmacology studies show it raises GH and IGF-1. There is no clinical evidence that this produces the physique or recovery outcomes it is sold for.',
    status: 'unapproved',
    statusNote: 'Not approved. Also on the FDA Category 2 compounding list.',
    risks: [
      'Water retention, joint aches and carpal-tunnel-type symptoms are the classic GH-elevation complaints.',
      'Effects on insulin sensitivity and glucose.',
      'A 2000s clinical programme was halted after a death in a trial; the relationship to the drug was disputed, but it is part of the record.',
    ],
    sport: 'prohibited',
    sportNote: 'GHRH analogues sit under S2, in and out of competition.',
  },
  {
    id: 'sermorelin',
    name: 'Sermorelin',
    aliases: ['sermorelin'],
    klass: 'GHRH analogue (first 29 amino acids of GHRH)',
    what: 'A short GHRH analogue that stimulates the pituitary to release growth hormone.',
    usedFor: 'Historically a diagnostic agent for growth hormone deficiency; now marketed by wellness clinics for ageing and recovery.',
    evidence: 'Well characterised as a diagnostic tool. The anti-ageing and body-composition marketing is not supported by outcome trials.',
    status: 'prescription',
    statusNote:
      'Was approved in the US as Geref for paediatric use and later withdrawn from the market for commercial reasons. Today it is supplied by compounding pharmacies on prescription.',
    risks: [
      'Injection-site reactions, flushing, headache.',
      'The GH-elevation considerations above apply.',
      'Compounded products vary in quality between pharmacies.',
    ],
    sport: 'prohibited',
    sportNote: 'GHRH analogues sit under S2, in and out of competition.',
  },
  {
    id: 'tesamorelin',
    name: 'Tesamorelin',
    aliases: ['tesamorelin', 'egrifta'],
    klass: 'GHRH analogue',
    what: 'A stabilised GHRH analogue.',
    usedFor: 'Licensed to reduce excess visceral abdominal fat in people with HIV-associated lipodystrophy.',
    evidence: 'Randomised trial evidence for its licensed indication. No evidence base for general fat loss in healthy people.',
    status: 'prescription',
    statusNote: 'FDA approved as Egrifta for a specific population, prescription only.',
    risks: [
      'Joint pain, swelling and muscle aches.',
      'Raises IGF-1; glucose intolerance is a documented concern.',
      'The visceral fat returns when it is stopped.',
    ],
    sport: 'prohibited',
    sportNote: 'GHRH analogues sit under S2, in and out of competition.',
  },
  {
    id: 'melanotan2',
    name: 'Melanotan II',
    aliases: ['melanotan', 'melanotan ii', 'melanotan 2', 'mt2', 'mt-2'],
    klass: 'Non-selective melanocortin receptor agonist',
    what: 'A synthetic analogue of α-MSH that stimulates melanin production, and also acts on melanocortin receptors involved in appetite and erectile function.',
    usedFor: 'Sold for tanning without sun exposure, and for appetite suppression and libido.',
    evidence: 'It does darken skin. That is not the question; the question is what else it does, and there the data is poor.',
    status: 'unapproved',
    statusNote:
      'Not approved anywhere. Multiple national regulators, including the UK MHRA and the Australian TGA, have issued public warnings against it. Almost all supply is illicit.',
    risks: [
      'Nausea, flushing, spontaneous erections, and darkening of existing moles.',
      'Case reports link it to changes in melanocytic naevi and to melanoma diagnoses; because it acts on the cells involved, this is a mechanistically plausible concern rather than a coincidence.',
      'Rhabdomyolysis and posterior reversible encephalopathy have both been reported in case literature.',
      'Injectable grey-market supply with the usual sterility problems.',
    ],
    sport: 'prohibited_as_unapproved',
    sportNote: 'With no approval anywhere, S0 applies in and out of competition.',
  },
  {
    id: 'pt141',
    name: 'PT-141 (bremelanotide)',
    aliases: ['pt141', 'pt 141', 'pt-141', 'bremelanotide', 'vyleesi'],
    klass: 'Melanocortin receptor agonist',
    what: 'A melanocortin agonist related to melanotan II but developed as a medicine.',
    usedFor: 'Licensed for hypoactive sexual desire disorder in premenopausal women.',
    evidence: 'Randomised trial evidence for its licensed indication; effect sizes were modest.',
    status: 'prescription',
    statusNote: 'FDA approved as Vyleesi, prescription only. Grey-market "PT-141" is a different supply chain entirely.',
    risks: ['Nausea is common.', 'Transient blood pressure rise; not for uncontrolled hypertension or known cardiovascular disease.', 'Skin darkening with repeated use.'],
    sport: 'permitted',
    sportNote: 'Melanocortin agonists are not listed.',
  },
  {
    id: 'testosterone',
    name: 'Testosterone (TRT and supraphysiological use)',
    aliases: ['testosterone', 'trt', 'test e', 'test c', 'testosterone enanthate', 'testosterone cypionate', 'sustanon'],
    klass: 'Androgen; anabolic-androgenic steroid',
    what: 'The primary male sex hormone, given as an injection, gel or patch. Replacement therapy aims to restore a normal blood level in someone who is measurably low. Doses above that range are a different thing with a different risk profile, whatever they are called.',
    usedFor: 'Licensed for male hypogonadism confirmed on repeat morning bloodwork. Used off-label and illicitly for muscle mass and strength.',
    evidence:
      'Replacement in genuinely hypogonadal men reliably improves symptoms, and supraphysiological doses reliably add muscle — that part was settled by a controlled trial in 1996. Neither fact says anything about whether it is a good idea for a given person.',
    status: 'prescription',
    statusNote:
      'A controlled substance in the US (Schedule III) and a prescription-only medicine in most countries. Obtaining it without a prescription is a criminal matter in many places, separate from any health question.',
    risks: [
      'Shuts down your own production. Fertility falls, often to zero, and recovery after stopping is not guaranteed.',
      'Testicular atrophy, acne, hair loss in those predisposed, and mood changes.',
      'Raises haematocrit — thickened blood — which needs monitoring and sometimes donation.',
      'Adverse lipid changes and, at supraphysiological doses, measurable cardiac effects including left ventricular hypertrophy.',
      'Once started for replacement it is usually lifelong.',
      'This is a class of drug that genuinely requires bloodwork before, during and after. That is the whole argument for doing it with a doctor.',
    ],
    sport: 'prohibited',
    sportNote: 'Anabolic agents sit under S1, in and out of competition. A therapeutic use exemption is possible for genuine replacement and is not granted casually.',
  },
  {
    id: 'aas',
    name: 'Anabolic steroids (nandrolone, trenbolone, oxandrolone and the rest)',
    aliases: [
      'anabolic steroid', 'anabolic steroids', 'steroid', 'steroids', 'gear', 'aas', 'juice',
      'nandrolone', 'deca', 'trenbolone', 'tren', 'oxandrolone', 'anavar', 'stanozolol',
      'winstrol', 'dianabol', 'dbol', 'methandrostenolone', 'boldenone', 'masteron', 'primobolan',
    ],
    klass: 'Anabolic-androgenic steroids',
    what: 'Synthetic derivatives of testosterone, designed to shift the balance between muscle-building and masculinising effects. Almost none of the ones used for physique purposes are licensed for that use in humans; several are veterinary drugs.',
    usedFor: 'Muscle mass, strength and fat loss. A few have narrow licensed uses — oxandrolone for burn recovery, nandrolone for some anaemias — none of them cosmetic.',
    evidence:
      'They work. That was never the open question. The open questions are dose-dependent harm, what happens over decades, and how much of the gain survives stopping — and the honest answer to the last one is: some of it, not all.',
    status: 'unapproved',
    statusNote:
      'Controlled substances in most countries. Illicit supply dominates, and testing of seized product routinely finds the wrong compound, the wrong quantity, or contamination.',
    risks: [
      'Suppression of natural testosterone, with infertility that is sometimes permanent.',
      'Cardiovascular: adverse lipids, raised blood pressure, left ventricular hypertrophy, and an association with early cardiac events in long-term users.',
      'Liver strain, particularly with 17-alpha-alkylated oral compounds.',
      'Gynaecomastia, acne, hair loss, and in women virilisation — voice deepening and clitoral enlargement — which does not reverse.',
      'Mood and aggression changes, and a withdrawal depression on stopping that is a real clinical phenomenon.',
      'Nineteen-nor compounds such as trenbolone and nandrolone carry their own additional problems, including on prolactin and on sleep.',
    ],
    sport: 'prohibited',
    sportNote: 'S1, in and out of competition. Long detection windows: nandrolone metabolites have been detected many months after a last dose.',
  },
  {
    id: 'sarms',
    name: 'SARMs (ostarine, ligandrol, RAD-140 and the rest)',
    aliases: ['sarm', 'sarms', 'ostarine', 'mk2866', 'mk-2866', 'enobosarm', 'ligandrol', 'lgd4033', 'lgd-4033', 'rad140', 'rad-140', 'testolone', 'yk11', 's4', 'andarine'],
    klass: 'Selective androgen receptor modulators',
    what: 'Non-steroidal compounds designed to activate androgen receptors in muscle and bone while sparing prostate and skin. The selectivity is the pitch; in practice it is partial, not absolute.',
    usedFor: 'Sold for muscle gain with "none of the side effects". Several were developed for muscle wasting and osteoporosis and abandoned.',
    evidence:
      'Real clinical trials exist — ostarine reached Phase III for cancer cachexia and missed its endpoints. Lean mass gains in trials were modest, well short of what the marketing implies, and no SARM has completed development to approval.',
    status: 'unapproved',
    statusNote:
      'Not approved anywhere for any use. The FDA has issued public warnings and taken enforcement action against sellers, and the products are commonly mislabelled — analyses have repeatedly found no active compound, the wrong compound, or an undeclared steroid.',
    risks: [
      'Testosterone suppression happens, the "no side effects" claim notwithstanding.',
      'Liver injury: there are published case reports of drug-induced hepatitis, some severe.',
      'Adverse lipid changes, particularly a drop in HDL.',
      'Because supply is unregulated, you often do not know what you took — which also means a positive drug test from a product that did not list it.',
      'Long-term safety data does not exist, because no product got far enough to generate it.',
    ],
    sport: 'prohibited',
    sportNote: 'S1 as "other anabolic agents", in and out of competition. SARMs are one of the most common causes of anti-doping violations from contaminated supplements.',
  },
  {
    id: 'hgh',
    name: 'Human growth hormone (somatropin)',
    aliases: ['hgh', 'growth hormone', 'somatropin', 'gh'],
    klass: 'Recombinant peptide hormone',
    what: 'A manufactured copy of the growth hormone the pituitary produces.',
    usedFor: 'Licensed for diagnosed growth hormone deficiency, certain genetic conditions, and HIV wasting. Used off-label for body composition and ageing.',
    evidence:
      'Clear benefit in genuine deficiency. In healthy adults it increases lean mass, but a good deal of that is fluid rather than contractile tissue, and controlled work has not shown the strength gains the marketing promises.',
    status: 'prescription',
    statusNote:
      'Prescription only. In the US it is unusual among drugs in that distribution for non-approved uses is specifically criminalised. Counterfeits are common in the grey market.',
    risks: [
      'Joint pain, swelling, carpal tunnel syndrome — the classic complaints, and dose-related.',
      'Insulin resistance and raised blood glucose; diabetes risk goes up.',
      'Raised IGF-1, which is the mechanism behind the theoretical concern about tumour growth.',
      'In acromegalic doses, irreversible changes to bone in the face, hands and feet.',
    ],
    sport: 'prohibited',
    sportNote: 'S2, in and out of competition, and specifically tested for.',
  },
  {
    id: 'ghkcu',
    name: 'GHK-Cu',
    aliases: ['ghk', 'ghkcu', 'ghk-cu', 'copper peptide', 'copper peptides'],
    klass: 'Copper-binding tripeptide',
    what: 'A naturally occurring tripeptide that binds copper, found in plasma and saliva.',
    usedFor: 'Widely used topically in skincare for wrinkles and skin firmness; also sold for hair and wound healing.',
    evidence: 'Reasonable cosmetic evidence for topical use on skin appearance. Injectable use is a different proposition with far less behind it.',
    status: 'supplement',
    statusNote: 'Sold as a cosmetic ingredient. Injectable forms are unapproved.',
    risks: ['Topical use is generally well tolerated; irritation is the usual complaint.', 'Copper load is a real consideration with anything systemic.'],
    sport: 'permitted',
    sportNote: 'Cosmetic topicals are not listed.',
  },
  {
    id: 'collagen',
    name: 'Collagen peptides',
    aliases: ['collagen', 'collagen peptides', 'hydrolysed collagen', 'hydrolyzed collagen'],
    klass: 'Hydrolysed protein supplement',
    what: 'Collagen protein broken into short chains so it dissolves and absorbs easily. A food, not a drug.',
    usedFor: 'Joint comfort, tendon health, skin elasticity, nails.',
    evidence:
      'Modest. Several small randomised trials suggest benefit for joint pain and skin elasticity, often industry-funded. As a protein it is low in leucine, so it is a poor choice as your main protein source for muscle building.',
    status: 'supplement',
    statusNote: 'Regulated as a food supplement.',
    risks: ['Low risk for most people.', 'Not a complete protein — count it towards your total, not towards your leucine.'],
    sport: 'permitted',
    sportNote: 'Food supplements are not listed, but contaminated supplements are a common route to a positive test — buy batch-tested.',
  },
  {
    id: 'creatine',
    name: 'Creatine monohydrate',
    aliases: ['creatine', 'creatine monohydrate', 'mono'],
    klass: 'Ergogenic supplement (not a peptide)',
    what: 'A compound your body already makes and stores in muscle, where it helps regenerate ATP for short, hard efforts.',
    usedFor: 'Strength, power, training volume, and some evidence for cognition.',
    evidence:
      'The strongest of anything on this list. Hundreds of randomised trials over thirty years, consistently positive for strength and power, and consistently unremarkable on safety in healthy adults.',
    status: 'supplement',
    statusNote: 'A food supplement, sold openly. Monohydrate is the form everything was tested on; the expensive variants have no advantage.',
    risks: [
      'A few pounds of water weight in the first weeks, which is intracellular and not fat.',
      'Gastrointestinal upset at large single servings.',
      'Kidney concerns have been looked for repeatedly in healthy people and not found; existing kidney disease is a conversation for a doctor.',
    ],
    sport: 'permitted',
    sportNote: 'Food supplements are not listed, but contaminated supplements are a common route to a positive test — buy batch-tested.',
  },
];

const byId = new Map(COMPOUNDS.map((c) => [c.id, c]));

export function compoundById(id: string): Compound | null {
  return byId.get(id) ?? null;
}

/** Escape a term so an alias containing "-" or "." cannot act as a pattern. */
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Find the compound a question is about.
 *
 * Longest alias first, so "melanotan ii" is not swallowed by "melanotan", and
 * so "collagen peptides" does not merely match the bare word "peptide"
 * elsewhere. Matching is on word boundaries: "tb500" must not fire on a set of
 * 500 reps, and "mono" must not fire inside "monohydrate" of something else.
 */
export function findCompound(text: string): Compound | null {
  const haystack = text.toLowerCase();
  const candidates: { compound: Compound; alias: string }[] = [];

  for (const compound of COMPOUNDS) {
    for (const alias of [compound.name.toLowerCase(), ...compound.aliases]) {
      const pattern = new RegExp(`(^|[^a-z0-9])${escape(alias)}([^a-z0-9]|$)`, 'i');
      if (pattern.test(haystack)) candidates.push({ compound, alias });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.alias.length - a.alias.length);
  return candidates[0]!.compound;
}

/** Which facet of a compound a question is reaching for. */
export type CompoundAsk = 'what' | 'evidence' | 'risks' | 'legal' | 'sport' | 'overview';

const ASK_PATTERNS: [CompoundAsk, RegExp][] = [
  // Order matters: "is it safe" is a risks question even though it says "is".
  ['risks', /\b(safe|safety|risk|risks|danger|dangerous|side[- ]?effects?|harm|harmful|bad for)\b/i],
  ['sport', /\b(banned|ban|wada|usada|drug[- ]?test|tested|doping|competition|federation|ipf|nsf)\b/i],
  ['legal', /\b(legal|legality|illegal|approved|approval|fda|ema|mhra|prescription|prescribed|buy|otc|over the counter)\b/i],
  ['evidence', /\b(work|works|working|effective|evidence|proven|research|studies|study|legit|real|worth it|does it do anything)\b/i],
  ['what', /\b(what is|what are|whats|what's|explain|tell me about|mean|means)\b/i],
];

export function compoundAsk(text: string): CompoundAsk {
  for (const [ask, pattern] of ASK_PATTERNS) {
    if (pattern.test(text)) return ask;
  }
  return 'overview';
}

const STATUS_LEAD: Record<ApprovalStatus, string> = {
  approved: 'Approved medicine.',
  prescription: 'Prescription medicine.',
  unapproved: 'Not an approved medicine anywhere.',
  supplement: 'Sold as a supplement, not a drug.',
};

const SPORT_LEAD: Record<SportStatus, string> = {
  prohibited: 'Banned in tested sport.',
  prohibited_as_unapproved: 'Banned in tested sport as an unapproved substance.',
  permitted: 'Not on the prohibited list.',
};

/**
 * The line that closes every compound answer.
 *
 * It is not a legal disclaimer bolted on the end — it is the actual answer to
 * the question the person is usually really asking, which is "should I take
 * this". The app is not in a position to know.
 */
export const CLINICIAN_LINE =
  'What this does not cover is whether it is right for you, or how much of it — that needs someone who can see your history and your bloodwork. Log whatever you and they decide in the protocol tracker.';

/** Compose the reference answer for one compound and one facet. */
export function compoundAnswer(compound: Compound, ask: CompoundAsk): string {
  const parts: string[] = [];

  switch (ask) {
    case 'what':
      parts.push(compound.what, `Class: ${compound.klass}.`, `Sold or prescribed for: ${compound.usedFor}`);
      break;
    case 'evidence':
      parts.push(`${compound.name}: ${compound.usedFor}`, compound.evidence);
      break;
    case 'risks':
      parts.push(`Known concerns with ${compound.name}:`, ...compound.risks.map((r) => `• ${r}`));
      break;
    case 'legal':
      parts.push(`${STATUS_LEAD[compound.status]} ${compound.statusNote}`);
      break;
    case 'sport':
      parts.push(`${SPORT_LEAD[compound.sport]} ${compound.sportNote}`, `Lists are revised every year — check the ${SPORT_LIST_YEAR} list and your federation's own rules before you rely on this.`);
      break;
    case 'overview':
    default:
      parts.push(
        compound.what,
        `Used for: ${compound.usedFor}`,
        `Evidence: ${compound.evidence}`,
        `${STATUS_LEAD[compound.status]} ${compound.statusNote}`,
        `Risks: ${compound.risks.join(' ')}`,
        `${SPORT_LEAD[compound.sport]} ${compound.sportNote}`,
      );
      break;
  }

  parts.push(CLINICIAN_LINE);
  return parts.join('\n\n');
}
