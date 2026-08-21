// Maps and constants
export const PFIC_SUBTYPE_MAP = {
  "pfic1": "ATP8B1",
  "pfic2": "ABCB11",
  "pfic3": "ABCB4",
  "pfic4": "TJP2",
  "pfic5": "NR1H4",
  "pfic6": "SLC51A",
  "pfic7": "USP53",
  "pfic8": "KIF12",
  "pfic9": "ZFYVE19",
  "pfic10": "MYO5B"
};

export const KNOWN_SUBGROUPS = {
  cadd_tier: {
    low: 'low (<10)',
    moderate: 'moderate (10-19.9)',
    high: 'high (>=20)'
  },
  sex: {
    male: 'boys', boys: 'boys', boy: 'boys', m: 'boys',
    female: 'girls', girls: 'girls', girl: 'girls', f: 'girls'
  },
  zygosity: {
    homo: 'homozygous', homozygous: 'homozygous',
    het: 'heterozygous', heterozygous: 'heterozygous',
    comp: 'compound heterozygous', 'compound heterozygous': 'compound heterozygous'
  },
  onset_tier: {
    infantile: 'infantile',
    toddler: 'toddler',
    juvenile: 'juvenile',
    adult: 'adult'
  }
};

export const ABBREVIATIONS = {
  'aspartate aminotransferase': 'AST',
  'alanine aminotransferase': 'ALT',
  'alkaline phosphatase': 'ALP',
  'gamma-glutamyltransferase': 'GGT',
  'serum bile acid': 'SBA',
  'alpha-fetoprotein': 'AFP'
};

export const REMOVAL_WORDS = ['circulating', 'concentration', 'level'];


