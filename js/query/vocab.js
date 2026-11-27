// Fixed vocabulary of the query language: operators, filter fields, facets and options.
// Every alias is matched after norm() (no accents, lower case). English comes first in each list:
// the first alias is the one printed in the canonical form.

export const OPERATORS = {
  vs: ['vs', 'versus', 'v.', 'compared to', 'contre'],
  among: ['among', 'parmi', '|'],
  by: ['by', 'par'],
  with: ['with', 'avec'],
  without: ['without', 'sans'],
};

/** An explicit cohort of all patients, for comparisons such as "survival all vs PFIC". */
export const ALL_WORDS = ['all', 'everyone', 'tous', 'tout'];

/** Words that ask the page for a random example query. */
export const EXAMPLE_WORDS = ['example', 'random', 'exemple', 'aleatoire'];

/**
 * Filter fields. prefixes: accepted before ":"; the first is canonical.
 * values: canonical value -> aliases; bare = aliases recognised without a prefix.
 * single: a patient has one value only, so two values must be joined with a comma (OR).
 */
export const FIELDS = {
  disease: { prefixes: ['dis', 'disease', 'maladie'] },
  gene: { prefixes: ['gene', 'gène'] },
  sex: {
    prefixes: ['sex', 'sexe'], single: true,
    values: { M: ['boys', 'boy', 'male', 'males', 'm', 'garçons', 'garçon', 'masculin'],
              F: ['girls', 'girl', 'female', 'females', 'f', 'filles', 'fille', 'féminin'] },
    bare: ['boys', 'male', 'males', 'garçons', 'girls', 'female', 'females', 'filles'],
    show: { M: 'boys', F: 'girls' },
  },
  zyg: {
    prefixes: ['zyg', 'zygosity', 'zygotie'], single: true,
    values: { homozygous: ['homozygous', 'homozygote', 'homozygotes', 'homo'],
              compound: ['compound', 'compound heterozygous', 'hétérozygote composite', 'hétérozygotes composites', 'composite'],
              heterozygous: ['heterozygous', 'hétérozygote', 'hétérozygotes', 'het'] },
    bare: ['homozygous', 'homozygote', 'homozygotes', 'compound', 'compound heterozygous', 'hétérozygote composite',
           'hétérozygotes composites', 'heterozygous', 'hétérozygote', 'hétérozygotes'],
  },
  var: {
    prefixes: ['var', 'variant'],
    values: { missense: ['missense', 'faux-sens'], nonsense: ['nonsense', 'non-sens', 'stop'],
              frameshift: ['frameshift', 'décalage du cadre'], splicing: ['splicing', 'splice', 'épissage'],
              indel: ['indel', 'inframe'], silent: ['silent', 'synonymous', 'silencieux'] },
    bare: ['missense', 'faux-sens', 'nonsense', 'non-sens', 'frameshift', 'décalage du cadre', 'splicing', 'splice',
           'épissage', 'indel', 'silent', 'synonymous', 'silencieux'],
  },
  cadd: {
    prefixes: ['cadd'],
    values: { 'pp3-moderate': ['pp3-moderate', 'pp3_moderate', 'pp3m'], 'pp3-supporting': ['pp3-supporting', 'pp3_supporting', 'pp3s'],
              indeterminate: ['indeterminate', 'indéterminé'], 'bp4-supporting': ['bp4-supporting', 'bp4_supporting', 'bp4s'],
              'bp4-moderate': ['bp4-moderate', 'bp4_moderate', 'bp4m'], 'bp4-strong': ['bp4-strong', 'bp4_strong'],
              pp3: ['pp3'], bp4: ['bp4'] },
    bare: [],
  },
  onset: {
    prefixes: ['onset', 'début'], single: true,
    values: { newborn: ['newborn', 'neonatal', 'nouveau-né', 'nouveau-nés', 'neonatal period', 'newborn period', 'période néonatale'],
              infancy: ['infancy', 'infant', 'infants', 'nourrisson', 'nourrissons'],
              toddler: ['toddler', 'toddlers'], preschool: ['preschool', 'preschooler', 'préscolaire'],
              childhood: ['childhood', 'enfance'], adolescence: ['adolescence', 'adolescent', 'adolescents'],
              adult: ['adult', 'adults', 'adulte', 'adultes'] },
    bare: ['newborn', 'neonatal', 'nouveau-nés', 'neonatal period', 'newborn period', 'période néonatale', 'infancy',
           'nourrissons', 'toddler', 'toddlers', 'preschool', 'préscolaire', 'childhood', 'enfance',
           'adolescence', 'adolescents', 'adult', 'adults', 'adulte', 'adultes'],
  },
  status: {
    prefixes: ['status', 'statut'], single: true,
    values: { dead: ['dead', 'deceased', 'died', 'décédé', 'décédés', 'décédées'], alive: ['alive', 'living', 'vivant', 'vivants'] },
    bare: ['dead', 'deceased', 'died', 'décédés', 'décédées', 'alive', 'vivants'],
  },
  cons: {
    prefixes: ['cons', 'consanguinity', 'consanguinité'], single: true,
    values: { yes: ['yes', 'oui', 'y', 'consanguineous', 'consanguins'], no: ['no', 'non', 'n'] },
    bare: ['consanguineous', 'consanguins'],
  },
  tx: { prefixes: ['tx', 'treatment', 'traitement'] },
  cluster: { prefixes: ['cluster', 'groupe'] },
  year: { prefixes: ['year', 'année'], single: true },
  doi: { prefixes: ['doi'] },
  term: { prefixes: ['hp', 'hpo'] },
};

/** Order of the fields in the canonical form. */
export const FIELD_ORDER = ['disease', 'gene', 'sex', 'zyg', 'var', 'cadd', 'onset', 'status', 'cons', 'tx', 'cluster', 'year', 'doi', 'term'];

/** Facets of "by". The first alias is canonical. */
export const FACETS = {
  gene: ['gene', 'genes'],
  disease: ['disease', 'diseases', 'maladie', 'maladies'],
  sex: ['sex', 'sexe'],
  zygosity: ['zygosity', 'zyg', 'zygotie'],
  variant: ['variant', 'variants', 'variant type', 'type de variant'],
  cadd: ['cadd', 'cadd tier'],
  onset: ['onset', 'onset period', 'debut'],
  status: ['status', 'statut'],
  consanguinity: ['consanguinity', 'cons', 'consanguinite'],
  cluster: ['cluster', 'clusters', 'groupe', 'groupes'],
  decade: ['decade', 'decennie'],
};

/** Options: name -> check of the value. */
export const OPTIONS = {
  k: (v) => /^\d{1,2}$/.test(v),
  x: (v) => ['age', 'onset'].includes(v),
  top: (v) => /^\d{1,3}$/.test(v) && +v >= 1 && +v <= 100,
  sub: (v) => ['on', 'off'].includes(v),
  stats: (v) => ['on', 'off'].includes(v),
  style: (v) => ['bubble', 'arc'].includes(v),
  layout: (v) => ['global', 'local'].includes(v),
  mark: (v) => v.split(',').every((c) => /^(hp:)?\d{1,7}$/i.test(c.trim())),
};

/** Aliases of laboratory variables (the variable names of the release are recognised as they are). */
export const LAB_ALIASES = {
  weight: ['poids'], height: ['taille', 'length'], 'head circumference': ['perimetre cranien', 'hc'],
  PTA: ['tp', 'prothrombin activity', 'taux de prothrombine'], TB: ['bilirubin', 'total bilirubin', 'bilirubine', 'bilirubine totale'],
  CB: ['conjugated bilirubin', 'bilirubine conjuguee'], SBA: ['bile acids', 'serum bile acids', 'acides biliaires'],
  ALB: ['albumin', 'albumine'], PLT: ['platelets', 'plaquettes'], GGT: ['gamma-gt', 'ggt'],
  cholesterol: ['cholesterol'], FV: ['factor v', 'facteur v'],
};
